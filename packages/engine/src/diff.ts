// 「改了什麼」：比較兩份行程，給 UI 顯示提議的摘要（interaction-design §0：「第 3 天：＋鳥羽水族館 10:00～12:00，－XX」），
// 以及套用前後的檢查結果差異（T16 的 propose_itinerary_change 用）。

import type { ConfigOverride, EngineConfig } from './config.ts';
import type { EngineData } from './data.ts';
import { findItem } from './ops.ts';
import { planItinerary } from './timeline.ts';
import type { DateString, EngineWarning, GroupItem, Itinerary, ItineraryItem, ItineraryPlan, TimelineEntry } from './types.ts';

export type ChangeKind = 'added' | 'removed' | 'moved-day' | 'reordered' | 'changed' | 'lodging';

export interface Change {
  kind: ChangeKind;
  date: DateString;
  itemId?: string;
  /** moved-day：原本在哪天 */
  fromDate?: DateString;
  /** changed：改了哪些欄位（selected、stayMinutes、start、travel、options、meal、note…） */
  fields?: string[];
  /** 項目目前（或刪掉之前）的地點 */
  place?: string | null;
  /** lodging：前後的住宿 */
  before?: string | null;
  after?: string | null;
}

function placeOf(item: ItineraryItem | GroupItem | undefined): string | null {
  if (!item) return null;
  if (item.type === 'visit') return item.options[item.selected]?.place ?? null;
  if (item.type === 'free') return item.place ?? null;
  if (item.type === 'flight') return item.airport;
  if (item.type === 'split') return item.meet.place;
  return null;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function changedFields(a: ItineraryItem | GroupItem, b: ItineraryItem | GroupItem): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: string[] = [];
  for (const k of keys) {
    if (k === 'id') continue;
    const va = (a as unknown as Record<string, unknown>)[k];
    const vb = (b as unknown as Record<string, unknown>)[k];
    if (same(va, vb)) continue;
    if (k === 'options' && a.type === 'visit' && b.type === 'visit') {
      // 只改了目前選項的停留時間時，寫 stayMinutes
      const oa = a.options.map(({ stayMinutes, ...r }) => r);
      const ob = b.options.map(({ stayMinutes, ...r }) => r);
      if (same(oa, ob)) {
        out.push('stayMinutes');
        continue;
      }
    }
    out.push(k);
  }
  return out;
}

/** 列出 before → after 的改動，依日期排序 */
export function diffItinerary(before: Itinerary, after: Itinerary): Change[] {
  const changes: Change[] = [];
  const posOf = (it: Itinerary, id: string) => {
    const loc = findItem(it, id);
    return loc && { date: it.days[loc.dayIndex].date, loc };
  };
  const ids = (it: Itinerary) => it.days.flatMap((d) => d.items.flatMap((i) => [i.id, ...(i.type === 'split' ? i.groups.flatMap((g) => g.items.map((x) => x.id)) : [])]));
  const bIds = ids(before);
  const aIds = ids(after);
  for (const id of bIds) {
    const b = posOf(before, id);
    const a = posOf(after, id);
    if (!b) continue;
    if (!a) {
      if (b.loc.splitId && !posOf(after, b.loc.splitId)) continue; // 整個分組刪掉時，只記分組
      changes.push({ kind: 'removed', date: b.date, itemId: id, place: placeOf(b.loc.item) });
      continue;
    }
    if (a.date !== b.date) changes.push({ kind: 'moved-day', date: a.date, fromDate: b.date, itemId: id, place: placeOf(a.loc.item) });
    const f = changedFields(b.loc.item, a.loc.item).filter((k) => !(a.loc.item.type === 'split' && k === 'groups'));
    if (f.length) changes.push({ kind: 'changed', date: a.date, itemId: id, fields: f, place: placeOf(a.loc.item) });
  }
  for (const id of aIds) {
    if (bIds.includes(id)) continue;
    const a = posOf(after, id);
    if (!a) continue;
    if (a.loc.splitId && !bIds.includes(a.loc.splitId)) continue;
    changes.push({ kind: 'added', date: a.date, itemId: id, place: placeOf(a.loc.item) });
  }
  // 同一天、同一組裡，共同項目的相對順序變了
  for (const day of after.days) {
    const bd = before.days.find((d) => d.date === day.date);
    if (!bd) continue;
    const lists = (d: Itinerary['days'][number]) => [
      d.items.map((i) => i.id),
      ...d.items.flatMap((i) => (i.type === 'split' ? i.groups.map((g) => g.items.map((x) => x.id)) : [])),
    ];
    const bl = lists(bd);
    for (const al of lists(day)) {
      const ref = bl.find((l) => l.some((x) => al.includes(x)));
      if (!ref) continue;
      const common = al.filter((x) => ref.includes(x));
      const refOrder = ref.filter((x) => common.includes(x));
      common.forEach((id, k) => {
        if (id !== refOrder[k] && !changes.some((c) => c.itemId === id && c.kind === 'reordered')) {
          changes.push({ kind: 'reordered', date: day.date, itemId: id, place: placeOf(findItem(after, id)?.item) });
        }
      });
    }
    if (bd.lodging !== day.lodging || (bd.lodgingMeals ?? null) !== (day.lodgingMeals ?? null)) {
      changes.push({ kind: 'lodging', date: day.date, before: bd.lodging, after: day.lodging });
    }
  }
  return changes.sort((x, y) => x.date.localeCompare(y.date));
}

