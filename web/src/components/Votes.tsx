// ❤️／👎（interaction-design §9）：每人對每個點一票；地圖、探索清單顯示 ❤️ 數。詳情的 ❤️／👎 移上去看是誰投的。
// 投票是「喜不喜歡這個點」，和建議（「這天想做什麼」）分開。

import { shared } from '../appShared.ts';
import { memberName } from '../sharedStore.ts';
import { useShared } from '../hooks.ts';
import type { VoteValue } from '../backend/types.ts';

function useVotes(placeId: string) {
  const votes = useShared((s) => s.votes);
  const me = useShared((s) => s.me?.id);
  const list = votes.filter((v) => v.placeId === placeId);
  return {
    list,
    mine: list.find((v) => v.memberId === me) ?? null,
    like: list.filter((v) => v.value === 'like').length,
    dislike: list.filter((v) => v.value === 'dislike').length,
  };
}

/** 詳情面板標題旁：❤️ 數、👎 數；點一下投、再點一下收回。滑鼠移上去看是誰投的 */
export function VoteButtons({ placeId }: { placeId: string }) {
  const { list, mine, like, dislike } = useVotes(placeId);
  const members = useShared((s) => s.members);
  const me = useShared((s) => s.me?.id);
  const who = (value: VoteValue) =>
    list
      .filter((v) => v.value === value)
      .map((v) => (v.memberId === me ? '我' : memberName(members, v.memberId)))
      .join('、');
  const toggle = (value: VoteValue) => void shared.vote(placeId, mine?.value === value ? null : value, mine?.value === value ? null : (mine?.note ?? null));
  return (
    <>
      <button
        type="button"
        className={`action vote ${mine?.value === 'like' ? 'on' : ''}`}
        aria-pressed={mine?.value === 'like'}
        title={who('like') ? `❤️ ${who('like')}` : '想去'}
        onClick={() => toggle('like')}
        data-testid="vote-like"
      >
        ❤️ {like || ''}
      </button>
      <button
        type="button"
        className={`action vote ${mine?.value === 'dislike' ? 'on' : ''}`}
        aria-pressed={mine?.value === 'dislike'}
        title={who('dislike') ? `👎 ${who('dislike')}` : '不想去'}
        onClick={() => toggle('dislike')}
        data-testid="vote-dislike"
      >
        👎 {dislike || ''}
      </button>
    </>
  );
}

/** 圖片牆照片上的 ❤️：點了投或收回（不開詳情） */
export function WallVote({ placeId }: { placeId: string }) {
  const { mine, like } = useVotes(placeId);
  const on = mine?.value === 'like';
  return (
    <span
      role="button"
      tabIndex={0}
      className={`wall-vote ${on ? 'on' : ''}`}
      aria-label={on ? '收回 ❤️' : '按 ❤️'}
      aria-pressed={on}
      data-testid="wall-vote"
      onClick={(e) => {
        e.stopPropagation();
        void shared.vote(placeId, on ? null : 'like');
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        e.stopPropagation();
        void shared.vote(placeId, on ? null : 'like');
      }}
    >
      {on ? '❤️' : '♡'}
      {like > 0 && <span className="wall-vote-count">{like}</span>}
    </span>
  );
}
