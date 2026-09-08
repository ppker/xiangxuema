export default abstract class CtrlBase {
  protected readonly templateHtml: string;
  dom: HTMLElement | null = null;
  constructor(templateHtml: string) {
    this.templateHtml = templateHtml;
  }
  ready() {}
  /** 把模板插入 parent 末尾并调用 ready()；模板须为单一根元素，返回该根节点 */
  appendTo(parent: HTMLElement) {
    parent.insertAdjacentHTML("beforeend", this.templateHtml);
    this.dom = parent.lastElementChild as HTMLElement;
    this.ready();
  }
}
