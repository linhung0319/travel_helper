// 手機版行程的面板（第六輪 §3.5）：蓋在地圖下半部，可以拉，停在三個高度（mobileStore.tripSnap；高度在 mobile.css 的 CSS 變數）：
// 低（只露出天數列）、中（預設，地圖約佔上面 1/3）、高（地圖剩一小條）。拖把手換高度：放開時停在最近的高度，快速往上／往下滑就往那邊切一格。
// 面板裡由上到下：把手、天數列（DayStrip）、選「全部」時是整趟（TripOverview），選某天時是這天的標題（✨、✏️ 編輯）、摘要、時間條（變矮）、
// 時間軸（MobileCard、MobileLeg，資料準備和網頁版共用 Timeline.tsx 的 useDayTimeline）、這天的候選（候選樣式的 MobileCard）。
// 選了一張卡（focusItem）：清單捲到那張卡。編輯中（藍條、把手、⋯ 動作面板）是 Task 11；✨ 的半屏聊天是 Task 12。

import { Fragment, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { EngineWarning, TimelineEntry, VisitItem } from '@travel-helper/engine';
import { useApp, useData, useUi } from '../hooks.ts';
import { openDialog } from '../uiStore.ts';
import { cardTime, findItemRef, formatStay, shownWarnings, type TimelineRow } from '../lib/planView.ts';
import { dayLabel, isRedDay, tripDates } from '../lib/trip.ts';
import type { Place } from '../data/types.ts';
import { DayBar, DaySummaryLine, useDayTimeline, type DayTimeline } from '../components/Timeline.tsx';
import { ItemTags, LodgingTags, tagKindOf } from '../components/ItemTags.tsx';
import { MemberName } from '../components/common.tsx';
import { focusKeyOf, mobileStore, useMobile, type TripSnap } from './mobileStore.ts';
import { DayStrip } from './DayStrip.tsx';
import { MobileCard } from './MobileCard.tsx';
import { MobileLeg, MobileWait } from './MobileLeg.tsx';
import { TripOverview } from './TripOverview.tsx';

const DATES = tripDates();
const SNAPS: TripSnap[] = ['low', 'mid', 'high'];
/** 放開時手指的速度超過這個（px/ms）就算快速滑 */
const FLING = 0.5;

const nameOf = (p: Place | undefined) => (p ? p.name.zh || p.name.ja : '（不明）');

/** 三個高度（px），從 CSS 變數讀：低是固定的高度，中是可用高度的比例，高是可用高度減掉地圖露出的那條 */
function snapHeights(sheet: HTMLElement): Record<TripSnap, number> {
  const css = getComputedStyle(sheet);
  const avail = (sheet.offsetParent as HTMLElement | null)?.clientHeight ?? window.innerHeight;
  return {
    low: parseFloat(css.getPropertyValue('--m-sheet-low')) || 100,
    mid: avail * (parseFloat(css.getPropertyValue('--m-sheet-mid')) || 0.67),
    high: avail - (parseFloat(css.getPropertyValue('--m-map-min')) || 48),
  };
}

/** 拖把手：跟著手指改高度（直接改 style，不重畫），放開時決定停在哪 */
function useSheetDrag(sheetRef: React.RefObject<HTMLElement | null>) {
  const drag = useRef<{ y: number; h: number; t: number; lastY: number; lastT: number; moved: boolean; id: number } | null>(null);
  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const h = sheet.getBoundingClientRect().height;
    drag.current = { y: e.clientY, h, t: e.timeStamp, lastY: e.clientY, lastT: e.timeStamp, moved: false, id: e.pointerId };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    const sheet = sheetRef.current;
    if (!d || !sheet || e.pointerId !== d.id) return;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dy) < 4) return;
    d.moved = true;
    const hs = snapHeights(sheet);
    sheet.classList.add('dragging');
    sheet.style.height = `${Math.min(hs.high, Math.max(hs.low, d.h - dy))}px`;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
  };
  const end = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    const sheet = sheetRef.current;
    drag.current = null;
    if (!d || !sheet || e.pointerId !== d.id) return;
    const store = mobileStore.getState();
    const cur = SNAPS.indexOf(store.tripSnap);
    sheet.classList.remove('dragging');
    if (!d.moved) {
      // 點一下把手：低→中→高→中
      store.setSnap(cur === 2 ? 'mid' : SNAPS[cur + 1]);
      return;
    }
    const h = sheet.getBoundingClientRect().height;
    sheet.style.height = '';
    const v = (e.clientY - d.lastY) / Math.max(1, e.timeStamp - d.lastT) || (e.clientY - d.y) / Math.max(1, e.timeStamp - d.t);
    let next: TripSnap;
    if (Math.abs(v) > FLING) next = SNAPS[Math.min(2, Math.max(0, cur + (v < 0 ? 1 : -1)))];
    else {
      const hs = snapHeights(sheet);
      next = SNAPS.reduce((a, b) => (Math.abs(hs[b] - h) < Math.abs(hs[a] - h) ? b : a));
    }
    store.setSnap(next);
  };
  return { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end };
}

