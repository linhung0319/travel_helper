// 編輯的拖曳（設計 §4）：拖的是什麼（DragSource）、放在哪（DropTargetInfo），算出放開時要做什麼。
// 卡片上下各 1/4 高是插入（before／after），中間是合併；不能合併、或還沒在這張卡上停滿 MERGE_DWELL_MS（merging＝false）時中間照上下半插入。
// 合併要停一下（第七輪 §6.4）：只是經過不合併；dwellMerge 判斷停夠了沒（planDrag.ts 每一格畫面都問一次）。
// 交通卡整張都是插入：排在這段交通通往的那張卡片前面（不合併）。
// 純函式，不碰畫面；planDrag.ts 每次移動都呼叫，標記和放開的動作照這個結果。
// dropTarget 把放開的位置換成 moveItemTo／addItem 的參數；samePosition 認出「放回原位」（不用存檔）。
// reorderInfo 給「⋯ → 調整順序」用：上移、下移的位置、可以合併過去的卡。

import type { Itinerary } from '@travel-helper/engine/types';
import { findItemRef, type ItemRef } from './planView.ts';

/** 拖的東西：時間軸的卡片（options：幾個選項）、這天的候選、合併卡片正在看的備卡 */
export type DragSource =
  | { kind: 'item'; itemId: string; placeType: string | null; options: number }
  | { kind: 'candidate'; candidateId: number; placeId: string; placeType: string | null }
  | { kind: 'option'; itemId: string; index: number; placeType: string | null };

/** 放的地方：某張卡片、交通卡（itemId：這段通往的項目，回住宿那段是 null）、這天最後的放置區、候選區 */
export type DropTargetInfo =
  | { kind: 'card'; itemId: string; placeType: string | null; isFlight: boolean }
  | { kind: 'leg'; itemId: string | null }
  | { kind: 'end' }
  | { kind: 'candidates' };

export type DropIntent = 'merge' | 'before' | 'after' | 'none';

/** 在同一張卡上停多久（ms）才算要合併 */
export const MERGE_DWELL_MS = 600;

/** 停在 over.itemId 這張卡上（從 since 開始）到 now 有沒有滿 MERGE_DWELL_MS；over 是 null（不在卡上）＝false */
export function dwellMerge(over: { itemId: string; since: number } | null, now: number): boolean {
  return !!over && now - over.since >= MERGE_DWELL_MS;
}

/** 拖的東西能不能合併到這張卡片：同類型、都不是住宿、不是整張有備卡的卡片、目標不是航班 */
export function canMerge(src: DragSource, target: Extract<DropTargetInfo, { kind: 'card' }>): boolean {
  if (target.isFlight) return false;
  if (src.kind === 'item' && src.options > 1) return false;
  if (!src.placeType || !target.placeType) return false;
  if (src.placeType === 'lodging' || target.placeType === 'lodging') return false;
  return src.placeType === target.placeType;
}

/** 放開時要做什麼；rect、clientY 是目標卡片的位置和游標的高度（只有 card 用得到）；merging：已經停夠久、中間區可以合併 */
export function dropIntent(src: DragSource, target: DropTargetInfo, rect: { top: number; height: number }, clientY: number, merging = true): DropIntent {
  if (target.kind === 'end') return 'after';
  if (target.kind === 'candidates') return src.kind === 'option' ? 'after' : 'none';
  // 拖整張卡片到通往自己的交通卡＝放回原位
  if (target.kind === 'leg') return src.kind === 'item' && src.itemId === target.itemId ? 'none' : 'before';
  if (src.kind !== 'candidate' && src.itemId === target.itemId) return 'none';
  const y = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5;
  if (y < 0.25) return 'before';
  if (y > 0.75) return 'after';
  if (merging && canMerge(src, target)) return 'merge';
  return y < 0.5 ? 'before' : 'after';
}

/** 放在哪裡：某張卡片的前面或後面，或某天的最後 */
export type DropAt = { kind: 'item'; itemId: string; after: boolean } | { kind: 'end'; date: string };

/** 項目所在的那一串：這天的項目，或分組裡那一組的項目 */
function siblings(it: Itinerary, ref: ItemRef): Itinerary['days'][number]['items'] {
  const day = it.days.find((d) => d.date === ref.date)!;
  if (!ref.split) return day.items;
  const split = day.items.find((x) => x.id === ref.split!.id) as Extract<Itinerary['days'][number]['items'][number], { type: 'split' }>;
  return split.groups.find((g) => g.id === ref.split!.group)!.items;
}

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
  const list = siblings(it, ref);
  let index = list.findIndex((x) => x.id === at.itemId) + (at.after ? 1 : 0);
  const src = source ? list.findIndex((x) => x.id === source) : -1;
  if (src >= 0 && src < index) index -= 1;
  return { date: ref.date, index, ...(ref.split ? { split: { id: ref.split.id, group: ref.split.group } } : {}) };
}

/** 項目移到 t 會不會還在原來的位置（同一天、同一組、同一個 index） */
export function samePosition(it: Itinerary, itemId: string, t: { date: string; index: number; split?: { id: string; group: string } }): boolean {
  const ref = findItemRef(it, itemId);
  if (!ref || ref.date !== t.date || ref.split?.id !== t.split?.id || ref.split?.group !== t.split?.group) return false;
  const list = siblings(it, ref);
  return list.findIndex((x) => x.id === itemId) === t.index;
}

/**
 * 「⋯ → 調整順序」（不拖也能換順序、合併）：這張卡在它那一串（這天或那一組）的第幾張、共幾張；
 * up／down 是上移、下移時給 moveItemTo 的 index（第一張、最後一張、旁邊是航班時是 null）；
 * merge 是同一串裡可以合併過去的卡（canMerge：同類型、不是住宿、自己沒有備卡）。typeOf：資料點的類型
 */
export function reorderInfo(it: Itinerary, itemId: string, typeOf: (placeId: string) => string | null | undefined): { index: number; count: number; up: number | null; down: number | null; merge: string[] } | null {
  const ref = findItemRef(it, itemId);
  if (!ref) return null;
  const list = siblings(it, ref);
  const index = list.findIndex((x) => x.id === itemId);
  const prev = list[index - 1];
  const next = list[index + 1];
  const up = prev && prev.type !== 'flight' ? index - 1 : null;
  const down = next && next.type !== 'flight' ? index + 1 : null;
  const item = ref.item;
  const mainType = (x: (typeof list)[number]) => (x.type === 'visit' ? (typeOf(x.options[x.selected]?.place ?? '') ?? null) : null);
  const src: DragSource | null = item.type === 'visit' ? { kind: 'item', itemId, placeType: mainType(item), options: item.options.length } : null;
  const merge = src ? list.filter((x) => x.id !== itemId && x.type === 'visit' && canMerge(src, { kind: 'card', itemId: x.id, placeType: mainType(x), isFlight: false })).map((x) => x.id) : [];
  return { index, count: list.length, up, down, merge };
}
