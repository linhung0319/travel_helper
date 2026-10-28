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

/** 想去分頁「已是候選」的點：白底、藍染色（--indigo）的虛線圓（circle 圖層畫不出虛線，所以畫成圖） */
const WISH_RING = 22;

function wishRingIcon(): ImageData {
  const [el, c] = canvas(WISH_RING);
  const r = WISH_RING / 2;
  c.fillStyle = '#ffffff';
  circle(c, r, r, 7.5);
  c.strokeStyle = '#24468a';
  c.lineWidth = 2.4;
  c.setLineDash([3.2, 2.4]);
  c.beginPath();
  c.arc(r, r, 7.5, 0, Math.PI * 2);
  c.stroke();
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

/** 圖片名稱：icon-<類型>（圓形圖標）、wish-candidate（想去的候選）、route-arrow。選中的數字水滴是 DOM 標記（MapView） */
export function addMapIcons(map: MapLibreMap) {
  for (const t of PLACE_TYPES) {
    if (!map.hasImage(`icon-${t}`)) map.addImage(`icon-${t}`, typeIcon(t), { pixelRatio: RATIO });
  }
  // 圓體字型下載完再重畫一次（canvas 不會自己等字型）
  document.fonts
    ?.load(`900 14px ${SEAL_FONT}`, Object.values(TYPE_GLYPHS).join(''))
    .then(() => {
      for (const t of PLACE_TYPES) if (map.hasImage(`icon-${t}`)) map.updateImage(`icon-${t}`, typeIcon(t));
    })
    .catch(() => {});
  if (!map.hasImage('wish-candidate')) map.addImage('wish-candidate', wishRingIcon(), { pixelRatio: RATIO });
  if (!map.hasImage('route-arrow')) map.addImage('route-arrow', arrowIcon(), { pixelRatio: RATIO, sdf: true });
}
