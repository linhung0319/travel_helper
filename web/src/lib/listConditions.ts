// 探索的「現在看」那一列、0 個時的下一步、問 AI 的那句（T64，interaction-design §30）。純函式，沒有畫面；手機、網頁共用。
// - 條件列：每個條件一顆（藍底的是書架帶來的，白底的是自己在面板加的、搜尋、只看地圖畫面裡的），都可以拿掉；地區、子地區在外面的地區列，不在這裡。
// - 0 個：一句「賢島沒有 S、A 級的景點」，加上 2～3 個下一步：放大範圍（子地區 → 整區）、放寬條件、問 AI（問題寫好，放進輸入框）。
// - 問 AI：把現在的地區、子地區、條件寫成一句（「在志摩・賢島找可容納 15 人的餐廳」）。

import { displayName } from '../data/normalize.ts';
import type { Area, Place } from '../data/types.ts';
import { appliedChips } from '../shared/filterOptions.ts';
import { explorePlaces } from './explore.ts';
import { TYPE_LABELS, placeFit15, placeStayKind, type Filter, type FilterKey } from './filter.ts';
import { dist, shelfFilter, shelfKeys, shelfOf, shelfTierOf, type Shelf } from './shelves.ts';

/** 條件列的一顆。key 是 Filter 的欄位，另外兩種：query（搜尋）、inView（只看地圖畫面裡的，只有網頁） */
export interface CondChip {
  key: FilterKey | 'query' | 'inView';
  value: string;
  label: string;
  /** 書架帶來的（藍底） */
  preset: boolean;
  /** 右邊的分布小字（T67，只有誰吃、住法兩題）：「能坐一起 6 · 要分桌 2」 */
  note?: string;
}

/** 分布小字的兩題 */
const NOTE_KEYS = ['who', 'stay'] as const;

/**
 * 誰吃、住法兩題的分布（T67，interaction-design §32「現在看」）：現在符合的點裡，
 * 餐廳照 15 人分（能坐一起、要分桌、還沒查、坐不下），住宿照住法分（包棟、包棟要分住、旅館飯店、民宿）；0 的那段不寫，全是 0 是空字串
 */
export function distNote(key: (typeof NOTE_KEYS)[number], items: Place[]): string {
  if (key === 'who') {
    const rs = items.filter((p) => p.type === 'restaurant');
    const fit = (v: string | null) => rs.filter((p) => (placeFit15(p) ?? 'unknown') === v).length;
    return dist([
      ['能坐一起', fit('yes')],
      ['要分桌', fit('split')],
      ['還沒查', fit('unknown')],
      ['坐不下', fit('no')],
    ]);
  }
  const kind = (v: string) => items.filter((p) => placeStayKind(p) === v).length;
  return dist([
    ['包棟', kind('whole')],
    ['包棟要分住', kind('multi')],
    ['旅館飯店', kind('hotel')],
    ['民宿', kind('other')],
  ]);
}

/** 現在看的地方：「志摩・賢島」、「志摩」；沒選地區（或 AI 給了好幾區）是 null */
export function placeLabel(filter: Pick<Filter, 'areas' | 'regions'>, areas: Area[]): string | null {
  if (filter.areas.length !== 1) return null;
  const area = areas.find((a) => a.id === filter.areas[0]);
  if (!area) return null;
  const name = displayName(area.name, area.id);
  const region = filter.regions.length === 1 ? area.regions?.find((r) => r.id === filter.regions[0]) : undefined;
  return region ? `${name}・${displayName(region.name, region.id)}` : name;
}

/** 最小的那一層的名字（「賢島」；沒選子地區是「志摩」）：0 個那句、問 AI 用 */
function placeShort(filter: Pick<Filter, 'areas' | 'regions'>, areas: Area[]): string | null {
  const label = placeLabel(filter, areas);
  return label ? label.split('・').at(-1)! : null;
}

/**
 * 條件列（T64）：書架帶來的在前面（藍底），自己加的在後面；最後是搜尋、只看地圖畫面裡的。
 * shelves：探索才有書架（想去沒有，條件都是白底）
 */
