// 規劃模式的拖曳（interaction-design §6、第四輪設計 §4）：
// - 可以拖的：時間軸的卡片（有備卡時連同備卡）、合併卡片正在看的備卡、這天的候選（住宿的候選不能拖）。
//   第三輪的「不從候選拖到時間軸」作廢：候選拖到卡片上＝合併，拖到卡片之間＝排進那個位置。
// - 電腦版用 HTML5 拖曳；手機長按 0.4 秒後拖。兩條路都是「取得 DragSource → 每次移動算 dropIntent（lib/dropIntent.ts）→ 標記 → 放開時執行」。
// - 放在同類型卡片的中間＝合併（亮藍框「放開＝合併到這張」）；卡片上下邊緣、最後的放置區＝排在這裡（插入線）；
//   放在交通卡上＝排在這段通往的卡片前面（不合併；回住宿那段＝這天的最後）；
//   備卡放到候選區＝放回候選。拖曳開始時，不能合併的卡片變淡（drop-nomerge）。
// - 合併、換順序、拆開、排進、放回候選都可以復原（changeItinerary 的 undo）；候選的增減在 settle 裡做完才跳復原提示。放回原位不存檔。
// 放置區：卡片 data-drop-item（data-drop-type、data-drop-flight）、交通卡 data-drop-leg（data-drop-date）、
// 最後的放置區 data-drop-end、候選區 data-drop-candidates。
// 同時放 application/x-travel-place，拖到聊天室也能問 AI（askAi.ts）。

import { useEffect, useRef, type DragEvent } from 'react';
import { addOption, detachOption, ItineraryError, mergeItems, moveItemTo, moveOption, removeOption } from '@travel-helper/engine';
import type { Itinerary } from '@travel-helper/engine/types';
import { shared } from '../appShared.ts';
import { dataStore } from '../dataStore.ts';
import { findItemRef } from '../lib/planView.ts';
import { canMerge, dropIntent, dropTarget, samePosition, type DragSource, type DropAt, type DropIntent, type DropTargetInfo } from '../lib/dropIntent.ts';
import { addPlaceToDay } from './addToDay.ts';

const ITEM = 'application/x-travel-item';
const CANDIDATE = 'application/x-travel-candidate';
const OPTION = 'application/x-travel-option';
const PLACE = 'application/x-travel-place';

const placeName = (id: string | null | undefined) => {
  const p = id ? dataStore.getState().byId.get(id) : null;
  return p ? p.name.zh || p.name.ja : '項目';
};

const typeOf = (id: string) => dataStore.getState().byId.get(id)?.type;

/** 卡片第 index 個選項的點（不給 index 是主卡；不是造訪是 null） */
function optionPlace(it: Itinerary, itemId: string, index?: number): string | null {
  const item = findItemRef(it, itemId)?.item;
  return item?.type === 'visit' ? (item.options[index ?? item.selected]?.place ?? null) : null;
}

/** 把項目移到放開的位置（經過 changeItinerary：存檔、快照；可以復原） */
export async function dropItem(itemId: string, at: DropAt) {
  const it = dataStore.getState().itinerary;
  if (!it || (at.kind === 'item' && at.itemId === itemId)) return;
  const t = dropTarget(it, at, itemId);
  // 放回原來的位置（自己前後的邊緣、通往自己的交通卡）：不存檔、不跳提示
  if (!t || samePosition(it, itemId, t)) return;
  const label = `${placeName(optionPlace(it, itemId))} 換位置`;
  await shared.changeItinerary((x) => moveItemTo(x, itemId, t.date, t.index, t.split), label, { undo: { text: label } });
}

/** 整張卡片合併到另一張；被丟掉的固定時間寫在復原提示裡 */
async function mergeItemInto(it: Itinerary, itemId: string, targetId: string) {
  const target = placeName(optionPlace(it, targetId));
  const base = `已合併到 ${target}`;
  // 提示文字在存好之後才用到；被丟掉的時間要在 fn 裡才知道
  const undo = { text: base };
  await shared.changeItinerary(
    (x) => {
      const r = mergeItems(x, itemId, targetId, typeOf);
      undo.text = r.droppedStart ? `${base}（原本的 ${r.droppedStart} 固定時間已拿掉）` : base;
      return r.itinerary;
    },
    `${placeName(optionPlace(it, itemId))} 合併到 ${target}`,
    { undo },
  );
}

