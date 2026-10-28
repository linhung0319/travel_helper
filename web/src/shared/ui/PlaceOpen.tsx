// 探索、想去的卡點了原地展開的內容（第八輪 §13.3 第 1 點、第 7 點，第九輪 §14.3，網頁）：介紹、「詳細資料 ›」「加到某天」。
// 照片牆的卡展開時橫跨兩欄（PlaceWall 的 openId），清單的列在原地往下長。按「詳細資料」才開詳情；點展開區塊的空白處不收起（同行程卡）。
// 展開後清單捲到那張卡（useRevealOpen）：卡的頂端停在看得到的範圍最上面（黏住的篩選列、想去的段落標題下面），本來就整張看得到就不捲。
import { useLayoutEffect, type RefObject } from 'react';
import type { Place } from '../../data/types.ts';
import { AddToDay } from '../../components/DayPicker.tsx';
import { Button } from './Button.tsx';
import { firstSentences } from './TripCard.tsx';

export function PlaceOpenBody({ place, onDetail }: { place: Place; onDetail: () => void }) {
  const intro = firstSentences(place.summary?.text);
  return (
    <div className="po-body" data-testid="place-open" onClick={(e) => e.stopPropagation()}>
      {intro && <p className="po-intro">{intro}</p>}
      <div className="po-actions">
        <Button kind="primary" size="sm" onClick={onDetail} data-testid="place-open-detail">
          詳細資料 ›
        </Button>
        <AddToDay placeId={place.id} kind="secondary" testId="place-open-add" />
      </div>
    </div>
  );
}

/** 卡和看得到的範圍上緣之間留的空 */
const GAP = 8;

/** 往上找捲動的容器（右欄的 .side-body） */
function scrollerOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY;
    if (y === 'auto' || y === 'scroll') return p;
  }
  return null;
}

/** 蓋在捲動範圍上緣的高度：黏住的篩選列，加上這張卡所在那段的段落標題（想去） */
function stickyInset(scroller: HTMLElement, el: HTMLElement): number {
  const bar = scroller.querySelector<HTMLElement>('.fb-desktop');
  const head = el.closest('.wl-section')?.querySelector<HTMLElement>('.wl-head');
  return (bar?.offsetHeight ?? 0) + (head?.offsetHeight ?? 0);
}

/** 展開了 openId 那張：捲到卡的頂端停在看得到的範圍最上面；整張本來就看得到就不捲。
 *  卡緊接在想去的日期小標（2/5（五）· 2）下面時，對齊小標，不讓它被切一半 */
export function useRevealOpen(listRef: RefObject<HTMLElement | null>, openId: string | null) {
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!openId || !list) return;
    const el = list.querySelector<HTMLElement>(`[data-id="${CSS.escape(openId)}"]`);
    const scroller = el && scrollerOf(el);
    if (!el || !scroller) return;
    const box = scroller.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    // 清單的列：展開的內容可能畫在列的外面（同一個 li 裡）
    const body = list.querySelector<HTMLElement>('[data-testid="place-open"]')?.getBoundingClientRect();
    const bottom = Math.max(r.bottom, body?.bottom ?? 0);
    const sub = el.closest('.wl-group')?.querySelector<HTMLElement>('.wl-sub')?.getBoundingClientRect();
    const anchor = sub && r.top - sub.bottom < 16 ? sub.top : r.top;
    const top = box.top + stickyInset(scroller, el) + GAP;
    if (anchor >= top && bottom <= box.bottom) return;
    scroller.scrollBy({ top: anchor - top, behavior: 'smooth' });
  }, [listRef, openId]);
}
