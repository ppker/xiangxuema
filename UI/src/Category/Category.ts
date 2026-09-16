import "./Category.scss";
import html from "./Category.html?raw";
import CtrlBase from "../CtrlBase";

/** 分类节点 */
interface CategoryNode {
  id: number;
  name: string;
  /** 子分类；省略或无子节点时为叶节点 */
  children?: CategoryNode[];
}

/* 测试数据：组织一个两级树形分类，后续替换为从数据库读取 */
const TEST_CATEGORIES: CategoryNode[] = [
  { id: 1, name: "工作", children: [
    { id: 11, name: "项目文档" },
    { id: 12, name: "会议纪要" },
  ]},
  { id: 2, name: "学习", children: [
    { id: 21, name: "编程" },
    { id: 22, name: "英语", children: [
      { id: 221, name: "词汇" },
      { id: 222, name: "听力" },
    ]},
  ]},
  { id: 3, name: "生活", children: [
    { id: 31, name: "饮食" },
    { id: 32, name: "旅行" },
  ]},
  { id: 3, name: "生活", children: [
    { id: 31, name: "饮食" },
    { id: 32, name: "旅行" },
  ]}
];

/**
 * 左侧分类目录面板（模块单例）。
 * 面板即 #category 自身，由 ContentBox 挂到分栏槽位。
 * 以原生 DOM 递归渲染 ul/li 树形分类，支持点击展开/收起子分类。
 */
class Category extends CtrlBase {
  constructor() {
    super(html);
  }

  override ready(): void {
    this.renderTree(TEST_CATEGORIES);
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