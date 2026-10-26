// 編輯的拖曳（interaction-design §6、第四輪設計 §4、第七輪 §6.4）：
// - 可以拖的：時間軸的卡片（有備卡時連同備卡）、合併卡片正在看的備卡、這天的候選（住宿的候選不能拖）。
//   候選拖到卡片上＝合併，拖到卡片之間＝排進那個位置。
// - 從哪裡抓看這次按下去的是什麼（pointerType，不看螢幕寬度）：手指只有左邊的把手能拖、一按就開始；滑鼠整張卡、移動超過 5px 才開始。
//   兩邊都用 pointer 事件（usePlanDrag）：「取得 DragSource → 每一格畫面算 dropIntent（lib/dropIntent.ts）→ 標記 → 放開時執行」。
// - 拖的時候：卡片的複本浮起來跟著指標，要放的位置讓出空位（drop-before／after）；靠近捲動區上下緣自動捲（lib/dragScroll.ts）。
// - 停在同類型卡片正上方 MERGE_DWELL_MS 才是合併（亮框「放開＝和「X」合併成備選」），只是經過不合併；卡片上下邊緣、最後的放置區＝排在這裡；
//   放在交通卡上＝排在這段通往的卡片前面（不合併；回住宿那段＝這天的最後）；備卡放到候選區＝放回候選。拖曳開始時，不能合併的卡片變淡（drop-nomerge）。
// - 網頁：放在左邊的聊天室（data-drop-ai）＝問 AI（askAi.ts；原本的 HTML5 拖曳改成這裡一起處理）。
// - 「⋯」的撤下（withdrawItem）：整張卡回這天的候選，也在這裡；「調整順序」的合併也用 mergeItemInto。
// - 合併、換順序、拆開、排進、放回候選、撤下都可以復原（changeItinerary 的 undo）；候選的增減在 settle 裡做完才跳復原提示。放回原位不存檔。
// 放置區：卡片 data-drop-item（data-drop-type、data-drop-flight）、交通卡 data-drop-leg（data-drop-date）、
// 最後的放置區 data-drop-end、候選區 data-drop-candidates。

