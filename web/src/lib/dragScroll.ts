// 拖曳時靠近捲動區上下緣自動捲（第七輪 §6.4）：手機是行程面板、網頁是右欄。
// 純函式，不碰畫面；planDrag.ts 每一格畫面用指標的高度算這一格要捲幾 px。

/**
 * 這一格要捲多少 px：離上緣 edge 以內是負的（往上捲）、離下緣 edge 以內是正的，
 * 越靠近越快，線性到 max（貼著邊緣或超出去）；中間是 0。
 */
export function autoScrollSpeed(pointerY: number, top: number, bottom: number, edge = 64, max = 18): number {
  const fromTop = pointerY - top;
  const fromBottom = bottom - pointerY;
  // || 0：很靠近 edge 時 round 出來是 -0
  if (fromTop < edge) return -Math.round(max * Math.min(1, (edge - fromTop) / edge)) || 0;
  if (fromBottom < edge) return Math.round(max * Math.min(1, (edge - fromBottom) / edge)) || 0;
  return 0;
}
