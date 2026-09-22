import "./Category.scss";
import html from "./Category.html?raw";
import CtrlBase from "../CtrlBase";
import Msg from "../Msg";
import Header from "./Header/Header";
import Menu from "./Menu/Menu";
import Editor from "./Editor/Editor";
import ArticleTitle from "../ArticleTitle/ArticleTitle";
import StatusBar from "../StatusBar/StatusBar";

/** 分类节点 */
interface CategoryNode {
  id: number;
  name: string;
  /** 子分类；省略或无子节点时为叶节点 */
  children?: CategoryNode[];
}

/** 原生侧返回的扁平分类行 */
interface CategoryRow {
  id: number;
  parentId: number | null;
  name: string;
}

/** 分类编辑器的打开方式：决定提交时新增到哪、或者改名 */
type EditorMode = "top" | "sibling" | "child" | "rename";

/**
 * 左侧分类目录面板（模块单例）。
 * 面板即 #category 自身，由 ContentBox 挂到分栏槽位。
 * 内部先挂 Header 标题栏，再挂内容区 #categoryContent（吃掉标题栏之外的高度并负责滚动），分类树挂进内容区；
 * 启动时通过 Msg 请求原生侧从数据库读取分类，以原生 DOM 递归渲染 ul/li 树形分类。
 * 点击分工：点名称（含它的整片背景）选中/取消选中；点名称左侧的 +/− 图标展开/折叠；
 * 右键弹出 Menu 并顺手选中该分类；Menu 里的新增/改名走 Editor，提交后写库并重画分类树；
 * 删除只准删空分类（没有子分类、下面也没挂文章），挡住时把原生给的原因弹给用户。
 */
class Category extends CtrlBase {
  /** 当前选中的分类行（.categoryLabel）；null 表示没有选中 */
  private selected: HTMLElement | null = null;

  /** 当前选中的分类 id：重画分类树后靠它把选中还原回来 */
  private selectedId: number | null = null;

  /** 标题栏之下的内容区：分类树的滚动容器，高度 = 面板高度 - 标题栏 */
  private content: HTMLElement | null = null;

  constructor() {
    super(html);
  }

