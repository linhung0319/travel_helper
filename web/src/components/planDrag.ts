// 規劃模式的拖曳（interaction-design §6）：
// - 電腦版：時間軸的卡片拖到別的卡片前後換順序。用 HTML5 拖曳。
// - 手機：時間軸的卡片長按 0.4 秒後拖。
// 想去的點不拖：在想去「加到某天」，再從這天的候選按 ↑ 排進。
// 放開的位置用「放在哪張卡片的前面或後面」表示；卡片和最後的放置區都有 data-drop-item／data-drop-end。
// 同時放 application/x-travel-place，拖到聊天室也能問 AI（askAi.ts）。

import { useEffect, useRef, type DragEvent } from 'react';
import { moveItemTo } from '@travel-helper/engine';
import type { Itinerary } from '@travel-helper/engine/types';
import { shared } from '../appShared.ts';
import { dataStore } from '../dataStore.ts';
import { findItemRef } from '../lib/planView.ts';

const ITEM = 'application/x-travel-item';
const PLACE = 'application/x-travel-place';

/** 放在哪裡：某張卡片的前面或後面，或某天的最後 */
export type DropAt = { kind: 'item'; itemId: string; after: boolean } | { kind: 'end'; date: string };

/** 放開的位置換成 moveItemTo／addItem 的 date、index、split（source：被拖的項目，同一串裡要扣掉它自己） */
export function dropTarget(it: Itinerary, at: DropAt, source: string | null): { date: string; index: number; split?: { id: string; group: string } } | null {
  if (at.kind === 'end') {
    const day = it.days.find((d) => d.date === at.date);
    if (!day) return null;
    const depart = day.items.findIndex((x) => x.type === 'flight' && x.direction === 'depart');
    let index = depart >= 0 ? depart : day.items.length;
    const src = source ? day.items.findIndex((x) => x.id === source) : -1;
    if (src >= 0 && src < index) index -= 1;
    return { date: at.date, index };
  }
  const ref = findItemRef(it, at.itemId);
  if (!ref) return null;
  const day = it.days.find((d) => d.date === ref.date)!;
  const list = ref.split ? (day.items.find((x) => x.id === ref.split!.id) as Extract<Itinerary['days'][number]['items'][number], { type: 'split' }>).groups.find((g) => g.id === ref.split!.group)!.items : day.items;
  let index = list.findIndex((x) => x.id === at.itemId) + (at.after ? 1 : 0);
  const src = source ? list.findIndex((x) => x.id === source) : -1;
  if (src >= 0 && src < index) index -= 1;
  return { date: ref.date, index, ...(ref.split ? { split: { id: ref.split.id, group: ref.split.group } } : {}) };
}

const placeName = (id: string | null) => {
  const p = id ? dataStore.getState().byId.get(id) : null;
  return p ? p.name.zh || p.name.ja : '項目';
};

/** 把項目移到放開的位置（經過 changeItinerary：存檔、快照） */
export async function dropItem(itemId: string, at: DropAt) {
  const it = dataStore.getState().itinerary;
  if (!it || (at.kind === 'item' && at.itemId === itemId)) return;
  const t = dropTarget(it, at, itemId);
  if (!t) return;
  const ref = findItemRef(it, itemId);
  const place = ref?.item.type === 'visit' ? ref.item.options[ref.item.selected]?.place ?? null : null;
  await shared.changeItinerary((x) => moveItemTo(x, itemId, t.date, t.index, t.split), `${placeName(place)} 換位置`);
}

/** 電腦版：時間軸的卡片可以拖 */
export function itemDragProps(itemId: string, placeId: string | null, enabled: boolean) {
  if (!enabled) return {};
  return {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(ITEM, itemId);
      if (placeId) e.dataTransfer.setData(PLACE, placeId);
      e.dataTransfer.effectAllowed = 'copyMove';
      document.body.classList.add('dragging-plan');
    },
    onDragEnd: () => {
      document.body.classList.remove('dragging-plan');
      clearMarks();
    },
  };
}

function clearMarks() {
  document.querySelectorAll('.drop-before, .drop-after, .drop-end-over').forEach((el) => el.classList.remove('drop-before', 'drop-after', 'drop-end-over'));
}

const isPlanDrag = (e: DragEvent) => e.dataTransfer.types.includes(ITEM);

/** 放下時看游標在卡片的上半還是下半 */
function afterHalf(el: HTMLElement, clientY: number) {
  const r = el.getBoundingClientRect();
  return clientY > r.top + r.height / 2;
}

async function drop(e: DragEvent, at: DropAt) {
  const item = e.dataTransfer.getData(ITEM);
  if (item) await dropItem(item, at);
}

