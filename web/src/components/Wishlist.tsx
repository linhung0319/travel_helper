// 想去（interaction-design §6）：❤️ 就是想去。「❤️ 想去」分頁照搬探索（Explore.tsx 的 source="wish"），
// 每張卡片底下多了「📅 加到某天」（小月曆，DayPicker.tsx）、留言（只有一層，收起來）；❤️／👎 數在照片右上角。
// 加到某天的點變成那天的「候選」，放在行程分頁時間軸的下面；規劃模式下按 ↑ 排進行程（插在最順路的位置），
// 或「併到…」某張卡片（成為那張卡片「這個時段也可以去」的一個）。
// 這天、整趟的留言（Comments）放在地圖區的視窗（MapPanel）。

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { addOption, type DayPlan, type TimelineEntry } from '@travel-helper/engine';
import type { VisitItem } from '@travel-helper/engine/types';
import { appStore } from '../store.ts';
import { commands } from '../appCommands.ts';
import { shared } from '../appShared.ts';
import { useApp, useData, usePlan, useShared } from '../hooks.ts';
import { dayPlanOf } from '../planStore.ts';
import { allItems, selectedPlace } from '../lib/planView.ts';
import { closeDialog, openDialog } from '../uiStore.ts';
import type { Candidate, Comment } from '../backend/types.ts';
import { dayCandidates, likedPlaces } from '../lib/wishlist.ts';
import { shortDayLabel } from '../lib/trip.ts';
import { TYPE_ICONS } from '../lib/typeStyle.ts';
import { memberName } from '../sharedStore.ts';
import { Avatar, AvatarStack, Dialog, MemberName, stamp } from './common.tsx';
import { addPlaceToDay } from './addToDay.ts';
import { AddToDay } from './DayPicker.tsx';

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

/** 想去卡片底下：加到某天（月曆）、留言。規劃模式下住宿多「設為 2/5 的住宿」。❤️／👎 數和候選、已排的 tag 在卡片的照片上 */
export function WishExtras({ placeId }: { placeId: string }) {
  const isLodging = useData((s) => s.byId.get(placeId)?.type === 'lodging');
  const planning = useApp((s) => s.planning);
  const day = useApp((s) => s.day);
  return (
    <div className="wish-extras">
      {planning && isLodging && day !== 'all' && (
        // 時間軸住宿卡片的「換住宿」切過來的；會換掉那晚原本的住宿，用排進行程的對話框確認
        <button type="button" className="button small primary" onClick={() => openDialog({ kind: 'add', placeId, day })} data-testid="wish-set-lodging">
          🏨 設為 {shortDayLabel(day)} 的住宿
        </button>
      )}
      <AddToDay placeId={placeId} />
      <Comments target={placeId} />
    </div>
  );
}

/** 某天的時間軸裡，每個項目的開始時間（含分組裡的） */
function startTimes(plan: DayPlan | null): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (entries: TimelineEntry[]) => {
    for (const e of entries) {
      if (e.itemId && e.kind !== 'meet') out.set(e.itemId, e.start);
      e.groups?.forEach((g) => walk(g.entries));
    }
  };
  walk(plan?.entries ?? []);
  return out;
}

