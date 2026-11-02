// 新手起步的純邏輯（interaction-design §17）：開始卡的進度和要不要顯示、整趟清單把連續還沒排的天併成一列、重新打開網站要不要開新對話。

import type { Itinerary } from '@travel-helper/engine/types';
import { fullDaysOf, nightsOf, type StarterInput } from '../ai/prompts.ts';

// ---------- 開始卡（§17.1） ----------

/** 三步完成了沒：看行程本身的狀態，不看是不是第一次進來，家人什麼時候進來都看到同一份進度 */
export interface StartProgress {
  liked: boolean;
  lodging: boolean;
  stops: boolean;
  done: number;
}

export function startProgress(i: StarterInput): StartProgress {
  const liked = i.anyLiked;
  const lodging = nightsOf(i).every((d) => d.lodging);
  const stops = fullDaysOf(i).every((d) => d.hasStops);
  return { liked, lodging, stops, done: [liked, lodging, stops].filter(Boolean).length };
}

/** 這台裝置記的：什麼時候第一次看到全部完成、按過 ✕ 沒 */
export interface StartCardMemory {
  doneAt: string | null;
  dismissed: boolean;
}

export const EMPTY_START_MEMORY: StartCardMemory = { doneAt: null, dismissed: false };

const DONE_KEEP_MS = 3 * 24 * 3600_000;

/** steps＝三步都列；last＝前兩步做完了，只留第 ③ 步；done＝一行「每天都排了東西」；hidden＝不出現 */
export type StartCardView = 'steps' | 'last' | 'done' | 'hidden';

export function startCardView(p: StartProgress, memory: StartCardMemory, nowMs: number): StartCardView {
  if (p.done < 3) return p.liked && p.lodging ? 'last' : 'steps';
  if (memory.dismissed) return 'hidden';
  if (memory.doneAt && nowMs - Date.parse(memory.doneAt) >= DONE_KEEP_MS) return 'hidden';
  return 'done';
}

/** 進度變了之後要記什麼：第一次完成記時間；又有東西沒排（有人刪了）就忘掉，之後完成再算一次 */
export function nextStartMemory(p: StartProgress, memory: StartCardMemory, nowIso: string): StartCardMemory {
  if (p.done < 3) return memory.doneAt || memory.dismissed ? EMPTY_START_MEMORY : memory;
  return memory.doneAt ? memory : { ...memory, doneAt: nowIso };
}

// ---------- 整趟清單（§17.1） ----------

export type OverviewRow = { kind: 'day'; date: string } | { kind: 'empty'; from: string; to: string; count: number };

export interface OverviewDayState {
  /** 有景點、餐廳、自由活動（航班、住宿不算） */
  stops: boolean;
  lodging: boolean;
  flights: number;
  candidates: number;
  warnings: number;
  /** 有 AI 提議的改動 */
  proposed: boolean;
}

/** 這天完全沒東西：沒有點、住宿、航班、候選、提醒、提議。有其中一樣就是「排了東西」，自己一列才看得到 */
const isBlank = (s: OverviewDayState) => !s.stops && !s.lodging && s.flights === 0 && s.candidates === 0 && s.warnings === 0 && !s.proposed;

/** 連續還沒排的天併成一列（2 天以上才併，1 天的照樣是一天） */
export function overviewRows(dates: string[], stateOf: (date: string) => OverviewDayState): OverviewRow[] {
  const rows: OverviewRow[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length === 1) rows.push({ kind: 'day', date: run[0] });
    else if (run.length > 1) rows.push({ kind: 'empty', from: run[0], to: run[run.length - 1], count: run.length });
    run = [];
  };
  for (const date of dates) {
    if (isBlank(stateOf(date))) {
      run.push(date);
      continue;
    }
    flush();
    rows.push({ kind: 'day', date });
  }
  flush();
  return rows;
}

/** 這天有幾筆航班 */
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