export function conditionChips(filter: Filter, query: string, areas: Area[], opts: { inView?: boolean; shelves?: boolean; places?: Place[] } = {}): CondChip[] {
  const hit = opts.shelves === false ? null : shelfTierOf(filter);
  const presetKeys = hit ? shelfKeys(hit.shelf, hit.tier) : [];
  const chips: CondChip[] = appliedChips(filter, areas).map((c) => ({ ...c, preset: presetKeys.includes(c.key) }));
  // 分布小字（T67）：給了 places（探索的條件列）才算，放在那一題的最後一顆
  if (opts.places) {
    const items = NOTE_KEYS.some((k) => filter[k].length) ? explorePlaces(opts.places, filter, null, 'recommend', () => 0, query) : [];
    for (const k of NOTE_KEYS) {
      const last = chips.filter((c) => c.key === k).at(-1);
      const note = last && distNote(k, items);
      if (last && note) last.note = note;
    }
  }
  const q = query.trim();
  return [
    ...chips.filter((c) => c.preset),
    ...chips.filter((c) => !c.preset),
    ...(q ? [{ key: 'query' as const, value: q, label: `搜尋「${q}」`, preset: false }] : []),
    ...(opts.inView ? [{ key: 'inView' as const, value: 'inView', label: '只看地圖畫面裡的', preset: false }] : []),
  ];
}

/** 拿掉一顆條件之後的 Filter、搜尋（只看地圖畫面裡的另外處理） */
export function withoutChip(filter: Filter, query: string, chip: Pick<CondChip, 'key' | 'value'>): { filter: Filter; query: string } {
  if (chip.key === 'query') return { filter, query: '' };
  if (chip.key === 'inView') return { filter, query };
  return { filter: { ...filter, [chip.key]: (filter[chip.key] as string[]).filter((v) => v !== chip.value) }, query };
}

/** 問 AI 那句的名詞：只選一類時是那一類，其他是「地點」 */
function nounOf(filter: Filter): string {
  return filter.types.length === 1 ? TYPE_LABELS[filter.types[0]] : '地點';
}

/** 晶片的字當形容詞不順的（「找全員 15 人的餐廳」）改寫 */
const ADJECTIVE_LABELS: Partial<Record<FilterKey, Record<string, string>>> = { who: { all: '全員 15 人能一起吃' } };

/** 條件寫成形容詞：「S、A 級」「可容納 15 人」「適合長輩」，類型另外當名詞 */
function adjectives(filter: Filter, areas: Area[]): string {
  const chips = appliedChips(filter, areas).filter((c) => c.key !== 'types');
  const tiers = chips.filter((c) => c.key === 'tiers').map((c) => c.value);
  const rest = chips.filter((c) => c.key !== 'tiers').map((c) => ADJECTIVE_LABELS[c.key]?.[c.value] ?? c.label);
  return [...(tiers.length ? [`${tiers.join('、')} 級`] : []), ...rest].join('、');
}

/**
 * 「問 AI」那顆鈕放進輸入框的那句（T64）：「在志摩・賢島找可容納 15 人的餐廳」。
 * 沒選地區寫「幫我找…」；只選了地區、沒有條件寫「志摩・賢島有什麼值得去的地方？」；什麼都沒有（概覽）是 null（不預填）。
 */
export function listDraft(filter: Filter, query: string, areas: Area[]): string | null {
  const where = placeLabel(filter, areas);
  const adj = adjectives(filter, areas);
  const q = query.trim();
  const hasCond = adj || filter.types.length > 0;
  if (!hasCond && !q) return where ? `${where}有什麼值得去的地方？` : null;
  // 英數字開頭的形容詞前面空一格（「找 S、A 級的景點」）
  const what = `${adj ? `${/^[A-Za-z0-9]/.test(adj) ? ' ' : ''}${adj}的` : ''}${nounOf(filter)}`;
  const named = q ? `，名稱有「${q}」` : '';
  return where ? `在${where}找${what}${named}` : `幫我找${what}${named}`;
}

/** 0 個時的一個下一步：換成這組條件和搜尋（apply），或問 AI（draft，放進輸入框） */
export type NextStep =
  | { kind: 'widen' | 'relax'; label: string; count: number; filter: Filter; query: string }
  | { kind: 'ask'; label: string; draft: string };

export interface EmptyHelp {
  /** 「賢島沒有 S、A 級的景點」 */
  message: string;
  steps: NextStep[];
}

const countOf = (places: Place[], filter: Filter, query: string) => explorePlaces(places, filter, null, 'recommend', () => 0, query).length;

