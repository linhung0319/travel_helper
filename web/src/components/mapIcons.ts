// 地圖上的類別圖標（類型圓章：類型色的圓、一個漢字，interaction-design §12.2）、想去分頁候選的虛線圓、路線的方向箭頭。
// 用 canvas 畫好再 addImage，不必另外放圖檔。

import type { Map as MapLibreMap } from 'maplibre-gl';
import { PLACE_TYPES, type PlaceType } from '../data/types.ts';
import { TYPE_COLORS, TYPE_GLYPHS, TYPE_INK } from '../lib/typeStyle.ts';

const RATIO = 2;
/** 圖標的直徑（CSS 像素） */
const SIZE = 28;
/** 圓章的字型（和 --font-round 一樣；還沒載入時先用 Noto Sans TC 或系統字，載入後 addMapIcons 重畫） */
const SEAL_FONT = "'Zen Maru Gothic', 'Noto Sans TC', system-ui, sans-serif";

type Ctx = CanvasRenderingContext2D;

function circle(c: Ctx, x: number, y: number, r: number) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

function canvas(size: number): [HTMLCanvasElement, Ctx] {
  const el = document.createElement('canvas');
  el.width = el.height = size * RATIO;
  const c = el.getContext('2d')!;
  c.scale(RATIO, RATIO);
  return [el, c];
}

/** 類型圓章（interaction-design §12.2）：白框、類型色的圓、裡面一個漢字（餐廳的字墨色） */
function typeIcon(type: PlaceType): ImageData {
  const [el, c] = canvas(SIZE);
  const r = SIZE / 2;
  c.fillStyle = '#fff';
  circle(c, r, r, r);
  c.fillStyle = TYPE_COLORS[type];
  circle(c, r, r, r - 2);
  c.fillStyle = TYPE_INK[type];
  c.font = `900 14px ${SEAL_FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(TYPE_GLYPHS[type], r, r + 1);
  return c.getImageData(0, 0, el.width, el.height);
}

/** 自己加的點（T31）：白底、類型色虛線框、同樣的字（字用類型色，白底上才看得見） */
function userTypeIcon(type: PlaceType): ImageData {
  const [el, c] = canvas(SIZE);
  const r = SIZE / 2;
  c.fillStyle = '#fff';
  circle(c, r, r, r);
  c.strokeStyle = TYPE_COLORS[type];
  c.lineWidth = 2.4;
  c.setLineDash([4, 3]);
  c.beginPath();
  c.arc(r, r, r - 2, 0, Math.PI * 2);
  c.stroke();
  c.setLineDash([]);
  c.fillStyle = TYPE_COLORS[type];
  c.font = `900 14px ${SEAL_FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(TYPE_GLYPHS[type], r, r + 1);
  return c.getImageData(0, 0, el.width, el.height);
}

/** 往右的箭頭（SDF，顏色由圖層的 icon-color 給，跟著那天的顏色） */
function arrowIcon(): ImageData {
  const [el, c] = canvas(16);
  c.fillStyle = '#000';
  c.beginPath();
  c.moveTo(4, 3);
  c.lineTo(13, 8);
  c.lineTo(4, 13);
  c.lineTo(6.5, 8);
  c.closePath();
  c.fill();
  return c.getImageData(0, 0, el.width, el.height);
}

/** 圖片名稱：icon-<類型>（圓形圖標）、icon-user-<類型>（自己加的：虛線框）、route-arrow。選中的數字水滴是 DOM 標記（MapView） */
export function addMapIcons(map: MapLibreMap) {
  for (const t of PLACE_TYPES) {
    if (!map.hasImage(`icon-${t}`)) map.addImage(`icon-${t}`, typeIcon(t), { pixelRatio: RATIO });
    if (!map.hasImage(`icon-user-${t}`)) map.addImage(`icon-user-${t}`, userTypeIcon(t), { pixelRatio: RATIO });
  }
  // 圓體字型下載完再重畫一次（canvas 不會自己等字型）
  document.fonts
    ?.load(`900 14px ${SEAL_FONT}`, Object.values(TYPE_GLYPHS).join(''))
    .then(() => {
      for (const t of PLACE_TYPES) {
        if (map.hasImage(`icon-${t}`)) map.updateImage(`icon-${t}`, typeIcon(t));
        if (map.hasImage(`icon-user-${t}`)) map.updateImage(`icon-user-${t}`, userTypeIcon(t));
      }
    })
    .catch(() => {});
  if (!map.hasImage('route-arrow')) map.addImage('route-arrow', arrowIcon(), { pixelRatio: RATIO, sdf: true });
}

/** 子地區名的小標籤底（T65）：白底、那區顏色的圓角框，可伸縮（icon-text-fit 包住字）。一區一張，名字是 region-pill-<顏色> */
const PILL_W = 40;
const PILL_H = 20;
export function addRegionPill(map: MapLibreMap, color: string): string {
  const name = `region-pill-${color}`;
  if (map.hasImage(name)) return name;
  const el = document.createElement('canvas');
  el.width = PILL_W * RATIO;
  el.height = PILL_H * RATIO;
  const c = el.getContext('2d')!;
  c.scale(RATIO, RATIO);
  const r = PILL_H / 2 - 1;
  c.beginPath();
  c.roundRect(1, 1, PILL_W - 2, PILL_H - 2, r);
  c.fillStyle = '#ffffff';
  c.fill();
  c.lineWidth = 1.5;
  c.strokeStyle = color;
  c.stroke();
  const mid = PILL_H / 2;
  map.addImage(name, c.getImageData(0, 0, el.width, el.height), {
    pixelRatio: RATIO,
    // 只伸縮中間（圓角不變形）
    stretchX: [[(r + 1) * RATIO, (PILL_W - r - 1) * RATIO]],
    stretchY: [[(mid - 1) * RATIO, (mid + 1) * RATIO]],
    content: [(r - 2) * RATIO, 3 * RATIO, (PILL_W - r + 2) * RATIO, (PILL_H - 3) * RATIO],
  });
  return name;
}
