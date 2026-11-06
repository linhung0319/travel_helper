// 想去的愛心：只有自己按了才是 --love 實心（別人按的不給顏色，T76 §35.7：誰按的寫在「誰想去」那行）；
// 點一下切換自己的（castVote，再點收回，按了、收回都有提示和「復原」）。
// T82（§36.T82，Instagram 式）：沒有框，沒按是墨色空心、按了實心紅；按下去縮到 0.75 再彈到 1.25 回 1（約 0.45 秒，prefers-reduced-motion 不彈）。
// 尺寸：row 列的最底一行（點擊 36、圖示 25）；bar 詳情照片下面那排（點擊 44、圖示 28）；md 手機詳情頂端列。樣式在 ui.css（.ui-heart）。

import { useState } from 'react';
import { useShared } from '../../hooks.ts';
import { Icon } from '../../components/Icon.tsx';
import { castVote } from '../../components/Votes.tsx';

/** 自己對這個點按了想去沒有 */
export function useLiked(placeId: string): boolean {
  const votes = useShared((s) => s.votes);
  const me = useShared((s) => s.me?.id);
  return votes.find((v) => v.placeId === placeId && !v.deletedAt && v.memberId === me)?.value === 'like';
}

/** 愛心彈一下：回傳 [現在第幾次彈（0 是還沒彈過）, 彈一下] ；每次換 key 讓動畫重來 */
export function usePop(): [number, () => void] {
  const [n, setN] = useState(0);
  return [n, () => setN((x) => x + 1)];
}

/** 愛心；點了不會冒泡（列本身可以點）。testId 預設 card-like（詳情那排是 detail-like） */
export function VoteHeart({ placeId, size = 'md', testId = 'card-like', pop: outerPop }: { placeId: string; size?: 'md' | 'row' | 'bar'; testId?: string; pop?: number }) {
  const on = useLiked(placeId);
  const [pop, bump] = usePop();
  const toggle = (from: Element) => {
    if (!on) bump();
    void castVote(placeId, on ? null : 'like', true, from);
  };
  const n = pop + (outerPop ?? 0);
  return (
    <span
      role="button"
      tabIndex={0}
      className={`ui-heart ui-heart-${size} ${on ? 'on' : ''}`}
      aria-label={on ? '收回想去' : '按想去'}
      aria-pressed={on}
      title={on ? '你想去（再按一次收回）' : '按想去'}
      data-testid={testId}
      onClick={(e) => {
        e.stopPropagation();
        toggle(e.currentTarget);
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        e.stopPropagation();
        toggle(e.currentTarget);
      }}
    >
      <span key={n} className={`ui-heart-ic${n ? ' pop' : ''}`}>
        <Icon name="heart" size={size === 'md' ? 20 : 24} filled={on} />
      </span>
    </span>
  );
}
