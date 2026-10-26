// 卡片「🏷 標籤」的分組與規則（設計 §2.1）。網頁版彈窗、手機版面板共用。
// 標籤 id 來自引擎的 TAG_IDS；這裡只決定怎麼分組、哪組互斥、哪種卡片有哪些組。

import type { LodgingMeals, TagId } from '@travel-helper/engine';
import type { IconName } from '../lib/icons.ts';

/** visit 的地點類型。住宿、航班、自由時間不用這個檔 */
export type TagCardKind = 'spot' | 'restaurant' | 'station' | 'custom';

export interface TagGroup {
  id: 'meal' | 'who' | 'plan';
  title: string;
  icon: IconName;
  tags: TagId[];
  /** 同組只能選一個 */
  exclusive: boolean;
  bg: string;
  fg: string;
}

export const TAG_GROUPS: TagGroup[] = [
  { id: 'meal', title: '用餐', icon: 'fork', tags: ['breakfast', 'lunch', 'dinner', 'snack'], exclusive: false, bg: '#fff1e0', fg: '#a14a00' },
  { id: 'who', title: '誰去', icon: 'users', tags: ['all', 'groups'], exclusive: true, bg: '#e3efff', fg: '#174ea6' },
  { id: 'plan', title: '安排', icon: 'pin', tags: ['must', 'skippable', 'rainplan', 'rest'], exclusive: false, bg: '#eceff1', fg: '#37474f' },
];

export const TAG_LABELS: Record<TagId, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '點心',
  all: '全員',
  groups: '分組',
  must: '必去',
  skippable: '可跳過',
  rainplan: '雨天備案',
  rest: '休息',
};

/** 這種卡片有哪幾組標籤：景、餐三組都有；車站、自訂只有用餐和安排 */
export function tagGroupsFor(kind: TagCardKind): TagGroup[] {
  return kind === 'spot' || kind === 'restaurant' ? TAG_GROUPS : TAG_GROUPS.filter((g) => g.id !== 'who');
}

/** 點一個標籤：已有就拿掉；沒有就加上，互斥的組會拿掉同組其他標籤 */
export function toggleTag(tags: readonly TagId[], id: TagId): TagId[] {
  if (tags.includes(id)) return tags.filter((t) => t !== id);
  const group = TAG_GROUPS.find((g) => g.tags.includes(id));
  const kept = group?.exclusive ? tags.filter((t) => !group.tags.includes(t)) : [...tags];
  return [...kept, id];
}

export const LODGING_PLANS: { value: LodgingMeals; label: '一泊二食' | '只含早餐' | '素泊' }[] = [
  { value: 'dinner+breakfast', label: '一泊二食' },
  { value: 'breakfast', label: '只含早餐' },
  { value: 'none', label: '素泊' },
];

/** 「這晚的方案」：點同一個再點一下，回到沒選（null） */
export function toggleLodgingPlan(cur: LodgingMeals | null, v: LodgingMeals): LodgingMeals | null {
  return cur === v ? null : v;
}
