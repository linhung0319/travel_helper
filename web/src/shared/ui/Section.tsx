// 書架區段（T76，interaction-design §35.4、35.8）：探索的「一定要去」「全員吃飯」、想去的「還沒排」都是這一個。
// 標題列一行（§36.T81）：標題＋說明小字、右邊數字膠囊（類型色：收著淡底＋類型色字、展開實心＋白字、0 淡灰；想去是愛心紅）、最右 ⌄（展開時轉成朝上）；
// 點了展開／收合，可以同時展開多個。左邊的類型色條 T81 拿掉了（類型色只留在數字膠囊）。
// 展開的區段標題黏在捲動區的頂端（position: sticky，只在自己的區段範圍裡）：往下捲還看得到「一定要去 5」、能原地收合；整條白底、下緣細線，黏住時下方很淡的陰影（.sec-shade，瀏覽器支援 scroll-state 查詢時才畫）。
// 頂端的篩選列也黏著，所以 top 是 --sec-top（FilterBar 量好寫在捲動容器上，手機 .m-page、網頁右欄 .side-body；沒寫是 0）。
// 區段裡的列分批畫（SectionRows：useBatch 的觀察點放在區段裡，一批 60 個）；0 個時區段照樣在，展開是虛線框和下一步（NextSteps，由呼叫的畫面放進 children）。
// 樣式在 ui.css（.sec-）。

import type { ReactNode } from 'react';
import type { DependencyList } from 'react';
import { Icon } from '../../components/Icon.tsx';
import type { Place } from '../../data/types.ts';
import type { SectionHead, Theme } from '../../lib/shelves.ts';
import { useBatch } from '../useBatch.ts';

/** 數字膠囊的顏色：探索照主題，想去是愛心紅 */
export type SectionKind = Theme | 'wish';

/** 區段裡一批畫幾個（同探索原本的分批） */
export const SECTION_BATCH = 60;

export function Section({ head, kind, count, open, onToggle, children, testId = 'section' }: { head: SectionHead; kind: SectionKind; count: number; open: boolean; onToggle: () => void; children?: ReactNode; testId?: string }) {
  return (
    <section className={`sec${open ? ' open' : ''}`} data-kind={kind} data-section={head.id} data-open={open || undefined} data-testid={testId}>
      <button type="button" className="sec-h" aria-expanded={open} onClick={onToggle} data-testid="section-head">
        <span className="sec-tt">
          <span className="sec-t">{head.title}</span>
          <span className="sec-r">{head.rule}</span>
        </span>
        <span className={`sec-n${count === 0 ? ' zero' : ''}`} data-testid="section-count">
          {count}
        </span>
        <span className="sec-tg" aria-hidden>
          <Icon name="chevron" size={20} />
        </span>
        <span className="sec-shade" aria-hidden />
      </button>
      {open && <div className="sec-body">{children}</div>}
    </section>
  );
}

/**
 * 區段裡的列，分批畫：底部的觀察點快進畫面時多畫一批。scroller 是捲動容器的選擇器（手機 '.m-page'、網頁 '.side-body'）；
 * resetOn 變了（篩選、子地區）從第一批重來。minShown：至少畫到第幾個（地圖點到的點要捲到它）
 */
export function SectionRows({ items, render, scroller, resetOn, minShown = 0, testId = 'section-rows' }: { items: Place[]; render: (place: Place, index: number) => ReactNode; scroller: string; resetOn: DependencyList; minShown?: number; testId?: string }) {
  const { shown, moreRef, hasMore } = useBatch({ total: items.length, batch: SECTION_BATCH, resetOn, scroller });
  const n = Math.max(shown, minShown);
  return (
    <>
      <ol className="sec-rows" data-testid={testId} data-count={items.length}>
        {items.slice(0, n).map((p, i) => (
          <li key={p.id}>{render(p, i)}</li>
        ))}
      </ol>
      {hasMore && n < items.length && <div ref={moreRef} className="sec-next" aria-hidden />}
    </>
  );
}
