// 想去（interaction-design §6）：❤️ 就是想去。「❤️ 想去」分頁照搬探索（Explore.tsx 的 source="wish"），
// 每張卡片底下多了 ❤️ 的頭像、👎 數、留言（只有一層，收起來）、「📅 加到某天」。
// 加到某天的點變成那天的「候選」，放在行程分頁時間軸的下面；規劃模式下按 ↑ 排進行程（插在最順路的位置）。
// 這天的留言（例如「這天想輕鬆一點」）也放在行程分頁。

import { useMemo, useState } from 'react';
import { appStore } from '../store.ts';
import { commands } from '../appCommands.ts';
import { shared } from '../appShared.ts';
import { useApp, useData, useShared } from '../hooks.ts';
import { closeDialog, openDialog } from '../uiStore.ts';
import { dayTarget, type Comment } from '../backend/types.ts';
import { dayCandidates, likedPlaces } from '../lib/wishlist.ts';
import { shortDayLabel, tripDates } from '../lib/trip.ts';
import { TYPE_ICONS } from '../lib/typeStyle.ts';
import { memberName } from '../sharedStore.ts';
import { Dialog, MemberName, stamp } from './common.tsx';
import { addPlaceToDay } from './addToDay.ts';

const DATES = tripDates();

/** 有人 ❤️ 的點（想去分頁的內容）；地圖、分頁的數字也用這個 */
export function useLiked() {
  const votes = useShared((s) => s.votes);
  return useMemo(() => likedPlaces(votes), [votes]);
}

function Avatar({ id }: { id: string }) {
  const members = useShared((s) => s.members);
  const me = useShared((s) => s.me?.id);
  const m = members.find((x) => x.id === id);
  const name = id === me ? '我' : memberName(members, id);
  return (
    <span className={`avatar ${id === me ? 'me' : ''}`} title={name}>
      {m?.pictureUrl ? <img src={m.pictureUrl} alt="" /> : name.slice(0, 1)}
    </span>
  );
}

const KIND_TAGS: Record<Comment['kind'], string | null> = { normal: null, planner: '規劃', decline: '不採用' };

