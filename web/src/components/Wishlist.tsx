// 想去（interaction-design §6）：❤️ 就是想去。「❤️ 想去」分頁照搬探索（Explore.tsx 的 source="wish"），
// 每張卡片底下多了「📅 加到某天」（小月曆，DayPicker.tsx）、留言（只有一層，收起來）；❤️／👎 數在照片右上角。
// 加到某天的點變成那天的「候選」，放在行程分頁時間軸的下面，樣子和資料卡一樣（類型淡底色、類型色塊），
// 用虛線框、沒有編號表示還沒排進去，下面一行「加的人」。規劃模式下左邊 ⠿、右邊「↑ 排進」（插在最順路的位置），
// 或拖到時間軸（卡片中間＝合併成那張卡片的備卡、卡片之間＝排在那裡；planDrag.ts）。備卡也可以拖回候選區。
// 這天、整趟的留言（Comments）放在地圖區的視窗（MapPanel）。

import { useMemo, useState } from 'react';
import { appStore } from '../store.ts';
import { commands } from '../appCommands.ts';
import { shared } from '../appShared.ts';
import { useApp, useData, useIsDesktop, useShared } from '../hooks.ts';
import { closeDialog, openDialog } from '../uiStore.ts';
import type { Candidate, Comment } from '../backend/types.ts';
import { dayCandidates, likedPlaces } from '../lib/wishlist.ts';
import { shortDayLabel } from '../lib/trip.ts';
import { Avatar, AvatarStack, Dialog, MemberName, stamp } from './common.tsx';
import { addPlaceToDay } from './addToDay.ts';
import { AddToDay } from './DayPicker.tsx';
import { dragSourceProps, dropOnCandidatesProps, useLongPressDrag } from './planDrag.ts';
import type { DragSource } from '../lib/dropIntent.ts';
import { CardType } from './Timeline.tsx';

/** 有人 ❤️ 的點（想去分頁的內容）；地圖、分頁的數字也用這個 */
export function useLiked() {
  const votes = useShared((s) => s.votes);
  return useMemo(() => likedPlaces(votes), [votes]);
}

const KIND_TAGS: Record<Comment['kind'], string | null> = { normal: null, planner: '規劃', decline: '不採用' };

function useComments(target: string) {
  const comments = useShared((s) => s.comments);
  return useMemo(() => comments.filter((c) => c.target === target && !c.deletedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [comments, target]);
}

/** 這個 target（地點、某一天 dayTarget、整趟 TRIP_TARGET）的留言數 */
export function useCommentCount(target: string): number {
  return useComments(target).length;
}

/** 留言：預設收起來（open＝true 時一開始就展開）；只有一層；自己的可以改、可以刪。規劃模式下留的標〔規劃〕 */
export function Comments({ target, label = '留言', placeholder = '留言…', open: openAtStart = false }: { target: string; label?: string; placeholder?: string; open?: boolean }) {
  const list = useComments(target);
  const [open, setOpen] = useState(openAtStart);
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

/** 想去卡片底下：加到某天（月曆）、留言。❤️／👎 數和候選、已排的 tag 在卡片的照片上 */
export function WishExtras({ placeId }: { placeId: string }) {
  return (
    <div className="wish-extras">
      <AddToDay placeId={placeId} />
      <Comments target={placeId} />
    </div>
  );
}

/** 候選的一筆：類型色塊、名稱、❤️ 頭像，下面一行「加的人」。規劃模式下左邊 ⠿ 可以拖進時間軸（住宿不行）、右邊「↑ 排進」 */
function CandidateRow({ c, date }: { c: Candidate; date: string }) {
  const me = useShared((s) => s.me?.id);
  const p = useData((s) => s.byId.get(c.placeId));
  const planning = useApp((s) => s.planning);
  const hovered = useApp((s) => s.hoveredId);
  const liked = useLiked().get(c.placeId);
  const [busy, setBusy] = useState(false);
  const name = p ? p.name.zh || p.name.ja : c.placeId;
  const mine = c.addedBy === me;
  const lodging = p?.type === 'lodging';
  const desktop = useIsDesktop();
  const dragSrc: DragSource | null = planning && !lodging ? { kind: 'candidate', candidateId: c.id, placeId: c.placeId, placeType: p?.type ?? null } : null;
  const pressRef = useLongPressDrag<HTMLLIElement>(dragSrc, !desktop);
  const up = async () => {
    // 住宿會換掉那晚原本的住宿，用對話框確認
    if (lodging) return openDialog({ kind: 'add', placeId: c.placeId, day: date });
    setBusy(true);
    await addPlaceToDay(c.placeId, date);
    setBusy(false);
  };
  return (
    <li
      className={`cand type-${p?.type ?? 'other'} ${hovered === c.placeId ? 'hot' : ''}`}
      data-testid="cand-item"
      data-id={c.placeId}
      onMouseEnter={() => appStore.getState().hover(c.placeId)}
      onMouseLeave={() => appStore.getState().hover(null)}
      ref={pressRef}
      {...(desktop ? dragSourceProps(dragSrc, c.placeId) : {})}
    >
      {dragSrc && (
        <span className="cand-handle" aria-hidden title="拖到時間軸">
          ⠿
        </span>
      )}
      <CardType type={p?.type ?? null} />
      <span className="cand-main">
        <span className="cand-title">
          <button
            type="button"
            className="cand-name"
            onClick={() => {
              commands.focus(c.placeId);
              appStore.getState().openPreview(c.placeId);
            }}
          >
            {p?.tier && <span className={`tier tier-${p.tier}`}>{p.tier}</span>}
            <strong>{name}</strong>
          </button>
          {liked && <AvatarStack ids={liked.likes} dislikes={liked.dislikes} />}
        </span>
        <span className="cand-by small muted" data-testid="cand-by">
          加的人 <Avatar id={c.addedBy} />
        </span>
      </span>
      {planning && (
        <button type="button" className="cand-up" disabled={busy} onClick={() => void up()} title={lodging ? '設成這晚的住宿' : '插在這天最順路的位置'} data-testid="cand-up">
          {lodging ? '↑ 設為這晚的住宿' : '↑ 排進'}
        </button>
      )}
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
}

/** 行程分頁：這天的候選（標題「候選 N」）。點一筆＝地圖飛過去、跳出小卡片；規劃模式下 ↑ 排進行程、拖到時間軸；這一區也收拖回來的備卡 */
export function DayCandidates({ date }: { date: string }) {
  const all = useShared((s) => s.candidates);
  const itinerary = useData((s) => s.itinerary);
  const planning = useApp((s) => s.planning);
  const list = dayCandidates(all, date, itinerary);
  return (
    <section className="day-section day-candidates" data-testid="day-candidates" {...dropOnCandidatesProps(date, planning)}>
      <h4 className="cand-head">
        候選{list.length > 0 && <span className="cand-count">{list.length}</span>}
      </h4>
      {list.length === 0 && <p className="muted small">在想去的卡片按『加到某天』，就會出現在這裡。</p>}
      <ul className="cand-list">
        {list.map((c) => (
          <CandidateRow key={c.id} c={c} date={date} />
        ))}
      </ul>
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