/** 一列時間軸（項目或空檔）：交通、等待、卡片；分組的那天各組一欄接著會合 */
function EntryRows({ entry, ctx }: { entry: TimelineEntry; ctx: RowCtx }) {
  const { tl, focused } = ctx;
  const { itDay: day } = tl;
  const byId = useData((s) => s.byId);
  const itinerary = useData((s) => s.itinerary);
  if (!day) return null;
  const p = entry.placeId ? byId.get(entry.placeId) : undefined;
  const key = focusKeyOf(entry);
  const mark = tl.marks.byEntry.get(entry) ?? null;
  const item = entry.itemId ? (findItemRef(itinerary, entry.itemId)?.item ?? null) : null;
  const visit: VisitItem | null = item?.type === 'visit' ? item : null;
  const warnCount = (list: EngineWarning[] | undefined) => list?.filter((w) => w.level !== 'info').length ?? 0;
  const leg = entry.kind !== 'start' && (
    <>
      <MobileLeg entry={entry} date={day.date} />
      <MobileWait entry={entry} visit={visit} />
    </>
  );

  if (entry.kind === 'start') {
    const i = itinerary?.days.findIndex((d) => d.date === day.date) ?? -1;
    const prevNight = i > 0 ? itinerary!.days[i - 1] : undefined;
    return (
      <MobileCard
        itemKey={key}
        place={p}
        mark={mark}
        time={{ text: cardTime(entry).text }}
        name={p ? nameOf(p) : '上一站'}
        tags={p?.type === 'lodging' ? <LodgingTags day={prevNight} place={p} reservationDate={null} editable={false} open={false} onOpenChange={() => {}} /> : null}
        focused={focused === key}
      />
    );
  }

  if (entry.kind === 'lodging') {
    return (
      <>
        {leg}
        <MobileCard
          itemKey={key}
          place={p}
          mark={mark}
          time={{ text: cardTime(entry).text }}
          name={p ? nameOf(p) : (entry.placeId ?? '')}
          tags={<LodgingTags day={day} place={p} reservationDate={day.date} editable={false} open={false} onOpenChange={() => {}} />}
          focused={focused === key}
        />
      </>
    );
  }

  if (entry.kind === 'meet' && entry.groups) {
    const split = item?.type === 'split' ? item : null;
    return (
      <>
        <li className="m-split" data-testid="m-split">
          <div className="m-split-head">👥 分組行動</div>
          {entry.groups.map((g) => {
            const sg = split?.groups.find((x) => x.id === g.id);
            return (
              <div key={g.id} className="m-group">
                <div className="m-group-name">
                  {g.name}
                  {sg && <span className="muted small"> {sg.size} 人</span>}
                </div>
                <ol className="m-tl">
                  {g.entries
                    .filter((e) => e.kind !== 'meet')
                    .map((e, i) => (
                      <EntryRows key={e.itemId ?? `${e.kind}${i}`} entry={e} ctx={ctx} />
                    ))}
                </ol>
              </div>
            );
          })}
        </li>
        <MobileCard itemKey={key} place={p} mark={mark} time={{ text: entry.start }} name={`🤝 會合：${p ? nameOf(p) : '（未定）'}`} focused={focused === key} />
      </>
    );
  }

  const flight = item?.type === 'flight' ? item : null;
  const time = cardTime(entry);
  const shownTime = flight ? (flight.direction === 'arrive' ? flight.arrive : flight.depart) : time.text;
  const name = flight ? `${flight.direction === 'arrive' ? '抵達' : '起飛'} ${nameOf(p)}` : entry.kind === 'free' ? `自由時間${p ? `：${nameOf(p)}` : ''}` : nameOf(p);
  return (
    <>
      {leg}
      <MobileCard
        itemKey={key}
        place={p}
        fallbackType={flight ? 'airport' : null}
        mark={mark}
        time={{ text: shownTime, pinned: !!visit?.start, stay: !flight && time.stay ? formatStay(time.stay) : null }}
        name={name}
        tags={visit ? <ItemTags visit={visit} kind={tagKindOf(p?.type)} date={day.date} placeId={entry.placeId} open={false} onOpenChange={() => {}} /> : null}
        warnings={warnCount(shownWarnings(entry.itemId ? tl.byItem.get(entry.itemId) : undefined, entry.placeId, true))}
        focused={focused === key}
      />
    </>
  );
}

interface RowCtx {
  tl: DayTimeline;
  focused: string | null;
}

