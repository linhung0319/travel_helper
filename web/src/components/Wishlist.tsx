// 想去（interaction-design §6）：❤️ 就是想去。「想去」分頁是 Explore.tsx 的 source="wish"，清單在 shared/ui/WishList（三段、日曆鈕「加到某天」開 DayPicker）；
// 留言（Comments，只有一層）不再在卡片上展開，放在詳情裡，清單上只有最新一則的第一句，點了開詳情。
// 加到某天的點變成那天的「候選」，放在行程分頁時間軸的下面，樣子和資料卡一樣（類型淡底色、類型色塊），
// 用虛線框、沒有編號表示還沒排進去，下面一行「加的人」。編輯中左邊 ⠿、右邊「↑ 排進」（插在最順路的位置）和「⋯」選單（設計 §2.3），
// 或拖到時間軸（滑鼠整列、手指按 ⠿；停在同類型卡片中間 0.6 秒＝合併成那張卡片的備卡、卡片之間＝排在那裡；planDrag.ts）。備卡也可以拖回候選區。
// 這天、整趟的留言（Comments）放在地圖區的視窗（MapPanel）。有人 ❤️ 的點、留言數的 hook 在 shared/placeLists.ts（手機版也用）。

import { useState } from 'react';
import { appStore } from '../store.ts';
import { commands } from '../appCommands.ts';
import { shared } from '../appShared.ts';
import { useApp, useData, useShared } from '../hooks.ts';
import { closeDialog, openDialog } from '../uiStore.ts';
import type { Candidate, Comment } from '../backend/types.ts';
import { dayCandidates } from '../lib/wishlist.ts';
import { useComments, useLiked } from '../shared/placeLists.ts';
import { shortDayLabel } from '../lib/trip.ts';
import { Avatar, AvatarStack, Dialog, MemberName, stamp } from './common.tsx';
import { addPlaceToDay } from './addToDay.ts';
import { Icon } from './Icon.tsx';
import { dropOnCandidatesProps, usePlanDrag } from './planDrag.ts';
import type { DragSource } from '../lib/dropIntent.ts';
import { CardType } from './Timeline.tsx';
import { ActionMenu } from './ActionMenu.tsx';

const KIND_TAGS: Record<Comment['kind'], string | null> = { normal: null, planner: '規劃', decline: '不採用' };

/** 留言：預設收起來（open＝true 時一開始就展開；bare＝詳情的留言分頁，沒有收合鈕、一直展開，沒有留言時寫一句說明）；只有一層；自己的可以改、可以刪。編輯中留的標〔規劃〕 */
export function Comments({ target, label = '留言', placeholder = '留言…', open: openAtStart = false, bare = false }: { target: string; label?: string; placeholder?: string; open?: boolean; bare?: boolean }) {
  const list = useComments(target);
  const [openState, setOpen] = useState(openAtStart);
  const open = bare || openState;
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
      {!bare && (
        <button type="button" className="text-button small" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="wish-comments">
          <Icon name="chat" size={16} /> {list.length ? `${list.length} 則${label}` : label} <span className={`chev ${open ? 'up' : ''}`}>
            <Icon name="chevron" size={16} />
          </span>
        </button>
      )}
      {open && (
        <div className="wish-comment-list">
          {bare && list.length === 0 && (
            <p className="muted small" data-testid="wish-comments-empty">
              還沒有人留言，寫下第一則吧
            </p>
          )}
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

/** 候選的一筆：類型色塊、名稱、❤️ 頭像，下面一行「加的人」。編輯中左邊 ⠿ 可以拖進時間軸（住宿不行）、右邊「↑ 排進」、「⋯」（排進這天、移到第幾天、刪除） */
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
  const station = p?.type === 'station'; // 車站不能排進行程（T29c §8.10）：舊資料裡的車站候選不給拖、不給 ↑
  const dragSrc: DragSource | null = planning && !lodging && !station ? { kind: 'candidate', candidateId: c.id, placeId: c.placeId, placeType: p?.type ?? null } : null;
  // 滑鼠整列都能拖、手指按 ⠿；拖到左邊聊天室＝問 AI
  const pressRef = usePlanDrag<HTMLLIElement>(dragSrc, true, { askPlace: c.placeId });
  const up = async () => {
    // 住宿會換掉那晚原本的住宿，用對話框確認
    if (lodging) return openDialog({ kind: 'add', placeId: c.placeId, day: date });
    setBusy(true);
    await addPlaceToDay(c.placeId, date);
    setBusy(false);
  };
  return (
    <li
      className={`cand type-${p?.type ?? 'other'} ${hovered === c.placeId ? 'hot' : ''} ${dragSrc ? 'movable' : ''}`}
      data-testid="cand-item"
      data-id={c.placeId}
      onMouseEnter={() => appStore.getState().hover(c.placeId)}
      onMouseLeave={() => appStore.getState().hover(null)}
      ref={pressRef}
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
      {planning && !station && (
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
      {planning && (
        <ActionMenu
          ctx={{ kind: 'candidate', mine, surface: 'desktop' }}
          target={{ date, candidateId: c.id, placeId: c.placeId }}
          ui={{ openTags: () => {}, openLodgingPlan: () => {}, openMove: () => openDialog({ kind: 'move-candidate', candidateId: c.id }) }}
          label={name}
        />
      )}
    </li>
  );
}

/** 行程分頁：這天的候選（標題「候選 N」）。點一筆＝地圖飛過去、跳出小卡片；編輯中 ↑ 排進行程、拖到時間軸；這一區也收拖回來的備卡 */
export function DayCandidates({ date }: { date: string }) {
  const all = useShared((s) => s.candidates);
  const itinerary = useData((s) => s.itinerary);
  const planning = useApp((s) => s.planning);
  const byId = useData((s) => s.byId);
  const list = dayCandidates(all, date, itinerary, byId);
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
