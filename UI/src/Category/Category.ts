import "./Category.scss";
import html from "./Category.html?raw";
import CtrlBase from "../CtrlBase";
import Msg from "../Msg";

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
 * 启动时通过 Msg 请求原生侧从数据库读取分类，再以原生 DOM 递归渲染 ul/li 树形分类，
 * 支持点击展开/收起子分类。
 */
class Category extends CtrlBase {
  constructor() {
    super(html);
  }

  override ready(): void {
    void this.loadAndRender();
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

  /** 递归构建分类树 DOM，挂到 #category */
  private renderTree(nodes: CategoryNode[]): void {
    const root = document.createElement("ul");
    root.className = "categoryTree";
    for (const node of nodes) {
      root.appendChild(this.buildNode(node));
    }
    this.dom.appendChild(root);
  }

  /** 构建单个分类节点（li）；有子分类时可点击标签展开/收起 */
  private buildNode(node: CategoryNode): HTMLLIElement {
    const li = document.createElement("li");
    li.className = "categoryNode";
    li.dataset.id = String(node.id);

    const label = document.createElement("div");
    label.className = "categoryLabel";
    label.textContent = node.name;
    li.appendChild(label);

    if (node.children && node.children.length > 0) {
      li.classList.add("hasChildren");

      const childUl = document.createElement("ul");
      childUl.className = "categoryChildren";
      for (const child of node.children) {
        childUl.appendChild(this.buildNode(child));
      }
      li.appendChild(childUl);

      // 点击标签展开/收起子分类
      label.addEventListener("click", (e) => {
        e.stopPropagation();
        li.classList.toggle("collapsed");
      });
    }

    return li;
  }
}

export default new Category();