import "./ArticleTitle.scss";
import html from "./ArticleTitle.html?raw";
import CtrlBase from "../CtrlBase";
import Msg from "../Msg";
import Header from "./Header/Header";
import EditorTitle from "../EditorTitle/EditorTitle";
import EditorContent from "../EditorContent/EditorContent";

/** 原生侧返回的文章行 */
interface ArticleRow {
  id: number;
  title: string;
  /** 所属分类 id；未分类时为 null */
  categoryId: number | null;
  /** 更新时间，"YYYY-MM-DD HH:MM:SS"（本地时间，原生侧 datetime('now','localtime') 写的） */
  updatedAt: string;
  /** 正文 HTML：只有 getArticle / createArticle 这种按篇返回的接口带上，列表接口不带 */
  content?: string;
}

/** 没有标题的文章入库时用的占位标题；输入框本身保持为空 */
const UNTITLED = "【未命名】";

/**
 * 中部文章列表面板（模块单例）。
 * 面板即 #articleTitle 自身，由 ContentBox 挂到中间分栏槽位。
 * 内部先挂 Header 标题栏，再挂内容区（吃掉标题栏之外的高度并负责滚动），列表挂进内容区；
 * 启动时通过 Msg 请求原生侧读取文章标题并渲染成列表；
 * 选中分类后由 Category 调 setCategoryFilter()，只加载该分类（含子分类）的文章，
 * 没选中任何分类则加载全部。这一版不做分页。
 *
 * 顺带管着"当前编辑的是哪一篇"，这里有两条不变量：
 * - 列表里永远至少有一篇文章：载入后发现一篇都没有（或读取失败），当场建一篇【未命名】；
 * - 永远有一行被选中：列表每次重画完就选中第一行，并把它的标题和正文载进编辑器。
 * 换句话说没有"新增态"：新建只有一条路，就是 Header 上的加号按钮广播的 addArticle
 * （清空标题输入框与正文 → 入库一篇【未命名】 → 补到列表末尾并选中它）。
 * 编辑过程中的改标题/改正文：防抖 800ms 写回当前选中这篇（标题正文一起更新）。
 */
class ArticleTitle extends CtrlBase {
  /** 当前过滤的分类 id；null 表示没选中分类，加载全部 */
  private categoryId: number | null = null;

  /** 列表容器：过滤条件变化时复用它，只换里面的行 */
  private list: HTMLElement | null = null;

  /** 标题栏之下的内容区：列表的滚动容器，高度 = 面板高度 - 标题栏 */
  private content: HTMLElement | null = null;

  /** 当前选中的列表行与它的 id：列表里永远有一篇被选中 */
  private selectedItem: HTMLElement | null = null;

  /** 当前选中文章的 id */
  private selectedId: number | null = null;

  /**
   * 正在程序化改动标题/正文（载入某篇时回填、新建后清空）：
   * 这期间 contentChanged 不是用户在编辑，别触发保存
   */
  private suppress = false;

  /** 防抖入库的定时器；0 = 没有待写的改动 */
  private saveTimer = 0;

  /** 连续输入时合并成一次写库的时间间隔（毫秒） */
  private static readonly SAVE_DELAY = 800;

  constructor() {
    super(html);
  }

  override ready(): void {
    Header.appendTo(this.dom);
    // 标题栏之后再补一层内容区：滚动条只落在它身上，标题栏永远在最上面不动
    this.content = document.createElement("div");
    this.content.className = "articleListContent";
    this.dom.appendChild(this.content);
    void this.loadAndRender();
    // 标题/正文的改动统一在这里收口写回当前选中的这篇
    Msg.on("articleTitleEdited", this.onEdited);
    Msg.on("editorContentChanged", this.onEdited);
    // Header 上的加号：清空输入并新建一篇【未命名】
    Msg.on("addArticle", () => void this.createArticle());
  }

  /** 按分类过滤；传 null 表示取消过滤、加载全部。由 Category 在选中变化时调用 */
  setCategoryFilter(categoryId: number | null): void {
    if (this.categoryId === categoryId) return; // 还是同一个分类，不用重新请求
    this.categoryId = categoryId;
    void this.loadAndRender();
  }