function useComments(target: string) {
  const comments = useShared((s) => s.comments);
  return useMemo(() => comments.filter((c) => c.target === target && !c.deletedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [comments, target]);
}

/** 留言：預設收起來；只有一層；自己的可以改、可以刪。規劃模式下留的標〔規劃〕 */
function Comments({ target, label = '留言', placeholder = '留言…' }: { target: string; label?: string; placeholder?: string }) {
  const list = useComments(target);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  const me = useShared((s) => s.me?.id);
  const planning = useApp((s) => s.planning);
  const send = async () => {
    if (!text.trim()) return;
    const r = await shared.comment(target, text.trim(), planning ? 'planner' : 'normal');
    if (r.ok) setText('');
  };
  return (
    <div className="wish-comments">
      <button type="button" className="text-button small" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="wish-comments">
        💬 {list.length ? `${list.length} 則${label}` : label} {open ? '▴' : '▾'}
      </button>
      {open && (
        <div className="wish-comment-list">
          {list.map((c) => (
            <div key={c.id} className={`wish-comment kind-${c.kind}`} data-testid="wish-comment">
              <Avatar id={c.author} />
              <div className="wish-comment-body">
                <span className="small">
                  <strong>
                    <MemberName id={c.author} />
                  </strong>
                  {KIND_TAGS[c.kind] && <span className={`tag tag-${c.kind}`}>〔{KIND_TAGS[c.kind]}〕</span>}
                  <span className="muted"> {stamp(c.updatedAt)}</span>
                </span>
                {editing?.id === c.id ? (
                  <span className="wish-comment-edit">
                    <input value={editing.text} onChange={(e) => setEditing({ id: c.id, text: e.target.value })} aria-label="改留言" />
                    <button
                      type="button"
                      className="text-button small"
                      onClick={async () => {
                        if ((await shared.editComment(c.id, editing.text.trim())).ok) setEditing(null);
                      }}
                    >
                      存
                    </button>
                    <button type="button" className="text-button small" onClick={() => setEditing(null)}>
                      取消
                    </button>
                  </span>
                ) : (
                  <span className="wish-comment-text">{c.text}</span>
                )}
                {c.author === me && editing?.id !== c.id && (
                  <span className="wish-comment-actions">
                    <button type="button" className="text-button small" onClick={() => setEditing({ id: c.id, text: c.text })}>
                      改
                    </button>
                    <button type="button" className="text-button small" onClick={() => void shared.deleteComment(c.id)}>
                      刪
                    </button>
                  </span>
                )}
              </div>
            </div>
          ))}
          <form
            className="wish-comment-new"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={label} maxLength={500} data-testid="comment-input" />
            <button type="submit" className="text-button small" disabled={!text.trim()}>
              送出
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/** ❤️ 的頭像、👎 數（自己按 ❤️／👎 用卡片上的按鈕或詳情） */
function Reactions({ likes, dislikes }: { likes: string[]; dislikes: string[] }) {
  const me = useShared((s) => s.me?.id);
  const members = useShared((s) => s.members);
  return (
    <span className="wish-reactions" title={`❤️ ${likes.map((id) => (id === me ? '我' : memberName(members, id))).join('、')}`}>
      <span className="avatars">
        {likes.map((id) => (
          <Avatar key={id} id={id} />
        ))}
      </span>
      <span className="muted small">❤️ {likes.length}</span>
      {dislikes.length > 0 && (
        <span className="muted small" title={`👎 ${dislikes.map((id) => (id === me ? '我' : memberName(members, id))).join('、')}`}>
          　👎 {dislikes.length}
        </span>
      )}
    </span>
  );
}

/** 「📅 加到某天」：展開一排日期，選一天就進那天的候選；已經是候選的那天標起來 */
function AddToDay({ placeId }: { placeId: string }) {
  const [open, setOpen] = useState(false);
  const candidates = useShared((s) => s.candidates);
  const on = new Set(candidates.filter((c) => c.placeId === placeId).map((c) => c.day));
  if (!open)
    return (
      <button type="button" className="text-button small" onClick={() => setOpen(true)} data-testid="wish-add-day">
        📅 加到某天
      </button>
    );
  return (
    <div className="wish-days" role="group" aria-label="加到哪天的候選">
      {DATES.map((d) => (
        <button
          key={d}
          type="button"
          className={`pill small-pill ${on.has(d) ? 'on' : ''}`}
          aria-pressed={on.has(d)}
          disabled={on.has(d)}
          data-add-day={d}
          onClick={async () => {
            if ((await shared.addCandidate(placeId, d)).ok) setOpen(false);
          }}
        >
          {shortDayLabel(d)}
        </button>
      ))}
      <button type="button" className="text-button small" onClick={() => setOpen(false)}>
        取消
      </button>
    </div>
  );
}

/** 想去卡片底下：頭像、👎、哪幾天的候選、加到某天、留言（已排哪天在卡片上的 📅） */
export function WishExtras({ placeId }: { placeId: string }) {
  const liked = useLiked().get(placeId);
  const candidates = useShared((s) => s.candidates);
  const cands = candidates.filter((c) => c.placeId === placeId).sort((a, b) => a.day.localeCompare(b.day));
  return (
    <div className="wish-extras">
      <div className="wish-meta">
        {liked && <Reactions likes={liked.likes} dislikes={liked.dislikes} />}
        {cands.map((c) => (
          <span key={c.id} className="hope-chip" title={`${shortDayLabel(c.day)} 的候選`}>
            候選 {shortDayLabel(c.day)}
          </span>
        ))}
      </div>
      <AddToDay placeId={placeId} />
      <Comments target={placeId} />
    </div>
  );
}

/** 行程分頁：這天的候選。點一筆＝地圖飛過去、跳出小卡片；規劃模式下 ↑ 排進行程 */
export function DayCandidates({ date }: { date: string }) {
  const all = useShared((s) => s.candidates);
  const me = useShared((s) => s.me?.id);
  const itinerary = useData((s) => s.itinerary);
  const byId = useData((s) => s.byId);
  const planning = useApp((s) => s.planning);
  const hovered = useApp((s) => s.hoveredId);
  const liked = useLiked();
  const [busy, setBusy] = useState<number | null>(null);
  const list = dayCandidates(all, date, itinerary);
  return (
    <section className="day-section day-candidates" data-testid="day-candidates">
      <h4>
        📋 這天的候選{list.length ? `（${list.length}）` : ''}
        {list.length > 0 && !planning && <span className="muted small">　進入規劃模式後按 ↑ 排進行程</span>}
      </h4>
      {list.length === 0 && <p className="muted small">在「❤️ 想去」的卡片按「📅 加到某天」，就會出現在這裡。</p>}
      <ul className="cand-list">
        {list.map((c) => {
          const p = byId.get(c.placeId);
          const name = p ? p.name.zh || p.name.ja : c.placeId;
          const mine = c.addedBy === me;
          const up = async () => {
            // 住宿會換掉那晚原本的住宿，用對話框確認
            if (p?.type === 'lodging') return openDialog({ kind: 'add', placeId: c.placeId, day: date });
            setBusy(c.id);
            await addPlaceToDay(c.placeId, date);
            setBusy(null);
          };
          return (
            <li
              key={c.id}
              className={`cand ${hovered === c.placeId ? 'hot' : ''}`}
              data-testid="cand-item"
              data-id={c.placeId}
              onMouseEnter={() => appStore.getState().hover(c.placeId)}
              onMouseLeave={() => appStore.getState().hover(null)}
            >
              {planning && (
                <button type="button" className="button small primary cand-up" disabled={busy === c.id} onClick={() => void up()} title={p?.type === 'lodging' ? '設成這晚的住宿' : '插在這天最順路的位置'} data-testid="cand-up">
                  ↑
                </button>
              )}
              <button
                type="button"
                className="cand-name"
                onClick={() => {
                  commands.focus(c.placeId);
                  appStore.getState().openPreview(c.placeId);
                }}
              >
                {p && <span aria-hidden>{TYPE_ICONS[p.type]} </span>}
                {p?.tier && <span className={`tier tier-${p.tier}`}>{p.tier}</span>}
                <strong>{name}</strong>
              </button>
              <span className="muted small cand-meta">
                ❤️ {liked.get(c.placeId)?.likes.length ?? 0}・<MemberName id={c.addedBy} /> 加的
              </span>
              {mine ? (
                <button type="button" className="text-button small" onClick={() => void shared.removeCandidate(c.id)} data-testid="cand-withdraw">
                  撤回
                </button>
              ) : (
                planning && (
                  <button type="button" className="text-button small" onClick={() => openDialog({ kind: 'reject', candidateId: c.id })} data-testid="cand-reject">
                    拿掉
                  </button>
                )
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** 行程分頁：這天的留言（對這天行程的討論，例如「這天想輕鬆一點」） */
export function DayComments({ date }: { date: string }) {
  return (
    <section className="day-section day-comments" data-testid="day-comments">
      <Comments target={dayTarget(date)} label="這天的留言" placeholder="例如：這天想輕鬆一點，下午在旅館泡湯" />
    </section>
  );
}

/** 拿掉別人加的候選：一定要寫理由，理由變成那個點的一則〔不採用〕留言 */
export function RejectDialog({ candidateId }: { candidateId: number }) {
  const c = useShared((s) => s.candidates.find((x) => x.id === candidateId));
  const p = useData((s) => (c ? s.byId.get(c.placeId) : undefined));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  if (!c) return null;
  const name = p ? p.name.zh || p.name.ja : c.placeId;
  return (
    <Dialog
      title={`從 ${shortDayLabel(c.day)} 的候選拿掉：${name}`}
      onClose={closeDialog}
      testId="reject-dialog"
      footer={
        <>
          <button type="button" className="button" onClick={closeDialog}>
            取消
          </button>
          <button
            type="button"
            className="button primary"
            disabled={busy || !text.trim()}
            data-testid="reject-submit"
            onClick={async () => {
              setBusy(true);
              if ((await shared.removeCandidate(c.id, text.trim())).ok) closeDialog();
              setBusy(false);
            }}
          >
            拿掉
          </button>
        </>
      }
    >
      <p className="small muted">
        <MemberName id={c.addedBy} /> 加的。理由會變成這個點的一則留言，大家看得到；這個點還是留在想去。
      </p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={500} placeholder="例如：這天排不下，改 2/6 好嗎" aria-label="拿掉的理由" data-testid="reject-text" />
    </Dialog>
  );
}