/** 空檔（「住宿（未排）」這類）：一行字 */
function GapRow({ row }: { row: Extract<TimelineRow, { kind: 'gap' }> }) {
  if (row.gap.kind === 'idle') return null;
  return (
    <li className="m-gap" data-testid="tl-gap">
      🏨 {row.gap.label}
    </li>
  );
}

/** 某一天：標題、摘要、時間條、時間軸、候選 */
function DayView({ date }: { date: string }) {
  const tl = useDayTimeline(date);
  const planning = useApp((s) => s.planning);
  const focused = useMobile((s) => s.focused);
  const legOpen = useUi((s) => s.legOpen);
  const byId = useData((s) => s.byId);
  const { itDay, plan } = tl;
  const ctx: RowCtx = { tl, focused };
  const barSelected = legOpen?.startsWith(`${date}:`) ? legOpen : focused;
  return (
    <div className="m-dayview" data-testid="m-dayview">
      <div className="m-dayhead">
        <h2 className={`m-dayhead-title ${isRedDay(date) ? 'red-day' : ''}`} data-testid="m-trip-title">
          {dayLabel(date)}第 {DATES.indexOf(date) + 1} 天
        </h2>
        {/* ✨ 半屏聊天：Task 12 接上 */}
        <button type="button" className="m-icon-button" aria-label="問 AI 這天" data-testid="m-trip-ai">
          ✨
        </button>
        {!planning && (
          <button type="button" className="m-edit-button" onClick={() => openDialog({ kind: 'planning' })} data-testid="m-trip-edit">
            ✏️ 編輯
          </button>
        )}
      </div>
      {plan && (
        <div className="m-daysum">
          <DaySummaryLine plan={plan} />
        </div>
      )}
      {plan && <DayBar plan={plan} selected={barSelected} compact />}
      {!itDay && <p className="muted">行程裡沒有這一天。</p>}
      {itDay && tl.status === 'loading' && <p className="muted">計算時間軸中…</p>}
      {tl.status === 'error' && <p className="warn">時間軸算不出來：{tl.error}</p>}
      {itDay && plan && (
        <ol className="m-tl" data-testid="m-timeline">
          {tl.rows.map((row, i) =>
            row.kind === 'gap' ? (
              <GapRow key={`g${i}`} row={row} />
            ) : (
              <Fragment key={row.entry.itemId ? `i:${row.entry.itemId}` : `${row.entry.kind}:${i}`}>
                <EntryRows entry={row.entry} ctx={ctx} />
              </Fragment>
            ),
          )}
        </ol>
      )}
      {itDay && plan && itDay.items.length === 0 && (
        <p className="muted small m-trip-empty" data-testid="m-trip-empty">
          這天還沒排。到 ❤️ 想去把想去的點加到這天。
        </p>
      )}
      {itDay && <Candidates tl={tl} focused={focused} byId={byId} />}
    </div>
  );
}

/** 這天的候選：放在時間軸下面，虛線框、寫加的人 */
function Candidates({ tl, focused, byId }: { tl: DayTimeline; focused: string | null; byId: Map<string, Place> }) {
  return (
    <section className="m-cands" data-testid="m-cands">
      <h3 className="m-cands-head">
        候選{tl.candidates.length > 0 && <span className="m-count">{tl.candidates.length}</span>}
      </h3>
      {tl.candidates.length === 0 ? (
        <p className="muted small">在想去按「加到某天」，就會出現在這裡。</p>
      ) : (
        <ul className="m-tl m-cand-list">
          {tl.candidates.map((c) => {
            const key = `cand:${c.id}`;
            const p = byId.get(c.placeId);
            return <MobileCard key={c.id} itemKey={key} place={p} name={p ? nameOf(p) : c.placeId} addedBy={<MemberName id={c.addedBy} />} focused={focused === key} />;
          })}
        </ul>
      )}
    </section>
  );
}

export function DaySheet() {
  const day = useApp((s) => s.day);
  const snap = useMobile((s) => s.tripSnap);
  const focused = useMobile((s) => s.focused);
  const sheetRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const drag = useSheetDrag(sheetRef);

  // 選了一張卡：清單捲到那張卡（放在清單最上面一點）
  useEffect(() => {
    const body = bodyRef.current;
    if (!focused || !body) return;
    const card = body.querySelector<HTMLElement>(`[data-item="${CSS.escape(focused)}"]`);
    if (!card) return;
    const top = card.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 8;
    body.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [focused]);

  // 換天：從最上面開始
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [day]);

  return (
    <section className="m-trip-sheet" ref={sheetRef} data-testid="m-sheet" data-snap={snap} aria-label="行程">
      <div className="m-trip-grab" data-testid="m-sheet-grab" aria-label="拖動調整高度" {...drag}>
        <span aria-hidden />
      </div>
      <DayStrip />
      <div className="m-trip-body" ref={bodyRef}>
        {day === 'all' ? <TripOverview /> : <DayView date={day} />}
      </div>
    </section>
  );
}
