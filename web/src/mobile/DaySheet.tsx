// 手機版行程的面板（第六輪 §3.5，第七輪 Task 8）：蓋在地圖下半部，可以拉，停在三個高度（mobileStore.tripSnap；高度在 mobile.css 的 CSS 變數）：
// 低（只露出天數列）、中（預設，地圖約佔上面 1/3）、高（地圖剩一小條）。拖把手換高度：放開時停在最近的高度，快速往上／往下滑就往那邊切一格。
// 面板裡由上到下：把手、日期列（DayStrip）固定在上面，往下捲也看得到；選「整趟」時是整趟（TripOverview），選某天時是這天的標題
// （圓體的大日期加「週五 · 第 4 天 · 鳥羽」、✦ 問 AI、編輯；這一列也固定，position: sticky）、摘要（提醒鈕點開列整天的，T74b）、時間條（變矮）、
// 時間軸（MobileCard、MobileLeg，資料準備和網頁版共用 Timeline.tsx 的 useDayTimeline）、這天的候選（候選樣式的 MobileCard）。
// 選了一張卡（focusItem）：清單捲到那張卡（不改面板高度）。點卡片原地展開（mobileStore.expanded）。
// 編輯中：最上面是墨色的編輯條（PlanningBar：「編輯 2/3」、問 AI、討論、上一步、「完成」）和別人改過了的提示（ConflictBar）；按「編輯」不改面板高度；
// 每張卡有把手（長按拖曳）、⋯（底部動作面板 ActionSheet，動作的 ctx 在這裡算），時間軸最後多一個放置區，候選區收拖回來的備卡。
// 結束編輯、換天時關掉動作面板。半屏聊天（ChatSheet）開著時，這個面板藏起來（高度不變），聊天關掉就回來。
// 有提議時最上面是提議列（ProposalStrip，§16.2）；看差異時時間軸唯讀、顯示提議後的時間，提議的卡加膠囊，被換掉的變淡、劃掉。
// 重疊卡（有備卡）用 ‹ n/m › 換著看（同網頁版）：看備卡時卡片顯示那張的縮圖、名稱、時間，⋯ 的主要、拿出和拖曳都作用在那張。

