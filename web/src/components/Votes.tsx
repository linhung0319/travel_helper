// 想去／不想去（interaction-design §9）：愛心就是「想去」——按了這個點就進「想去」分頁；不想去另外一個按鈕。每人對每個點一個狀態。
// 想排在哪天用想去卡片上的「加到某天」（沒有「希望哪天」）。卡片、清單上的愛心是 shared/ui/VoteHeart.tsx；這裡只有詳情的按鈕。

import { shared } from '../appShared.ts';
import { memberName } from '../sharedStore.ts';
import { useShared } from '../hooks.ts';
import { Icon } from './Icon.tsx';
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

/** 投票（卡片的愛心 VoteHeart 也走這裡）；value 是 null 時收回 */
export async function castVote(placeId: string, value: VoteValue | null) {
  await shared.vote(placeId, value);
}

/** 詳情面板標題旁：想去數、不想去數；點一下投、再點一下收回。滑鼠移上去看是誰投的 */
export function VoteButtons({ placeId }: { placeId: string }) {
  const { list, mine, like, dislike } = useVotes(placeId);
  const members = useShared((s) => s.members);
  const me = useShared((s) => s.me?.id);
  const who = (value: VoteValue) =>
    list
      .filter((v) => v.value === value)
      .map((v) => (v.memberId === me ? '我' : memberName(members, v.memberId)))
      .join('、');
  const toggle = (value: VoteValue) => void castVote(placeId, mine?.value === value ? null : value);
  return (
    <>
      <button
        type="button"
        className={`action vote ${mine?.value === 'like' ? 'on' : ''}`}
        aria-pressed={mine?.value === 'like'}
        title={who('like') ? `想去：${who('like')}` : '想去'}
        onClick={() => toggle('like')}
        data-testid="vote-like"
      >
        <Icon name="heart" size={20} filled={mine?.value === 'like'} /> {like || ''}
      </button>
      <button
        type="button"
        className={`action vote ${mine?.value === 'dislike' ? 'on' : ''}`}
        aria-pressed={mine?.value === 'dislike'}
        title={who('dislike') ? `不想去：${who('dislike')}` : '不想去'}
        onClick={() => toggle('dislike')}
        data-testid="vote-dislike"
      >
        <Icon name="thumb-down" size={20} filled={mine?.value === 'dislike'} /> {dislike || ''}
      </button>
    </>
  );
}
