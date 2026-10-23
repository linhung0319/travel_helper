// ❤️／👎（interaction-design §9）：每人對每個點一票，可以加一句備註；地圖、圖片牆顯示 ❤️ 數。
// 投票是「喜不喜歡這個點」，和建議（「這天想做什麼」）分開。

import { useState } from 'react';
import { shared } from '../appShared.ts';
import { useData, useShared } from '../hooks.ts';
import { closeDialog, openDialog } from '../uiStore.ts';
import type { VoteValue } from '../backend/types.ts';
import { Dialog, MemberName } from './common.tsx';

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

/** 詳情面板頂端：❤️ 數、👎 數；點一下投、再點一下收回；「＋備註」開對話框 */
export function VoteButtons({ placeId }: { placeId: string }) {
  const { mine, like, dislike } = useVotes(placeId);
  const toggle = (value: VoteValue) => void shared.vote(placeId, mine?.value === value ? null : value, mine?.value === value ? null : (mine?.note ?? null));
  return (
    <>
      <button type="button" className={`action vote ${mine?.value === 'like' ? 'on' : ''}`} aria-pressed={mine?.value === 'like'} onClick={() => toggle('like')} data-testid="vote-like">
        ❤️ {like || ''}
      </button>
      <button type="button" className={`action vote ${mine?.value === 'dislike' ? 'on' : ''}`} aria-pressed={mine?.value === 'dislike'} onClick={() => toggle('dislike')} data-testid="vote-dislike">
        👎 {dislike || ''}
      </button>
    </>
  );
}

/** 詳情面板裡：誰投了什麼、備註 */
export function VoteSummary({ placeId }: { placeId: string }) {
  const { list, mine } = useVotes(placeId);
  if (!list.length && !mine) {
    return (
      <p className="vote-summary muted small">
        還沒有人投票。
        <button type="button" className="text-button" onClick={() => openDialog({ kind: 'vote', placeId })}>
          ＋ 投票並寫備註
        </button>
      </p>
    );
  }
  return (
    <div className="vote-summary small" data-testid="vote-summary">
      {list.map((v) => (
        <span key={v.memberId} className="vote-who">
          {v.value === 'like' ? '❤️' : '👎'} <MemberName id={v.memberId} />
          {v.note && <span className="muted">「{v.note}」</span>}
        </span>
      ))}
      <button type="button" className="text-button" onClick={() => openDialog({ kind: 'vote', placeId })}>
        {mine ? '✏️ 改我的備註' : '＋ 投票並寫備註'}
      </button>
    </div>
  );
}

export function VoteDialog({ placeId }: { placeId: string }) {
  const p = useData((s) => s.byId.get(placeId));
  const { mine } = useVotes(placeId);
  const [value, setValue] = useState<VoteValue>(mine?.value ?? 'like');
  const [note, setNote] = useState(mine?.note ?? '');
  const submit = async () => {
    const r = await shared.vote(placeId, value, note.trim() || null);
    if (r.ok) closeDialog();
  };
  return (
    <Dialog
      title={`投票：${p ? p.name.zh || p.name.ja : placeId}`}
      onClose={closeDialog}
      testId="vote-dialog"
      footer={
        <>
          {mine && (
            <button
              type="button"
              className="button"
              onClick={async () => {
                if ((await shared.vote(placeId, null)).ok) closeDialog();
              }}
            >
              收回我的票
            </button>
          )}
          <button type="button" className="button primary" onClick={() => void submit()}>
            儲存
          </button>
        </>
      }
    >
      <div className="segmented big" role="group" aria-label="喜歡或不喜歡">
        <button type="button" aria-pressed={value === 'like'} onClick={() => setValue('like')}>
          ❤️ 想去
        </button>
        <button type="button" aria-pressed={value === 'dislike'} onClick={() => setValue('dislike')}>
          👎 不想去
        </button>
      </div>
      <label className="field">
        <span className="field-label">備註（可以不寫）</span>
        <input type="text" maxLength={500} value={note} placeholder="例如：海女表演一定要看／坡太陡走不上去" onChange={(e) => setNote(e.target.value)} />
      </label>
      <p className="muted small">大家都看得到你投了什麼；AI 排行程時會參考（❤️ 多的優先，有人 👎 的先問）。</p>
    </Dialog>
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
