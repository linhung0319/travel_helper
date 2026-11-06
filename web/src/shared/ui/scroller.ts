// 往上找捲動的容器（網頁右欄的 .side-body）：篩選列量黏頂高度、時間軸捲到卡片用。

/** 往上找第一個 overflow-y 是 auto／scroll 的祖先 */
export function scrollerOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY;
    if (y === 'auto' || y === 'scroll') return p;
  }
  return null;
}
