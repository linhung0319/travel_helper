// 探索、想去的清單計算（第六輪 §4）：從 Explore.tsx、Wishlist.tsx 抽出來的 hook，沒有版面。
// 網頁版右欄（ExplorePanel）、手機版（ExploreFeed、WishlistPage）、底部分頁的數字、「我」的留言數都用這裡。
// 排序、篩選、每一類的數量是 lib/explore.ts 的純函式；這裡只負責從 store 拿資料、記住結果。

import { useMemo } from 'react';
import { useData, useShared } from '../hooks.ts';
import { likedPlaces } from '../lib/wishlist.ts';
import { voteCounts } from '../sharedStore.ts';
import { explorePlaces, typeCounts, type ExploreSort, type ExploreType } from '../lib/explore.ts';
import type { Filter } from '../lib/filter.ts';
import type { Bbox, Place } from '../data/types.ts';

/** 有人 ❤️ 的點（想去分頁的內容）；地圖、分頁的數字也用這個 */
export function useLiked() {
  const votes = useShared((s) => s.votes);
  return useMemo(() => likedPlaces(votes), [votes]);
}

/** 這個 target（地點、某一天 dayTarget、整趟 TRIP_TARGET）還在的留言，舊的在前 */
export function useComments(target: string) {
  const comments = useShared((s) => s.comments);
  return useMemo(() => comments.filter((c) => c.target === target && !c.deletedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [comments, target]);
}

/** 這個 target（地點、某一天 dayTarget、整趟 TRIP_TARGET）的留言數 */
export function useCommentCount(target: string): number {
  return useComments(target).length;
}

/** 每個點的 ❤️ 數（排序「❤️ 多」用） */
export function useLikeCount(): (id: string) => number {
  const votes = useShared((s) => s.votes);
  return useMemo(() => {
    const c = voteCounts(votes);
    return (id: string) => c.get(id)?.like ?? 0;
  }, [votes]);
}

export interface PlaceList {
  /** 篩選前的所有點（探索：全部；想去：有人 ❤️ 的） */
  pool: Place[];
  /** 符合篩選、搜尋的點，排好了 */
  list: Place[];
  /** 每一類各有幾個（其他條件照 filter，不看類型） */
  counts: Record<ExploreType, number>;
}

/**
 * 探索（source="explore"）或想去（"wish"）的清單。bounds 給 null 就不看地圖範圍（手機版一律 null）。
 * 兩種來源走同一串 hook，網頁版同一個元件換 source 也不會亂掉 hook 的順序。
 */
export function usePlaceList(source: 'explore' | 'wish', filter: Filter, query: string, sort: ExploreSort, bounds: Bbox | null = null): PlaceList {
  const allPlaces = useData((s) => s.places);
  const liked = useLiked();
  const likes = useLikeCount();
  const pool = useMemo(() => (source === 'wish' ? allPlaces.filter((p) => liked.has(p.id)) : allPlaces), [source, allPlaces, liked]);
  const list = useMemo(() => explorePlaces(pool, filter, bounds, sort, likes, query), [pool, filter, bounds, sort, likes, query]);
  const counts = useMemo(() => typeCounts(pool, filter, bounds, query), [pool, filter, bounds, query]);
  return { pool, list, counts };
}

/** 探索的清單：全部的點（車站不列） */
export const useExploreList = (filter: Filter, query: string, sort: ExploreSort, bounds: Bbox | null = null) => usePlaceList('explore', filter, query, sort, bounds);

/** 想去的清單：有人 ❤️ 的點 */
export const useWishList = (filter: Filter, query: string, sort: ExploreSort, bounds: Bbox | null = null) => usePlaceList('wish', filter, query, sort, bounds);
