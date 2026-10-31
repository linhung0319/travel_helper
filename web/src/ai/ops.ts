// AI 提議用的行程操作（規格 §4.4）：模型只給操作清單，不輸出整份行程；採用時才套到最新的行程上，別人先改過也能重新檢查。
// 每一步都用 engine 的操作；有問題丟 ItineraryError。

import {
  ItineraryError,
  addItem,
  addOption,
  findItem,
  moveItemToDay,
  removeItem,
  setLegTravel,
  setLodging,
  setStart,
  setStay,
  setTags,
  type LegTarget,
} from '@travel-helper/engine';
import { TAG_IDS, type Itinerary, type LodgingMeals, type TagId, type TravelSpec } from '@travel-helper/engine/types';

export type Op =
  | { op: 'add'; date: string; place: string; index?: number; start?: string; stayMinutes?: number; tags?: TagId[]; note?: string }
  | { op: 'remove'; itemId: string }
  | { op: 'move'; itemId: string; date: string; index?: number }
  | { op: 'replace'; itemId: string; place: string }
  | { op: 'addOption'; itemId: string; place: string }
  | { op: 'setStay'; itemId: string; minutes: number | null }
  | { op: 'setStart'; itemId: string; start: string | null }
  | { op: 'setTags'; itemId: string; tags: TagId[] }
  | { op: 'setTravel'; to: LegTarget; spec: TravelSpec | null }
  | { op: 'setLodging'; date: string; lodging: string | null; meals?: LodgingMeals | null };

/** 操作要查的東西 */
export interface OpsContext {
  /** 地點的類型；沒有這個點是 undefined */
  placeType(id: string): string | undefined;
  /** 誰提的：按 ❤️ 的人（同手動排進行程） */
  likesOf(id: string): string[];
  me: string | null;
}

function checkPlace(id: unknown, ctx: OpsContext, allow: 'visit' | 'lodging'): string {
  if (typeof id !== 'string') throw new ItineraryError('地點要是資料點 ID');
  const type = ctx.placeType(id);
  if (!type) throw new ItineraryError(`沒有資料點 ${id}`);
  if (type === 'station') throw new ItineraryError('車站不能排進行程，只會出現在地圖和交通卡');
  if (allow === 'visit' && type === 'lodging') throw new ItineraryError(`${id} 是住宿，要用 setLodging`);
  if (allow === 'lodging' && type !== 'lodging') throw new ItineraryError(`${id} 不是住宿`);
  return id;
}

function checkTags(tags: unknown): TagId[] {
  if (!Array.isArray(tags) || tags.some((t) => !(TAG_IDS as readonly string[]).includes(t as string))) throw new ItineraryError(`tags 要是 ${TAG_IDS.join('、')}`);
  return tags as TagId[];
}

function applyOp(it: Itinerary, o: Op, ctx: OpsContext): Itinerary {
  switch (o.op) {
    case 'add': {
      const place = checkPlace(o.place, ctx, 'visit');
      const likes = ctx.likesOf(place);
      const { itinerary } = addItem(
        it,
        o.date,
        {
          type: 'visit',
          options: [{ place, stayMinutes: o.stayMinutes ?? null }],
          ...(o.start ? { start: o.start } : {}),
          ...(o.tags ? { tags: checkTags(o.tags) } : {}),
          ...(o.note ? { note: o.note } : {}),
          addedBy: ctx.me,
          ...(likes.length ? { proposedBy: likes } : {}),
        },
        o.index == null ? {} : { index: o.index },
      );
      return itinerary;
    }
    case 'remove':
      return removeItem(it, o.itemId);
    case 'move':
      return moveItemToDay(it, o.itemId, o.date, o.index);
    case 'replace': {
      // 換掉這張卡目前選的那個點：時間、標籤、備選都留著
      const place = checkPlace(o.place, ctx, 'visit');
      const next = structuredClone(it);
      const loc = findItem(next, o.itemId);
      if (!loc) throw new ItineraryError(`沒有項目 ${o.itemId}`);
      if (loc.item.type !== 'visit') throw new ItineraryError('只有地點的卡片能換');
      loc.item.options[loc.item.selected] = { place, stayMinutes: null };
      return next;
    }
    case 'addOption':
      return addOption(it, o.itemId, { place: checkPlace(o.place, ctx, 'visit'), stayMinutes: null });
    case 'setStay':
      return setStay(it, o.itemId, o.minutes);
    case 'setStart':
      return setStart(it, o.itemId, o.start);
    case 'setTags':
      return setTags(it, o.itemId, checkTags(o.tags));
    case 'setTravel':
      return setLegTravel(it, o.to, o.spec);
    case 'setLodging':
      return setLodging(it, o.date, o.lodging === null ? null : checkPlace(o.lodging, ctx, 'lodging'), o.meals ?? null);
    default:
      throw new ItineraryError(`不認得的操作 ${(o as { op?: unknown }).op}`);
  }
}

/** 依序套用；有一步不行就丟 ItineraryError，行程不變 */
export function applyOps(it: Itinerary, ops: Op[], ctx: OpsContext): Itinerary {
  if (!Array.isArray(ops) || !ops.length) throw new ItineraryError('ops 要是非空的陣列');
  return ops.reduce((x, o) => applyOp(x, o, ctx), it);
}

/** 這些操作排進去的點：採用時那天的候選要拿掉 */
export function placedByOps(ops: Op[]): { place: string; date: string }[] {
  return ops.flatMap((o) => (o.op === 'add' ? [{ place: o.place, date: o.date }] : []));
}
