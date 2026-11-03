// 長清單分批畫（T32，手機探索原本就這樣做，網頁探索也用）：底部的標記快要進畫面時多畫一批。
// DOM 少，開分頁、選點、打字才不會卡；畫出來的卡片也才會去載照片。

import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

/** 底部標記離畫面還有多遠就先畫下一批 */
const ROOT_MARGIN = '800px 0px';

export interface BatchOptions {
  /** 清單總數 */
  total: number;
  /** 一批幾個 */
  batch: number;
  /** 這些值變了（篩選、搜尋、排序）從第一批重新開始 */
  resetOn: DependencyList;
  /** 捲動的容器（標記往上找） */
  scroller: string;
  /** 換分頁再回來要接著上次的數量時，把數量記在這裡（手機版的分頁會卸載） */
  memory?: { current: number };
}

export function useBatch({ total, batch, resetOn, scroller, memory }: BatchOptions) {
  const [shown, setShown] = useState(memory?.current ?? batch);
  // 底部標記用 callback ref 記成 state：標記晚一點才出現（探索從概覽換成清單，T42）時也會重新觀察
  const [mark, moreRef] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (memory) memory.current = shown;
  }, [shown, memory]);

  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setShown(batch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, resetOn);

  useEffect(() => {
    const root = mark?.closest(scroller);
    if (!mark || !root) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setShown((n) => n + batch);
      },
      { root, rootMargin: ROOT_MARGIN },
    );
    io.observe(mark);
    return () => io.disconnect();
  }, [mark, shown, total, batch, scroller]);

  /** 至少畫到第 index 個（地圖、AI 要捲到某張卡，它可能還沒畫） */
  const reveal = useCallback((index: number) => setShown((n) => Math.max(n, index + 1)), []);

  return { shown, moreRef, reveal, hasMore: shown < total };
}