/** 一行一個改動的文字摘要；nameOf 給地點的顯示名稱，plan 給套用後的時間 */
export function describeChanges(changes: Change[], opts: { nameOf?: (id: string) => string; plan?: ItineraryPlan } = {}): string[] {
  const name = (id: string | null | undefined) => (id ? opts.nameOf?.(id) ?? id : '（無）');
  const md = (d: DateString) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  const entryOf = (date: DateString, itemId?: string): TimelineEntry | undefined => {
    const day = opts.plan?.days.find((d) => d.date === date);
    return day?.entries.flatMap((e) => [e, ...(e.groups?.flatMap((g) => g.entries) ?? [])]).find((e) => e.itemId === itemId && e.kind !== 'meet');
  };
  const time = (c: Change) => {
    const e = entryOf(c.date, c.itemId);
    return e ? ` ${e.start}～${e.end}` : '';
  };
  return changes.map((c) => {
    const d = md(c.date);
    switch (c.kind) {
      case 'added':
        return `${d}：＋${name(c.place)}${time(c)}`;
      case 'removed':
        return `${d}：－${name(c.place)}`;
      case 'moved-day':
        return `${d}：${name(c.place)}（從 ${md(c.fromDate as string)} 移過來）${time(c)}`;
      case 'reordered':
        return `${d}：${name(c.place)} 換了順序${time(c)}`;
      case 'changed':
        return `${d}：${name(c.place)} 改了 ${(c.fields ?? []).join('、')}${time(c)}`;
      case 'lodging':
        return `${d}：住宿 ${name(c.before)} → ${name(c.after)}`;
    }
  });
}

export interface ProposalCheck {
  changes: Change[];
  summary: string[];
  before: ItineraryPlan;
  after: ItineraryPlan;
  /** 套用後新出現的警告（同一天、同一個 code、同一個項目算同一個） */
  newWarnings: EngineWarning[];
  /** 套用後消失的警告 */
  resolvedWarnings: EngineWarning[];
}

/** 套用前後都跑一次引擎，比較改了什麼、多了哪些警告（T16 的提議、T15 的確認畫面用） */
export function checkProposal(
  before: Itinerary,
  after: Itinerary,
  data: EngineData,
  config: ConfigOverride | EngineConfig = {},
  nameOf?: (id: string) => string,
): ProposalCheck {
  const pb = planItinerary(before, data, config);
  const pa = planItinerary(after, data, config);
  const all = (p: ItineraryPlan) => [...p.warnings, ...p.days.flatMap((d) => d.warnings)];
  const key = (w: EngineWarning) => `${w.date ?? ''}|${w.code}|${w.itemId ?? ''}|${w.groupId ?? ''}|${w.placeId ?? ''}`;
  const kb = new Set(all(pb).map(key));
  const ka = new Set(all(pa).map(key));
  const changes = diffItinerary(before, after);
  return {
    changes,
    summary: describeChanges(changes, { nameOf, plan: pa }),
    before: pb,
    after: pa,
    newWarnings: all(pa).filter((w) => !kb.has(key(w))),
    resolvedWarnings: all(pb).filter((w) => !ka.has(key(w))),
  };
}