/** 卡片：放在它前面或後面 */
export function dropOnItemProps(itemId: string, enabled: boolean) {
  if (!enabled) return {};
  return {
    'data-drop-item': itemId,
    onDragOver: (e: DragEvent) => {
      if (!isPlanDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget as HTMLElement;
      const after = afterHalf(el, e.clientY);
      clearMarks();
      el.classList.add(after ? 'drop-after' : 'drop-before');
    },
    onDragLeave: (e: DragEvent) => (e.currentTarget as HTMLElement).classList.remove('drop-before', 'drop-after'),
    onDrop: (e: DragEvent) => {
      if (!isPlanDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      const after = afterHalf(e.currentTarget as HTMLElement, e.clientY);
      clearMarks();
      void drop(e, { kind: 'item', itemId, after });
    },
  };
}

/** 時間軸最後的放置區：放在這天的最後（出發航班之前） */
export function dropOnEndProps(date: string, enabled: boolean) {
  if (!enabled) return {};
  return {
    'data-drop-end': date,
    onDragOver: (e: DragEvent) => {
      if (!isPlanDrag(e)) return;
      e.preventDefault();
      clearMarks();
      (e.currentTarget as HTMLElement).classList.add('drop-end-over');
    },
    onDragLeave: (e: DragEvent) => (e.currentTarget as HTMLElement).classList.remove('drop-end-over'),
    onDrop: (e: DragEvent) => {
      if (!isPlanDrag(e)) return;
      e.preventDefault();
      clearMarks();
      void drop(e, { kind: 'end', date });
    },
  };
}

// --- 手機：長按後拖 ----------------------------------------------------------

const LONG_PRESS_MS = 400;
const MOVE_CANCEL_PX = 8;

/** 找手指底下的卡片或最後的放置區 */
function dropAtPoint(x: number, y: number): DropAt | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  const card = el?.closest<HTMLElement>('[data-drop-item]');
  if (card) return { kind: 'item', itemId: card.dataset.dropItem!, after: afterHalf(card, y) };
  const end = el?.closest<HTMLElement>('[data-drop-end]');
  if (end) return { kind: 'end', date: end.dataset.dropEnd! };
  return null;
}

/**
 * 手機：長按卡片進入拖曳，放開在哪張卡片的前後就移過去。回傳要掛在卡片上的 ref。
 * 監聽器直接掛在元素上（touchmove 一開始就是 passive: false，Chrome 才讓長按之後擋得住捲動），
 * 狀態放在 effect 裡，重畫不會丟掉；卸載或關掉規劃模式時一定清乾淨（不然整頁不能捲）。
 */
export function useLongPressDrag<T extends HTMLElement>(itemId: string | null, enabled: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || !itemId) return;
    let timer = 0;
    let start: { x: number; y: number } | null = null;
    let active = false;
    const stop = () => {
      window.clearTimeout(timer);
      start = null;
      active = false;
      el.classList.remove('drag-source');
      document.body.classList.remove('dragging-plan');
      clearMarks();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (active) e.preventDefault();
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || start) return;
      start = { x: e.clientX, y: e.clientY };
      const pointerId = e.pointerId;
      timer = window.setTimeout(() => {
        active = true;
        el.setPointerCapture?.(pointerId);
        document.body.classList.add('dragging-plan');
        el.classList.add('drag-source');
        navigator.vibrate?.(20);
      }, LONG_PRESS_MS);
    };
    const onMove = (e: PointerEvent) => {
      if (!start) return;
      if (!active) {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_CANCEL_PX) stop();
        return;
      }
      clearMarks();
      const at = dropAtPoint(e.clientX, e.clientY);
      if (at?.kind === 'item') document.querySelector(`[data-drop-item="${CSS.escape(at.itemId)}"]`)?.classList.add(at.after ? 'drop-after' : 'drop-before');
      if (at?.kind === 'end') document.querySelector(`[data-drop-end="${CSS.escape(at.date)}"]`)?.classList.add('drop-end-over');
    };
    const onUp = (e: PointerEvent) => {
      const at = active ? dropAtPoint(e.clientX, e.clientY) : null;
      stop();
      if (at) void dropItem(itemId, at);
    };
    // 長按時不要跳出系統選單
    const onContext = (e: Event) => {
      if (start || active) e.preventDefault();
    };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', stop);
    el.addEventListener('contextmenu', onContext);
    return () => {
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', stop);
      el.removeEventListener('contextmenu', onContext);
      stop();
    };
  }, [itemId, enabled]);
  return ref;
}