/** 復原「放回候選」：把剛放進候選的那筆撤回（原本就有的不動） */
async function dropCandidate(placeId: string, date: string, existed: boolean) {
  if (existed) return;
  const c = shared.store.getState().candidates.find((x) => x.placeId === placeId && x.day === date);
  if (c) await shared.removeCandidate(c.id, undefined, true);
}

/** 備卡放回這天的候選（看備卡時的「拿出來」、備卡拖到候選區），可以復原 */
export async function putBackOption(itemId: string, index: number, date: string) {
  const it = dataStore.getState().itinerary;
  const placeId = it ? optionPlace(it, itemId, index) : null;
  if (!placeId) return;
  const label = placeName(placeId);
  const existed = shared.store.getState().candidates.some((c) => c.placeId === placeId && c.day === date);
  // 先放回候選、再從卡片拿掉：「已放回候選」的復原提示要最後出現（共用一個提示位置）
  // 這天已經有這個候選就不用再加，照樣從卡片拿掉；加不起來時 addCandidate 自己會跳錯誤提示
  if (!existed) {
    const added = await shared.addCandidate(placeId, date);
    if (!added.ok) return;
  }
  const r = await shared.changeItinerary((x) => removeOption(x, itemId, index), `${label} 從卡片拿出來`, {
    undo: { text: `已放回候選・${label}`, after: () => dropCandidate(placeId, date, existed) },
  });
  if (!r.ok) await dropCandidate(placeId, date, existed);
}

/** 放開時要做的事：合併到某張卡、排在某個位置、放回某天的候選 */
type Resolved = { kind: 'merge'; itemId: string } | { kind: 'insert'; at: DropAt } | { kind: 'candidates'; date: string };

/** 候選拖進時間軸（合併或排進）：成功後拿掉候選，復原時加回去 */
async function dropCandidateIn(it: Itinerary, src: Extract<DragSource, { kind: 'candidate' }>, r: Resolved) {
  const day = shared.store.getState().candidates.find((c) => c.id === src.candidateId)?.day;
  if (!day || r.kind === 'candidates') return;
  const name = placeName(src.placeId);
  const after = async () => {
    if (!shared.store.getState().candidates.some((c) => c.placeId === src.placeId && c.day === day)) await shared.addCandidate(src.placeId, day);
  };
  // 成功後拿掉候選：在跳「復原」提示之前做完（settle），馬上按復原也加得回去
  const settle = async () => {
    await shared.removeCandidate(src.candidateId, undefined, true);
  };
  if (r.kind === 'merge') {
    const target = placeName(optionPlace(it, r.itemId));
    const add = (x: Itinerary) => {
      const item = findItemRef(x, r.itemId)?.item;
      if (item?.type === 'visit' && item.options.some((o) => o.place === src.placeId)) throw new ItineraryError(`${target} 已經有 ${name}`);
      return addOption(x, r.itemId, { place: src.placeId, stayMinutes: null });
    };
    await shared.changeItinerary(add, `${name} 合併到 ${target}`, { undo: { text: `已合併到 ${target}`, after }, settle });
  } else {
    const t = dropTarget(it, r.at, null);
    if (!t) return;
    await addPlaceToDay(src.placeId, t.date, { index: t.index, split: t.split }, { text: `已排進 ${name}`, after }, settle);
  }
}

/** 備卡拖出來：移到別張卡、拆成獨立一站、放回候選 */
async function dropOption(it: Itinerary, src: Extract<DragSource, { kind: 'option' }>, r: Resolved) {
  if (r.kind === 'candidates') return putBackOption(src.itemId, src.index, r.date);
  const label = placeName(optionPlace(it, src.itemId, src.index));
  if (r.kind === 'merge') {
    const target = placeName(optionPlace(it, r.itemId));
    await shared.changeItinerary((x) => moveOption(x, src.itemId, src.index, r.itemId, typeOf), `${label} 移到 ${target}`, { undo: { text: `已移到 ${target}` } });
    return;
  }
  const t = dropTarget(it, r.at, null);
  if (!t) return;
  const text = `${label} 拆出來了`;
  await shared.changeItinerary((x) => detachOption(x, src.itemId, src.index, t.date, t.index, t.split).itinerary, text, { undo: { text } });
}

/** 照來源和放開的結果改行程（設計 §4 的表） */
async function runDrop(src: DragSource, r: Resolved) {
  const it = dataStore.getState().itinerary;
  if (!it) return;
  if (src.kind === 'candidate') return dropCandidateIn(it, src, r);
  if (src.kind === 'option') return dropOption(it, src, r);
  if (r.kind === 'merge') return mergeItemInto(it, src.itemId, r.itemId);
  if (r.kind === 'insert') return dropItem(src.itemId, r.at);
}