import { lodgingMealsOn } from '@travel-helper/engine';
import { Fragment, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { TimelineEntry, VisitItem } from '@travel-helper/engine';
import { useApp, useData, useShared, useUi } from '../hooks.ts';
import { Icon } from '../components/Icon.tsx';
import { openDialog } from '../uiStore.ts';
import { cardTime, findItemRef, formatStay, needsStart, shownWarnings, stayNight, type TimelineRow } from '../lib/planView.ts';
import { tripName } from '../lib/labels.ts';
import { isRedDay, shortDayLabel } from '../lib/trip.ts';
import { dayAreaTitle, dayTitle } from '../lib/dayTitle.ts';
import { NightLine } from '../shared/ui/NightLine.tsx';
import type { Place } from '../data/types.ts';
import { DayBar, DayReminders, DaySummaryLine, GhostRow, useDayTimeline, useProposalDay, useRevealProposal, type DayTimeline } from '../components/Timeline.tsx';
import { TimelineDiffContext, useEditing, useTimelineDiff } from '../components/timelineEdit.ts';
import { ProposalStrip } from '../components/ProposalStrip.tsx';
import { ItemTags, LodgingTags, tagKindOf } from '../components/ItemTags.tsx';
import { DayStartMissing } from '../shared/ui/DayStartMissing.tsx';
import { MemberName } from '../components/common.tsx';
import { ConflictBar, PlanningBar } from '../components/Planning.tsx';
import { dropOnCandidatesProps, dropOnEndProps } from '../components/planDrag.ts';
import type { DragSource } from '../lib/dropIntent.ts';
import { focusKeyOf, mobileStore, useMobile, type ActionSheetSpec, type ActionView, type TripSnap } from './mobileStore.ts';
import { DayStrip } from '../shared/ui/DayStrip.tsx';
import { Button } from '../shared/ui/Button.tsx';
import { DiscussButton } from '../shared/ui/DiscussButton.tsx';
import { MobileCard } from './MobileCard.tsx';
import { MobileLeg, MobileWait } from './MobileLeg.tsx';
import { askDay, askEmptyDay } from './mobileAi.ts';
import { DayEmpty } from '../shared/ui/EmptyStates.tsx';
import { TripOverview } from './TripOverview.tsx';
import { TimelineSkeleton } from '../shared/ui/Skeleton.tsx';

const SNAPS: TripSnap[] = ['low', 'mid', 'high'];
/** 放開時手指的速度超過這個（px/ms）就算快速滑 */
const FLING = 0.5;

/** 卡片上的名稱：去掉全形括號（T74b） */
const nameOf = (p: Place | undefined) => tripName(p) ?? '（不明）';

/** 三個高度（px），從 CSS 變數讀：低是固定的高度，中是可用高度的比例，高是可用高度減掉地圖露出的那條 */
function snapHeights(sheet: HTMLElement): Record<TripSnap, number> {
  const css = getComputedStyle(sheet);
  const avail = (sheet.offsetParent as HTMLElement | null)?.clientHeight ?? window.innerHeight;
  return {
    low: parseFloat(css.getPropertyValue('--m-sheet-low')) || 112,
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

/** 一列時間軸（項目或空檔）：交通、等待、卡片 */
function EntryRows({ entry, ctx }: { entry: TimelineEntry; ctx: RowCtx }) {
  const { tl, focused } = ctx;
  const { itDay: day } = tl;
  const byId = useData((s) => s.byId);
  const confirmed = useData((s) => s.itinerary);
  // 看提議的差異時，卡片讀提議後的行程，編輯的東西都不畫（§16.2）
  const diff = useTimelineDiff();
  const itinerary = diff?.itinerary ?? confirmed;
  const planning = useEditing();
  const proposed = !!entry.itemId && !!diff?.marked.has(entry.itemId);
  const pill = proposed || (entry.kind === 'lodging' && diff?.lodging) ? (
    <span className="tl-proposal-pill" data-testid="proposal-pill">
      提議
    </span>
  ) : null;
  // 重疊卡（有備卡）正在看第幾個選項（null＝主卡）；主卡換了、選項增減時回到看主卡
  const [shown, setShown] = useState<number | null>(null);
  const optItem = entry.itemId ? findItemRef(itinerary, entry.itemId)?.item : null;
  const optKey = optItem?.type === 'visit' ? `${optItem.selected}/${optItem.options.length}` : '';
  useEffect(() => setShown(null), [optKey]);
  if (!day) return null;
  /** 標籤那一排（編輯中）打開動作面板的某個子畫面 */
  const openSub = (menu: ActionSheetSpec, view: ActionView) => (open: boolean) => open && mobileStore.getState().openActions({ ...menu, view });
  const p = entry.placeId ? byId.get(entry.placeId) : undefined;
  const key = focusKeyOf(entry);
  const mark = tl.marks.byEntry.get(entry) ?? null;
  const item = entry.itemId ? (findItemRef(itinerary, entry.itemId)?.item ?? null) : null;
  const visit: VisitItem | null = item?.type === 'visit' ? item : null;
  const leg = entry.kind !== 'start' && (
    <>
      <MobileLeg entry={entry} date={day.date} />
      <MobileWait entry={entry} visit={visit} />
    </>
  );

  if (entry.kind === 'start') {
    const i = itinerary?.days.findIndex((d) => d.date === day.date) ?? -1;
    const prevDate = i > 0 ? itinerary!.days[i - 1].date : null;
    return (
      <MobileCard
        itemKey={key}
        place={p}
        mark={mark}
        time={{ text: cardTime(entry).text }}
        name={p ? nameOf(p) : '上一站'}
        tags={p?.type === 'lodging' ? <LodgingTags meals={prevDate ? lodgingMealsOn(itinerary, prevDate) : null} place={p} reservationDate={prevDate} editable={false} open={false} onOpenChange={() => {}} /> : null}
        focused={focused === key}
      />
    );
  }

  if (entry.kind === 'lodging') {
    const name = p ? nameOf(p) : (entry.placeId ?? '');
    const menu: ActionSheetSpec = { ctx: { kind: 'lodging-end', surface: 'mobile' }, target: { date: day.date, placeId: entry.placeId ?? undefined }, name, placeId: entry.placeId };
    return (
      <>
        {leg}
        <MobileCard
          itemKey={key}
          place={p}
          mark={mark}
          time={{ text: cardTime(entry).text }}
          pill={pill}
          proposed={!!pill}
          name={name}
          tags={<LodgingTags meals={lodgingMealsOn(itinerary, day.date)} place={p} reservationDate={day.date} night={stayNight(itinerary, day.date)} editable={planning} open={false} onOpenChange={openSub(menu, 'lodging-plan')} />}
          focused={focused === key}
          menu={menu}
        />
      </>
    );
  }

  const flight = item?.type === 'flight' ? item : null;
  const time = cardTime(entry);
  const shownTime = flight ? (flight.direction === 'arrive' ? flight.arrive : flight.depart) : time.text;
  const free = item?.type === 'free' ? item : null;
  const name = flight ? `${flight.direction === 'arrive' ? '抵達' : '起飛'} ${nameOf(p)}` : entry.kind === 'free' ? `自由時間${p ? `：${nameOf(p)}` : ''}` : nameOf(p);
  const n = visit?.options.length ?? 0;
  const overlap = n > 1;
  // 看的是哪個選項（重疊卡用 ‹ n/m › 換著看，同網頁版）；看備卡時縮圖、名稱、時間、停留、警告換成那張，⋯ 的主要、拿出作用在那張
  const index = visit ? (shown != null && shown < n ? shown : visit.selected) : undefined;
  const backup = !!visit && index !== visit.selected;
  const option = visit && index != null ? visit.options[index] : undefined;
  const sp = backup && option ? byId.get(option.place) : p;
  const shownPlace = backup && option ? option.place : entry.placeId;
  const shownName = backup ? nameOf(sp) : name;
  const go = (d: number) => setShown(((index ?? 0) + d + n) % n);
  const switcher = overlap ? (
    <span className="m-option-switch" data-testid="m-option-switch" data-shown={index}>
      <button type="button" aria-label="上一個" onClick={() => go(-1)} data-testid="option-prev">
        ‹
      </button>
      <span>
        {(index ?? 0) + 1}/{n}
      </span>
      <button type="button" aria-label="下一個" onClick={() => go(1)} data-testid="option-next">
        ›
      </button>
    </span>
  ) : null;
  // 動作面板：造訪、自由時間才有（航班沒有）；看主卡時「👑 主要」不能點，看備卡時「⏱ 改停留時間」不能點（只改得到主卡，同網頁版備卡的停留唯讀）
  const menu: ActionSheetSpec | null =
    item && (visit || free)
      ? {
          ctx: { kind: visit ? 'visit' : 'free', overlap, pinned: !!visit?.start, surface: 'mobile' },
          target: { date: day.date, itemId: item.id, optionIndex: index, placeId: shownPlace ?? undefined, start: entry.start },
          name: shownName,
          placeId: shownPlace,
          disabled: overlap ? [backup ? 'stay' : 'main'] : [],
        }
      : null;
  // 拖的東西：看備卡時是那張備卡，不然整張卡（同網頁版）
  const drag: DragSource | null =
    item && (visit || free)
      ? backup && index != null
        ? { kind: 'option', itemId: item.id, index, placeType: sp?.type ?? null }
        : { kind: 'item', itemId: item.id, placeType: visit ? (p?.type ?? null) : null, options: n || 1 }
      : null;
  const stayMin = backup ? (option?.stayMinutes ?? null) : time.stay;
  return (
    <>
      {leg}
      <MobileCard
        itemKey={key}
        place={sp}
        fallbackType={flight ? 'airport' : null}
        menu={menu}
        switcher={switcher}
        drag={drag}
        drop={drag && item ? { kind: 'card', itemId: item.id, placeType: visit ? (p?.type ?? null) : null, isFlight: false } : null}
        mark={mark}
        pill={pill}
        proposed={proposed}
        time={{ text: backup ? entry.start : shownTime, pinned: !backup && !!visit?.start, stay: !flight && stayMin ? formatStay(stayMin) : null }}
        name={shownName}
        tags={visit ? <ItemTags visit={visit} kind={tagKindOf(p?.type)} date={day.date} placeId={shownPlace} open={false} onOpenChange={menu ? openSub(menu, 'tags') : () => {}} /> : null}
        warnings={shownWarnings(entry.itemId ? tl.byItem.get(entry.itemId) : undefined, shownPlace, !backup) ?? null}
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
      <Icon name="bed" size={16} /> {row.gap.label}
    </li>
  );
}

/** 某一天：標題、摘要、時間條、時間軸、候選 */
function DayView({ date }: { date: string }) {
  // 看提議的差異：顯示提議後的時間，唯讀；按「看原本」或「編輯」回到真的時間軸（§16.2）
  const shown = useProposalDay(date);
  const tl = useDayTimeline(date, shown?.source);
  const reallyPlanning = useApp((s) => s.planning);
  const planning = reallyPlanning && !shown;
  const dayRef = useRef<HTMLDivElement>(null);
  const focused = useMobile((s) => s.focused);
  const legOpen = useUi((s) => s.legOpen);
  const byId = useData((s) => s.byId);
  const itinerary = useData((s) => s.itinerary);
  const areas = useData((s) => s.areas);
  // 摘要列的提醒鈕點開列這天所有的（T74b，同網頁）
  const [warnOpen, setWarnOpen] = useState(false);
  const title = dayTitle(date, dayAreaTitle(itinerary, date, byId, areas));
  const { itDay, plan } = tl;
  useRevealProposal(dayRef, date, !!shown, plan);
  const ctx: RowCtx = { tl, focused };
  const barSelected = legOpen?.startsWith(`${date}:`) ? legOpen : focused;
  const timeOf = (itemId: string) => {
    const e = shown?.originalPlan?.entries.find((x) => x.itemId === itemId);
    return e ? cardTime(e).text : null;
  };
  const ghostsBefore = (id: string | null) => shown?.diff.ghosts.filter((g) => g.beforeItemId === id).map((g) => <GhostRow key={`ghost:${g.itemId}`} ghost={g} date={date} time={timeOf(g.itemId)} thumb={56} />) ?? [];
  const tailShown = tl.rows.some((r) => r.kind !== 'gap' && r.entry.kind === 'lodging');
  return (
    <div className="m-dayview" data-testid="m-dayview" ref={dayRef}>
      {/* 編輯中這一排不畫（編輯條已經寫了日期，問 AI 也在編輯條上）；看提議的差異時也不畫：按「編輯」提議的卡會不見，要編輯先按「看原本」 */}
      {!reallyPlanning && !shown && (
      <div className="m-dayhead">
        <h2 className={`m-dayhead-title ${isRedDay(date) ? 'red-day' : ''}`} data-testid="m-trip-title">
          <span className="m-dayhead-date">{title.date}</span>
          <span className="m-dayhead-sub">{title.week}</span>
          {title.area && <span className="m-dayhead-area"> · {title.area}</span>}
        </h2>
        {/* 半屏聊天（ChatSheet） */}
        <Button kind="secondary" size="sm" icon="spark" className="m-ask-day" aria-label="問 AI 這天" onClick={() => askDay(date)} data-testid="m-trip-ai">
          問 AI
        </Button>
        <DiscussButton variant="white" />
        <Button kind="primary" size="sm" icon="pen" onClick={() => openDialog({ kind: 'planning' })} data-testid="m-trip-edit">
          編輯
        </Button>
      </div>
      )}
      {!reallyPlanning && !shown && (
        <div className="m-nightline">
          <NightLine date={date} />
        </div>
      )}
      {plan && (
        <div className="m-daysum">
          <DaySummaryLine plan={plan} warnOpen={warnOpen} onWarn={() => setWarnOpen((o) => !o)} />
          {warnOpen && <DayReminders plan={plan} />}
        </div>
      )}
      {plan && <DayBar plan={plan} selected={barSelected} compact />}
      {!itDay && <p className="muted">行程裡沒有這一天。</p>}
      {itDay && tl.status === 'loading' && <TimelineSkeleton />}
      {tl.status === 'error' && <p className="warn">時間軸算不出來：{tl.error}</p>}
      {itDay && plan && (
        <TimelineDiffContext.Provider value={shown?.diff ?? null}>
          <ol className={`m-tl tl-axis ${planning ? 'in-planning' : ''}`} data-testid="m-timeline">
            {needsStart(plan) && <DayStartMissing />}
            {tl.rows.map((row, i) =>
              row.kind === 'gap' ? (
                <GapRow key={`g${i}`} row={row} />
              ) : (
                <Fragment key={row.entry.itemId ? `i:${row.entry.itemId}` : `${row.entry.kind}:${i}`}>
                  {row.entry.itemId ? ghostsBefore(row.entry.itemId) : row.entry.kind === 'lodging' ? ghostsBefore(null) : null}
                  <EntryRows entry={row.entry} ctx={ctx} />
                </Fragment>
              ),
            )}
            {!tailShown && ghostsBefore(null)}
            {planning && (
              <li className="m-dropend small muted" data-testid="m-dropend" {...dropOnEndProps(date, true)}>
                拖到這裡：放在這天的最後
              </li>
            )}
          </ol>
        </TimelineDiffContext.Provider>
      )}
      {itDay && plan && itDay.items.length === 0 && (
        <DayEmpty date={date} onAsk={() => askEmptyDay(date)} onWish={() => mobileStore.getState().setTab('wish')} testId="m-trip-empty" />
      )}
      {itDay && <Candidates tl={tl} focused={focused} byId={byId} />}
    </div>
  );
}

/** 這天的候選：放在時間軸下面，虛線框、寫加的人 */
function Candidates({ tl, focused, byId }: { tl: DayTimeline; focused: string | null; byId: Map<string, Place> }) {
  const planning = useApp((s) => s.planning);
  const me = useShared((s) => s.me?.id);
  const date = tl.itDay?.date ?? '';
  return (
    <section className="m-cands" data-testid="m-cands" {...dropOnCandidatesProps(date, planning)}>
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
            const name = p ? nameOf(p) : c.placeId;
            // 候選的 ⋯：排進這天、（自己加的）移到第幾天、刪除；住宿的候選不能拖（會換掉那晚的住宿，要用 ⋯ 的排進這天確認）
            const menu: ActionSheetSpec = { ctx: { kind: 'candidate', mine: c.addedBy === me, surface: 'mobile' }, target: { date, candidateId: c.id, placeId: c.placeId }, name, placeId: c.placeId };
            const drag: DragSource | null = p?.type === 'lodging' ? null : { kind: 'candidate', candidateId: c.id, placeId: c.placeId, placeType: p?.type ?? null };
            return <MobileCard key={c.id} itemKey={key} place={p} name={name} addedBy={<MemberName id={c.addedBy} />} focused={focused === key} menu={menu} drag={drag} />;
          })}
        </ul>
      )}
    </section>
  );
}

