// 不用載入地圖引擎就能用的東西（T39）：maplibre 有 1 MB，App 的主程式不能靜態 import 它，不然聊天室、探索都要等它下載完才出得來。
// 地圖本體（MapView.tsx）由 LazyMap 動態載入；這裡放別的畫面也要用的小東西。

import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Place } from '../data/types.ts';
import { TYPE_COLORS, TYPE_GLYPHS, TYPE_INK } from '../lib/typeStyle.ts';

export const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

/** 詳情的小地圖、加地點的地圖用：先載 MapView（設定地圖的 worker、CSS），再拿引擎 */
export async function loadMapLib() {
  await import('./MapView.tsx');
  return import('maplibre-gl');
}

/** 水滴的外形（34×44，尖端在 (17, 42)；§草圖 九） */
const DROP_PATH = 'M17 42s-14-13.5-14-24A14 14 0 0 1 31 18c0 10.5-14 24-14 24z';

/** 選中的水滴（interaction-design §12.5）：類型色（fill 可以換掉），頭裡是編號（mark），沒有編號是類型圓章的字；
 *  底下的影子（ms-shadow）跟著跳縮放；旁邊是粗體的名稱（手機詳情的小地圖也用） */
export function selectedDropHtml(place: Place, mark: string, fill?: string): string {
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const head = mark || TYPE_GLYPHS[place.type];
  const small = head.length > 2;
  return (
    `<svg class="ms-drop" width="34" height="44" viewBox="0 0 34 44" aria-hidden="true"><path d="${DROP_PATH}" fill="${fill ?? TYPE_COLORS[place.type]}" stroke="#fff" stroke-width="2.5"/>` +
    `<text x="17" y="${small ? 22 : 23.5}" text-anchor="middle" font-size="${small ? 11 : 15}" font-weight="900" fill="${fill ? '#fff' : TYPE_INK[place.type]}" font-family="'Zen Maru Gothic', 'Noto Sans TC', system-ui, sans-serif">${esc(head)}</text></svg>` +
    `<span class="ms-shadow" aria-hidden="true"></span>` +
    `<span class="ms-name">${esc(place.name.zh || place.name.ja)}</span>`
  );
}

/** 蓋在地圖上的彈窗剛用滑鼠關掉的位置：游標移開這附近之前，地圖不出小卡片（不然看起來像點穿了） */
let hoverPause: { x: number; y: number } | null = null;
const HOVER_PAUSE_PX = 24;

export function pauseMapHover(x: number, y: number) {
  hoverPause = { x, y };
}

export function hoverPaused(e: MouseEvent): boolean {
  if (!hoverPause) return false;
  if (Math.hypot(e.clientX - hoverPause.x, e.clientY - hoverPause.y) < HOVER_PAUSE_PX) return true;
  hoverPause = null;
  return false;
}

/** 畫面上那一張地圖（整個網站只有一張） */
let currentMap: MapLibreMap | null = null;

export const setCurrentMap = (map: MapLibreMap) => {
  currentMap = map;
};

export const clearCurrentMap = (map: MapLibreMap) => {
  if (currentMap === map) currentMap = null;
};

/** 地圖重新算大小：手機版從別的分頁切回行程時呼叫（藏起來的時候版面可能變過）；地圖還沒載好就沒事做 */
export function resizeMap() {
  currentMap?.resize();
}
