// 「⋯」動作選單每個動作要做的事（設計 §2.3）。沒有版面：網頁版的 ActionMenu、手機版的動作面板都呼叫 runCardAction。
// 要開子畫面的動作（標籤、移到第幾天、這晚的方案、改停留時間、調整順序）交給呼叫的人（ui）；其他直接改行程或候選。
// 調整順序子畫面的上移、下移（reorderStep）、合併（mergeItemInto，和拖曳同一份）也在這裡。
// 撤下是 planDrag.ts 的 withdrawItem；排進這天用 addToDay.ts 的 addPlaceToDay；刪別人加的候選開 RejectDialog（要寫理由）。
// 選單畫什麼（menuItems：順序、組名、紅字）和「移到第幾天」的兩個動作（moveItemToDayAction、moveCandidateToDay）也在這裡，兩邊共用。

import { detachOption, moveItemTo, moveItemToDay, removeItem, selectOption, setLodging, setStart } from '@travel-helper/engine';
import type { Itinerary } from '@travel-helper/engine/types';
import { shared } from '../appShared.ts';
import { dataStore } from '../dataStore.ts';
import { openDialog } from '../uiStore.ts';
import { findItemRef } from '../lib/planView.ts';
import { dayLabel, shortDayLabel } from '../lib/trip.ts';
import { ACTION_LABELS, cardActions, type ActionId, type CardActionContext } from '../shared/cardActions.ts';
import { addPlaceToDay } from './addToDay.ts';
import { mergeItemInto, withdrawItem } from './planDrag.ts';
import { reorderInfo } from '../lib/dropIntent.ts';

/** 動作作用在哪張卡 */
export interface ActionTarget {
  date: string;
  itemId?: string;
  /** 重疊卡：正在看的那個選項（主要、拿出用） */
  optionIndex?: number;
  candidateId?: number;
  placeId?: string;
  /** 時間軸上現在的開始時間（釘選用） */
  start?: string;
  /** 移到某組（group-in）：那一組 */
  split?: { id: string; group: string; name?: string };
}

/** 要開子畫面的動作，由呼叫的人決定怎麼開 */
export interface ActionUi {
  openTags: () => void;
  openMove: () => void;
  openLodgingPlan: () => void;
  openStay?: () => void;
  /** 調整順序的子畫面（上移、下移、和哪一張合併） */
  openReorder?: () => void;
}

/** 分組的日子：這張卡可以移進的組（自己這組以外，同一天所有分組的每一組） */
export function groupTargetsOf(it: Itinerary | null, itemId: string): { splitId: string; groupId: string; name: string }[] {
  const ref = findItemRef(it, itemId);
  if (!ref || ref.item.type === 'split') return [];
  const items = it?.days.find((d) => d.date === ref.date)?.items ?? [];
  return items.flatMap((x) =>
    x.type === 'split' ? x.groups.filter((g) => !(ref.split?.id === x.id && ref.split.group === g.id)).map((g) => ({ splitId: x.id, groupId: g.id, name: g.name })) : [],
  );
}

/** 紅字的動作（刪掉東西的） */
const DANGER = new Set<ActionId>(['delete', 'lodging-clear']);

/** 選單的一項：網頁版的 ActionMenu、手機版的動作清單都照這個畫 */
export interface MenuItem {
  id: ActionId;
  /** React 的 key（「移到{組名}」每組一項，要加上組） */
  key: string;
  text: string;
  /** 這一項作用在哪（group-in 帶著那一組） */
  target: ActionTarget;
  danger: boolean;
  /** group-in 的那一組（data-group） */
  group?: string;
}

/** 選單要畫的項目，分好組（照 cardActions）；每個 group-in 和 ctx.groupTargets 照位置對上 */
export function menuItems(ctx: CardActionContext, target: ActionTarget): MenuItem[][] {
  const targets = ctx.groupTargets ?? [];
  let nth = 0; // 第幾個 group-in
  return cardActions(ctx).map((group) =>
    group.map((id) => {
      const g = id === 'group-in' ? targets[nth++] : undefined;
      const danger = DANGER.has(id);
      if (!g) return { id, key: id, text: ACTION_LABELS[id], target, danger };
      return { id, key: `${id}:${g.splitId}:${g.groupId}`, text: `移到${g.name}`, target: { ...target, split: { id: g.splitId, group: g.groupId, name: g.name } }, danger, group: g.groupId };
    }),
  );
}

