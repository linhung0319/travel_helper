// 螢幕鍵盤（interaction-design §16.3）：手機和橫拿 iPad 才有，全站一份。
// 鍵盤出現時，版面（.m-app、.layout）和貼底的東西用 --kb 讓出來，不讓瀏覽器把整頁往上推；根元素加 data-keyboard（手機藏分頁列、聊天收建議問題）。
// iOS、多數 Android：layout 不變，visualViewport 變矮 → --kb 是差的那段。部分 Android WebView：layout 本身變矮 → --kb 是 0，只靠高度比較判斷鍵盤開著。

/** 比平常矮多少才算鍵盤（網址列收合只差幾十 px） */
const MIN_KEYBOARD = 120;

export interface KeyboardInput {
  /** 這個寬度看過最高的可視高度 */
  baseline: number;
  /** visualViewport 的高度 */
  visualHeight: number;
  /** window.innerHeight（layout 的高度） */
  layoutHeight: number;
  /** 焦點在會打字的輸入框 */
  focused: boolean;
}

/** open：鍵盤開著；inset：版面要讓出來的高度（layout 自己變矮時是 0） */
export function keyboardState({ baseline, visualHeight, layoutHeight, focused }: KeyboardInput): { open: boolean; inset: number } {
  const open = focused && baseline - visualHeight > MIN_KEYBOARD;
  return { open, inset: open ? Math.max(0, Math.round(layoutHeight - visualHeight)) : 0 };
}

const NO_KEYBOARD = new Set(['checkbox', 'radio', 'button', 'submit', 'range', 'color', 'file', 'time', 'date']);

function isTextField(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && !NO_KEYBOARD.has((el as HTMLInputElement).type);
}

/** 輸入框所在的捲動區自己捲到看得到（不用 scrollIntoView：它連 overflow: hidden 的外層都會捲）；下面多留一點給同一列的按鈕 */
export function revealInScroller(el: HTMLElement, margin = 56) {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY;
    if ((y !== 'auto' && y !== 'scroll') || p.scrollHeight <= p.clientHeight) continue;
    const box = p.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.bottom + margin > box.bottom) p.scrollTop += r.bottom + margin - box.bottom;
    else if (r.top < box.top) p.scrollTop -= box.top - r.top + 8;
    return;
  }
}

/** 開始看鍵盤；onChange：開關時（地圖要重新算大小） */
export function watchKeyboard(onChange: () => void): () => void {
  const root = document.documentElement;
  const vv = window.visualViewport;
  const baselines = new Map<number, number>();
  let wasOpen = false;
  let lastInset = 0;
  let lastHeight = 0;
  let revealTimer: number | undefined;

  /** 鍵盤升起時輸入框要一直看得到：版面排好就捲，鍵盤動畫、瀏覽器自己的捲動都結束後再確認一次 */
  const reveal = () => {
    const show = () => {
      const el = document.activeElement;
      if (wasOpen && isTextField(el)) revealInScroller(el as HTMLElement);
    };
    requestAnimationFrame(show);
    window.clearTimeout(revealTimer);
    revealTimer = window.setTimeout(show, 350);
  };

  const update = () => {
    const visualHeight = vv?.height ?? window.innerHeight;
    const width = Math.round(vv?.width ?? window.innerWidth);
    const baseline = Math.max(baselines.get(width) ?? 0, visualHeight);
    baselines.set(width, baseline);
    const { open, inset } = keyboardState({ baseline, visualHeight, layoutHeight: window.innerHeight, focused: isTextField(document.activeElement) });
    if (open !== wasOpen || inset !== lastInset) {
      root.style.setProperty('--kb', `${inset}px`);
      if (open) root.setAttribute('data-keyboard', '');
      else root.removeAttribute('data-keyboard');
      wasOpen = open;
      lastInset = inset;
      onChange();
    }
    // 鍵盤是一段一段升上來的（每一段都會有 resize）：只在第一段捲的話，輸入框會被後面升上來的鍵盤蓋住
    if (open && visualHeight !== lastHeight) reveal();
    lastHeight = visualHeight;
    // iOS 聚焦時會把整頁往上推：版面已經讓開了，推回來
    if (open && (window.scrollY > 0 || (vv?.offsetTop ?? 0) > 0)) window.scrollTo(0, 0);
  };

  // 鍵盤已經開著時換輸入框：不會有 resize，自己捲；收鍵盤時焦點先離開
  const onFocus = (e: FocusEvent) => {
    update();
    if (wasOpen && e.target instanceof HTMLElement && isTextField(e.target)) revealInScroller(e.target);
    window.setTimeout(update, 350);
  };
  const onBlur = () => window.setTimeout(update, 60);

  vv?.addEventListener('resize', update);
  vv?.addEventListener('scroll', update);
  window.addEventListener('resize', update);
  document.addEventListener('focusin', onFocus);
  document.addEventListener('focusout', onBlur);
  update();
  return () => {
    window.clearTimeout(revealTimer);
    vv?.removeEventListener('resize', update);
    vv?.removeEventListener('scroll', update);
    window.removeEventListener('resize', update);
    document.removeEventListener('focusin', onFocus);
    document.removeEventListener('focusout', onBlur);
    root.style.removeProperty('--kb');
    root.removeAttribute('data-keyboard');
  };
}
