// 探索、想去的條件列、0 個時的下一步、問 AI 的那句（T64 起，interaction-design §30、§35.5）。純函式，沒有畫面；手機、網頁共用。
// - 條件列：每個條件一顆（自己在面板加的、搜尋、只看地圖畫面裡的），都可以拿掉；地區、子地區在外面的地區列，不在這裡（FilterBar 的 FilterConds 再拿掉類型）。
// - 0 個：區段 0 個用 sectionEmptyHelp（檔案最後）；搜尋、AI 結果集篩到 0 個用 emptyHelp：一句加上 2～3 個下一步（放大範圍、放寬條件、問 AI）。
// - 問 AI：把現在的地區、子地區、條件寫成一句（「在志摩・賢島找可容納 15 人的餐廳」）。

import { displayName } from '../data/normalize.ts';
import type { Area, Place } from '../data/types.ts';
import { appliedChips } from '../shared/filterOptions.ts';
import { explorePlaces } from './explore.ts';
import { EMPTY_FILTER, TYPE_LABELS, type Filter, type FilterKey } from './filter.ts';
import { THEME_LABELS, sectionPlaces, themeOf, type Section } from './shelves.ts';

/** 條件列的一顆。key 是 Filter 的欄位，另外兩種：query（搜尋）、inView（只看地圖畫面裡的，只有網頁） */
export interface CondChip {
  key: FilterKey | 'query' | 'inView';
  value: string;
  label: string;
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

/** 條件列（T64）：面板裡的條件照面板的順序，最後是搜尋、只看地圖畫面裡的（只有網頁） */
export function conditionChips(filter: Filter, query: string, areas: Area[], opts: { inView?: boolean } = {}): CondChip[] {
  const q = query.trim();
  return [
    ...appliedChips(filter, areas),
    ...(q ? [{ key: 'query' as const, value: q, label: `搜尋「${q}」` }] : []),
    ...(opts.inView ? [{ key: 'inView' as const, value: 'inView', label: '只看地圖畫面裡的' }] : []),
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
 * 搜尋、AI 結果集篩到 0 個的時候寫什麼、給哪幾個下一步（T64）：
 * 1. 放大範圍：選了子地區時看整區（同樣的條件），數字是 0 不放。
 * 2. 放寬條件：拿掉搜尋，或從最後加的條件往前找第一個拿掉後有東西的。數字是 0 不放。
 * 3. 問 AI：listDraft 那句。
 */
export function emptyHelp(places: Place[], filter: Filter, query: string, areas: Area[]): EmptyHelp {
  const q = query.trim();
  const where = placeShort(filter, areas);
  const area = filter.areas.length === 1 ? areas.find((a) => a.id === filter.areas[0]) : undefined;
  const steps: NextStep[] = [];

  if (filter.regions.length && area) {
    const wide = { ...filter, regions: [] };
    const count = countOf(places, wide, q);
    if (count > 0) steps.push({ kind: 'widen', label: `看${displayName(area.name, area.id)}全區`, count, filter: wide, query: q });
  }

  const chips = conditionChips(filter, q, areas);
  for (const chip of [...chips].reverse()) {
    const next = withoutChip(filter, q, chip);
    const count = countOf(places, next.filter, next.query);
    if (count === 0) continue;
    steps.push({ kind: 'relax', label: chip.key === 'query' ? '清掉搜尋' : `拿掉「${chip.label}」`, count, filter: next.filter, query: next.query });
    break;
  }

  const draft = listDraft(filter, q, areas);
  if (draft) steps.push({ kind: 'ask', label: `問 AI：${draft}`, draft });

  const message = q && conditionChips(filter, '', areas).length === 0 ? `${where ?? ''}找不到「${q}」` : `${where ?? ''}沒有符合這些條件的地點`;
  return { message, steps };
}

// ---- T75：區段 0 個（interaction-design §35.4） ----

/**
 * 區段（或整個主題）0 個時寫什麼、給哪幾個下一步（T75，取代舊書架的兩級退）：
 * - 那句：區段是「賢島沒有『一定要去』的景點」；整個主題是「賢島沒有住宿」，有篩選時「賢島沒有符合條件的住宿」。
 * - 下一步：① 選了子地區時看整區（同樣的區段、篩選，數字是 0 不放）；② 有篩選時清除篩選（數字是 0 不放）；③ 問 AI（區段的那句，整個主題用 listDraft）。
 * filter 是目前的（含主題、篩選）；section 不給＝整個主題。清除篩選留地區、子地區、主題。
 */
export function sectionEmptyHelp(places: Place[], filter: Filter, areas: Area[], section?: Section, query = ''): EmptyHelp {
  const theme = section?.theme ?? themeOf(filter);
  const noun = theme ? THEME_LABELS[theme].noun : '地點';
  const where = placeShort(filter, areas) ?? '這裡';
  const q = query.trim();
  const count = (f: Filter) => (section ? sectionPlaces(places, section, f, { query: q }).length : countOf(places, f, q));
  const area = filter.areas.length === 1 ? areas.find((a) => a.id === filter.areas[0]) : undefined;
  const cleared: Filter = { ...EMPTY_FILTER, areas: filter.areas, regions: filter.regions, types: filter.types };
  const hasCond = !!q || appliedChips(filter, areas).some((c) => c.key !== 'types');
  const steps: NextStep[] = [];

  if (filter.regions.length && area) {
    const wide = { ...filter, regions: [] };
    const n = count(wide);
    if (n > 0) steps.push({ kind: 'widen', label: `看${displayName(area.name, area.id)}全區`, count: n, filter: wide, query: q });
  }
  if (hasCond) {
    const n = count(cleared);
    if (n > 0) steps.push({ kind: 'relax', label: '清除篩選', count: n, filter: cleared, query: '' });
  }
  const draft = section ? section.ask(where) : listDraft(filter, q, areas);
  if (draft) steps.push({ kind: 'ask', label: `問 AI：${draft}`, draft });

  const message = section ? `${where}沒有「${section.title}」的${noun}` : hasCond ? `${where}沒有符合條件的${noun}` : `${where}沒有${noun}`;
  return { message, steps };
}