/** 這張卡在行程裡的位置：那天（或那一組）的第幾個 */
function positionOf(it: Itinerary, itemId: string): { date: string; index: number; split?: { id: string; group: string } } | null {
  for (const d of it.days) {
    const i = d.items.findIndex((x) => x.id === itemId);
    if (i >= 0) return { date: d.date, index: i };
    for (const x of d.items) {
      if (x.type !== 'split') continue;
      for (const g of x.groups) {
        const j = g.items.findIndex((y) => y.id === itemId);
        if (j >= 0) return { date: d.date, index: j, split: { id: x.id, group: g.id } };
      }
    }
  }
  return null;
}

const placeName = (id: string | null | undefined) => {
  const p = id ? dataStore.getState().byId.get(id) : null;
  return p ? p.name.zh || p.name.ja : (id ?? '項目');
};

/** 卡片的名稱（重疊卡給 optionIndex 是那個選項） */
function itemLabel(itemId: string, optionIndex?: number): string {
  const item = findItemRef(dataStore.getState().itinerary, itemId)?.item;
  if (item?.type === 'visit') return placeName(item.options[optionIndex ?? item.selected]?.place);
  return item?.type === 'split' ? '分組' : item?.type === 'free' ? '自由時間' : '項目';
}

/** 重疊卡的「拿出」：那個選項變成單獨一張卡，放在主卡的下一個位置（在分組裡就留在同一組）。拿出的是主卡時，皇冠先給別張 */
function detach(it: Itinerary, itemId: string, optionIndex: number): Itinerary {
  const pos = positionOf(it, itemId);
  const item = findItemRef(it, itemId)?.item;
  if (!pos || item?.type !== 'visit') return it;
  const base = optionIndex === item.selected ? selectOption(it, itemId, optionIndex === 0 ? 1 : 0) : it;
  return detachOption(base, itemId, optionIndex, pos.date, pos.index + 1, pos.split).itinerary;
}

/** 候選的刪除：自己加的直接撤回，別人加的開對話框寫理由 */
function deleteCandidate(id: number) {
  const s = shared.store.getState();
  const c = s.candidates.find((x) => x.id === id);
  if (!c) return;
  if (c.addedBy === s.me?.id) return void shared.removeCandidate(id);
  openDialog({ kind: 'reject', candidateId: id });
}

/** 卡片（造訪、自由時間、分組）移到別天：放到那天的最後，留在原本那天，跳可以復原的「已移到 …」提示（網頁版、手機版共用） */
export async function moveItemToDayAction(itemId: string, date: string): Promise<boolean> {
  const label = itemLabel(itemId);
  const r = await shared.changeItinerary((it) => moveItemToDay(it, itemId, date), `${label} 移到 ${dayLabel(date)}`, { undo: { text: `已移到 ${dayLabel(date)}・${label}` } });
  return r.ok;
}

/**
 * 自己加的候選移到別天（網頁版、手機版共用）：先在那天加成候選，成功了才拿掉這天的。
 * 拿不掉這天的：把剛加的拿掉（那天本來就有的不動），跳錯誤提示
 */
export async function moveCandidateToDay(candidateId: number, date: string): Promise<boolean> {
  const s = shared.store.getState();
  const c = s.candidates.find((x) => x.id === candidateId);
  if (!c) return false;
  const existed = s.candidates.some((x) => x.placeId === c.placeId && x.day === date);
  const added = await shared.addCandidate(c.placeId, date);
  if (!added.ok) return false;
  const removed = await shared.removeCandidate(c.id, undefined, true);
  if (removed.ok) return true;
  if (!existed) await shared.removeCandidate(added.value.id, undefined, true);
  shared.notifyError(`沒有移到 ${shortDayLabel(date)}：${removed.error}`);
  return false;
}

const typeOf = (id: string) => dataStore.getState().byId.get(id)?.type;

/**
 * 調整順序的子畫面要的東西：第幾張、能不能上移下移、可以合併過去的卡（ID 和名稱）；
 * mergeable：只有造訪能合併成備選（自由時間、分組只有上移下移）。找不到卡是 null
 */
