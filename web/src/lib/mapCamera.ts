// 選中一個點時地圖怎麼動（T15m 第七輪 §8.2「能不動就不動」）：純函式，MapView 拿去用，Node 也能測。
// 可見範圍＝地圖扣掉蓋在上面的東西（手機的行程面板、網頁從行程打開、浮在地圖右邊的詳情）。

/** 畫面上的一塊長方形（像素；和 DOMRect 的 left／top／right／bottom 一樣） */
export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** 點離可見範圍的邊至少要這麼遠才算看得到 */
export const SELECT_INSET = 24;
/** 縮放小於這個才拉近 */
export const SELECT_MIN_ZOOM = 12;
/** 拉近到這裡 */
export const SELECT_ZOOM = 13;

export type SelectMove = { kind: 'stay' } | { kind: 'pan' } | { kind: 'zoom'; zoom: 13 };

/**
 * 選中一個點（p 是它在地圖上的像素位置）：在 visible 往內縮 24px 的範圍內 → 不動；
 * 看不到而且縮放小於 12 → 拉到 13；其他 → 平移（中心移到 visible 的中心、縮放不變）
 */
export function selectCamera(p: { x: number; y: number }, visible: ScreenRect, zoom: number): SelectMove {
  const i = SELECT_INSET;
  if (p.x >= visible.left + i && p.x <= visible.right - i && p.y >= visible.top + i && p.y <= visible.bottom - i) return { kind: 'stay' };
  if (zoom < SELECT_MIN_ZOOM) return { kind: 'zoom', zoom: SELECT_ZOOM };
  return { kind: 'pan' };
}

const area = (r: ScreenRect) => Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top);

/**
 * box（地圖）扣掉每個蓋在上面的 obstruction：只切掉一邊（左、右、上、下裡面剩下最大的那個），
 * 例如右邊浮動的詳情切掉右邊、下面的面板切掉下面。沒蓋到 box 的不算
 */
export function visibleArea(box: ScreenRect, obstructions: ScreenRect[]): ScreenRect {
  let out = { ...box };
  for (const o of obstructions) {
    const overlaps = o.left < out.right && o.right > out.left && o.top < out.bottom && o.bottom > out.top;
    if (!overlaps) continue;
    const options: ScreenRect[] = [
      { ...out, right: Math.max(out.left, Math.min(out.right, o.left)) },
      { ...out, left: Math.min(out.right, Math.max(out.left, o.right)) },
      { ...out, bottom: Math.max(out.top, Math.min(out.bottom, o.top)) },
      { ...out, top: Math.min(out.bottom, Math.max(out.top, o.bottom)) },
    ];
    out = options.reduce((best, r) => (area(r) > area(best) ? r : best));
  }
  return out;
}
