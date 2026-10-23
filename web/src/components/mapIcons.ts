// 地圖上的類別圖標（像 Google Maps：類別色的圓、白色的圖示）、選中的點的水滴圖釘、路線的方向箭頭。
// 用 canvas 畫好再 addImage，不必另外放圖檔；圖示的座標以 24×24 為單位。

import type { Map as MapLibreMap } from 'maplibre-gl';
import { PLACE_TYPES, type PlaceType } from '../data/types.ts';
import { TYPE_COLORS } from '../lib/typeStyle.ts';

const RATIO = 2;
/** 圖標的直徑（CSS 像素） */
const SIZE = 28;

type Ctx = CanvasRenderingContext2D;

function roundRect(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fill();
}

function circle(c: Ctx, x: number, y: number, r: number) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

/** 白色的圖示；bg 是圓的顏色（挖空的地方用） */
const GLYPHS: Record<PlaceType, (c: Ctx, bg: string) => void> = {
  // 刀叉
  restaurant: (c) => {
    c.lineWidth = 1.4;
    c.lineCap = 'round';
    for (const x of [6.5, 8.5, 10.5]) {
      c.beginPath();
      c.moveTo(x, 4);
      c.lineTo(x, 9);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(5.8, 8.5);
    c.lineTo(11.2, 8.5);
    c.quadraticCurveTo(11.2, 11.5, 8.5, 11.8);
    c.quadraticCurveTo(5.8, 11.5, 5.8, 8.5);
    c.fill();
    roundRect(c, 7.7, 11, 1.6, 9, 0.8);
    c.beginPath();
    c.moveTo(15, 4);
    c.quadraticCurveTo(18.5, 6, 18.3, 12);
    c.lineTo(16.6, 12);
    c.lineTo(16.6, 20);
    c.lineTo(15, 20);
    c.closePath();
    c.fill();
  },
  // 床
  lodging: (c) => {
    roundRect(c, 3.5, 6, 1.8, 12.5, 0.6);
    roundRect(c, 3.5, 12.5, 17, 3, 0.6);
    roundRect(c, 18.7, 14, 1.8, 4.5, 0.6);
    circle(c, 8.2, 10.4, 1.9);
    roundRect(c, 11, 8.8, 9.5, 4.2, 1.6);
  },
  // 相機
  spot: (c, bg) => {
    roundRect(c, 3.5, 7.5, 17, 11, 2.2);
    roundRect(c, 8.5, 5.2, 5, 3.2, 1);
    c.fillStyle = bg;
    circle(c, 12, 13, 3.9);
    c.fillStyle = '#fff';
    circle(c, 12, 13, 2.2);
  },
  // 電車
  station: (c, bg) => {
    roundRect(c, 6, 3.5, 12, 13.5, 3);
    c.fillStyle = bg;
    roundRect(c, 8, 6, 8, 4.5, 1);
    circle(c, 9.3, 14, 1.1);
    circle(c, 14.7, 14, 1.1);
    c.strokeStyle = '#fff';
    c.lineWidth = 1.6;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(9.5, 17.5);
    c.lineTo(7.5, 20.5);
    c.moveTo(14.5, 17.5);
    c.lineTo(16.5, 20.5);
    c.stroke();
  },
};

function canvas(size: number): [HTMLCanvasElement, Ctx] {
  const el = document.createElement('canvas');
  el.width = el.height = size * RATIO;
  const c = el.getContext('2d')!;
  c.scale(RATIO, RATIO);
  return [el, c];
}

function typeIcon(type: PlaceType): ImageData {
  const [el, c] = canvas(SIZE);
  const bg = TYPE_COLORS[type];
  const r = SIZE / 2;
  c.fillStyle = '#fff';
  circle(c, r, r, r);
  c.fillStyle = bg;
  circle(c, r, r, r - 2);
  // 圖示畫在中間 16×16
  c.save();
  c.translate(r - 8, r - 8);
  c.scale(16 / 24, 16 / 24);
  c.fillStyle = '#fff';
  c.strokeStyle = '#fff';
  GLYPHS[type](c, bg);
  c.restore();
  return c.getImageData(0, 0, el.width, el.height);
}

/** 選中的點：水滴形的大圖釘（像 Google Maps 選中的地點），尖端在圖的底部中間 */
const PIN_W = 40;
const PIN_H = 50;

function pinPath(c: Ctx, cx: number, cy: number, r: number, tipY: number) {
  const phi = Math.acos(r / (tipY - cy));
  c.beginPath();
  c.moveTo(cx, tipY);
  c.arc(cx, cy, r, Math.PI / 2 + phi, Math.PI / 2 - phi);
  c.closePath();
  c.fill();
}

function pinIcon(type: PlaceType): ImageData {
  const el = document.createElement('canvas');
  el.width = PIN_W * RATIO;
  el.height = PIN_H * RATIO;
  const c = el.getContext('2d')!;
  c.scale(RATIO, RATIO);
  const bg = TYPE_COLORS[type];
  const cx = PIN_W / 2;
  const cy = 19;
  const tip = PIN_H - 2;
  c.save();
  c.shadowColor = 'rgba(0, 0, 0, 0.35)';
  c.shadowBlur = 3;
  c.shadowOffsetY = 1;
  c.fillStyle = '#fff';
  pinPath(c, cx, cy, 17, tip);
  c.restore();
  c.fillStyle = bg;
  pinPath(c, cx, cy, 14.5, tip - 3.5);
  // 圖示畫在圓的中間 20×20
  c.save();
  c.translate(cx - 10, cy - 10);
  c.scale(20 / 24, 20 / 24);
  c.fillStyle = '#fff';
  c.strokeStyle = '#fff';
  GLYPHS[type](c, bg);
  c.restore();
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

/** 圖片名稱：icon-<類型>（圓形圖標）、pin-<類型>（選中的水滴圖釘）、route-arrow */
export function addMapIcons(map: MapLibreMap) {
  for (const t of PLACE_TYPES) {
    if (!map.hasImage(`icon-${t}`)) map.addImage(`icon-${t}`, typeIcon(t), { pixelRatio: RATIO });
    if (!map.hasImage(`pin-${t}`)) map.addImage(`pin-${t}`, pinIcon(t), { pixelRatio: RATIO });
  }
  if (!map.hasImage('route-arrow')) map.addImage('route-arrow', arrowIcon(), { pixelRatio: RATIO, sdf: true });
}
