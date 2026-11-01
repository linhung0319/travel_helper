// 討論彈窗（T33 設計 §3）：網頁浮在地圖上（MapPanel 的位置），手機是大彈窗，上面露出一條。內容同一份。
// 篩選：全部、整趟、每一天。列的是討論對象（整趟、某一天、資料點），不是一則則留言；一次展開一個，展開後由舊到新，最新的緊貼輸入框。
// 輸入框只有一個，固定在底部，「留給」跟著展開的對象換。手機鍵盤彈出時整個彈窗跟著 .m-app 縮到鍵盤上方（--kb），收起篩選（CSS 看 data-keyboard）。
// 分組是 lib/discussion.ts 的純函式；留言的畫法和詳情共用 CommentRow。

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useStore } from 'zustand';
import { TRIP_TARGET, dayTarget } from '../../backend/types.ts';
import { commands } from '../../appCommands.ts';
import { shared } from '../../appShared.ts';
import { CommentRow } from '../../components/Wishlist.tsx';
import { Icon } from '../../components/Icon.tsx';
import { useApp, useData, usePlan, useShared, useUi } from '../../hooks.ts';
import { discussionView, isUnread, unreadDates, type DiscussionInput, type DiscussionThread } from '../../lib/discussion.ts';
import { cardTime } from '../../lib/planView.ts';
import { dayLabel, isRedDay, shortDayLabel, tripDates } from '../../lib/trip.ts';
import { focusKeyForPlace, mobileStore } from '../../mobile/mobileStore.ts';
import { dayPlanOf, planStore } from '../../planStore.ts';
import { appStore } from '../../store.ts';
import { closeDiscussion, setDiscussionChip, setDiscussionOpen } from '../../uiStore.ts';
import { seenStore } from '../discussionSeen.ts';
import type { FilterSurface } from './FilterSheet.tsx';

const DATES = tripDates();
/** 打到一半的留言：每個對象一份，關掉再打開還在（只存在記憶體） */
const drafts = new Map<string, string>();
/** 往下拉把手多遠算關掉（px） */
const DRAG_CLOSE = 60;

function goToPlace(placeId: string, date: string, surface: FilterSurface) {
  closeDiscussion();
  if (surface === 'mobile') {
    const m = mobileStore.getState();
    if (m.tab !== 'trip') m.setTab('trip');
    commands.selectDay(date);
    mobileStore.getState().focusItem(focusKeyForPlace(dayPlanOf(planStore.getState().plan, date), placeId));
    return;
  }
  const s = appStore.getState();
  s.closeDetail();
  s.setMode('map');
  commands.selectDay(date);
  appStore.getState().select(placeId);
  commands.focus(placeId);
}

function openDetail(placeId: string, surface: FilterSurface) {
  closeDiscussion();
  if (surface === 'mobile') mobileStore.getState().openPlace(placeId, mobileStore.getState().tab, 'comments');
  else appStore.getState().openDetail(placeId, 'map', 'comments', 'map');
}

