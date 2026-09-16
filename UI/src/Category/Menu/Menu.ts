import "./Menu.scss";
import html from "./Menu.html?raw";
import CtrlBase from "../../CtrlBase";

/**
 * 分类节点的右键菜单（模块单例）。
 * 平时不在 DOM 里：第一次 open() 时才把模板挂到 document.body
 * （不能挂在 #category 里，那个容器 overflow-y:auto 会把弹层裁掉），之后只切换 .open。
 * 三个菜单项的功能还没接，各自的 data-action 已经留好，动作在 ready() 的委托里统一处理。
 * 选中态属于分类行（见 Category），菜单项本身只有 hover。
 */
class Menu extends CtrlBase {
  /** 被右键的分类节点；将来增删分类要靠它定位（对外可读，方便后续接线） */
  target: HTMLElement | null = null;

  constructor() {
    super(html);
  }

  override ready(): void {
    // 菜单项统一用事件委托，将来接功能只改这一处
    this.dom.addEventListener("click", (e) => {
      const item = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
      if (!item) return;
      // TODO: 接三个菜单项的功能，data-action 取值 addSibling / addChild / remove，
      //       被右键的分类节点在 this.target 上
      this.close();
    });

    // 点空白、页面滚动、窗口失焦、Esc 都关闭
    document.addEventListener("mousedown", (e) => {
      if (!this.dom || !this.dom.contains(e.target as Node)) this.close();
    });
    // 用捕获：滚动可能发生在 #category 这个内层滚动容器上，scroll 不冒泡
    document.addEventListener("scroll", () => this.close(), true);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.close();
    });
    window.addEventListener("blur", () => this.close());
  }

  /** 在视口坐标 (x, y) 弹出菜单，target 是被右键的分类节点 */
  open(x: number, y: number, target: HTMLElement): void {
    this.target = target;
    if (!this.dom) {
      this.appendTo(document.body);
    }
    // 先显示再量尺寸：隐藏时量到的是 0，越界回收的判断会失效
    this.dom.classList.add("open");
    const { width, height } = this.dom.getBoundingClientRect();
    // 贴住鼠标位置，超出窗口就往回收，四周留 4px
    const left = Math.max(4, Math.min(x, window.innerWidth - width - 4));
    const top = Math.max(4, Math.min(y, window.innerHeight - height - 4));
    this.dom.style.left = `${left}px`;
    this.dom.style.top = `${top}px`;
  }

  close(): void {
    this.dom?.classList.remove("open");
  }
}

export default new Menu();