export function reorderState(it: Itinerary | null, itemId: string) {
  const r = it ? reorderInfo(it, itemId, typeOf) : null;
  const mergeable = findItemRef(it, itemId)?.item.type === 'visit';
  return r && { ...r, mergeable, merge: r.merge.map((id) => ({ itemId: id, name: itemLabel(id) })) };
}

/** 上移（dir＝-1）或下移（1）一張：留在同一天、同一組，可以復原；到頭了不動 */
export async function reorderStep(itemId: string, dir: -1 | 1): Promise<void> {
  const it = dataStore.getState().itinerary;
  const ref = findItemRef(it, itemId);
  const r = it ? reorderInfo(it, itemId, typeOf) : null;
  const index = r && (dir < 0 ? r.up : r.down);
  if (!ref || index == null) return;
  const label = `${itemLabel(itemId)} ${dir < 0 ? '上移' : '下移'}`;
  const split = ref.split ? { id: ref.split.id, group: ref.split.group } : undefined;
  await shared.changeItinerary((x) => moveItemTo(x, itemId, ref.date, index, split), label, { undo: { text: label } });
}

/** 和另一張合併成備選（調整順序的「和哪一張合併成備選…」） */
export async function mergeItemAction(itemId: string, targetId: string): Promise<void> {
  const it = dataStore.getState().itinerary;
  if (it) await mergeItemInto(it, itemId, targetId);
}

/** 執行「⋯」選單的一個動作 */
export async function runCardAction(id: ActionId, target: ActionTarget, ui: ActionUi): Promise<void> {
  const { date, itemId } = target;
  switch (id) {
    case 'tags':
      return ui.openTags();
    case 'move':
      return ui.openMove();
    case 'reorder':
      return ui.openReorder?.();
    case 'lodging-plan':
      return ui.openLodgingPlan();
    case 'stay':
    case 'free-length':
      return ui.openStay?.();
    case 'lodging-clear':
      await shared.changeItinerary((it) => setLodging(it, date, null), `清掉 ${shortDayLabel(date)} 的住宿`);
      return;
    case 'schedule': {
      const placeId = target.placeId;
      if (!placeId) return;
      // 住宿會換掉那晚原本的住宿，用對話框確認（同候選的「↑ 設為這晚的住宿」）
      if (dataStore.getState().byId.get(placeId)?.type === 'lodging') return openDialog({ kind: 'add', placeId, day: date });
      await addPlaceToDay(placeId, date);
      return;
    }
    case 'delete':
      if (target.candidateId != null) return deleteCandidate(target.candidateId);
      if (!itemId) return;
      {
        const label = itemLabel(itemId);
        await shared.changeItinerary((it) => removeItem(it, itemId), `－${label}`, { undo: { text: `已刪除・${label}` } });
      }
      return;
  }
  if (!itemId) return;
  const label = itemLabel(itemId, target.optionIndex);
  switch (id) {
    case 'main':
      if (target.optionIndex == null) return;
      await shared.changeItinerary((it) => selectOption(it, itemId, target.optionIndex!), `${label} 設為主要`);
      return;
    case 'detach': {
      if (target.optionIndex == null) return;
      const text = `已拿出・${label}`;
      await shared.changeItinerary((it) => detach(it, itemId, target.optionIndex!), `${label} 拿出來變成單獨一站`, { undo: { text } });
      return;
    }
    case 'pin':
      if (!target.start) return;
      await shared.changeItinerary((it) => setStart(it, itemId, target.start!), `固定 ${target.start} 開始`);
      return;
    case 'unpin':
      await shared.changeItinerary((it) => setStart(it, itemId, null), `${label} 取消固定時間`);
      return;
    case 'group-in': {
      const g = target.split;
      if (!g) return;
      await shared.changeItinerary((it) => moveItemTo(it, itemId, date, 0, { id: g.id, group: g.group }), `${label} 移到${g.name ?? '別組'}`);
      return;
    }
    case 'group-out':
      await shared.changeItinerary((it) => {
        const ref = findItemRef(it, itemId);
        const items = it.days.find((d) => d.date === ref?.date)?.items ?? [];
        const out = ref?.split ? items.findIndex((x) => x.id === ref.split!.id) + 1 : 0;
        return moveItemTo(it, itemId, ref?.date ?? date, out);
      }, `${label} 移出分組`);
      return;
    case 'withdraw':
      return withdrawItem(itemId, date);
  }
}
