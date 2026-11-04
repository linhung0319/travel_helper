// 一排橫滑的晶片（地區列、子地區列，T49）：手機用手指滑；網頁補三件事——滑鼠滾輪在這排上直接橫捲、按住拖、
// 超出時兩端淡出加 ‹ › 小箭頭（一次捲一個畫面寬，捲到底那邊的箭頭不出現；手機 .m-app 裡不畫箭頭、不淡出）。
// 選到的鈕（aria-pressed）在 activeKey 變了時自動捲進畫面（地圖的地區標籤、AI 換區時）。

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** 按住拖超過幾 px 才算拖（不到就是點） */
const DRAG_SLOP = 4;
/** 箭頭一次捲的寬度：這排看得到的寬度扣掉兩邊箭頭蓋住的地方，前後不漏掉鈕 */
const ARROW_COVER = 56;

export function ChipScroller({ className, testId, activeKey, children }: { className: string; testId?: string; activeKey?: string | null; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // 寬度有小數、scrollWidth 是整數：捲到底時 scrollLeft 可能差不到 1px，用無條件進位比（T69）
    const max = el.scrollWidth - el.clientWidth;
    const start = el.scrollLeft > 1;
    const end = Math.ceil(el.scrollLeft) < max - 1;
    setEdge((e) => (e.start === start && e.end === end ? e : { start, end }));
  }, []);

  // 量兩端：捲動、這排或裡面的鈕變寬變窄時
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    // 平滑捲動（‹ › 箭頭）停下來再量一次，箭頭才不會卡著
    el.addEventListener('scrollend', measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const c of Array.from(el.children)) ro.observe(c);
    return () => {
      el.removeEventListener('scroll', measure);
      el.removeEventListener('scrollend', measure);
      ro.disconnect();
    };
  }, [measure, children]);

  // 滾輪：直的滾輪換成橫捲（這排捲得動時才攔下來，捲到底就讓外面照常捲）
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      if ((d < 0 && el.scrollLeft <= 0) || (d > 0 && el.scrollLeft >= max - 1)) return;
      e.preventDefault();
      el.scrollLeft += d;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // 按住拖（只有滑鼠；手指本來就能滑）：拖過了就不算點到鈕
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let from: { x: number; left: number; id: number } | null = null;
    let dragged = false;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || el.scrollWidth <= el.clientWidth) return;
      from = { x: e.clientX, left: el.scrollLeft, id: e.pointerId };
      dragged = false;
    };
    const onMove = (e: PointerEvent) => {
      if (!from || e.pointerId !== from.id) return;
      const dx = e.clientX - from.x;
      if (!dragged && Math.abs(dx) < DRAG_SLOP) return;
      if (!dragged) {
        dragged = true;
        el.setPointerCapture(e.pointerId);
        el.classList.add('dragging');
      }
      el.scrollLeft = from.left - dx;
    };
    const onUp = (e: PointerEvent) => {
      if (!from || e.pointerId !== from.id) return;
      from = null;
      el.classList.remove('dragging');
      if (!dragged) return;
      // 放開時的 click 不要點到鈕
      const eat = (ev: MouseEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      el.addEventListener('click', eat, { capture: true, once: true });
      setTimeout(() => el.removeEventListener('click', eat, { capture: true }), 0);
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, []);

  // 選到的鈕捲進畫面（只動這排的橫向，不動外面的直向捲動）
  useEffect(() => {
    const el = ref.current;
    const on = el?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!el || !on) return;
    const pad = ARROW_COVER / 2;
    const left = on.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
    const right = left + on.offsetWidth;
    if (left < el.scrollLeft + pad) el.scrollTo({ left: Math.max(0, left - pad), behavior: 'smooth' });
    else if (right > el.scrollLeft + el.clientWidth - pad) el.scrollTo({ left: right - el.clientWidth + pad, behavior: 'smooth' });
  }, [activeKey]);

  const page = (dir: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * Math.max(80, el.clientWidth - ARROW_COVER), behavior: 'smooth' });
  };

  return (
    <div className={`ui-hscroll ${edge.start ? 'at-start-more' : ''} ${edge.end ? 'at-end-more' : ''}`}>
      <div className={`${className} ui-hscroll-row`} ref={ref} data-testid={testId}>
        {children}
      </div>
      {edge.start && (
        <button type="button" className="ui-hscroll-arrow prev" aria-label="往前捲" tabIndex={-1} onClick={() => page(-1)} data-testid={testId ? `${testId}-prev` : undefined}>
          ‹
        </button>
      )}
      {edge.end && (
        <button type="button" className="ui-hscroll-arrow next" aria-label="往後捲" tabIndex={-1} onClick={() => page(1)} data-testid={testId ? `${testId}-next` : undefined}>
          ›
        </button>
      )}
    </div>
  );
}
