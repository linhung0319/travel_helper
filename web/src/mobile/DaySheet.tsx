// 手機版行程的面板（第六輪 §3.5）：蓋在地圖下半部，可以拉，停在三個高度（mobileStore.tripSnap；高度在 mobile.css 的 CSS 變數）：
// 低（只露出天數列）、中（預設，地圖約佔上面 1/3）、高（地圖剩一小條）。拖把手換高度：放開時停在最近的高度，快速往上／往下滑就往那邊切一格。
// 面板裡由上到下：把手、天數列（DayStrip）、選「全部」時是整趟（TripOverview），選某天時是這天的標題（✨、✏️ 編輯）、摘要、時間條（變矮）、
// 時間軸（MobileCard、MobileLeg，資料準備和網頁版共用 Timeline.tsx 的 useDayTimeline）、這天的候選（候選樣式的 MobileCard）。
// 選了一張卡（focusItem）：清單捲到那張卡。✨ 的半屏聊天是 Task 12。
// 編輯中：面板拉到高、最上面是藍色的編輯條（網頁版第五輪的 PlanningBar，手機用 m-edit-bar：「✏️ 編輯 2/3（三）」加「完成」）和別人改過了的提示（ConflictBar）；
// 每張卡有把手（長按拖曳）、⋯（底部動作面板 ActionSheet，動作的 ctx 在這裡算），時間軸最後多一個放置區，候選區收拖回來的備卡。
// 結束編輯、換天時關掉動作面板；結束編輯時面板回到中間。
// 重疊卡（有備卡）用 ‹ n/m › 換著看（同網頁版）：看備卡時卡片顯示那張的縮圖、名稱、時間，⋯ 的主要、拿出和拖曳都作用在那張。

import { Fragment, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { EngineWarning, TimelineEntry, VisitItem } from '@travel-helper/engine';
import { useApp, useData, useShared, useUi } from '../hooks.ts';
import { openDialog } from '../uiStore.ts';
import { cardTime, findItemRef, formatStay, shownWarnings, type TimelineRow } from '../lib/planView.ts';
import { dayLabel, isRedDay, tripDates } from '../lib/trip.ts';
import type { Place } from '../data/types.ts';
import { DayBar, DaySummaryLine, useDayTimeline, type DayTimeline } from '../components/Timeline.tsx';
import { ItemTags, LodgingTags, tagKindOf } from '../components/ItemTags.tsx';
import { MemberName } from '../components/common.tsx';
import { ConflictBar, PlanningBar } from '../components/Planning.tsx';
import { groupTargetsOf } from '../components/cardActionRun.ts';
import { dropOnCandidatesProps, dropOnEndProps } from '../components/planDrag.ts';
import type { DragSource } from '../lib/dropIntent.ts';
import { focusKeyOf, mobileStore, useMobile, type ActionSheetSpec, type ActionView, type TripSnap } from './mobileStore.ts';
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

/** 一列時間軸（項目或空檔）：交通、等待、卡片；分組的那天各組一欄接著會合 */
function EntryRows({ entry, ctx }: { entry: TimelineEntry; ctx: RowCtx }) {
  const { tl, focused } = ctx;
  const { itDay: day } = tl;
  const byId = useData((s) => s.byId);
  const itinerary = useData((s) => s.itinerary);
  const planning = useApp((s) => s.planning);
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
          name={name}
          tags={<LodgingTags day={day} place={p} reservationDate={day.date} editable={planning} open={false} onOpenChange={openSub(menu, 'lodging-plan')} />}
          focused={focused === key}
          menu={menu}
        />
      </>
    );
  }

  if (entry.kind === 'meet' && entry.groups) {
    const split = item?.type === 'split' ? item : null;
    return (
      <>
        <li className="m-split" data-testid="m-split">
          <div className="m-split-head">
            <span>👥 分組行動</span>
            {planning && split && (
              <button
                type="button"
                className="m-card-menu"
                aria-label="分組的動作"
                aria-haspopup="menu"
                onClick={() => mobileStore.getState().openActions({ ctx: { kind: 'split', surface: 'mobile' }, target: { date: day.date, itemId: split.id }, name: '分組行動', placeId: null })}
                data-testid="m-split-menu"
              >
                ⋯
              </button>
            )}
          </div>
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
  const free = item?.type === 'free' ? item : null;
  const name = flight ? `${flight.direction === 'arrive' ? '抵達' : '起飛'} ${nameOf(p)}` : entry.kind === 'free' ? `自由時間${p ? `：${nameOf(p)}` : ''}` : nameOf(p);
  const ref = item ? findItemRef(itinerary, item.id) : null;
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
  // 動作面板：造訪、自由時間才有（航班沒有）；看主卡時「👑 主要」不能點
  const menu: ActionSheetSpec | null =
    item && (visit || free)
      ? {
          ctx: { kind: visit ? 'visit' : 'free', overlap, pinned: !!visit?.start, groupTargets: groupTargetsOf(itinerary, item.id), inGroup: !!ref?.split, surface: 'mobile' },
          target: { date: day.date, itemId: item.id, optionIndex: index, placeId: shownPlace ?? undefined, start: entry.start },
          name: shownName,
          placeId: shownPlace,
          disabled: overlap && !backup ? ['main'] : [],
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
        time={{ text: backup ? entry.start : shownTime, pinned: !backup && !!visit?.start, stay: !flight && stayMin ? formatStay(stayMin) : null }}
        name={shownName}
        tags={visit ? <ItemTags visit={visit} kind={tagKindOf(p?.type)} date={day.date} placeId={shownPlace} open={false} onOpenChange={menu ? openSub(menu, 'tags') : () => {}} /> : null}
        warnings={warnCount(shownWarnings(entry.itemId ? tl.byItem.get(entry.itemId) : undefined, shownPlace, !backup))}
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
          {planning && (
            <li className="m-dropend small muted" data-testid="m-dropend" {...dropOnEndProps(date, true)}>
              拖到這裡：放在這天的最後
            </li>
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

/** 編輯中最上面的藍條（網頁版第五輪的 PlanningBar：「✏️ 編輯 2/3（三）」加「完成」）和別人改過了的提示 */
function EditBar({ day }: { day: string }) {
  return (
    <div className="m-edit-top">
      <PlanningBar title={day === 'all' ? '✏️ 編輯中' : `✏️ 編輯 ${dayLabel(day)}`} className="m-edit-bar" compact />
      <ConflictBar />
    </div>
  );
}

/** 進編輯：面板拉到高；結束編輯：關掉動作面板、面板回到中間；換天：關掉動作面板 */
function useEditingSheet() {
  const planning = useApp((s) => s.planning);
  const day = useApp((s) => s.day);
  const first = useRef(true);
  useEffect(() => {
    const m = mobileStore.getState();
    if (planning) m.setSnap('high');
    else {
      m.closeActions();
      // 第一次掛上（本來就不在編輯中）不動面板
      if (!first.current) m.setSnap('mid');
    }
    first.current = false;
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
      <EditBar day={day} />
      <DayStrip />
      <div className="m-trip-body" ref={bodyRef}>
        {day === 'all' ? <TripOverview /> : <DayView date={day} />}
      </div>
    </section>
  );
}