  /** 请求原生侧读取文章标题，渲染成列表，再挑一篇选中并载进编辑器 */
  private async loadAndRender(): Promise<void> {
    const categoryId = this.categoryId;
    let rows: ArticleRow[] = [];
    try {
      const args = categoryId == null ? undefined : { categoryId };
      const data = await Msg.invoke("getArticleTitles", args);
      // 请求是异步的：回来时过滤条件可能已经变了，过期结果直接丢掉，避免列表闪回旧数据
      if (categoryId !== this.categoryId) return;
      rows = (data as { articles?: ArticleRow[] }).articles ?? [];
    } catch {
      // 读取失败：渲染空列表，接下来照样补一篇【未命名】，不让界面停在"没有文章"的状态
      rows = [];
    }
    this.renderList(rows);
    // 列表有了 → 选中第一行（同时把它的标题正文载进编辑器）；一篇都没有 → 当场建一篇
    await this.ensureSelection();
  }

  /** 保证"列表里有文章、且有一篇被选中"这两条不变量 */
  private async ensureSelection(): Promise<void> {
    if (!this.list.childElementCount) {
      await this.createArticle(); // 一篇都没有：createArticle 会补一行并选中它
      return;
    }
    await this.select(this.list.firstElementChild as HTMLElement);
  }

  private renderList(rows: ArticleRow[]): void {
    if (!this.content) return; // ready() 还没跑完（内容区还没建），先不渲染
    if (!this.list) {
      this.list = document.createElement("ul");
      this.list.className = "articleList";
      this.content.appendChild(this.list);
    }
    // 先清空：切换分类是重新请求重新渲染，不能往旧列表上叠
    this.list.replaceChildren();
    for (const row of rows) {
      this.list.appendChild(this.buildRow(row));
    }
    // 旧的行连同它们的选中样式已经被丢掉：selectedItem 指向的是不在文档里的节点，先置空。
    // selectedId 保留：列表还没选定新的一篇，这期间的编辑仍然属于原来那篇
    this.selectedItem = null;
  }

  /** 一行 = 标题（过长省略）+ 右侧更新时间；分类 id 挂在 dataset 上，点它就选中这篇 */
  private buildRow(row: ArticleRow): HTMLElement {
    const item = document.createElement("li");
    item.className = "articleItem";
    item.dataset.id = String(row.id);
    if (row.categoryId != null) item.dataset.categoryId = String(row.categoryId);

    const title = document.createElement("span");
    title.className = "articleItemTitle";
    title.textContent = row.title;
    // 标题被省略号截断时，悬停看全文
    title.title = row.title;

    const time = document.createElement("span");
    time.className = "articleItemTime";
    time.textContent = ArticleTitle.formatUpdatedAt(row.updatedAt);
    // 悬停看具体日期时间；原生侧给的就是完整时间串，直接拿来提示
    time.title = row.updatedAt;

    item.append(title, time);
    item.addEventListener("click", () => void this.select(item));
    return item;
  }

  /** 点一行（或列表重画后选中第一行）：戴上选中样式，并把这篇的标题与正文填进编辑器 */
  private async select(item: HTMLElement): Promise<void> {
    const id = Number(item.dataset.id);
    if (id === this.selectedId) {
      // 列表重画后行是新节点，样式得重新戴上；正文已经在编辑器里了，不用再取一次
      this.applySelection(item);
      return;
    }
    // 上一行还有没写完的改动：先落库到它自己身上，别串到这一篇来
    this.flushSave();
    this.applySelection(item);
    try {
      const data = (await Msg.invoke("getArticle", { id })) as { article: ArticleRow };
      // 请求是异步的：回来时用户可能已经又点了别的篇，过期结果直接丢掉
      if (this.selectedId !== id) return;
      EditorTitle.input.value = data.article.title;
      // 回填正文会触发 contentChanged，给它打上标记，别当成用户在改动
      this.suppress = true;
      EditorContent.setContent(data.article.content ?? "");
      this.suppress = false;
    } catch {
      // 读取失败：保持这一行选中，编辑器里的东西不动，用户再点一次即可重试
    }
  }

