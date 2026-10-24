// 點時間軸的卡片時，地圖上那個編號圓放大再縮回來（MapView 聽這個事件）。

export const PULSE_EVENT = 'map-pulse-mark';
export const PULSE_MS = 800;

/** 使用者設了減少動態就不做 */
export function pulseMark(id: string) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  window.dispatchEvent(new CustomEvent(PULSE_EVENT, { detail: id }));
}