function Thread({ t, open, pinned, surface, seen, me, timeOf }: { t: DiscussionThread; open: boolean; pinned?: boolean; surface: FilterSurface; seen: string | null; me: string | null; timeOf: (placeId: string, date: string) => string | null }) {
  const place = useData((s) => (t.placeId ? s.byId.get(t.placeId) : undefined));
  const day = useApp((s) => s.day);
  const planning = useApp((s) => s.planning);
  const last = t.comments.at(-1);
  const fresh = t.comments.some((c) => isUnread(c, me, seen));
  const name = t.kind === 'trip' ? '整趟' : t.kind === 'day' ? `${dayLabel(t.date!)} 這天` : place ? place.name.zh || place.name.ja : t.placeId!;
  const where = t.where;
  const whereText = where ? `${shortDayLabel(where.date)} ${where.status === 'candidate' ? '候選' : where.status === 'lodging' ? '住宿' : (timeOf(t.placeId!, where.date) ?? '')}`.trim() : t.kind === 'place' ? '不在行程' : null;
  const cls = t.kind === 'place' ? (place?.type ?? 'custom') : t.kind;
  return (
    <article className={`dp-thread t-${cls}`} data-testid="discuss-thread" data-target={t.target} data-open={open || undefined}>
      <button type="button" className="dp-thread-head" aria-expanded={open} onClick={() => setDiscussionOpen(open ? null : t.target)} data-testid="discuss-thread-toggle">
        <span className="dp-thread-top">
          <span className="dp-thread-name">{name}</span>
          {pinned && <span className="dp-tag top">置頂</span>}
          {whereText && <span className={`dp-tag ${where ? '' : 'off'}`}>{whereText}</span>}
          {t.comments.length > 0 && (
            <span className="dp-num">
              {fresh && <i className="dp-new" data-testid="discuss-new" aria-label="有新留言" />}
              <Icon name="chat" size={16} />
              {t.comments.length}
            </span>
          )}
        </span>
        {!open && (
          <span className="dp-latest">
            {last ? (
              <>
                <MemberShort id={last.author} />：{last.text}
              </>
            ) : t.kind === 'place' ? (
              '還沒有人留言'
            ) : (
              '還沒有人留言，點開留第一則'
            )}
          </span>
        )}
      </button>
      {open && (
        <div className="dp-thread-body">
          {t.comments.map((c) => (
            <CommentRow key={c.id} c={c} />
          ))}
          {t.comments.length === 0 && <p className="muted small">還沒有人留言，在下面留第一則</p>}
          {t.placeId && (
            <p className="dp-links">
              <button type="button" className="text-button small" onClick={() => openDetail(t.placeId!, surface)} data-testid="discuss-detail">
                看詳情 ›
              </button>
              {where && where.status !== 'candidate' && (!planning || day === where.date) && (
                <button type="button" className="text-button small" onClick={() => goToPlace(t.placeId!, where.date, surface)} data-testid="discuss-goto">
                  到行程看 ›
                </button>
              )}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function MemberShort({ id }: { id: string }) {
  const name = useShared((s) => s.members.find((m) => m.id === id)?.displayName ?? id);
  return <>{name}</>;
}

/** 底部的輸入框：跟著對象換，草稿各留各的；送出後還是留在這個對象（電腦不收，手機鍵盤也不收，方便接著打） */
function Composer({ target, toName, onSent, onFocus }: { target: string; toName: string; onSent(): void; onFocus(): void }) {
  const planning = useApp((s) => s.planning);
  const [text, setText] = useState(drafts.get(target) ?? '');
  const [busy, setBusy] = useState(false);
  useEffect(() => setText(drafts.get(target) ?? ''), [target]);
  const send = async () => {
    const v = text.trim();
    if (!v || busy) return;
    setBusy(true);
    const r = await shared.comment(target, v, planning ? 'planner' : 'normal');
    setBusy(false);
    if (!r.ok) return;
    drafts.delete(target);
    setText('');
    onSent();
  };
  return (
    <form
      className="dp-composer"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <span className="dp-to" data-testid="discuss-to">
        留給：<b>{toName}</b>
      </span>
      <span className="dp-input">
        <input
          type="text"
          value={text}
          maxLength={500}
          placeholder="留言…"
          aria-label={`留言給${toName}`}
          autoComplete="off"
          onFocus={onFocus}
          onChange={(e) => {
            setText(e.target.value);
            if (e.target.value) drafts.set(target, e.target.value);
            else drafts.delete(target);
          }}
          data-testid="discuss-input"
        />
        <button type="submit" className="dp-send" disabled={!text.trim() || busy} onMouseDown={(e) => e.preventDefault()} data-testid="discuss-send">
          送出
        </button>
      </span>
    </form>
  );
}

export function DiscussionPanel({ surface }: { surface: FilterSurface }) {
  const state = useUi((s) => s.discussion);
  const comments = useShared((s) => s.comments);
  const candidates = useShared((s) => s.candidates);
  const me = useShared((s) => s.me?.id ?? null);
  const itinerary = useData((s) => s.itinerary);
  const byId = useData((s) => s.byId);
  const plan = usePlan((s) => s.plan);
  const seen = useStore(seenStore, (s) => s.shownSeen);
  const listRef = useRef<HTMLDivElement>(null);
  const input = useMemo<DiscussionInput>(() => ({ comments, itinerary, candidates, byId, dates: DATES }), [comments, itinerary, candidates, byId]);
  const chip = state?.chip ?? 'all';
  const open = state?.open ?? null;
  const view = useMemo(() => discussionView(chip, input), [chip, input]);
  const freshDates = useMemo(() => (state ? unreadDates(input, me, seen) : new Set<string>()), [state, input, me, seen]);

  // 把展開的對象捲到看得到最新一則（展開、新留言、鍵盤升起時）
  const reveal = () => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>('[data-open]');
    if (!list || !el) return;
    const box = list.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.bottom > box.bottom) list.scrollTop += r.bottom - box.bottom;
    const r2 = el.getBoundingClientRect();
    if (r2.top < box.top) list.scrollTop -= box.top - r2.top;
  };
  useEffect(() => {
    if (state) reveal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, chip, comments.length, !!state]);

  // 往下拉把手關掉（手機）
  const drag = useRef<{ y: number; id: number } | null>(null);
  const dragProps = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      drag.current = { y: e.clientY, id: e.pointerId };
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      const d = drag.current;
      drag.current = null;
      if (d && d.id === e.pointerId && e.clientY - d.y > DRAG_CLOSE) closeDiscussion();
    },
    onPointerCancel: () => {
      drag.current = null;
    },
  };

  if (!state) return null;
  const all = [view.pinned, ...view.threads, ...view.quiet].filter((t): t is DiscussionThread => !!t);
  const target = open ?? (chip === 'all' || chip === 'trip' ? TRIP_TARGET : dayTarget(chip));
  const toThread = all.find((t) => t.target === target);
  const toPlace = toThread?.placeId ? byId.get(toThread.placeId) : undefined;
  const toName = target === TRIP_TARGET ? '整趟' : target.startsWith('day:') ? `${dayLabel(target.slice(4))} 這天` : toPlace ? toPlace.name.zh || toPlace.name.ja : target;
  const timeOf = (placeId: string, date: string) => {
    const entry = dayPlanOf(plan, date)?.entries.find((e) => e.placeId === placeId);
    return entry && entry.kind !== 'start' && entry.kind !== 'lodging' ? cardTime(entry).text.split('–')[0] : null;
  };
  const row = (t: DiscussionThread, pinned = false) => <Thread key={t.target} t={t} open={open === t.target} pinned={pinned} surface={surface} seen={seen} me={me} timeOf={timeOf} />;

  const box = (
    <section className={`dp dp-${surface}`} role="dialog" aria-label="討論" data-testid="discussion" data-chip={chip}>
      {surface === 'mobile' && (
        <div className="dp-grab" data-testid="discuss-grab" {...dragProps}>
          <span />
        </div>
      )}
      <header className="dp-head">
        <h2>討論</h2>
        <button type="button" className="dp-x" onClick={closeDiscussion} aria-label="關閉" data-testid="discuss-close">
          <Icon name="close" size={20} />
        </button>
      </header>
      <div className="dp-chips" role="group" aria-label="範圍" data-testid="discuss-chips">
        <button type="button" className="dp-chip" aria-pressed={chip === 'all'} onClick={() => setDiscussionChip('all')} data-testid="discuss-chip-all">
          全部
        </button>
        <button type="button" className="dp-chip" aria-pressed={chip === 'trip'} onClick={() => setDiscussionChip('trip')} data-testid="discuss-chip-trip">
          整趟
        </button>
        {DATES.map((d) => (
          <button key={d} type="button" className={`dp-chip ${isRedDay(d) ? 'red-day' : ''}`} aria-pressed={chip === d} onClick={() => setDiscussionChip(d)} data-testid={`discuss-chip-${d}`}>
            {shortDayLabel(d)}
            {freshDates.has(d) && <i className="dp-new" aria-label="有新留言" />}
          </button>
        ))}
      </div>
      <div className="dp-list" ref={listRef} data-testid="discuss-list">
        {view.pinned && row(view.pinned, chip !== 'trip')}
        {view.threads.map((t) => row(t))}
        {view.quiet.length > 0 && <p className="dp-others">這天還沒人留言的點</p>}
        {view.quiet.map((t) => row(t))}
        {all.length === 0 && (
          <p className="muted small dp-empty" data-testid="discuss-empty">
            還沒有人留言，寫下第一則吧
          </p>
        )}
      </div>
      <Composer key={target} target={target} toName={toName} onSent={() => setDiscussionOpen(target)} onFocus={() => window.setTimeout(reveal, 300)} />
    </section>
  );
  if (surface === 'desktop') return box;
  return (
    <div className="dp-backdrop" data-testid="discuss-backdrop">
      <button type="button" className="dp-peek" onClick={closeDiscussion} aria-label="關閉討論" tabIndex={-1} data-testid="discuss-peek" />
      {box}
    </div>
  );
}
