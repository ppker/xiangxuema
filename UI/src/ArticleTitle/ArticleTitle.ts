import "./ArticleTitle.scss";
import html from "./ArticleTitle.html?raw";
import CtrlBase from "../CtrlBase";
import Msg from "../Msg";
import Header from "./Header/Header";

/** 原生侧返回的文章行；这一版只用到标题和更新时间 */
interface ArticleRow {
  id: number;
  title: string;
  /** 所属分类 id；未分类时为 null */
  categoryId: number | null;
  /** 更新时间，"YYYY-MM-DD HH:MM:SS"（本地时间，原生侧 datetime('now','localtime') 写的） */
  updatedAt: string;
}

/**
 * 中部文章列表面板（模块单例）。
 * 面板即 #articleTitle 自身，由 ContentBox 挂到中间分栏槽位。
 * 内部先挂 Header 标题栏，启动时通过 Msg 请求原生侧读取文章标题并渲染成列表；
 * 选中分类后由 Category 调 setCategoryFilter()，只加载该分类（含子分类）的文章，
 * 没选中任何分类则加载全部。这一版不做分页，也不加载正文。
 */
class ArticleTitle extends CtrlBase {
  /** 当前过滤的分类 id；null 表示没选中分类，加载全部 */
  private categoryId: number | null = null;

  /** 列表容器：过滤条件变化时复用它，只换里面的行 */
  private list: HTMLElement | null = null;

  constructor() {
    super(html);
  }

  override ready(): void {
    Header.appendTo(this.dom);
    void this.loadAndRender();
  }

  /** 按分类过滤；传 null 表示取消过滤、加载全部。由 Category 在选中变化时调用 */
  setCategoryFilter(categoryId: number | null): void {
    if (this.categoryId === categoryId) return; // 还是同一个分类，不用重新请求
    this.categoryId = categoryId;
    void this.loadAndRender();
  }

  /** 请求原生侧读取文章标题，再渲染成列表 */
  private async loadAndRender(): Promise<void> {
    const categoryId = this.categoryId;
    try {
      const args = categoryId == null ? undefined : { categoryId };
      const data = await Msg.invoke("getArticleTitles", args);
      // 请求是异步的：回来时选中可能已经变了，过期结果直接丢掉，避免列表闪回旧数据
      if (categoryId !== this.categoryId) return;
      const rows: ArticleRow[] = (data as { articles?: ArticleRow[] }).articles ?? [];
      this.renderList(rows);
    } catch {
      // 读取失败时渲染空列表，避免阻塞其余面板
      if (categoryId === this.categoryId) this.renderList([]);
    }
  }

  /** 一行 = 标题（过长省略）+ 右侧更新时间；分类 id 挂在 dataset 上，方便以后点开正文 */
  private renderList(rows: ArticleRow[]): void {
    if (!this.list) {
      this.list = document.createElement("ul");
      this.list.className = "articleList";
      this.dom.appendChild(this.list);
    }
    // 先清空：切换分类是重新请求重新渲染，不能往旧列表上叠
    this.list.replaceChildren();
    for (const row of rows) {
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
      this.list.appendChild(item);
    }
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
