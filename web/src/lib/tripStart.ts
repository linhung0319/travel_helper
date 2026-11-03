// 新手起步的純邏輯（interaction-design §17）：引導彈窗的進度（T46）、重新打開網站要不要開新對話。

import type { Itinerary } from '@travel-helper/engine/types';
import { fullDaysOf, nightsOf, type StarterInput } from '../ai/prompts.ts';

// ---------- 引導彈窗（§17.1，T46） ----------

/** 四步完成了沒：看行程本身的狀態，不看是不是第一次進來，家人什麼時候進來都看到同一份進度 */
export interface GuideProgress {
  /** ① 任何一位家人按過 ♡（不是只算自己） */
  liked: boolean;
  /** ② 2/2～2/12 每晚都決定了住哪一區（選了住宿的晚上，區照住宿） */
  areas: boolean;
  /** ③ 2/2～2/12 每晚都有住宿 */
  lodging: boolean;
  /** ④ 2/3～2/12 每天都排了景點或餐廳（航班那兩天除外） */
  stops: boolean;
  done: number;
}

export const GUIDE_STEPS = 4;

/** 「問 AI」問哪一步：③ 選住宿、④ 一天一天排 */
export type GuideAsk = 'lodging' | 'day';

export function guideProgress(i: StarterInput): GuideProgress {
  const nights = nightsOf(i);
  const liked = i.anyLiked;
  const areas = nights.every((d) => !!d.area || d.lodging);
  const lodging = nights.every((d) => d.lodging);
  const stops = fullDaysOf(i).every((d) => d.hasStops);
  return { liked, areas, lodging, stops, done: [liked, areas, lodging, stops].filter(Boolean).length };
}

/** 現在該做的那一步（第一個還沒完成的，按鈕用實心）；全部完成是 null */
export function guideCurrent(p: GuideProgress): 1 | 2 | 3 | 4 | null {
  if (!p.liked) return 1;
  if (!p.areas) return 2;
  if (!p.lodging) return 3;
  if (!p.stops) return 4;
  return null;
}

export const flightCount = (it: Itinerary | null, date: string) => it?.days.find((d) => d.date === date)?.items.filter((x) => x.type === 'flight').length ?? 0;

// ---------- 重新打開網站（§17.3） ----------

const REOPEN_NEW_MS = 30 * 60_000;

/** 重新載入時要不要開新對話：這段有訊息，而且最後一則超過 30 分鐘 */
export function shouldStartFresh(messages: { createdAt: string }[], nowIso: string): boolean {
  const last = messages.at(-1);
  if (!last) return false;
  const age = Date.parse(nowIso) - Date.parse(last.createdAt);
  return age > REOPEN_NEW_MS;
}
