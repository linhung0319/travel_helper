// 想去的愛心：自己按了是 --love 實心，數字是所有人按的總數；點一下切換自己的（castVote，再點收回）。
// 卡片、清單、照片牆、詳情頂端列只用這一個；樣式在 ui.css。

import { useShared } from '../../hooks.ts';
import { Icon } from '../../components/Icon.tsx';
import { castVote } from '../../components/Votes.tsx';

/** 愛心＋❤ 總數；showCount 預設 true，數字 0 不寫。點了不會冒泡（卡片本身可以點） */
export function VoteHeart({ placeId, size = 'md', showCount = true }: { placeId: string; size?: 'sm' | 'md'; showCount?: boolean }) {
  const votes = useShared((s) => s.votes);
  const me = useShared((s) => s.me?.id);
  const list = votes.filter((v) => v.placeId === placeId && !v.deletedAt);
  const mine = list.find((v) => v.memberId === me)?.value ?? null;
  const total = list.filter((v) => v.value === 'like').length;
  const on = mine === 'like';
  const toggle = () => void castVote(placeId, on ? null : 'like');
  return (
    <span
      role="button"
      tabIndex={0}
      className={`ui-heart ui-heart-${size} ${on ? 'on' : ''}`}
      aria-label={on ? '收回想去' : '按想去'}
      aria-pressed={on}
      data-testid="card-like"
      onClick={(e) => {
        e.stopPropagation();
        toggle();
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        e.stopPropagation();
        toggle();
      }}
    >
      <Icon name="heart" size={size === 'sm' ? 16 : 20} filled={on} />
      {showCount && total > 0 && <span className="ui-heart-count">{total}</span>}
    </span>
  );
}
