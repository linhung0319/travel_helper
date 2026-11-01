// 電腦版把地點拖進「問 AI」：探索的卡片、詳情的標題可以拖到左邊的聊天室（有 data-drop-ai 的元素），放開等於按一次問 AI（累加地點晶片，webAi.ts）。手機版沒有拖曳，見 mobile/mobileAi.ts。

import type { DragEvent } from 'react';
import { dataStore } from '../dataStore.ts';
import { TYPE_COLORS, TYPE_ICON_NAMES } from '../lib/typeStyle.ts';
import { iconSvg } from '../lib/icons.ts';
import { askPlace } from './webAi.ts';

const MIME = 'application/x-travel-place';

/** 跟著游標的小標籤（類別色的圓＋名稱） */
function ghost(id: string): HTMLElement | null {
  const p = dataStore.getState().byId.get(id);
  if (!p) return null;
  const el = document.createElement('div');
  el.className = 'place-ghost';
  el.style.top = '-200px';
  const dot = document.createElement('span');
  dot.className = 'place-ghost-dot';
  dot.style.background = TYPE_COLORS[p.type];
  dot.innerHTML = iconSvg(TYPE_ICON_NAMES[p.type], 16);
  const name = document.createElement('span');
  name.className = 'place-ghost-name';
  name.textContent = p.name.zh || p.name.ja;
  el.append(dot, name);
  return el;
}

/** 可以拖到聊天室的東西（探索卡片、詳情標題）；enabled＝false（手機）時什麼都不加 */
export function dragPlaceProps(id: string, enabled = true) {
  if (!enabled) return {};
  return {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(MIME, id);
      e.dataTransfer.effectAllowed = 'copy';
      const g = ghost(id);
      if (g) {
        document.body.appendChild(g);
        e.dataTransfer.setDragImage(g, 16, 16);
        window.setTimeout(() => g.remove(), 0);
      }
      document.body.classList.add('dragging-place');
    },
    onDragEnd: () => document.body.classList.remove('dragging-place'),
  };
}

const isPlace = (e: DragEvent) => e.dataTransfer.types.includes(MIME);

/** 聊天室：放開在這裡就問 AI */
export function dropAiProps() {
  return {
    'data-drop-ai': true,
    onDragOver: (e: DragEvent) => {
      if (!isPlace(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      e.currentTarget.classList.add('drop-over');
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) e.currentTarget.classList.remove('drop-over');
    },
    onDrop: (e: DragEvent) => {
      if (!isPlace(e)) return;
      e.preventDefault();
      e.currentTarget.classList.remove('drop-over');
      document.body.classList.remove('dragging-place');
      askPlace(e.dataTransfer.getData(MIME));
    },
  };
}
