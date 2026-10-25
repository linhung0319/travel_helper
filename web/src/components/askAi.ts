// 把地點帶進「問 AI」（放進選取，T16 的聊天室把選取帶進對話，AI 就知道要問哪幾個點）。
// 電腦版：探索的卡片、詳情的標題可以拖到左邊的聊天室（有 data-drop-ai 的元素）。
// 手機版：沒有拖曳，卡片和詳情上按「＋ 問 AI」，聊天分頁顯示帶了幾個點。

import type { DragEvent } from 'react';
import { appStore } from '../store.ts';
import { dataStore } from '../dataStore.ts';
import { commands } from '../appCommands.ts';
import { shared } from '../appShared.ts';
import { stopsOn } from '../lib/itinerary.ts';
import { TYPE_COLORS, TYPE_ICONS } from '../lib/typeStyle.ts';
import { setAddToChat } from '../uiStore.ts';

const MIME = 'application/x-travel-place';

/** 加進選取，提示「已帶進聊天」；已經在裡面就不動 */
export function askAi(id: string) {
  if (appStore.getState().selection.includes(id)) return;
  if (!commands.select(id).ok) return;
  shared.notify(`已帶進聊天（${appStore.getState().selection.length} 個點）`);
}

setAddToChat(askAi); // uiStore 的 askAboutPlace 用這個把地點放進選取

/** 行程分頁的「🤖 問 AI」：把這天的點全部加進選取（已經在裡面的不動） */
export function askAiAboutDay(date: string) {
  const ids = [...new Set(stopsOn(dataStore.getState().itinerary, date).map((s) => s.place))];
  const fresh = ids.filter((id) => !appStore.getState().selection.includes(id));
  if (fresh.length && !commands.select(fresh).ok) return;
  shared.notify(`已帶進聊天（${appStore.getState().selection.length} 個點）`);
}

/** 「＋ 問 AI」按鈕：再按一次拿掉 */
export function toggleAskAi(id: string) {
  if (appStore.getState().selection.includes(id)) commands.unselect(id);
  else askAi(id);
}

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
  dot.textContent = TYPE_ICONS[p.type];
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
      askAi(e.dataTransfer.getData(MIME));
    },
  };
}
