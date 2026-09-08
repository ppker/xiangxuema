import alignCenterSvg from "./icon/align-center.svg?raw";
import alignJustifySvg from "./icon/align-justify.svg?raw";
import alignLeftSvg from "./icon/align-left.svg?raw";
import alignRightSvg from "./icon/align-right.svg?raw";
import "./AlignSelect.scss";

interface AlignOption {
  value: string;
  label: string;
  svg: string;
}

/** 对齐方式选项：左/居中/右/两端为段落水平对齐，垂直居中对齐表格单元格内容 */
const ALIGN_OPTIONS: AlignOption[] = [
  { value: "left", label: "左对齐", svg: alignLeftSvg },
  { value: "center", label: "居中对齐", svg: alignCenterSvg },
  { value: "right", label: "右对齐", svg: alignRightSvg },
  { value: "justify", label: "两端对齐", svg: alignJustifySvg },
];

const DEFAULT_ALIGN = "left";

interface AlignSelectProps {
  /** 当前对齐值；缺省为左对齐 */
  value?: string;
  /** 选中值变化时回调（箭头键移动也会触发，同原生 select 的 change 时机） */
  onSelect?: (value: string) => void;
}

/**
 * 对齐方式下拉框（div 模拟原生 <select>）。
 *
 * UI2 采用无框架极简运行时：静态 DOM 只创建一次、无重渲染。
 * 菜单部分按需创建：首次点击/键盘展开时才动态创建下拉选项 DOM，
 * 收起（选中 / Esc / Tab / 点击其它区域）时直接销毁，页面上不常驻选项节点。
 */
export default function AlignSelect(props: AlignSelectProps = {}) {
  const emit = props.onSelect;
  const init = ALIGN_OPTIONS.find((o) => o.value === props.value) ?? ALIGN_OPTIONS[0];

  // ---------- 静态结构：只渲染字段，不含任何菜单 DOM ----------
  const root = document.createElement("div");
  root.className = "alignSelect";
  root.dataset.value = init.value;

  const field = document.createElement("div");
  field.className = "alignField";
  field.setAttribute("role", "combobox");
  field.setAttribute("aria-haspopup", "listbox");
  field.setAttribute("aria-expanded", "false");
  field.tabIndex = 0;
  field.title = "对齐方式";

  const cur = document.createElement("span");
  cur.className = "alignCur alignIcon";
  cur.title = init.label;
  cur.innerHTML = init.svg;

  const arrow = document.createElement("span");
  arrow.className = "alignArrow";
  arrow.setAttribute("aria-hidden", "true");

  field.append(cur, arrow);
  root.append(field);

  // ---------- 内部状态（仅在本实例闭包内，DOM 为唯一状态源） ----------
  let menuEl: HTMLElement | null = null;

  const getField = () => root.querySelector<HTMLElement>(".alignField");
  const getItems = (): HTMLElement[] =>
    menuEl ? Array.from(menuEl.querySelectorAll<HTMLElement>(".alignOption")) : [];

  const isOpen = () => root.classList.contains("open");

  /** 把某值应用到字段显示 + root 状态，并回调 */
  const applyValue = (val: string) => {
    root.dataset.value = val;
    const o = ALIGN_OPTIONS.find((x) => x.value === val);
    if (o) {
      cur.title = o.label;
      cur.innerHTML = o.svg;
    }
    emit?.(val);
  };

  /** 打开：构建并挂载菜单；展开时页面中恰好只有这一份下拉选项 DOM */
  const open = () => {
    if (isOpen()) return;
    const menu = document.createElement("div");
    menu.className = "alignMenu scrollContainer";
    menu.setAttribute("role", "listbox");
    for (const o of ALIGN_OPTIONS) {
      const item = document.createElement("div");
      const on = o.value === root.dataset.value;
      item.className = "alignOption" + (on ? " selected" : "");
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(on));
      item.dataset.value = o.value;
      const ic = document.createElement("span");
      ic.className = "alignOptionIcon";
      ic.title = o.label;
      ic.innerHTML = o.svg;
      item.append(ic);
      item.addEventListener("click", () => {
        applyValue(o.value);
        close();
      });
      menu.append(item);
    }
    menuEl = menu;
    root.append(menu);
    root.classList.add("open");
    getField()?.setAttribute("aria-expanded", "true");
    getField()?.focus();
    bindGlobalClose();
  };

  /** 关闭：移除菜单并销毁其全部选项 DOM */
  const close = () => {
    if (!isOpen()) return;
    root.classList.remove("open");
    getField()?.setAttribute("aria-expanded", "false");
    menuEl?.remove();
    menuEl = null;
  };

  // ---------- 字段事件 ----------

  // 阻止 mousedown 默认行为抢走编辑器焦点，保证键盘可用
  field.addEventListener("mousedown", (e) => e.preventDefault());

  field.addEventListener("click", () => {
    if (isOpen()) close();
    else open();
  });

  field.addEventListener("keydown", (e) => {
    if (e.key === "Escape" || e.key === "Tab") {
      if (isOpen()) close();
      return; // Tab 不阻止默认，允许焦点移走
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter" && e.key !== " ")
      return;
    e.preventDefault();

    if (!isOpen()) {
      open(); // 首次按键只负责展开，行为同原生 select
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      close(); // 确认当前高亮后收起
      return;
    }
    // 上下移动：定位当前值索引，移动一格后实时应用
    const items = getItems();
    if (items.length === 0) return;
    const idx = items.findIndex((it) => it.dataset.value === root.dataset.value);
    const start = idx < 0 ? (e.key === "ArrowDown" ? -1 : 0) : idx;
    const next = start + (e.key === "ArrowDown" ? 1 : -1);
    const ni = ((next % items.length) + items.length) % items.length;
    const target = items[ni];
    const val = target.dataset.value ?? "";
    applyValue(val);
    items.forEach((it) => {
      const on = it === target;
      it.classList.toggle("selected", on);
      it.setAttribute("aria-selected", String(on));
    });
  });

  // ---------- 点击其它区域自动收起（打开一次后惰性绑定，仅操作自己的实例） ----------

  let globalBound = false;
  const onDocPointerDown = (e: Event) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest<HTMLElement>(".alignSelect") === root) return; // 点在本控件内交给字段/选项处理
    close();
  };
  function bindGlobalClose() {
    if (globalBound) return;
    globalBound = true;
    document.addEventListener("pointerdown", onDocPointerDown, true);
  }

  return root;
}
