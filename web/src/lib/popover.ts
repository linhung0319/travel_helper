// 浮動層（標籤彈窗、⋯ 選單）放在哪裡（設計 §2.1、§2.3）：純函式，給 Popover.tsx 用。
// 預設在 anchor 下面、左緣對齊；下面放不下就翻到上面，右邊超出就改成右緣對齊 anchor，最後夾在視窗裡（離邊緣至少 8px）。

/** getBoundingClientRect() 的那幾個欄位 */
export interface DOMRectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/** 離視窗邊緣最少幾 px */
const EDGE = 8;

/** 浮動層左上角的座標（position: fixed 用的 left、top） */
export function placePopover(anchor: DOMRectLike, size: { w: number; h: number }, viewport: { w: number; h: number }, gap = 6): { left: number; top: number } {
  let top = anchor.bottom + gap;
  if (top + size.h > viewport.h - EDGE) top = anchor.top - gap - size.h;
  let left = anchor.left;
  if (left + size.w > viewport.w - EDGE) left = anchor.right - size.w;
  return {
    left: Math.max(EDGE, Math.min(left, viewport.w - EDGE - size.w)),
    top: Math.max(EDGE, Math.min(top, viewport.h - EDGE - size.h)),
  };
}