// --- 放置區、標記 --------------------------------------------------------------

/** 手指或游標底下的放置區：元素和它的 DropTargetInfo */
interface Hit {
  el: HTMLElement;
  target: DropTargetInfo;
}

function hitOf(start: Element | null): Hit | null {
  const card = start?.closest<HTMLElement>('[data-drop-item]');
  if (card) return { el: card, target: { kind: 'card', itemId: card.dataset.dropItem!, placeType: card.dataset.dropType || null, isFlight: card.dataset.dropFlight === 'true' } };
  const leg = start?.closest<HTMLElement>('[data-drop-leg]');
  if (leg) return { el: leg, target: { kind: 'leg', itemId: leg.dataset.dropLeg || null } };
  const end = start?.closest<HTMLElement>('[data-drop-end]');
  if (end) return { el: end, target: { kind: 'end' } };
  const cands = start?.closest<HTMLElement>('[data-drop-candidates]');
  if (cands) return { el: cands, target: { kind: 'candidates' } };
  return null;
}

const intentAt = (src: DragSource, hit: Hit, clientY: number) => dropIntent(src, hit.target, hit.el.getBoundingClientRect(), clientY);

/** 放開的結果換成要做的事 */
function resolve(hit: Hit, intent: DropIntent): Resolved | null {
  if (intent === 'none') return null;
  const t = hit.target;
  if (t.kind === 'card') return intent === 'merge' ? { kind: 'merge', itemId: t.itemId } : { kind: 'insert', at: { kind: 'item', itemId: t.itemId, after: intent === 'after' } };
  if (t.kind === 'leg') return { kind: 'insert', at: t.itemId ? { kind: 'item', itemId: t.itemId, after: false } : { kind: 'end', date: hit.el.dataset.dropDate! } };
  if (t.kind === 'end') return { kind: 'insert', at: { kind: 'end', date: hit.el.dataset.dropEnd! } };
  return { kind: 'candidates', date: hit.el.dataset.dropCandidates! };
}

const MARKS = ['drop-before', 'drop-after', 'drop-merge', 'drop-leg-over', 'drop-end-over', 'drop-cand-over'];

function clearMarks() {
  document.querySelectorAll(MARKS.map((c) => `.${c}`).join(', ')).forEach((el) => el.classList.remove(...MARKS));
}

/** 標記放開的結果：合併亮框、插入線、交通卡和放置區亮起來 */
function mark(hit: Hit | null, intent: DropIntent) {
  clearMarks();
  if (!hit || intent === 'none') return;
  if (hit.target.kind === 'card') hit.el.classList.add(intent === 'merge' ? 'drop-merge' : intent === 'before' ? 'drop-before' : 'drop-after');
  else hit.el.classList.add(hit.target.kind === 'leg' ? 'drop-leg-over' : hit.target.kind === 'end' ? 'drop-end-over' : 'drop-cand-over');
}

/** 拖曳中的東西（HTML5 的 dragover 讀不到 dataTransfer 的內容，放在這裡） */
let current: DragSource | null = null;

/** 開始拖：不能合併的卡片變淡 */
function beginDrag(src: DragSource) {
  current = src;
  document.body.classList.add('dragging-plan');
  document.querySelectorAll<HTMLElement>('[data-drop-item]').forEach((el) => {
    const hit = hitOf(el);
    if (hit?.target.kind === 'card' && !canMerge(src, hit.target)) el.classList.add('drop-nomerge');
  });
}

function endDrag() {
  current = null;
  document.body.classList.remove('dragging-plan');
  clearMarks();
  document.querySelectorAll('.drop-nomerge').forEach((el) => el.classList.remove('drop-nomerge'));
}

/** 電腦版：可以拖的東西（卡片、備卡、候選）；placeId 給聊天室 */
export function dragSourceProps(src: DragSource | null, placeId: string | null) {
  if (!src) return {};
  return {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.stopPropagation();
      if (src.kind === 'item') e.dataTransfer.setData(ITEM, src.itemId);
      if (src.kind === 'candidate') e.dataTransfer.setData(CANDIDATE, JSON.stringify({ candidateId: src.candidateId, placeId: src.placeId }));
      if (src.kind === 'option') e.dataTransfer.setData(OPTION, JSON.stringify({ itemId: src.itemId, index: src.index }));
      if (placeId) e.dataTransfer.setData(PLACE, placeId);
      e.dataTransfer.effectAllowed = 'copyMove';
      beginDrag(src);
    },
    onDragEnd: endDrag,
  };
}