  /** 切换选中态：摘掉旧的、给新的戴上，selectedId 跟着更新 */
  private applySelection(item: HTMLElement): void {
    this.selectedItem?.classList.remove("selected");
    this.selectedItem = item;
    this.selectedId = Number(item.dataset.id);
    item.classList.add("selected");
  }

  /** 标题或正文被改动：防抖写回当前选中的这一篇 */
  private readonly onEdited = (): void => {
    // 回填/清空是程序化改动，不算用户在编辑
    if (this.suppress) return;
    this.scheduleSave();
  };

  /** 新建一篇【未命名】：清空输入框与正文，入库后补到列表末尾并选中它 */
  private async createArticle(): Promise<void> {
    // 当前这篇还有没写完的改动：先落到它自己身上，别被新增的这篇接走
    this.flushSave();
    try {
      const data = (await Msg.invoke("createArticle", {
        title: UNTITLED,
        content: "",
        // 归到正在看的那个分类下；没选分类就是未分类
        categoryId: this.categoryId,
      })) as { article: ArticleRow };
      const item = this.buildRow(data.article);
      this.list.appendChild(item);
      item.scrollIntoView({ block: "nearest" });
      this.applySelection(item);
      // 清空：这是新增动作本身，别当成用户在改这篇刚建好的文章
      this.suppress = true;
      EditorTitle.input.value = "";
      EditorContent.setContent("");
      this.suppress = false;
    } catch {
      // 入库失败：界面停在原来那篇上，用户可以再点一次加号重试
    }
  }

  /** 编辑中的文章写库：防抖，连续输入最后算一次 */
  private scheduleSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.saveNow(), ArticleTitle.SAVE_DELAY);
  }

  /** 把还没落的改动立刻写掉（切换文章、新建前调用，避免串稿） */
  private flushSave(): void {
    if (!this.saveTimer) return; // 没有待写的改动
    clearTimeout(this.saveTimer);
    this.saveTimer = 0;
    void this.saveNow();
  }

  private async saveNow(): Promise<void> {
    this.saveTimer = 0;
    const id = this.selectedId;
    const title = ArticleTitle.storeTitle(EditorTitle.input.value);
    const content = EditorContent.content;
    const data = (await Msg.invoke("updateArticle", { id, title, content })) as { updatedAt: string };
    // 列表行跟着更新：标题换成入库的值（空的会显示成【未命名】），时间换成库里新的 updated_at
    const titleEl = this.selectedItem.querySelector<HTMLElement>(".articleItemTitle");
    titleEl.textContent = title;
    titleEl.title = title;
    const timeEl = this.selectedItem.querySelector<HTMLElement>(".articleItemTime");
    timeEl.textContent = ArticleTitle.formatUpdatedAt(data.updatedAt);
    timeEl.title = data.updatedAt;
  }

  /** 入库用的标题：输入框为空时用占位标题（输入框本身仍然保持为空） */
  private static storeTitle(value: string): string {
    return value.trim() || UNTITLED;
  }

  /**
   * 更新时间的显示规则：
   * 今天 → 今；昨天 → 昨；今年内 → MM-DD；更早（含去年）→ YY-MM-DD。
   * 只比日期不比时刻；格式不认识就原样显示，免得丢信息。
   */
  private static formatUpdatedAt(updatedAt: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(updatedAt);
    if (!match) return updatedAt;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    // 用本地零点构日期，只比较日期部分
    const date = new Date(year, month - 1, day);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((todayStart.getTime() - date.getTime()) / 86400000);
    if (days === 0) return "今";
    if (days === 1) return "昨";
    const monthDay = `${match[2]}-${match[3]}`;
    return year === now.getFullYear() ? monthDay : `${match[1].slice(2)}-${monthDay}`;
  }
}

export default new ArticleTitle();