import { useEffect, useRef } from 'react';
import { addOption, detachOption, ItineraryError, mergeItems, moveItemTo, moveOption, removeOption } from '@travel-helper/engine';
import type { Itinerary } from '@travel-helper/engine/types';
import { shared } from '../appShared.ts';
import { dataStore } from '../dataStore.ts';
import { appStore } from '../store.ts';
import { findItemRef } from '../lib/planView.ts';
import { canMerge, dropIntent, dropTarget, dwellMerge, samePosition, type DragSource, type DropAt, type DropIntent, type DropTargetInfo } from '../lib/dropIntent.ts';
import { autoScrollSpeed } from '../lib/dragScroll.ts';
import { addPlaceToDay } from './addToDay.ts';
import { askAi } from './askAi.ts';

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
export async function mergeItemInto(it: Itinerary, itemId: string, targetId: string) {
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

/**
 * 撤下（「⋯」的 ↩ 撤下）：整張卡回這天的候選，可以復原（做法在 sharedStore 的 withdrawItem：
 * 這天已經有的候選不加也不記，復原時只刪這次加的，連本機還沒同步到的別人的候選也不會刪到）
 */
export async function withdrawItem(itemId: string, date: string): Promise<void> {
  await shared.withdrawItem(itemId, date);
}

/** 備卡放回這天的候選（備卡拖到候選區），可以復原；復原時只刪這次加的候選（ensureCandidate 的 created） */
export async function putBackOption(itemId: string, index: number, date: string) {
  const it = dataStore.getState().itinerary;
  const placeId = it ? optionPlace(it, itemId, index) : null;
  if (!placeId) return;
  const label = placeName(placeId);
  // 先放回候選、再從卡片拿掉：「已放回候選」的復原提示要最後出現（共用一個提示位置）
  // 這天已經有這個候選就不用再加，照樣從卡片拿掉；加不起來時 ensureCandidate 自己會跳錯誤提示
  const c = await shared.ensureCandidate(placeId, date);
  if (!c.ok) return;
  const created = c.value.created ? [c.value.id] : [];
  const r = await shared.changeItinerary((x) => removeOption(x, itemId, index), `${label} 從卡片拿出來`, {
    undo: { text: `已放回候選・${label}`, after: () => shared.dropCreated(created) },
  });
  if (!r.ok) await shared.dropCreated(created);
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

/**
 * 放開的結果。卡片的位置只算看得到的那張卡（扣掉讓位的空白：drop-before／after 的 padding）：
 * 指標在上面的空位裡＝before、下面的空位裡＝after；上下緣、中間照卡片本身算，指著卡片正中間就是那張卡的中間區
 */
function intentAt(src: DragSource, hit: Hit, clientY: number, merging: boolean): DropIntent {
  const r = hit.el.getBoundingClientRect();
  let top = r.top;
  let height = r.height;
  if (hit.target.kind === 'card') {
    const cs = getComputedStyle(hit.el);
    const pt = parseFloat(cs.paddingTop) || 0;
    const pb = parseFloat(cs.paddingBottom) || 0;
    top += pt;
    height -= pt + pb;
  }
  return dropIntent(src, hit.target, { top, height }, clientY, merging);
}

/** 放開的結果換成要做的事 */
function resolve(hit: Hit, intent: DropIntent): Resolved | null {
  if (intent === 'none') return null;
  const t = hit.target;
  if (t.kind === 'card') return intent === 'merge' ? { kind: 'merge', itemId: t.itemId } : { kind: 'insert', at: { kind: 'item', itemId: t.itemId, after: intent === 'after' } };
  if (t.kind === 'leg') return { kind: 'insert', at: t.itemId ? { kind: 'item', itemId: t.itemId, after: false } : { kind: 'end', date: hit.el.dataset.dropDate! } };
  if (t.kind === 'end') return { kind: 'insert', at: { kind: 'end', date: hit.el.dataset.dropEnd! } };
  return { kind: 'candidates', date: hit.el.dataset.dropCandidates! };
}

const MARKS = ['drop-before', 'drop-after', 'drop-merge', 'keep-gap-before', 'keep-gap-after', 'drop-leg-over', 'drop-end-over', 'drop-cand-over'];

function clearMarks() {
  document.querySelectorAll<HTMLElement>(MARKS.map((c) => `.${c}`).join(', ')).forEach((el) => {
    el.classList.remove(...MARKS);
    delete el.dataset.dropLabel;
  });
  document.querySelectorAll('[data-drop-ai].drop-over').forEach((el) => el.classList.remove('drop-over'));
}

/**
 * 標記放開的結果：讓位（drop-before／after 撐開一個空位）、合併的亮框和「放開＝和「X」合併成備選」、交通卡和放置區亮起來、聊天室。
 * 只加不拿（每一格畫面都補一次：React 重畫 className 時會把手動加的 class 洗掉，例如游標經過時的 flash）；換目標時先 clearMarks
 */
function mark(hit: Hit | null, intent: DropIntent, chat: HTMLElement | null) {
  if (chat) chat.classList.add('drop-over');
  if (!hit || intent === 'none') return;
  if (hit.target.kind === 'card') {
    hit.el.classList.add(intent === 'merge' ? 'drop-merge' : intent === 'before' ? 'drop-before' : 'drop-after');
    if (intent === 'merge') {
      const it = dataStore.getState().itinerary;
      hit.el.dataset.dropLabel = `放開＝和「${placeName(it ? optionPlace(it, hit.target.itemId) : null)}」合併成備選`;
    }
  } else hit.el.classList.add(hit.target.kind === 'leg' ? 'drop-leg-over' : hit.target.kind === 'end' ? 'drop-end-over' : 'drop-cand-over');
}

/** 開始拖：不能合併的卡片變淡（回傳那些卡，拖的時候每一格補回 class） */
function beginDrag(src: DragSource): HTMLElement[] {
  // 拖的時候不算指到（appStore.hover 在 dragging-plan 時不理）：先把現在的指到拿掉
  appStore.getState().hover(null);
  document.body.classList.add('dragging-plan');
  return [...document.querySelectorAll<HTMLElement>('[data-drop-item]')].filter((el) => {
    const hit = hitOf(el);
    return hit?.target.kind === 'card' && !canMerge(src, hit.target);
  });
}

function endDrag() {
  document.body.classList.remove('dragging-plan');
  clearMarks();
  document.querySelectorAll('.drop-nomerge').forEach((el) => el.classList.remove('drop-nomerge'));
}

/** 卡片：放在它前面、後面，或合併到它（placeType：主卡的類型，不是造訪是 null） */
export function dropOnCardProps(target: Extract<DropTargetInfo, { kind: 'card' }>, enabled: boolean) {
  if (!enabled) return {};
  return { 'data-drop-item': target.itemId, 'data-drop-type': target.placeType ?? '', 'data-drop-flight': String(target.isFlight) };
}

/** 交通卡：排在這段通往的卡片前面（itemId 是 null：回住宿那段，放在這天的最後） */
export function dropOnLegProps(itemId: string | null, date: string, enabled: boolean) {
  if (!enabled) return {};
  return { 'data-drop-leg': itemId ?? '', 'data-drop-date': date };
}

/** 時間軸最後的放置區：放在這天的最後（出發航班之前） */
export function dropOnEndProps(date: string, enabled: boolean) {
  if (!enabled) return {};
  return { 'data-drop-end': date };
}

/** 這天的候選區：備卡放回候選 */
export function dropOnCandidatesProps(date: string, enabled: boolean) {
  if (!enabled) return {};
  return { 'data-drop-candidates': date };
}

// --- 拖曳：手指按把手、滑鼠整張卡 --------------------------------------------------

/** 滑鼠按下去移動超過這個距離（px）才算拖；沒移動就放開＝點 */
export const MOUSE_DRAG_PX = 5;

/** 手指移動超過這個距離才把手機面板拉滿（只是點一下把手不跳） */
const TOUCH_LIFT_PX = 4;

/** 手指只能從把手開始拖 */
const HANDLE = '.tc-handle, .cand-handle';

/** 滑鼠按在這些東西上照常是按鈕，不會開始拖（⋯、−／＋、標籤、‹ 1/2 ›、地圖 ↗、改） */
const NO_DRAG = 'button, a, input, select, textarea, label, .tag-edit, .option-switch, .m-option-switch, .tc-expand, .tc-more';

/** 例外：候選的名稱是按鈕，但整列都能拖（點了照樣看預覽） */
const DRAG_OK = '.cand-name';

export interface PlanDragOptions {
  /** 開始拖（手機：面板暫時拉滿） */
  onStart?: () => void;
  /** 拖完（放開或取消；手機：面板回到原本的高度） */
  onEnd?: () => void;
  /** 放在聊天室（data-drop-ai）時問 AI 的點（網頁：拖到左邊的聊天室） */
  askPlace?: string | null;
}

/** 正在拖的那一次（一次只有一個） */
interface Session {
  src: DragSource;
  el: HTMLElement;
  pointerType: string;
  /** 浮起來跟著指標的複本 */
  float: HTMLElement;
  /** 指標現在的位置、按下去的位置 */
  x: number;
  y: number;
  startX: number;
  startY: number;
  /** 停在哪張卡的中間區、從什麼時候開始（合併要停 MERGE_DWELL_MS） */
  over: { itemId: string; since: number } | null;
  /** 這張卡的空位開在哪一邊（中間區還沒停夠時照這個，不換邊） */
  side: 'before' | 'after' | null;
  scroller: HTMLElement;
  raf: number;
  started: boolean;
  last: { hit: Hit | null; intent: DropIntent; chat: HTMLElement | null };
  /** 不能合併、要變淡的卡 */
  nomerge: HTMLElement[];
  opts: PlanDragOptions;
}

let session: Session | null = null;

/** 已經被某個拖曳來源接手的 pointerdown（巢狀的來源只讓最裡面的那個開始；不用 stopPropagation） */
const claimed = new WeakSet<Event>();

/** 往上找會捲的那一層（手機的行程面板、網頁的右欄）；找不到用整頁 */
function scrollParent(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return (document.scrollingElement as HTMLElement) ?? document.documentElement;
}

/** 浮起來的複本：拿掉 testid、放置區的標記，不擋 elementFromPoint；x、y 是指標（縮小時以它為中心） */
function makeFloat(el: HTMLElement, rect: DOMRect, x: number, y: number): HTMLElement {
  const f = el.cloneNode(true) as HTMLElement;
  for (const x of [f, ...f.querySelectorAll<HTMLElement>('*')]) {
    x.removeAttribute('data-testid');
    x.removeAttribute('id');
    for (const a of ['data-drop-item', 'data-drop-type', 'data-drop-flight', 'data-drop-leg', 'data-drop-end', 'data-drop-candidates']) x.removeAttribute(a);
  }
  f.classList.remove('drag-source', 'selected', 'flash', ...MARKS);
  f.classList.add('drag-float');
  f.setAttribute('aria-hidden', 'true');
  Object.assign(f.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, transformOrigin: `${x - rect.left}px ${y - rect.top}px` });
  document.body.appendChild(f);
  return f;
}

/** 照指標的位置算放開的結果、標記（每一格畫面、每次移動都跑：停著不動也要算合併的停留） */
function evaluate(s: Session) {
  const under = document.elementFromPoint(s.x, s.y);
  const hit = hitOf(under);
  const chat = s.opts.askPlace ? (under?.closest<HTMLElement>('[data-drop-ai]') ?? null) : null;
  const now = performance.now();
  const l = s.last;
  // 換了一張卡：空位從頭決定
  if (l.hit?.el !== hit?.el) s.side = null;
  // 這個位置在哪一區（照可以合併的分法：上緣、下緣、中間區 merge）
  const zone = hit && !chat ? intentAt(s.src, hit, s.y, true) : 'none';
  // 只是經過不合併：指標進到這張卡的中間區才開始計時，離開中間區就重來
  const center = zone === 'merge' && hit?.target.kind === 'card' ? hit.target.itemId : null;
  if (!center) s.over = null;
  else if (s.over?.itemId !== center) s.over = { itemId: center, since: now };
  let intent: DropIntent = zone;
  if (zone === 'merge' && !dwellMerge(s.over, now)) {
    // 還沒停夠：空位留在原本那一邊（換邊會讓卡片上下跳 60px，指標就跑到別區去）；剛進來時照上下半
    intent = s.side ?? intentAt(s.src, hit!, s.y, false);
  }
  if (intent === 'before' || intent === 'after') s.side = intent;
  if (l.hit?.el !== hit?.el || l.intent !== intent || l.chat !== chat) clearMarks();
  mark(hit, intent, chat);
  // 合併時空位不收（收了卡片會跳），只是不畫「放開＝排在這裡」
  if (hit && intent === 'merge' && s.side) hit.el.classList.add(s.side === 'before' ? 'keep-gap-before' : 'keep-gap-after');
  s.el.classList.add('drag-source');
  for (const el of s.nomerge) el.classList.add('drop-nomerge');
  // 要合併時複本縮小（以指標為中心），看得到底下那張的亮框和提示
  s.float.classList.toggle('merging', intent === 'merge' || !!chat);
  s.last = { hit, intent, chat };
}

/** 每一格畫面：靠近上下緣就捲，再算一次放在哪 */
function tick() {
  const s = session;
  if (!s) return;
  const r = s.scroller.getBoundingClientRect();
  const speed = autoScrollSpeed(s.y, Math.max(0, r.top), Math.min(window.innerHeight, r.bottom));
  if (speed) s.scroller.scrollTop += speed;
  evaluate(s);
  s.raf = requestAnimationFrame(tick);
}

/** 移動：複本跟著指標（陰影、微傾在 CSS 的 drag-float），手指第一次移動時把手機面板拉滿 */
function follow(s: Session, x: number, y: number) {
  s.x = x;
  s.y = y;
  // translate 和 scale（合併時縮小）分開寫：scale 不會把位移也縮小
  s.float.style.translate = `${x - s.startX}px ${y - s.startY}px`;
  if (!s.started && Math.hypot(x - s.startX, y - s.startY) > TOUCH_LIFT_PX) {
    s.started = true;
    s.opts.onStart?.();
  }
  evaluate(s);
}

/** 開始拖（滑鼠移動超過 MOUSE_DRAG_PX、手指按下把手） */
function startSession(src: DragSource, el: HTMLElement, pointerType: string, x: number, y: number, opts: PlanDragOptions): Session {
  const rect = el.getBoundingClientRect();
  const nomerge = beginDrag(src);
  el.classList.add('drag-source');
  for (const x of nomerge) x.classList.add('drop-nomerge');
  const s: Session = {
    src,
    el,
    pointerType,
    float: makeFloat(el, rect, x, y),
    x,
    y,
    startX: x,
    startY: y,
    over: null,
    side: null,
    scroller: scrollParent(el),
    raf: 0,
    started: false,
    last: { hit: null, intent: 'none', chat: null },
    nomerge,
    opts,
  };
  session = s;
  s.raf = requestAnimationFrame(tick);
  return s;
}

/** 結束：commit＝放開（照最後算的結果執行），false＝取消（Esc、pointercancel） */
function finish(commit: boolean) {
  const s = session;
  if (!s) return;
  session = null;
  cancelAnimationFrame(s.raf);
  if (commit) evaluate(s);
  s.float.remove();
  s.el.classList.remove('drag-source');
  const { hit, intent, chat } = s.last;
  endDrag();
  if (s.started) s.opts.onEnd?.();
  if (!commit) return;
  if (chat && s.opts.askPlace) return askAi(s.opts.askPlace);
  const r = hit ? resolve(hit, intent) : null;
  if (r) void runDrop(s.src, r);
}

/** 滑鼠拖完之後的那一下 click 不算點卡片（不然放開就展開了） */
function swallowNextClick() {
  const stop = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener('click', stop, { capture: true, once: true });
  window.setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0);
}