/**
 * 0 個的時候寫什麼、給哪幾個下一步（T64）：書架的一排（AreaHome）和照片牆、清單（篩到 0 個）都用這個。
 * 1. 放大範圍：選了子地區時看整區（同樣的條件），數字是 0 不放。
 * 2. 放寬條件：還是一整排書架（沒有自己加的條件）時不放（書架自己會退到第二級，兩級都 0 才到這裡，T66）；其他時候拿掉搜尋，或從最後加的條件往前找第一個拿掉後有東西的。數字是 0 不放。
 * 3. 問 AI：書架的那句（「賢島有什麼值得去的景點？」），其他用 listDraft。
 */
export function emptyHelp(places: Place[], filter: Filter, query: string, areas: Area[]): EmptyHelp {
  const q = query.trim();
  const where = placeShort(filter, areas);
  const area = filter.areas.length === 1 ? areas.find((a) => a.id === filter.areas[0]) : undefined;
  const areaName = area ? displayName(area.name, area.id) : null;
  const shelf = shelfOf(filter);
  // 一整排書架、沒有自己加的條件和搜尋
  const pureShelf: Shelf | null = shelf && !q && conditionChips(filter, '', areas).every((c) => c.preset) ? shelf : null;
  const steps: NextStep[] = [];

  if (filter.regions.length && areaName) {
    const wide = { ...filter, regions: [] };
    const count = countOf(places, wide, q);
    if (count > 0) steps.push({ kind: 'widen', label: pureShelf ? `看${areaName}全區的${pureShelf.title}` : `看${areaName}全區`, count, filter: wide, query: q });
  }

  // 放寬條件照第一題定（T67）：全員 15 人 →「看賢島坐不下、還沒查的」；一間住得下全團 →「看賢島要分開住的」
  const swap = pureShelf ? null : firstQuestionSwap(filter, where ?? '這裡');
  const swapCount = swap ? countOf(places, swap.filter, q) : 0;
  if (swap && swapCount > 0) steps.push({ kind: 'relax', label: swap.label, count: swapCount, filter: swap.filter, query: q });
  else if (!pureShelf) {
    const chips = conditionChips(filter, q, areas, { shelves: false }).filter((c) => c.key !== 'inView');
    for (const chip of [...chips].reverse()) {
      const next = withoutChip(filter, q, chip);
      const count = countOf(places, next.filter, next.query);
      if (count === 0) continue;
      steps.push({ kind: 'relax', label: chip.key === 'query' ? '清掉搜尋' : `拿掉「${chip.label}」`, count, filter: next.filter, query: next.query });
      break;
    }
  }

  const draft = pureShelf && where ? pureShelf.ask(where) : listDraft(filter, q, areas);
  if (draft) steps.push({ kind: 'ask', label: `問 AI：${draft}`, draft });

  const message = pureShelf
    ? `${where ?? '這裡'}沒有${/^[A-Za-z0-9]/.test(pureShelf.empty) ? ' ' : ''}${pureShelf.empty}`
    : q && conditionChips(filter, '', areas).length === 0
      ? `${where ?? ''}找不到「${q}」`
      : `${where ?? ''}沒有符合這些條件的地點`;
  return { message, steps };
}

/** 第一題（誰吃、住法）放寬成「容納不下、要分開」的那一邊；不是第一級的條件就 null */
function firstQuestionSwap(filter: Filter, where: string): { filter: Filter; label: string } | null {
  if (filter.who.includes('all') && !filter.who.includes('apart')) return { filter: { ...filter, who: ['apart'] }, label: `看${where}坐不下、還沒查的` };
  if (filter.stay.length && !filter.stay.includes('apart') && filter.stay.every((v) => v === 'whole' || v === 'hotel' || v === 'fits')) return { filter: { ...filter, stay: ['apart'] }, label: `看${where}要分開住的` };
  return null;
}

/** 書架的一排兩級都是 0 個時（AreaHome）：同 emptyHelp，條件是那排第一級套在目前地區、子地區上 */
export function shelfEmptyHelp(places: Place[], shelf: Shelf, base: Pick<Filter, 'areas' | 'regions'>, areas: Area[]): EmptyHelp {
  return emptyHelp(places, shelfFilter(shelf, base), '', areas);
}
