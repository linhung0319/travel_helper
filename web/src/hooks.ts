import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { appStore, type AppStore } from './store.ts';
import { dataStore, ensureDetails, fullPlace, type DataState } from './dataStore.ts';
import type { Place } from './data/types.ts';
import { sharedStore } from './appShared.ts';
import type { SharedState } from './sharedStore.ts';
import { planStore, requestPlan, type PlanState } from './planStore.ts';
import { uiStore, type UiState } from './uiStore.ts';

export function useApp<T>(selector: (s: AppStore) => T): T {
  return useStore(appStore, selector);
}

export function useData<T>(selector: (s: DataState) => T): T {
  return useStore(dataStore, selector);
}

export function useShared<T>(selector: (s: SharedState) => T): T {
  return useStore(sharedStore, selector);
}

export function useUi<T>(selector: (s: UiState) => T): T {
  return useStore(uiStore, selector);
}

export function usePlan<T>(selector: (s: PlanState) => T): T {
  return useStore(planStore, selector);
}

/**
 * 畫面要用詳情層的欄位時（介紹、團體、價格、來源…）：回傳完整的資料點，順便讀這個點的詳情層（T47 起用到才讀）。
 * loaded 是 false 時 place 只有清單層，畫面放骨架（shared/ui/Skeleton.tsx 的 DetailPending）。自己加的點沒有詳情層。
 */
export function useFullPlace<T extends Place | null | undefined>(place: T): { place: T; loaded: boolean; error: string | null; retry(): void } {
  const id = place?.id ?? null;
  const has = useData((s) => (id ? !!s.details?.has(id) : false));
  const error = useData((s) => s.detailsError);
  const full = useData((s) => (id ? fullPlace(s, id) : null));
  const needed = !!place && place.origin !== 'user';
  useEffect(() => {
    if (needed && id && !has) void ensureDetails([id]).catch(() => {});
  }, [needed, id, has]);
  return {
    place: (full ?? place) as T,
    loaded: !needed || has,
    error: has ? null : error,
    retry: () => void (id && ensureDetails([id]).catch(() => {})),
  };
}

/** 行程的畫面（網頁版的行程欄、手機的行程分頁）：打開就讀時刻表（T47：行程是空的時候不先讀） */
export function useNeedPlan() {
  useEffect(() => requestPlan(), []);
}

/** 網頁版的寬度（interaction-design §1「平板」）：1100px 以上三欄。iPad 直拿（最寬 1024）是手機版、橫拿（最窄 1133）是網頁版 */
export const DESKTOP_QUERY = '(min-width: 1100px)';

export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatch(mq.matches);
    mq.addEventListener('change', onChange);
    onChange();
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return match;
}

export const useIsDesktop = () => useMediaQuery(DESKTOP_QUERY);
/** 滑鼠：移上去出現小卡片；觸控：點一下出現小卡片、再點一下開詳情 */
export const useCanHover = () => useMediaQuery('(hover: hover) and (pointer: fine)');
