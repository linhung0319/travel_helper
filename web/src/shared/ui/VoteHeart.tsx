// 想去的愛心：只有自己按了才是 --love 實心（別人按的不給顏色，T76 §35.7：誰按的寫在列的「誰想去」那行）；
// 點一下切換自己的（castVote，再點收回，按了、收回都有提示和「復原」）。數字拿掉了（T76），列、詳情頂端列只用這一個；樣式在 ui.css。

import { useShared } from '../../hooks.ts';
import { Icon } from '../../components/Icon.tsx';
import { castVote } from '../../components/Votes.tsx';

/** 愛心；點了不會冒泡（列本身可以點）。showCount 留著給舊的呼叫（T79 刪），一律不畫數字 */
export function VoteHeart({ placeId, size = 'md' }: { placeId: string; size?: 'sm' | 'md'; showCount?: boolean }) {
  const votes = useShared((s) => s.votes);
  const me = useShared((s) => s.me?.id);
  const mine = votes.find((v) => v.placeId === placeId && !v.deletedAt && v.memberId === me)?.value ?? null;
  const on = mine === 'like';
  const toggle = (from: Element) => void castVote(placeId, on ? null : 'like', true, from);
  return (
    <span
      role="button"
      tabIndex={0}
      className={`ui-heart ui-heart-${size} ${on ? 'on' : ''}`}
      aria-label={on ? '收回想去' : '按想去'}
      aria-pressed={on}
      title={on ? '你想去（再按一次收回）' : '按想去'}
      data-testid="card-like"
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
      <Icon name="heart" size={size === 'sm' ? 16 : 20} filled={on} />
    </span>
  );
}
