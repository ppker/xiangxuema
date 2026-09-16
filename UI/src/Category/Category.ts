import "./Category.scss";
import html from "./Category.html?raw";
import CtrlBase from "../CtrlBase";
import Msg from "../Msg";
import Header from "./Header/Header";
import Menu from "./Menu/Menu";
import ArticleTitle from "../ArticleTitle/ArticleTitle";

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

/**
 * 左侧分类目录面板（模块单例）。
 * 面板即 #category 自身，由 ContentBox 挂到分栏槽位。
 * 内部先挂 Header 标题栏，再在它下面挂分类树；
 * 启动时通过 Msg 请求原生侧从数据库读取分类，以原生 DOM 递归渲染 ul/li 树形分类。
 * 点击分工：点名称（含它的整片背景）选中/取消选中；点名称左侧的 +/− 图标展开/折叠；
 * 右键弹出 Menu 并顺手选中该分类。
 */
class Category extends CtrlBase {
  /** 当前选中的分类行（.categoryLabel）；null 表示没有选中 */
  private selected: HTMLElement | null = null;

  constructor() {
    super(html);
  }

  override ready(): void {
    Header.appendTo(this.dom);

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

    void this.loadAndRender();
  }

  /** 切换选中态：先摘掉旧的，再给新的戴上；传 null 即全部取消选中 */
  private applySelection(label: HTMLElement | null): void {
    this.selected?.classList.remove("selected");
    this.selected = label;
    this.selected?.classList.add("selected");
    // 选中变化就通知文章列表按分类过滤；没选中任何分类时传 null，它会加载全部
    ArticleTitle.setCategoryFilter(Category.categoryIdOf(label));
  }

  /** 取分类行所属节点的 id；没有选中时返回 null */
  private static categoryIdOf(label: HTMLElement | null): number | null {
    const id = label?.closest<HTMLLIElement>(".categoryNode")?.dataset.id;
    return id ? Number(id) : null;
  }

  /** 请求原生侧读取分类，并把扁平数据组织成树后渲染 */
  private async loadAndRender(): Promise<void> {
    try {
      const data = await Msg.invoke("getCategories");
      const rows: CategoryRow[] = (data as { categories?: CategoryRow[] }).categories ?? [];
      this.renderTree(Category.toTree(rows));
    } catch {
      // 读取失败时渲染空树，避免阻塞其余面板
      this.renderTree([]);
    }
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

  /** 递归构建分类树 DOM，挂到 #category */
  private renderTree(nodes: CategoryNode[]): void {
    const root = document.createElement("ul");
    root.className = "categoryTree";
    for (const node of nodes) {
      root.appendChild(this.buildNode(node));
    }
    this.dom.appendChild(root);
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