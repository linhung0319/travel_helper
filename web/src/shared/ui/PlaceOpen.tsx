// 探索、想去的卡點了原地展開的內容（第八輪 §13.3 第 1 點、第 7 點，第九輪 §14.3，網頁）：介紹、「詳細資料 ›」「加到某天」。
// 列在原地往下長（T76 起沒有照片牆）。按「詳細資料」才開詳情；點展開區塊的空白處不收起（同行程卡）。
// 展開後清單捲到那張卡（useRevealOpen）：卡的頂端停在看得到的範圍最上面（黏住的篩選列、想去的段落標題下面），本來就整張看得到就不捲。
import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import type { Place } from '../../data/types.ts';
import { AddToDay } from '../../components/DayPicker.tsx';
import { Button } from './Button.tsx';
import { firstSentences } from './TripCard.tsx';
import { useFullPlace } from '../../hooks.ts';
import { IntroPending } from './Skeleton.tsx';

export function PlaceOpenBody({ place, onDetail, onAsk }: { place: Place; onDetail: () => void; onAsk?: () => void }) {
  const full = useFullPlace(place);
  const intro = firstSentences(full.place.summary?.text);
  return (
    <div className="po-body" data-testid="place-open" onClick={(e) => e.stopPropagation()}>
      {!full.loaded && !full.error && <IntroPending />}
      {intro && <p className="po-intro">{intro}</p>}
      <div className="po-actions">
        <Button kind="primary" size="sm" onClick={onDetail} data-testid="place-open-detail">
          詳細資料 ›
        </Button>
        <AddToDay placeId={place.id} kind="secondary" testId="place-open-add" />
        {onAsk && (
          <Button kind="secondary" size="sm" icon="spark" title="問 AI" onClick={onAsk} data-testid="place-open-ask">
            問 AI
          </Button>
        )}
      </div>
    </div>
  );
}

/** 卡和看得到的範圍上緣之間留的空 */
const GAP = 8;

/** 往上找捲動的容器（右欄的 .side-body） */
export function scrollerOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY;
    if (y === 'auto' || y === 'scroll') return p;
  }
  return null;
}

/** 蓋在捲動範圍上緣的高度：黏住的篩選列（想去的段落標題 T53 拿掉了） */
function stickyInset(scroller: HTMLElement): number {
  const bar = scroller.querySelector<HTMLElement>('.fb-desktop');
  return bar?.offsetHeight ?? 0;
}

/** 展開了 openId 那張：捲到卡的頂端停在看得到的範圍最上面；整張本來就看得到就不捲。
 *  回傳的函式在展開、收合之前呼叫：記下被點的卡在畫面上的位置，畫面排好後（上面的卡收起來）先把它放回原位再決定要不要捲，卡才不會跳走又捲回來 */
export function useRevealOpen(listRef: RefObject<HTMLElement | null>, openId: string | null) {
  const held = useRef<{ id: string; top: number } | null>(null);
  const cardOf = (list: HTMLElement, id: string) => list.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
  const hold = useCallback(
    (id: string) => {
      const list = listRef.current;
      const el = list && cardOf(list, id);
      held.current = el ? { id, top: el.getBoundingClientRect().top } : null;
    },
    [listRef],
  );
  useLayoutEffect(() => {
    const list = listRef.current;
    const was = held.current;
    held.current = null;
    if (was && list) {
      const el = cardOf(list, was.id);
      const scroller = el && scrollerOf(el);
      if (el && scroller) scroller.scrollTop += el.getBoundingClientRect().top - was.top;
    }
    if (!openId || !list) return;
    const el = cardOf(list, openId);
    const scroller = el && scrollerOf(el);
    if (!el || !scroller) return;
    const box = scroller.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    // 清單的列：展開的內容可能畫在列的外面（同一個 li 裡）
    const body = list.querySelector<HTMLElement>('[data-testid="place-open"]')?.getBoundingClientRect();
    const bottom = Math.max(r.bottom, body?.bottom ?? 0);
    const sub = el.closest('.wl-group')?.querySelector<HTMLElement>('.wl-sub')?.getBoundingClientRect();
    const anchor = sub && r.top - sub.bottom < 16 ? sub.top : r.top;
    const top = box.top + stickyInset(scroller) + GAP;
    if (anchor >= top && bottom <= box.bottom) return;
    scroller.scrollBy({ top: anchor - top, behavior: 'smooth' });
  }, [listRef, openId]);
  return hold;
}