  override ready(): void {
    Header.appendTo(this.dom);
    // 标题栏之后再补一层内容区：滚动条只落在它身上，标题栏永远在最上面不动
    this.content = document.createElement("div");
    this.content.className = "categoryContent";
    this.dom.appendChild(this.content);

    // 点击用事件委托：分类树是异步渲染出来的，绑在树节点上会漏掉后渲染的那些
    this.dom.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const label = target.closest<HTMLElement>(".categoryLabel");
      if (!label) {
        // 点面板空白处（含标题栏那块）：取消选中
        this.applySelection(null);
        return;
      }
      const node = label.closest<HTMLLIElement>(".categoryNode");
      const isParent = node ? node.classList.contains("hasChildren") : false;
      // 点父节点左侧那个 +/− 图标：只负责展开/折叠，不改变选中
      if (isParent && target.closest(".categoryToggle")) {
        if (node) Category.setExpanded(node, node.classList.contains("collapsed"));
        return;
      }
      // 其余位置都算"点名称与它的背景区"：选中/取消选中。
      // （叶节点左侧的减号只是分支终点，不是控件，点它和点名称同义）
      this.applySelection(this.selected === label ? null : label);
    });

    // 右键分类节点：顺手把它选中，再弹菜单——菜单里的操作就以这个分类为目标
    this.dom.addEventListener("contextmenu", (e) => {
      const node = (e.target as HTMLElement).closest<HTMLLIElement>(".categoryNode");
      if (!node) return; // 右键面板空白处不接管，留给默认菜单
      e.preventDefault();
      // 只选中、不切换：右键已选中的分类不会把它取消掉
      this.applySelection(node.querySelector<HTMLElement>(":scope > .categoryLabel"));
      Menu.open(e.clientX, e.clientY, node);
    });

    // 标题栏右侧的加号：新增顶层分类（弹层始终在按钮正下方）
    Header.onAddClick = (anchor) => this.openEditor(null, "top", anchor);

    // 右键菜单的动作：锚点是被右键的那个分类行（弹层贴在它下方，放不下向上翻折）
    Menu.onAction = (action, node, anchor) => {
      if (action === "addSibling") this.openEditor(node, "sibling", anchor);
      else if (action === "addChild") this.openEditor(node, "child", anchor);
      else if (action === "rename") this.openEditor(node, "rename", anchor);
      else if (action === "remove") void this.removeCategory(node);
    };

    void this.loadAndRender();
  }

  /**
   * 打开分类编辑器（贴到触发它的锚点弹出）。
   * target 是参照分类（右键的那个节点），mode 决定提交时写到哪：
   *   top     标题栏加号        → 新建顶层分类
   *   sibling 右键"增加同级分类" → 与 target 同级
   *   child   右键"增加子级分类" → 作为 target 的子分类
   *   rename  右键"修改分类"     → 把 target 改成输入的名字（输入框里预填原名）
   * anchor 是锚点：标题栏按钮（始终在下方）或被右键的分类行（下方放不下向上翻折）。
   */
  private openEditor(
    target: HTMLElement | null,
    mode: EditorMode,
    anchor: { rect: DOMRect; mayFlip: boolean },
  ): void {
    const placeholder =
      mode === "top" ? "新分类名称" :
      mode === "sibling" ? "同级分类名称" :
      mode === "child" ? "子分类名称" : "分类名称";
    Editor.open(anchor, { value: mode === "rename" ? Category.nameOf(target) : "", placeholder }, (result) => {
      // 传局部的 mode/target：请求期间用户可能又开了编辑器，字段会被改写
      void this.applyEditorResult(mode, target, result.name);
    });
  }

  /**
   * 提交分类编辑器：新增或改名，完成后重新加载分类树，让列表立刻反映结果。
   * 注意"重新加载"这一步放在 try 外面且无条件执行：不管写入成功、失败还是原生侧没回应，
   * 都要重新拉一次分类——否则界面上看不到刚做的改动，也没法暴露真实状态。
   */
  private async applyEditorResult(mode: EditorMode, target: HTMLElement | null, name: string): Promise<void> {
    // 新增成功时用返回的 id 选中刚建好的分类
    let createdId: number | null = null;
    try {
      if (mode === "rename") {
        const id = Category.nodeIdOf(target);
        if (id != null) await Msg.invoke("renameCategory", { id, name });
      } else {
        // 新增：父分类看 mode —— 同级挂到 target 的父分类下，子级挂到 target 下，顶层为 null
        const parentId =
          mode === "child" ? Category.nodeIdOf(target) :
          mode === "sibling" ? Category.parentIdOf(target) : null;
        const data = (await Msg.invoke("addCategory", parentId == null ? { name } : { name, parentId })) as
          | { id?: number }
          | undefined;
        const newId = data?.id;
        if (typeof newId === "number" && newId > 0) createdId = newId;
      }
    } catch {
      // 请求失败（原生侧报错或没回应）也往下走，统一刷新
    }
    // 不指定 id 时选中会按原 id 还原，改名后视觉不跳
    await this.loadAndRender(createdId);
  }

  /**
   * 删除分类。只删空分类：下面还挂着子分类或文章的，原生侧会挡回来并给一句原因，
   * 这里把原因弹给用户；确认框也因此不再提"连同子分类一起删"。
   */
  private async removeCategory(node: HTMLElement | null): Promise<void> {
    const id = Category.nodeIdOf(node);
    if (id == null) return;
    const name = Category.nameOf(node) || "该分类";
    // 用宿主浏览器的 confirm 弹窗；以后要做成应用内弹窗的话换掉这一句即可
    const confirmed = window.confirm(`删除分类「${name}」？`);
    if (!confirmed) return;

    try {
      const data = (await Msg.invoke("removeCategory", { id })) as { ok: boolean; reason?: string };
      // 挡回来的（有子分类 / 有文章）与 id 不存在都走这里：把原生给的原因原样弹出来
      if (!data?.ok) window.alert(data?.reason || "删除失败");
    } catch {
      // 原生侧没回应（消息丢失）：没有原因可弹，直接刷新反映真实状态
    }
    await this.loadAndRender();
  }

  /** 切换选中态：先摘掉旧的，再给新的戴上；传 null 即全部取消选中 */
  private applySelection(label: HTMLElement | null): void {
    this.selected?.classList.remove("selected");
    this.selected = label;
    this.selected?.classList.add("selected");
    this.selectedId = Category.categoryIdOf(label);
    // 选中变化就通知文章列表按分类过滤；没选中任何分类时传 null，它会加载全部
    ArticleTitle.setCategoryFilter(this.selectedId);
  }

  /** 取分类行所属节点的 id；没有选中时返回 null */
  private static categoryIdOf(label: HTMLElement | null): number | null {
    const id = label?.closest<HTMLLIElement>(".categoryNode")?.dataset.id;
    return id ? Number(id) : null;
  }

  /** 取节点的分类 id */
  private static nodeIdOf(node: HTMLElement | null): number | null {
    const id = node?.dataset.id;
    return id ? Number(id) : null;
  }

  /** 取节点的父分类 id；顶层分类返回 null */
  private static parentIdOf(node: HTMLElement | null): number | null {
    // 节点在 .categoryChildren 里，往上一层 li 就是父分类
    const parent = node?.parentElement?.closest<HTMLLIElement>(".categoryNode") ?? null;
    return parent ? Category.nodeIdOf(parent) : null;
  }

  /** 取节点显示的名称（改名时用来预填输入框） */
  private static nameOf(node: HTMLElement | null): string {
    return node?.querySelector<HTMLElement>(":scope > .categoryLabel > .categoryName")?.textContent ?? "";
  }

  /** 请求原生侧读取分类，并把扁平数据组织成树后渲染；selectId 指定重画后选中哪个分类 */
  private async loadAndRender(selectId: number | null = null): Promise<void> {
    try {
      const data = await Msg.invoke("getCategories");
      const rows: CategoryRow[] = (data as { categories?: CategoryRow[] }).categories ?? [];
      this.renderTree(Category.toTree(rows), selectId);
    } catch {
      // 读取失败时渲染空树，避免阻塞其余面板
      this.renderTree([], selectId);
    }
    // 分类数可能刚变过（新增/删除）：让状态栏重新数一次
    void StatusBar.refreshCounts();
  }

  /** 把原生侧返回的扁平分类行组织成多级树（保持传入顺序，父在前） */
  private static toTree(rows: CategoryRow[]): CategoryNode[] {
    const byId = new Map<number, CategoryNode>();
    for (const row of rows) {
      byId.set(row.id, { id: row.id, name: row.name });
    }
    const roots: CategoryNode[] = [];
    // 按行顺序把节点挂到父节点 children
    for (const row of rows) {
      const node = byId.get(row.id)!;
      if (row.parentId != null && byId.has(row.parentId)) {
        const parent = byId.get(row.parentId)!;
        parent.children ??= [];
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  /** 展开态图标：方框内一个减号 */
  private static readonly expandedIcon = "icon-removeRect";
  /** 折叠态图标：方框内一个加号 */
  private static readonly collapsedIcon = "icon-addRect";

  /**
   * 切换节点展开态。
   * collapsed 类与图标字形必须一起变，集中在此处修改，避免状态与图标对不上。
   */
  private static setExpanded(li: HTMLLIElement, expanded: boolean): void {
    li.classList.toggle("collapsed", !expanded);
    // 只找本节点自己的图标位，不能用 document 级查询，否则会改到别的节点
    const toggle = li.querySelector<HTMLElement>(":scope > .categoryLabel > .categoryToggle");
    if (!toggle) return;
    toggle.classList.toggle(Category.expandedIcon, expanded);
    toggle.classList.toggle(Category.collapsedIcon, !expanded);
  }

  /** 递归构建分类树 DOM，挂到 #category；selectId 用于指定重画后选中哪个分类 */
  private renderTree(nodes: CategoryNode[], selectId: number | null = null): void {
    // 新增/改名后是整棵重建，先把旧树摘掉，避免叠上去
    const content = this.content;
    if (!content) return;
    content.querySelector(".categoryTree")?.remove();
    // 旧节点已经离开文档，之前记的选中引用随之失效
    this.selected = null;

    const root = document.createElement("ul");
    root.className = "categoryTree";
    for (const node of nodes) {
      root.appendChild(this.buildNode(node));
    }
    content.appendChild(root);

    // 选中还原：优先用调用方指定的 id（新建的分类），否则沿用原来的选中；
    // 分类已经不在了就取消选中
    const keepId = selectId ?? this.selectedId;
    if (keepId == null) {
      this.applySelection(null);
      return;
    }
    const label = this.dom.querySelector<HTMLElement>(`.categoryNode[data-id="${keepId}"] > .categoryLabel`);
    this.applySelection(label);
  }

  /**
   * 构建单个分类节点（li）。
   * 只负责结构和图标字形，点击/右键这些交互统一交给 ready() 里的委托处理。
   */
  private buildNode(node: CategoryNode): HTMLLIElement {
    const li = document.createElement("li");
    li.className = "categoryNode";
    li.dataset.id = String(node.id);

    const label = document.createElement("div");
    label.className = "categoryLabel";

    // 图标位：父节点由 setExpanded 切换 +/−，叶节点在下面固定为减号
    const toggle = document.createElement("i");
    toggle.className = "icon categoryToggle";
    label.appendChild(toggle);

    const name = document.createElement("span");
    name.className = "categoryName";
    name.textContent = node.name;
    label.appendChild(name);
    li.appendChild(label);

    if (node.children && node.children.length > 0) {
      li.classList.add("hasChildren");
      Category.setExpanded(li, true); // 默认展开，显示减号

      const childUl = document.createElement("ul");
      childUl.className = "categoryChildren";
      for (const child of node.children) {
        childUl.appendChild(this.buildNode(child));
      }
      li.appendChild(childUl);
    } else {
      // 叶节点没有可折叠的子级，固定用减号作为分支终点，让同级的图标连成一条线
      toggle.classList.add(Category.expandedIcon);
    }

    return li;
  }
}

export default new Category();