/** 編輯中最上面的藍條（網頁版第五輪的 PlanningBar：「編輯 2/3（三）」加「完成」）和別人改過了的提示 */
function EditBar({ day }: { day: string }) {
  return (
    <div className="m-edit-top">
      <PlanningBar
        title={day === 'all' ? '編輯中' : `編輯 ${shortDayLabel(day)}`}
        className="m-edit-bar"
        compact
        extra={
          // 半屏聊天（ChatSheet），編輯中也打得開
          day !== 'all' && (
            <button type="button" className="text-button m-edit-ask" aria-label="問 AI 這天" title="問 AI 這天" onClick={() => askDay(day)} data-testid="m-trip-ai">
              <Icon name="spark" size={20} />
            </button>
          )
        }
      />
      <ConflictBar />
    </div>
  );
}

/** 結束編輯、換天：關掉動作面板（按「編輯」不改面板高度） */
function useEditingSheet() {
  const planning = useApp((s) => s.planning);
  const day = useApp((s) => s.day);
  useEffect(() => {
    if (!planning) mobileStore.getState().closeActions();
  }, [planning]);
  useEffect(() => {
    mobileStore.getState().closeActions();
  }, [day]);
}

export function DaySheet() {
  const day = useApp((s) => s.day);
  const snap = useMobile((s) => s.tripSnap);
  useEditingSheet();
  const focused = useMobile((s) => s.focused);
  // 半屏聊天開著：面板藏起來，高度不變
  const planning = useApp((s) => s.planning);
  const covered = useMobile((s) => s.chatSheet && s.tab === 'trip');
  const sheetRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const drag = useSheetDrag(sheetRef);

  // 選了一張卡：清單捲到那張卡（放在清單最上面一點）
  useEffect(() => {
    const body = bodyRef.current;
    if (!focused || !body) return;
    const card = body.querySelector<HTMLElement>(`[data-item="${CSS.escape(focused)}"]`);
    if (!card) return;
    // 固定在上面的標題那一列要讓出來
    const head = body.querySelector<HTMLElement>('.m-dayhead')?.offsetHeight ?? 0;
    const top = card.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - head - 8;
    body.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [focused]);

  // 換天：從最上面開始
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [day]);

  return (
    <section className="m-trip-sheet" ref={sheetRef} data-testid="m-sheet" data-snap={snap} data-covered={covered || undefined} aria-label="行程">
      <div className="m-trip-grab" data-testid="m-sheet-grab" aria-label="拖動調整高度" {...drag}>
        <span aria-hidden />
      </div>
      <ProposalStrip onTrip />
      <EditBar day={day} />
      {/* 編輯中墨色編輯條取代日期列：編輯中不能換天 */}
      {!planning && <DayStrip />}
      <div className="m-trip-body" ref={bodyRef}>
        {day === 'all' ? <TripOverview /> : <DayView date={day} />}
      </div>
    </section>
  );
}
