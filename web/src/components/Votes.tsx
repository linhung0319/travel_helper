// ❤️／👎（interaction-design §9）：❤️ 就是「想去」——按了這個點就進「想去」分頁；👎 是不想去。每人對每個點一個狀態。
// 想排在哪天用想去卡片上的「加到某天」（沒有「希望哪天」）。詳情的 ❤️／👎 移上去看是誰按的。

import { useEffect, useRef, useState } from 'react';
import { shared } from '../appShared.ts';
import { memberName } from '../sharedStore.ts';
import { useShared } from '../hooks.ts';
import { NameList } from './common.tsx';
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

/** 投票（想去卡片的 ❤️ 也走這裡）；value 是 null 時收回 */
export async function castVote(placeId: string, value: VoteValue | null) {
  await shared.vote(placeId, value);
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
  const toggle = (value: VoteValue) => void castVote(placeId, mine?.value === value ? null : value);
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

/** 卡片上的小按鈕（卡片本身是按鈕，所以用 span）：點了不開詳情 */
function MiniButton({ className, label, pressed, testId, onPress, children }: { className: string; label: string; pressed?: boolean; testId: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <span
      role="button"
      tabIndex={0}
      className={className}
      aria-label={label}
      aria-pressed={pressed}
      data-testid={testId}
      onClick={(e) => {
        e.stopPropagation();
        onPress();
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        e.stopPropagation();
        onPress();
      }}
    >
      {children}
    </span>
  );
}

/**
 * 探索、想去的卡片上的 ❤️／👎（interaction-design §12）：`❤️ 3　👎 1`，只有一種就只顯示那種，都沒有時是空心的 ♡；
 * 兩個都可以點（按的是自己的票，再點收回）；數字旁的 ▾ 跳出名單。照片上放右上角，只有文字的卡片放在名稱後面（inline）。
 */
export function CardVotes({ placeId, inline = false }: { placeId: string; inline?: boolean }) {
  const { list, mine, like, dislike } = useVotes(placeId);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const toggle = (value: VoteValue) => void castVote(placeId, mine?.value === value ? null : value);
  const likeOn = mine?.value === 'like';
  const dislikeOn = mine?.value === 'dislike';
  return (
    <span className={`card-votes ${inline ? 'inline' : ''}`} ref={ref} data-testid="card-votes">
      {(like > 0 || dislike === 0) && (
        <MiniButton className={`card-vote ${likeOn ? 'on' : ''}`} label={likeOn ? '收回 ❤️' : '按 ❤️'} pressed={likeOn} testId="card-like" onPress={() => toggle('like')}>
          {likeOn || like > 0 ? '❤️' : '♡'}
          {like > 0 && <span className="card-vote-count">{like}</span>}
        </MiniButton>
      )}
      {dislike > 0 && (
        <MiniButton className={`card-vote ${dislikeOn ? 'on' : ''}`} label={dislikeOn ? '收回 👎' : '按 👎'} pressed={dislikeOn} testId="card-dislike" onPress={() => toggle('dislike')}>
          👎<span className="card-vote-count">{dislike}</span>
        </MiniButton>
      )}
      {list.length > 0 && (
        <MiniButton className="card-vote-more" label="看是誰按的" pressed={open} testId="card-votes-more" onPress={() => setOpen(!open)}>
          ▾
        </MiniButton>
      )}
      {open && (
        <NameList
          className="card-vote-list"
          ids={list.filter((v) => v.value === 'like').map((v) => v.memberId)}
          dislikes={list.filter((v) => v.value === 'dislike').map((v) => v.memberId)}
        />
      )}
    </span>
  );
}
