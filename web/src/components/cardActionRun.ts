// 「⋯」動作選單每個動作要做的事（設計 §2.3）。沒有版面：網頁版的 ActionMenu、手機版的動作面板都呼叫 runCardAction。
// 要開子畫面的動作（標籤、移到第幾天、這晚的方案、改停留時間）交給呼叫的人（ui）；其他直接改行程或候選。
// 撤下是 planDrag.ts 的 withdrawItem；排進這天用 addToDay.ts 的 addPlaceToDay；刪別人加的候選開 RejectDialog（要寫理由）。

import { detachOption, moveItemTo, removeItem, selectOption, setLodging, setStart } from '@travel-helper/engine';
import type { Itinerary } from '@travel-helper/engine/types';
import { shared } from '../appShared.ts';
import { dataStore } from '../dataStore.ts';
import { openDialog } from '../uiStore.ts';
import { findItemRef } from '../lib/planView.ts';
import { shortDayLabel } from '../lib/trip.ts';
import { cardActions, type ActionId, type CardActionContext } from '../shared/cardActions.ts';
import { addPlaceToDay } from './addToDay.ts';
import { withdrawItem } from './planDrag.ts';

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

/** 選單要畫的動作：cardActions，分組的「分組動作」展開成移到第幾天、刪除（現在分組的動作） */
export function menuGroups(ctx: CardActionContext): ActionId[][] {
  return ctx.kind === 'split' ? [['move'], ['delete']] : cardActions(ctx);
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

/** 執行「⋯」選單的一個動作 */
export async function runCardAction(id: ActionId, target: ActionTarget, ui: ActionUi): Promise<void> {
  const { date, itemId } = target;
  switch (id) {
    case 'tags':
      return ui.openTags();
    case 'move':
      return ui.openMove();
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
    case 'split-actions':
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
