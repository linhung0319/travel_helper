// 時間軸是不是畫提議的差異：差異畫面唯讀（interaction-design §16.1），卡片讀提議後的行程，編輯的東西都不畫。
// 手機版和一般的時間軸沒有這個 context，照原本的 planning。

import { createContext, useContext } from 'react';
import type { Itinerary } from '@travel-helper/engine/types';
import { useApp } from '../hooks.ts';
import type { DayDiff } from '../lib/proposalDiff.ts';

export interface TimelineDiff extends DayDiff {
  /** 提議後的行程 */
  itinerary: Itinerary;
}

export const TimelineDiffContext = createContext<TimelineDiff | null>(null);

export const useTimelineDiff = () => useContext(TimelineDiffContext);

/** 這張時間軸能不能編輯 */
export function useEditing(): boolean {
  const planning = useApp((s) => s.planning);
  return planning && !useTimelineDiff();
}