/** 放置區共用的 HTML5 拖曳處理 */
function dropZoneHandlers() {
  return {
    onDragOver: (e: DragEvent) => {
      if (!current) return;
      const hit = hitOf(e.currentTarget as HTMLElement);
      if (!hit) return;
      e.stopPropagation();
      const intent = intentAt(current, hit, e.clientY);
      mark(hit, intent);
      if (intent === 'none') return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    },
    onDragLeave: (e: DragEvent) => (e.currentTarget as HTMLElement).classList.remove(...MARKS),
    onDrop: (e: DragEvent) => {
      const src = current;
      const hit = hitOf(e.currentTarget as HTMLElement);
      if (!src || !hit) return;
      e.preventDefault();
      e.stopPropagation();
      const r = resolve(hit, intentAt(src, hit, e.clientY));
      endDrag();
      if (r) void runDrop(src, r);
    },
  };
}

/** 卡片：放在它前面、後面，或合併到它（placeType：主卡的類型，不是造訪是 null） */
export function dropOnCardProps(target: Extract<DropTargetInfo, { kind: 'card' }>, enabled: boolean) {
  if (!enabled) return {};
  return { 'data-drop-item': target.itemId, 'data-drop-type': target.placeType ?? '', 'data-drop-flight': String(target.isFlight), ...dropZoneHandlers() };
}

/** 交通卡：排在這段通往的卡片前面（itemId 是 null：回住宿那段，放在這天的最後） */
export function dropOnLegProps(itemId: string | null, date: string, enabled: boolean) {
  if (!enabled) return {};
  return { 'data-drop-leg': itemId ?? '', 'data-drop-date': date, ...dropZoneHandlers() };
}

/** 時間軸最後的放置區：放在這天的最後（出發航班之前） */
export function dropOnEndProps(date: string, enabled: boolean) {
  if (!enabled) return {};
  return { 'data-drop-end': date, ...dropZoneHandlers() };
}

/** 這天的候選區：備卡放回候選 */
export function dropOnCandidatesProps(date: string, enabled: boolean) {
  if (!enabled) return {};
  return { 'data-drop-candidates': date, ...dropZoneHandlers() };
}

// --- 手機：長按後拖 ----------------------------------------------------------

const LONG_PRESS_MS = 400;
const MOVE_CANCEL_PX = 8;

/**
 * 手機：長按進入拖曳，放開時照 dropIntent 執行。回傳要掛在拖曳來源（卡片、候選）上的 ref。
 * src 放在 ref 裡（換著看備卡時跟著換），監聽器只在能不能拖變了才重掛，重畫不會打斷拖到一半的手勢。
 * 監聽器直接掛在元素上（touchmove 一開始就是 passive: false，Chrome 才讓長按之後擋得住捲動），
 * 卸載或關掉規劃模式時一定清乾淨（不然整頁不能捲）。
 */
export function useLongPressDrag<T extends HTMLElement>(src: DragSource | null, enabled: boolean) {
  const ref = useRef<T>(null);
  const srcRef = useRef(src);
  srcRef.current = src;
  const on = enabled && !!src;
  useEffect(() => {
    const el = ref.current;
    if (!el || !on) return;
    let timer = 0;
    let start: { x: number; y: number } | null = null;
    let active: DragSource | null = null;
    const stop = () => {
      window.clearTimeout(timer);
      start = null;
      if (active) endDrag();
      active = null;
      el.classList.remove('drag-source');
    };
    const onTouchMove = (e: TouchEvent) => {
      if (active) e.preventDefault();
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || start) return;
      start = { x: e.clientX, y: e.clientY };
      const pointerId = e.pointerId;
      timer = window.setTimeout(() => {
        const s = srcRef.current;
        if (!s) return;
        active = s;
        el.setPointerCapture?.(pointerId);
        beginDrag(s);
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
      const hit = hitOf(document.elementFromPoint(e.clientX, e.clientY));
      mark(hit, hit ? intentAt(active, hit, e.clientY) : 'none');
    };
    const onUp = (e: PointerEvent) => {
      const s = active;
      const hit = s ? hitOf(document.elementFromPoint(e.clientX, e.clientY)) : null;
      const r = s && hit ? resolve(hit, intentAt(s, hit, e.clientY)) : null;
      stop();
      if (s && r) void runDrop(s, r);
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
  }, [on]);
  return ref;
}
