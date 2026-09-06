/**
 * 滚动条 hover 显示增强。
 *
 * 背景：Chromium 中 `::-webkit-scrollbar` 系列伪元素的样式，只有当滚动条自身区域
 * 被交互时才触发重绘，纯 CSS 用 `.container:hover::-webkit-scrollbar-thumb` 实现
 * "鼠标进入滚动内容区就显示滑块" 不可靠（内容区悬停不生效 / 移出后不还原）。
 *
 * 方案：鼠标进入任意可滚动容器（或其任意后代）时给容器加 .sb-live，
 * 移出时移除；CSS 通过 .sb-live 控制滑块显隐，规避伪元素 :hover 重绘缺陷。
 */
const LIVE_CLASS = "sb-live";

let current: HTMLElement | null = null;

/** 元素是否真的发生滚动溢出（overflow 为 auto/scroll 且内容超出） */
function hasOverflow(el: Element): boolean {
  const cs = window.getComputedStyle(el);
  const x = cs.overflowX;
  const y = cs.overflowY;
  const xOk = (x === "auto" || x === "scroll") && el.scrollWidth > el.clientWidth + 0.5;
  const yOk = (y === "auto" || y === "scroll") && el.scrollHeight > el.clientHeight + 0.5;
  return xOk || yOk;
}

/** 向上找最近一个真正可滚动的祖先（含自身） */
function findScrollable(node: EventTarget | null): HTMLElement | null {
  let el = node instanceof Element ? node : null;
  while (el && el !== document.documentElement) {
    if (hasOverflow(el)) return el as HTMLElement;
    el = el.parentElement;
  }
  return null;
}

function show(el: HTMLElement) {
  if (current !== el) {
    current?.classList.remove(LIVE_CLASS);
    current = el;
  }
  el.classList.add(LIVE_CLASS);
}

function hide(el: HTMLElement | null) {
  if (el) el.classList.remove(LIVE_CLASS);
  if (current === el) current = null;
}

document.addEventListener(
  "mouseover",
  (e) => {
    // 鼠标已在当前滚动容器内移动，无需重复探测
    if (current?.contains(e.target as Node)) return;
    const sc = findScrollable(e.target);
    if (sc) show(sc);
  },
  true,
);

document.addEventListener(
  "mouseout",
  (e) => {
    if (!current) return;
    const from = e.target as Element | null;
    if (!(from instanceof Element) || !current.contains(from)) return;
    const to = e.relatedTarget as Node | null;
    // 仍在当前容器内（子元素间移动 / 移到滚动条上）则保持显示
    if (to instanceof Node && current.contains(to)) return;
    hide(current);
  },
  true,
);

// 滚动发生时（滚轮 / 键盘 / 程序滚动）也短暂亮起，即使鼠标恰好不在元素上。
// 到点后若鼠标已回到容器上则不隐藏，交给 mouseover/mouseout 维持。
let hideTimer = 0;
document.addEventListener(
  "scroll",
  (e) => {
    const el = e.target as HTMLElement | null;
    if (!el || !(el instanceof HTMLElement)) return;
    show(el);
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      if (current && !current.matches(":hover")) hide(current);
    }, 1200);
  },
  true,
);