/** 候選的「併到…」：選這天的哪一張造訪卡片，這個點就放進那張卡片的「這個時段也可以去」，候選拿掉 */
function MergeMenu({ candidateId, placeId, date, name }: { candidateId: number; placeId: string; date: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const itinerary = useData((s) => s.itinerary);
  const byId = useData((s) => s.byId);
  const plan = usePlan((s) => dayPlanOf(s.plan, date));
  const times = startTimes(plan);
  const placeName = (v: VisitItem) => {
    const p = byId.get(selectedPlace(v) ?? '');
    return p ? p.name.zh || p.name.ja : (selectedPlace(v) ?? '');
  };
  const targets = allItems(itinerary)
    .filter((r) => r.date === date && r.item.type === 'visit')
    .map((r) => r.item as VisitItem)
    .filter((v) => !v.options.some((o) => o.place === placeId));
  const merge = async (v: VisitItem) => {
    setBusy(true);
    const r = await shared.changeItinerary((it) => addOption(it, v.id, { place: placeId, stayMinutes: null }), `${name} 併到 ${placeName(v)}`);
    if (r.ok) await shared.removeCandidate(candidateId, undefined, true);
    setBusy(false);
    setOpen(false);
  };
  return (
    <span className="item-menu cand-merge">
      <button type="button" className="text-button small" aria-expanded={open} disabled={busy} onClick={() => setOpen(!open)} title="放進某張卡片的「這個時段也可以去」" data-testid="candidate-merge">
        併到…
      </button>
      {open && (
        <span className="menu" role="menu" data-testid="merge-menu">
          {targets.length === 0 && <span className="muted small menu-note">這天還沒有可以併的卡片</span>}
          {targets.map((v) => {
            const p = byId.get(selectedPlace(v) ?? '');
            return (
              <button key={v.id} type="button" role="menuitem" disabled={busy} onClick={() => void merge(v)} data-merge-item={v.id}>
                <span className="muted">{times.get(v.id) ?? ''}</span> {p ? TYPE_ICONS[p.type] : ''} {placeName(v)}
              </button>
            );
          })}
        </span>
      )}
    </span>
  );
}

/** 手機長按顯示提示（電腦版滑鼠移過去看 title） */
function useLongPressHint(text: string) {
  const timer = useRef<number | null>(null);
  const cancel = () => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancel, []);
  return {
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.pointerType !== 'touch') return;
      cancel();
      timer.current = window.setTimeout(() => shared.notify(text), 500);
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
  };
}

/** 這天候選的一筆：類型圖示、名稱、❤️ 頭像；誰加的放在 title（手機長按） */
function CandidateRow({ c, date }: { c: Candidate; date: string }) {
  const me = useShared((s) => s.me?.id);
  const members = useShared((s) => s.members);
  const p = useData((s) => s.byId.get(c.placeId));
  const planning = useApp((s) => s.planning);
  const hovered = useApp((s) => s.hoveredId);
  const liked = useLiked().get(c.placeId);
  const [busy, setBusy] = useState(false);
  const name = p ? p.name.zh || p.name.ja : c.placeId;
  const mine = c.addedBy === me;
  const addedBy = `${mine ? '我' : memberName(members, c.addedBy)} 加的`;
  const hint = useLongPressHint(addedBy);
  const lodging = p?.type === 'lodging';
  const up = async () => {
    // 住宿會換掉那晚原本的住宿，用對話框確認
    if (lodging) return openDialog({ kind: 'add', placeId: c.placeId, day: date });
    setBusy(true);
    await addPlaceToDay(c.placeId, date);
    setBusy(false);
  };
  return (
    <li
      className={`cand ${hovered === c.placeId ? 'hot' : ''}`}
      data-testid="cand-item"
      data-id={c.placeId}
      title={addedBy}
      onMouseEnter={() => appStore.getState().hover(c.placeId)}
      onMouseLeave={() => appStore.getState().hover(null)}
      {...hint}
    >
      {planning && (
        <button type="button" className="button small primary cand-up" disabled={busy} onClick={() => void up()} title={lodging ? '設成這晚的住宿' : '插在這天最順路的位置'} data-testid="cand-up">
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
      {liked && <AvatarStack ids={liked.likes} dislikes={liked.dislikes} />}
      {planning && !lodging && <MergeMenu candidateId={c.id} placeId={c.placeId} date={date} name={name} />}
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

/** 行程分頁：這天的候選。點一筆＝地圖飛過去、跳出小卡片；規劃模式下 ↑ 排進行程、併到某張卡片 */
export function DayCandidates({ date }: { date: string }) {
  const all = useShared((s) => s.candidates);
  const itinerary = useData((s) => s.itinerary);
  const planning = useApp((s) => s.planning);
  const list = dayCandidates(all, date, itinerary);
  return (
    <section className="day-section day-candidates" data-testid="day-candidates">
      <h4>
        📅 這天的候選{list.length ? `（${list.length}）` : ''}
      </h4>
      {list.length > 0 && !planning && <p className="muted small">進入規劃模式，就可以按 ↑ 排進行程</p>}
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