/**
 * 編輯的拖曳（第七輪 §6.4），回傳要掛在拖曳來源（卡片、候選）上的 ref：
 * - 手指（pointerType 不是 mouse）：只有把手（.tc-handle、.cand-handle）能拖，一按就開始，不用長按；卡片其他地方照常捲動、點。
 * - 滑鼠：整張卡都能抓，按下去移動超過 MOUSE_DRAG_PX 才開始（按在 NO_DRAG 上照常是按鈕）；拖完那一下 click 不算點。
 * 拖的時候：複本（drag-float）跟著指標，原來那張變淡；放的位置讓出空位；靠近捲動區上下緣自動捲；停在同類型卡上 0.6 秒才合併；Esc 取消。
 * src、opts 放在 ref 裡（換著看備卡時跟著換），監聽器只在能不能拖變了才重掛，重畫不會打斷拖到一半的手勢；
 * 卸載或關掉編輯時一定清乾淨（不然整頁不能捲）。
 */
export function usePlanDrag<T extends HTMLElement>(src: DragSource | null, enabled: boolean, opts: PlanDragOptions = {}) {
  const ref = useRef<T>(null);
  const srcRef = useRef(src);
  srcRef.current = src;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const on = enabled && !!src;
  useEffect(() => {
    const el = ref.current;
    if (!el || !on) return;
    // 滑鼠按下去、還沒移動到 MOUSE_DRAG_PX
    let pending: { x: number; y: number; id: number } | null = null;
    const mine = () => session?.el === el;
    const onMove = (e: PointerEvent) => {
      if (pending && e.pointerId === pending.id && !session) {
        if (Math.hypot(e.clientX - pending.x, e.clientY - pending.y) <= MOUSE_DRAG_PX) return;
        const s = srcRef.current;
        const p = pending;
        pending = null;
        if (!s) return detach();
        startSession(s, el, 'mouse', p.x, p.y, optsRef.current);
      }
      if (session && mine()) follow(session, e.clientX, e.clientY);
    };
    const onUp = (e: PointerEvent) => {
      pending = null;
      if (session && mine()) {
        if (session.pointerType === 'mouse') swallowNextClick();
        session.x = e.clientX;
        session.y = e.clientY;
        finish(true);
      }
      detach();
    };
    const onCancel = () => {
      pending = null;
      if (mine()) finish(false);
      detach();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mine()) onCancel();
    };
    const attach = () => {
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      window.addEventListener('keydown', onKey);
    };
    function detach() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
    }
    const onDown = (e: PointerEvent) => {
      if (session || pending) return;
      const t = e.target as Element;
      if (e.pointerType === 'mouse') {
        if (e.button !== 0 || (t.closest(NO_DRAG) && !t.closest(DRAG_OK))) return;
        // 裡面還有別的拖曳來源時交給最裡面的那個：做記號，不擋冒泡（usePlanningIdle、點外面關掉的彈窗都要聽到 pointerdown）
        if (claimed.has(e)) return;
        claimed.add(e);
        pending = { x: e.clientX, y: e.clientY, id: e.pointerId };
        attach();
        return;
      }
      const handle = t.closest(HANDLE);
      const s = srcRef.current;
      if (!handle || !el.contains(handle) || !s || claimed.has(e)) return;
      claimed.add(e);
      startSession(s, el, e.pointerType, e.clientX, e.clientY, optsRef.current);
      navigator.vibrate?.(15);
      attach();
    };
    // 拖的時候擋住捲動（把手本身是 touch-action: none，這裡是保險）
    const onTouchMove = (e: TouchEvent) => {
      if (mine()) e.preventDefault();
    };
    // 照片、連結的原生拖曳會搶走滑鼠的拖（pointercancel）
    const onNativeDrag = (e: DragEvent) => e.preventDefault();
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('dragstart', onNativeDrag);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('dragstart', onNativeDrag);
      detach();
      if (mine()) finish(false);
    };
  }, [on]);
  return ref;
}
