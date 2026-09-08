import "./DropBox.scss";

export interface DropBoxOption {
  value: string;
  /** 显示文本，缺省用 value */
  label?: string;
  /** 若提供，选项与当前值文本会以该字体渲染（如字体下拉的预览） */
  font?: string;
  /** 若提供，选项与当前值以该 SVG 原始字符串渲染图标；此时 label 仅作为 title 提示 */
  svg?: string;
}

interface DropBoxProps {
  title?: string;
  options: DropBoxOption[];
  /** 初始选中值；不在 options 中时按普通文本显示，不产生选中高亮 */
  value?: string;
  /** 选中值变化时回调（箭头键移动也会触发，同原生 select 的 change 时机） */
  onSelect?: (value: string) => void;
}

/**
 * 用 div 模拟原生 <select> 的下拉框控件。
 *
 * UI2 采用无框架极简运行时：DOM 只创建一次、无重渲染。
 * 因此这里不依赖响应式状态，展开/收起、选中高亮等交互全部通过
 * 事件闭包 + 直接操作 class / textContent 完成，无需任何重渲染机制。
 */
export default function DropBox(props: DropBoxProps) {
  const opts = props.options ?? [];
  const value = props.value ?? "";
  const initial = opts.find((o) => o.value === value);
  const label = initial?.label ?? value;

  // ---------- 事件处理（都从 currentTarget 定位自己所属 root，避免全局查询） ----------

  const onFieldClick = (e: MouseEvent) => {
    const field = e.currentTarget as HTMLElement;
    const root = field.closest<HTMLElement>(".dropBox");
    if (!root) return;
    if (root.classList.contains("open")) closeBox(root);
    else openBox(root);
  };

  // 阻止点击抢走焦点，保证键盘可用
  const onFieldMouseDown = (e: MouseEvent) => e.preventDefault();

  const onOptionClick = (e: MouseEvent) => {
    const item = e.currentTarget as HTMLElement;
    const root = item.closest<HTMLElement>(".dropBox");
    if (!root) return;
    const val = item.dataset.value ?? "";
    selectValue(root, item);
    closeBox(root);
    props.onSelect?.(val);
  };

  const onFieldKeyDown = (e: KeyboardEvent) => {
    const field = e.currentTarget as HTMLElement;
    const root = field.closest<HTMLElement>(".dropBox");
    if (!root) return;
    const key = e.key;
    if (key === "Escape" || key === "Tab") {
      if (root.classList.contains("open")) closeBox(root);
      return;
    }
    if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Enter" && key !== " ") return;

    e.preventDefault();
    const items = getItems(root);
    if (items.length === 0) return;

    if (!root.classList.contains("open")) {
      openBox(root);
      return;
    }

    if (key === "Enter" || key === " ") {
      // 箭头移动时已实时应用当前高亮，这里确认后收起
      closeBox(root);
      return;
    }

    // 上下移动：先定位当前值索引，移动一格后应用并回调
    const idx = items.findIndex((it) => it.dataset.value === root.dataset.value);
    const start = idx < 0 ? (key === "ArrowDown" ? -1 : 0) : idx;
    const next = start + (key === "ArrowDown" ? 1 : -1);
    const ni = ((next % items.length) + items.length) % items.length;
    const target = items[ni];
    const val = target.dataset.value ?? "";
    selectValue(root, target);
    props.onSelect?.(val);
  };

  // ---------- 静态结构（DOM 只创建一次，之后靠 selectValue 更新） ----------

  const textStyle = initial?.font ? { fontFamily: initial.font } : undefined;
  const fieldContent = initial?.svg ? (
    <span
      class="dropBoxText dropBoxIcon"
      title={initial.label ?? initial.value}
      innerHTML={initial.svg}
    />
  ) : (
    <span class="dropBoxText" style={textStyle}>
      {label}
    </span>
  );
  return (
    <div class="dropBox" data-value={value}>
      <div
        class="dropBoxField"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded="false"
        tabindex="0"
        title={props.title}
        onClick={onFieldClick}
        onMouseDown={onFieldMouseDown}
        onKeyDown={onFieldKeyDown}
      >
        {fieldContent}
        <span class="dropBoxArrow" aria-hidden="true" />
      </div>
      <div class="dropBoxMenu scrollContainer" role="listbox">
        {opts.map((o) => (
          <div
            class={"dropBoxOption" + (o.value === value ? " selected" : "")}
            role="option"
            aria-selected={String(o.value === value)}
            data-value={o.value}
            data-label={o.label ?? o.value}
            data-font={o.font ?? ""}
            style={o.font ? { fontFamily: o.font } : undefined}
            onClick={onOptionClick}
          >
            {o.svg ? (
              <span class="dropBoxOptionIcon" title={o.label ?? o.value} innerHTML={o.svg} />
            ) : (
              (o.label ?? o.value)
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- 共享操作（同一时刻只允许一个下拉展开） ----------

function getItems(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(".dropBoxOption"));
}

function getField(root: HTMLElement): HTMLElement {
  return root.querySelector<HTMLElement>(".dropBoxField") as HTMLElement;
}

/** 展开：关闭其它所有下拉，再打开当前这一个。 */
function openBox(root: HTMLElement) {
  if (root.classList.contains("open")) return;
  bindGlobalClose();
  document.querySelectorAll<HTMLElement>(".dropBox.open").forEach((box) => {
    if (box !== root) closeBox(box);
  });
  root.classList.add("open");
  getField(root).setAttribute("aria-expanded", "true");
  getField(root).focus();
}

function closeBox(root: HTMLElement) {
  if (!root.classList.contains("open")) return;
  root.classList.remove("open");
  getField(root).setAttribute("aria-expanded", "false");
}

/** 把 item 的选项同步到 root：更新文本/图标、字体预览、选中高亮与当前值。 */
function selectValue(root: HTMLElement, item: HTMLElement) {
  const val = item.dataset.value ?? "";
  const lbl = item.dataset.label ?? val;
  const font = item.dataset.font ?? "";

  root.dataset.value = val;
  const text = root.querySelector<HTMLElement>(".dropBoxText");
  if (text) {
    const srcIcon = item.querySelector<HTMLElement>(".dropBoxOptionIcon");
    if (srcIcon) {
      text.classList.add("dropBoxIcon");
      text.innerHTML = srcIcon.innerHTML;
      text.title = srcIcon.title;
      text.style.fontFamily = "";
    } else {
      text.classList.remove("dropBoxIcon");
      text.textContent = lbl;
      text.style.fontFamily = font;
      text.title = "";
    }
  }
  getItems(root).forEach((it) => {
    const on = it === item;
    it.classList.toggle("selected", on);
    it.setAttribute("aria-selected", String(on));
  });
}

// 点击其它区域 / 其它下拉时，自动关闭当前展开的下拉。
// 无 mount 生命周期：首次 openBox 时惰性绑定一次全局监听。
let globalCloseBound = false;
function bindGlobalClose() {
  if (globalCloseBound) return;
  globalCloseBound = true;
  document.addEventListener(
    "pointerdown",
    (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const inside = t.closest<HTMLElement>(".dropBox");
      document.querySelectorAll<HTMLElement>(".dropBox.open").forEach((box) => {
        if (inside !== box) closeBox(box);
      });
    },
    true,
  );
}
