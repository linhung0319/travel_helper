// 這一天的時間軸（interaction-design §3、§6、第五輪 §2）：引擎算好的項目、相鄰兩點之間的交通、等待、警告。
// 手機是直的清單，電腦放在地圖下方。左邊一條虛線從一張資料卡串到下一張，交通卡在虛線右邊（右緣和資料卡對齊）。
// 點項目地圖跳過去；到了要等（📌、還沒開門）時交通卡下面一條黃色虛框的「⏳ 幾點到，等 N 分（原因）」，純文字、不能點。
// 資料卡只顯示要看的（設計 §6）：左邊類型色塊（宿／景／餐／站／機／點）、時間（開始–結束）、停留時間（X小時MM分）、名稱、標籤、❤️ 頭像、⚠ 數。
// 資料卡固定四欄（第六輪 §2.2）：把手欄（編輯中每張卡都留，宿的卡也是）、類型色塊、內容、右邊動作欄（上面編號、下面 ⋯），所以色塊、⋯ 上下對齊。
// 卡片底色是類型的淡色；起點、終點的住宿和造訪是同樣的卡片（只寫一個時間）。有備卡的卡片（重疊卡）疊著淡色卡、‹ n/m › 換著看。
// 編輯中才有：停留時間 −／＋、點時間固定開始（📌）、點標籤那一排開標籤彈窗（ItemTags.tsx）、
// 「⋯」動作選單（ActionMenu.tsx，動作照 shared/cardActions.ts：重疊卡的主要、拿出，標籤、釘選、移到第幾天、移進／移出分組、撤下；
// 回住宿的這晚的方案、清掉住宿；自由時間、分組的刪除）。出發的住宿、航班沒有「⋯」；有地點的卡沒有刪除（要先撤下回候選）。
// 拖卡片（電腦版拖、手機長按後拖）：放在卡片中間合併、邊緣換順序；看備卡時拖的是那張備卡。
// 看備卡時預約 tag、警告跟著那張備卡；「⋯」的主要、拿出作用在那張備卡，其他動作作用在整張卡片。

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { fromMinutes, setStart, setStay, toMinutes, type DayPlan, type EngineWarning, type Gap, type TimelineEntry } from '@travel-helper/engine';
import type { ItineraryDay, ItineraryItem, VisitItem } from '@travel-helper/engine/types';
import { appStore } from '../store.ts';
import { commands } from '../appCommands.ts';
import { shared } from '../appShared.ts';
import { useApp, useData, useIsDesktop } from '../hooks.ts';
import { dragSourceProps, dropOnCardProps, dropOnEndProps, useLongPressDrag } from './planDrag.ts';
import type { DragSource } from '../lib/dropIntent.ts';
import { openDialog } from '../uiStore.ts';
import { cardTime, cardTypeLetter, dayBar, daySummary, findItemRef, formatStay, formatTravelTotal, hourTicks, isBarSelected, shownWarnings, stopMarks, timelineRows, waitNote, WARNING_ICONS, warningsByItem, type BarSegment } from '../lib/planView.ts';
import { TYPE_COLORS } from '../lib/typeStyle.ts';
import type { Place } from '../data/types.ts';
import { AvatarStack, PlaceChip } from './common.tsx';
import { LegRow } from './LegRow.tsx';
import { ItemTags, LodgingTags, tagKindOf } from './ItemTags.tsx';
import { ActionMenu } from './ActionMenu.tsx';
import { groupTargetsOf } from './cardActionRun.ts';
import { useLiked } from '../shared/placeLists.ts';
import { pulseMark } from '../lib/mapPulse.ts';

/** 地圖上同一個編號（0、1、2…）；顏色是那個點的類型色 */
interface Marks {
  byEntry: Map<TimelineEntry, string>;
}

/** 車站、機場、使用者加的點、沒有資料的點：中性灰 */
const NEUTRAL_COLOR = '#6e7781';

/** 類型色塊、編號圓圈的顏色：景點、住宿、餐廳用類型色，其他中性灰 */
function typeColor(type: Place['type'] | null | undefined): string {
  return type === 'spot' || type === 'lodging' || type === 'restaurant' ? TYPE_COLORS[type] : NEUTRAL_COLOR;
}

/** 資料卡（和候選卡）左邊的類型色塊：宿、景、餐、站、機、點 */
export function CardType({ type }: { type: Place['type'] | 'airport' | null }) {
  return (
    <span className="tl-card-type" style={{ background: typeColor(type === 'airport' ? null : type) }} aria-hidden data-testid="item-type">
      {cardTypeLetter(type)}
    </span>
  );
}

/** 資料卡右邊動作欄上面的編號（和地圖同一個號碼），類型色的實心圓、白字 */
function CardNo({ entry, marks }: { entry: TimelineEntry; marks: Marks }) {
  const byId = useData((s) => s.byId);
  const label = marks.byEntry.get(entry);
  if (!label) return null;
  const type = entry.placeId ? byId.get(entry.placeId)?.type : undefined;
  return (
    <span className="tl-card-no" style={{ background: typeColor(type) }} data-testid="tl-mark">
      {label}
    </span>
  );
}

/** 資料卡右邊的動作欄：上面編號、下面 ⋯（children）；每張卡同一個位置 */
function CardActions({ entry, marks, children }: { entry: TimelineEntry; marks: Marks; children?: ReactNode }) {
  return (
    <span className="tl-card-actions">
      <CardNo entry={entry} marks={marks} />
      {children}
    </span>
  );
}

/** 會合那列的編號（不是資料卡，跟著文字） */
function Mark({ entry, marks }: { entry: TimelineEntry; marks: Marks }) {
  const byId = useData((s) => s.byId);
  const label = marks.byEntry.get(entry);
  if (!label) return null;
  const type = entry.placeId ? byId.get(entry.placeId)?.type : undefined;
  return (
    <span className="tl-mark" style={{ background: typeColor(type) }} data-testid="tl-mark">
      {label}
    </span>
  );
}

function focusPlace(id: string | null) {
  if (!id) return;
  commands.focus(id);
  pulseMark(id);
  appStore.getState().openPreview(id);
}

function Warnings({ list }: { list: EngineWarning[] | undefined }) {
  if (!list?.length) return null;
  return (
    <ul className="tl-warnings">
      {list.map((w, i) => (
        <li key={i} className={`warning-${w.level}`}>
          {WARNING_ICONS[w.level]} {w.message}
        </li>
      ))}
    </ul>
  );
}

const name = (p: Place | undefined) => (p ? p.name.zh || p.name.ja : '（不明）');

/** ⋯ 選單用不到的子畫面 */
const NO_UI = { openTags: () => {}, openMove: () => {}, openLodgingPlan: () => {} };

const typeClass = (p: Place | undefined) => `type-${p?.type ?? 'other'}`;

interface ShownOption {
  placeId: string;
  /** 看的是主卡 */
  isMain: boolean;
  /** 那個選項自己填的停留分鐘（沒填是 null：引擎只替主卡算好時間） */
  stayMinutes: number | null;
  /** tag 那一排右邊的 ‹ n/m › */
  switcher: ReactNode;
}

/**
 * 有備卡的卡片（visit.options 超過一個）：本地 state shown 是「看的是第幾個」，只是看，不改主卡。
 * ‹ n/m › 或手機左右滑換卡；看備卡時地圖上那個點亮起來。主要、拿出在「⋯」選單裡（作用在正在看的那張）。
 * onShown：看的備卡換了就告訴卡片（看主卡是 null），拖卡片、⋯ 選單用的就是那張備卡。
 */
function OptionStack({ visit, onShown, children }: { visit: VisitItem; onShown: (index: number | null) => void; children: (v: ShownOption) => ReactNode }) {
  const n = visit.options.length;
  const [shown, setShown] = useState(visit.selected);
  // 主卡換了、備卡被拿掉時，回到看主卡
  useEffect(() => setShown(visit.selected), [visit.selected, n]);
  const index = shown < n ? shown : visit.selected;
  const option = visit.options[index];
  const isMain = index === visit.selected;
  const placeId = option.place;
  useEffect(() => onShown(isMain ? null : index), [isMain, index]);

  // 看備卡時地圖上那個點亮起來；換回主卡或卸載時清掉自己亮的
  const lit = isMain ? '' : placeId;
  useEffect(() => {
    if (!lit) return;
    commands.highlight([lit]);
    return () => {
      const now = appStore.getState().highlights.primary ?? [];
      if (now.length === 1 && now[0] === lit) commands.highlight([]);
    };
  }, [lit]);

  const go = (d: number) => setShown((index + d + n) % n);
  const start = useRef<{ x: number; y: number } | null>(null);
  const switcher = (
    <span className="option-switch small" data-testid="option-switch">
      <button type="button" aria-label="上一個" onClick={() => go(-1)} data-testid="option-prev">
        ‹
      </button>
      <span>
        {index + 1}/{n}
      </span>
      <button type="button" aria-label="下一個" onClick={() => go(1)} data-testid="option-next">
        ›
      </button>
    </span>
  );
  return (
    <div
      className="option-stack"
      data-testid="option-stack"
      data-shown={index}
      data-main={isMain}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const s = start.current;
        start.current = null;
        if (!s) return;
        const dx = e.clientX - s.x;
        if (e.pointerType === 'touch' && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - s.y)) go(dx < 0 ? 1 : -1);
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
    >
      {children({ placeId, isMain, stayMinutes: option.stayMinutes ?? null, switcher })}
    </div>
  );
}

function EntryRow({ entry, day, warnings, plan, marks }: { entry: TimelineEntry; day: ItineraryDay; warnings: Map<string, EngineWarning[]>; plan: DayPlan; marks: Marks }) {
  const byId = useData((s) => s.byId);
  const itinerary = useData((s) => s.itinerary);
  const planning = useApp((s) => s.planning);
  const hovered = useApp((s) => s.hoveredId);
  const [warnOpen, setWarnOpen] = useState(false);
  const desktop = useIsDesktop();
  const ref = entry.itemId ? findItemRef(itinerary, entry.itemId) : null;
  const item = ref?.item ?? null;
  const p = entry.placeId ? byId.get(entry.placeId) : undefined;
  // 有備卡的卡片正在看哪張備卡（看主卡是 null）
  const [backup, setBackup] = useState<number | null>(null);
  // 拖的東西：看備卡時是那張備卡，不然整張卡片（航班不能動）；hook 不能放在下面的提前 return 之後
  const visitItem = item?.type === 'visit' ? item : null;
  const backupPlace = visitItem && backup != null ? visitItem.options[backup]?.place : undefined;
  const dragSrc: DragSource | null =
    !planning || !item || item.type === 'flight' || entry.kind === 'start' || entry.kind === 'lodging' || entry.kind === 'meet'
      ? null
      : visitItem && backupPlace && backup !== visitItem.selected
        ? { kind: 'option', itemId: item.id, index: backup!, placeType: byId.get(backupPlace)?.type ?? null }
        : { kind: 'item', itemId: item.id, placeType: visitItem ? (p?.type ?? null) : null, options: visitItem?.options.length ?? 1 };
  // 手機：長按後拖
  const pressRef = useLongPressDrag<HTMLLIElement>(dragSrc, !desktop);
  const likedMap = useLiked();
  const [tagsOpen, setTagsOpen] = useState(false);
  // 結束編輯時關掉標籤彈窗：不然下次進編輯會自己打開
  useEffect(() => {
    if (!planning) setTagsOpen(false);
  }, [planning]);

  // 編輯中每張資料卡都留把手欄（宿的卡沒有把手，也留空白），類型色塊才對齊
  const editing = planning ? 'editing' : '';

  if (entry.kind === 'start') {
    // 出發的住宿：只顯示前一晚的方案（唯讀）
    const dayIndex = itinerary?.days.findIndex((d) => d.date === day.date) ?? -1;
    const prevNight = dayIndex > 0 ? itinerary!.days[dayIndex - 1] : undefined;
    return (
      <li className={`tl-row tl-card tl-start ${typeClass(p)} ${editing}`} data-testid="tl-start" data-place={entry.placeId ?? ''}>
        <span className="tl-card-inner">
          <CardType type={p?.type ?? null} />
          <span className="tl-body">
            <span className="tl-timeline">
              <span className="tl-start-time">{cardTime(entry).text}</span>
            </span>
            <span className="tl-title">
              {p ? (
                <button type="button" className="link-button tl-name" onClick={() => focusPlace(entry.placeId)}>
                  {name(p)}
                </button>
              ) : (
                <span className="muted">上一站</span>
              )}
            </span>
            {p?.type === 'lodging' && <LodgingTags day={prevNight} place={p} reservationDate={null} editable={false} open={false} onOpenChange={() => {}} />}
          </span>
        </span>
        <CardActions entry={entry} marks={marks} />
      </li>
    );
  }

  if (entry.kind === 'meet' && entry.groups) {
    return (
      <>
        <li className="tl-split" data-testid="tl-split">
          <div className="tl-split-head">
            <span>👥 分組行動</span>
            {planning && item && <ActionMenu ctx={{ kind: 'split', surface: 'desktop' }} target={{ date: day.date, itemId: item.id }} ui={{ ...NO_UI, openMove: () => openDialog({ kind: 'move', itemId: item.id }) }} label="分組" />}
          </div>
          <div className="tl-groups">
            {entry.groups.map((g) => {
              const sg = item?.type === 'split' ? item.groups.find((x) => x.id === g.id) : null;
              return (
                <div key={g.id} className="tl-group">
                  <div className="tl-group-name">
                    {g.name}
                    {sg && <span className="muted small"> {sg.size} 人{sg.elders ? `・長輩 ${sg.elders}` : ''}{sg.kids ? `・小孩 ${sg.kids}` : ''}</span>}
                  </div>
                  <ol className="tl tl-rail">
                    {g.entries
                      .filter((e) => e.kind !== 'meet')
                      .map((e, i) => (
                        <EntryRow key={e.itemId ?? `${e.kind}${i}`} entry={e} day={day} warnings={warnings} plan={plan} marks={marks} />
                      ))}
                  </ol>
                </div>
              );
            })}
          </div>
          <Warnings list={item ? warnings.get(item.id) : undefined} />
        </li>
        <li className="tl-row tl-meet" data-testid="tl-meet">
          <span className="tl-time">{entry.start}</span>
          <span className="tl-body">
            <span className="tl-title">
              <Mark entry={entry} marks={marks} />
              🤝 會合：{entry.placeId ? <PlaceChip id={entry.placeId} /> : '（未定）'}
            </span>
            {entry.waitMinutes > 0 && <span className="muted small">（最早到的組等 {entry.waitMinutes} 分）</span>}
          </span>
        </li>
      </>
    );
  }

  if (entry.kind === 'lodging') {
    return (
      <>
        <LegRow entry={entry} date={day.date} />
        <WaitRow entry={entry} item={null} />
        <li className={`tl-row tl-card tl-lodging ${typeClass(p)} ${editing}`} data-testid="tl-row" data-place={entry.placeId ?? ''}>
          <span className="tl-card-inner">
            <CardType type={p?.type ?? 'lodging'} />
            <span className="tl-body">
              <span className="tl-timeline">
                <span className="tl-start-time">{cardTime(entry).text}</span>
              </span>
              <span className="tl-title">
                <button type="button" className="link-button tl-name" onClick={() => focusPlace(entry.placeId)}>
                  {p ? name(p) : entry.placeId}
                </button>
              </span>
              <LodgingTags day={day} place={p} reservationDate={day.date} editable={planning} open={tagsOpen} onOpenChange={setTagsOpen} />
            </span>
          </span>
          <CardActions entry={entry} marks={marks}>
            {planning && <ActionMenu ctx={{ kind: 'lodging-end', surface: 'desktop' }} target={{ date: day.date, placeId: entry.placeId ?? undefined }} ui={{ ...NO_UI, openLodgingPlan: () => setTagsOpen(true) }} label="住宿" />}
          </CardActions>
        </li>
      </>
    );
  }

  const visit = item?.type === 'visit' ? item : null;
  const flight = item?.type === 'flight' ? item : null;
  const free = item?.type === 'free' ? item : null;
  const time = cardTime(entry);
  // 編輯：電腦版拖曳、手機長按後拖（航班不能動）
  const movable = !!dragSrc;
  const itemWarnings = entry.itemId ? warnings.get(entry.itemId) : undefined;
  const stacked = visit && visit.options.length > 1 ? Math.min(visit.options.length - 1, 2) : 0;
  // ⋯ 選單的主要、拿出作用在正在看的那張（不是重疊卡、或看主卡時是主卡）
  const shownIndex = visit ? (stacked && backup != null && backup < visit.options.length ? backup : visit.selected) : undefined;

  // 卡片的內容；有備卡時 v 是現在看的那個選項（名稱、類型圖示、❤️ 頭像、停留時間換成它）
  const content = (v?: ShownOption) => {
    const sp = v ? byId.get(v.placeId) : p;
    const liked = likedMap.get(v?.placeId ?? entry.placeId ?? '');
    const backup = !!v && !v.isMain;
    const stay = backup ? v.stayMinutes : time.stay;
    // 看備卡時：預約 tag、警告跟著那張備卡
    const shownPlace = v?.placeId ?? entry.placeId;
    const shownWarns = shownWarnings(itemWarnings, shownPlace, !backup);
    return (
      <span className="tl-card-inner">
        <CardType type={flight ? 'airport' : (sp?.type ?? null)} />
        <span className="tl-body">
          <span className="tl-timeline">
            {backup ? <span className="tl-start-time">{entry.start}</span> : <StartTime entry={entry} visit={visit} flight={flight} text={time.text} />}
            {!flight && stay != null && stay > 0 && <StayChip itemId={visit?.id ?? free?.id ?? null} minutes={stay} readOnly={backup} />}
          </span>
          <span className="tl-title">
            <button type="button" className="link-button tl-name" onClick={() => focusPlace(v?.placeId ?? entry.placeId)} onMouseEnter={() => appStore.getState().hover(v?.placeId ?? entry.placeId)} onMouseLeave={() => appStore.getState().hover(null)}>
              {flight ? `${flight.direction === 'arrive' ? '抵達' : '起飛'} ${name(sp)}` : entry.kind === 'free' ? `自由時間${sp ? `：${name(sp)}` : ''}` : name(sp)}
            </button>
            {visit && liked && <AvatarStack ids={liked.likes} dislikes={liked.dislikes} />}
            <WarnToggle list={shownWarns} open={warnOpen} onToggle={() => setWarnOpen(!warnOpen)} />
          </span>
          <span className="tl-meta">
            {visit && <ItemTags visit={visit} kind={tagKindOf(p?.type)} date={day.date} placeId={shownPlace} open={tagsOpen} onOpenChange={setTagsOpen} />}
            {v?.switcher}
          </span>
          {flight?.note && <span className="muted small">{flight.note}（{flight.depart} 起飛 → {flight.arrive} 抵達）</span>}
          {visit?.note && <span className="tl-note small">📝 {visit.note}</span>}
          {warnOpen && <Warnings list={shownWarns} />}
        </span>
      </span>
    );
  };

  return (
    <>
      <LegRow entry={entry} date={day.date} />
      <WaitRow entry={entry} item={visit} />
      <li
        className={`tl-row tl-card tl-${entry.kind} ${typeClass(p)} ${editing} ${stacked ? `stacked stacked-${stacked}` : ''} ${hovered && hovered === entry.placeId ? 'flash' : ''} ${movable ? 'movable' : ''}`}
        data-testid="tl-row"
        data-item={entry.itemId ?? ''}
        data-place={entry.placeId ?? ''}
        ref={pressRef}
        {...(movable && entry.itemId ? { ...(desktop ? dragSourceProps(dragSrc, dragSrc?.kind === 'option' ? (backupPlace ?? null) : entry.placeId) : {}), ...dropOnCardProps({ kind: 'card', itemId: entry.itemId, placeType: visit ? (p?.type ?? null) : null, isFlight: false }, true) } : {})}
      >
        {movable && (
          <span className="tl-handle" aria-hidden>
            ⠿
          </span>
        )}
        {visit && stacked ? (
          <OptionStack visit={visit} onShown={setBackup}>
            {(v) => content(v)}
          </OptionStack>
        ) : (
          content()
        )}
        <CardActions entry={entry} marks={marks}>
          {planning && item && (visit || free) && (
            <ActionMenu
              ctx={{
                kind: visit ? 'visit' : 'free',
                overlap: !!stacked,
                pinned: !!visit?.start,
                groupTargets: groupTargetsOf(itinerary, item.id),
                inGroup: !!ref?.split,
                surface: 'desktop',
              }}
              target={{ date: day.date, itemId: item.id, optionIndex: shownIndex, placeId: entry.placeId ?? undefined, start: entry.start }}
              ui={{
                ...NO_UI,
                openTags: () => setTagsOpen(true),
                openMove: () => openDialog({ kind: 'move', itemId: item.id }),
                // 網頁版：停留時間在卡片上原地 −／＋，把焦點移到 ＋
                openStay: () => pressRef.current?.querySelector<HTMLElement>('[data-testid="stay-plus"]')?.focus(),
              }}
              label={visit ? name(byId.get(visit.options[shownIndex!]?.place ?? '')) : '自由時間'}
              disabled={visit && shownIndex === visit.selected ? ['main'] : []}
            />
          )}
        </CardActions>
      </li>
    </>
  );
}

/** 卡片右上角的 ⚠ 數字：警告預設收起來，點了才展開 */
function WarnToggle({ list, open, onToggle }: { list: EngineWarning[] | undefined; open: boolean; onToggle: () => void }) {
  if (!list?.length) return null;
  const level = list.some((w) => w.level === 'error') ? 'error' : list.some((w) => w.level === 'warning') ? 'warning' : 'info';
  return (
    <button type="button" className={`warn-toggle level-${level}`} aria-expanded={open} onClick={onToggle} data-testid="warn-toggle" title={list.map((w) => w.message).join('\n')}>
      {WARNING_ICONS[level]} {list.length}
    </button>
  );
}

/** 時間（大字，造訪是「開始–結束」）；固定時間（訂位、表演）標 📌。編輯中點了切換固定／不固定 */
function StartTime({ entry, visit, flight, text }: { entry: TimelineEntry; visit: VisitItem | null; flight: Extract<ItineraryItem, { type: 'flight' }> | null; text: string }) {
  const planning = useApp((s) => s.planning);
  const time = flight ? (flight.direction === 'arrive' ? flight.arrive : flight.depart) : text;
  const fixed = !!visit?.start;
  if (!planning || !visit)
    return (
      <span className="tl-start-time">
        {fixed && <span title="指定的開始時間（訂位、表演）">📌</span>}
        {time}
      </span>
    );
  return (
    <button
      type="button"
      className={`tl-start-time fixable ${fixed ? 'on' : ''}`}
      title={fixed ? '取消固定時間（到了就開始）' : '固定這個開始時間（訂位、表演、船班）'}
      aria-pressed={fixed}
      data-testid="fix-start"
      onClick={() => void shared.changeItinerary((it) => setStart(it, visit.id, fixed ? null : entry.start), fixed ? `取消固定 ${visit.start} 開始` : `固定 ${entry.start} 開始`)}
    >
      {fixed ? '📌' : ''}
      {time}
    </button>
  );
}

/** 停留時間的標籤（X小時MM分，等寬數字、固定最小寬度，調時間時字不跳）；編輯中 −15／＋15（後面的時間跟著重算） */
function StayChip({ itemId, minutes, readOnly = false }: { itemId: string | null; minutes: number; readOnly?: boolean }) {
  const planning = useApp((s) => s.planning) && !readOnly;
  const change = (d: number) => {
    if (!itemId) return;
    const next = Math.max(15, minutes + d);
    void shared.changeItinerary((it) => setStay(it, itemId, next), `停留改成 ${formatStay(next)}`);
  };
  return (
    <span className="stay-chip" data-testid="stay-chip">
      {planning && itemId && (
        <button type="button" aria-label="少 15 分" onClick={() => change(-15)} disabled={minutes <= 15} data-testid="stay-minus">
          −
        </button>
      )}
      <span className="stay-chip-text">{formatStay(minutes)}</span>
      {planning && itemId && (
        <button type="button" aria-label="多 15 分" onClick={() => change(15)} data-testid="stay-plus">
          ＋
        </button>
      )}
    </span>
  );
}


const GAP_ACTIONS: Record<Gap['kind'], { icon: string; look: string; types: ('restaurant' | 'spot' | 'lodging')[] }> = {
  lodging: { icon: '🏨', look: '看住宿', types: ['lodging'] },
  idle: { icon: '⏳', look: '', types: [] },
};

/** 空檔（「住宿（未排）」這類，不是等待）：點了展開——看住宿（篩選＋地圖框住前後兩站） */
function GapRow({ gap, plan }: { gap: Gap; plan: DayPlan }) {
  const [open, setOpen] = useState(false);
  const a = GAP_ACTIONS[gap.kind];
  const around = [gap.afterItemId, gap.beforeItemId]
    .map((id) => plan.entries.find((e) => e.itemId === id)?.placeId)
    .filter((x): x is string => !!x);
  return (
    <li className={`tl-gap gap-${gap.kind}`} data-testid="tl-gap">
      <button type="button" className="tl-gap-button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="tl-time">{gap.from && gap.to ? `${gap.from}–${gap.to}` : ''}</span>
        <span>
          {a.icon} {gap.label}
        </span>
      </button>
      {open && (
        <span className="tl-gap-actions">
          <button
            type="button"
            className="text-button"
            onClick={() => {
              commands.setFilter({ types: a.types, contexts: [] });
              if (around.length) commands.focus(around);
            }}
          >
            🔎 {a.look}
          </button>
        </span>
      )}
    </li>
  );
}

/**
 * 交通卡下面、資料卡上面「到了要等」的那條（第五輪 §2）：只有一行文字 waitNote，不能點、不能展開（第六輪）。
 * 不用等就不畫；會合那列自己寫「最早到的組等 N 分」
 */
function WaitRow({ entry, item }: { entry: TimelineEntry; item: VisitItem | null }) {
  const byId = useData((s) => s.byId);
  const text = waitNote(entry, item, entry.placeId ? byId.get(entry.placeId) : undefined);
  if (!text) return null;
  return (
    <li className="tl-wait-row" data-testid="tl-wait">
      <span className="tl-wait">{text}</span>
    </li>
  );
}

export function Timeline({ plan, day }: { plan: DayPlan; day: ItineraryDay }) {
  const planning = useApp((s) => s.planning);
  const { byItem } = warningsByItem(plan);
  const marks: Marks = { byEntry: stopMarks(plan).byEntry };
  return (
    <ol className="tl tl-rail" data-testid="timeline">
      {/* 用項目 ID 當 key：上面的卡片增減時，備卡看第幾張、警告展開這些本地 state 不會跑到別張卡片 */}
      {timelineRows(plan).map((row, i) =>
        row.kind === 'gap' ? (
          <GapRow key={`g:${row.gap.afterItemId ?? ''}:${row.gap.kind}:${i}`} gap={row.gap} plan={plan} />
        ) : (
          <EntryRow key={row.entry.itemId ? `i:${row.entry.itemId}` : `${row.entry.kind}:${i}`} entry={row.entry} day={day} warnings={byItem} plan={plan} marks={marks} />
        ),
      )}
      {planning && (
        <li className="tl-dropend small muted" data-testid="tl-dropend" {...dropOnEndProps(day.date, true)}>
          拖到這裡：放在這天的最後
        </li>
      )}
    </ol>
  );
}

/** 標題的一行：09:30 出發 → 13:46 回住宿・交通 1小時05分、警告數 */
export function DaySummaryLine({ plan, warnOpen, onWarn, reminders = 0 }: { plan: DayPlan; warnOpen?: boolean; onWarn?: () => void; reminders?: number }) {
  const s = daySummary(plan);
  const times = [s.start && `${s.start} 出發`, s.back && `${s.back} 回住宿`].filter(Boolean).join(' → ');
  return (
    <span className="day-stats small" data-testid="day-summary">
      {[times, s.travelMinutes > 0 && `交通 ${formatTravelTotal(s.travelMinutes)}`].filter(Boolean).join('・')}
      {onWarn && reminders > 0 ? (
        <button type="button" className={`badge warn-button ${s.warnings > 0 ? 'badge-warn' : ''}`} aria-expanded={!!warnOpen} onClick={onWarn} data-testid="day-warn-toggle">
          {s.warnings > 0 ? '⚠' : WARNING_ICONS.info} {reminders} {warnOpen ? '▴' : '▾'}
        </button>
      ) : (
        s.warnings > 0 && <span className="badge badge-warn">⚠ {s.warnings}</span>
      )}
      {plan.stats.tiring && <span className="badge badge-warn">累</span>}
    </span>
  );
}

const BAR_LABELS: Record<BarSegment['kind'], string> = { spot: '景點', restaurant: '用餐', other: '停留', travel: '交通', wait: '等待' };
const BAR_HEIGHT = 22;
const MARK_MIN_PX = 18;

/** 捲到那張卡（交通卡或資料卡）並閃一下 */
function jumpToCard(seg: BarSegment) {
  const sel = seg.legKey ? `[data-testid="tl-leg"][data-leg="${CSS.escape(seg.legKey)}"]` : seg.itemId ? `[data-testid="tl-row"][data-item="${CSS.escape(seg.itemId)}"]` : null;
  const el = sel ? document.querySelector<HTMLElement>(sel) : null;
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.add('flash');
  window.setTimeout(() => el.classList.remove('flash'), 1600);
}

/**
 * 按時間比例的橫條（高 22px）：景點、餐廳用類型色並寫卡片編號，交通是細灰點線，等待是黃色斜紋，其他停留是灰色；
 * 分組的時段每組一條細條（總高度不變）。下面每個整點一個刻度，兩端寫出發、回住宿時間。
 * 點一段捲到那張卡並閃一下；selected（目前點的卡片的項目 ID 或交通卡 key）那段加藍框
 */
export function DayBar({ plan, selected }: { plan: DayPlan; selected?: string | null }) {
  const byId = useData((s) => s.byId);
  const [width, setWidth] = useState(0);
  // callback ref：橫條出現時量一次寬度並開始看它變寬變窄，拿掉時停止（不是每次重畫都重建 ResizeObserver）
  const trackRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const segs = dayBar(plan, (id) => (id ? (byId.get(id)?.type ?? null) : null));
  if (!segs.length) return null;
  const t0 = Math.min(...segs.map((s) => toMinutes(s.from)));
  const t1 = Math.max(...segs.map((s) => toMinutes(s.to)));
  const span = Math.max(1, t1 - t0);
  const lanes = Math.max(...segs.map((s) => s.lane));
  const laneH = lanes ? BAR_HEIGHT / lanes : BAR_HEIGHT;
  return (
    <div className="day-bar" data-testid="day-bar">
      <div className="day-bar-track" ref={trackRef} style={{ height: BAR_HEIGHT }}>
        {segs.map((s, i) => {
          const w = ((toMinutes(s.to) - toMinutes(s.from)) / span) * 100;
          const lane = s.lane > 0;
          const h = s.kind === 'travel' ? 6 : lane ? laneH - 1 : BAR_HEIGHT;
          const top = lane ? (s.lane - 1) * laneH + (s.kind === 'travel' ? (laneH - 6) / 2 : 0) : s.kind === 'travel' ? (BAR_HEIGHT - 6) / 2 : 0;
          return (
            <button
              key={i}
              type="button"
              className={`day-bar-seg seg-${s.kind} ${isBarSelected(s, selected) ? 'selected' : ''}`}
              style={{
                left: `${((toMinutes(s.from) - t0) / span) * 100}%`,
                width: `${w}%`,
                top,
                height: h,
                ...(s.kind === 'spot' || s.kind === 'restaurant' ? { background: TYPE_COLORS[s.kind] } : {}),
              }}
              title={`${BAR_LABELS[s.kind]} ${s.from}–${s.to}`}
              aria-label={`${BAR_LABELS[s.kind]} ${s.from}–${s.to}`}
              data-testid="day-bar-seg"
              onClick={() => jumpToCard(s)}
            >
              {s.mark && !lane && (w / 100) * width >= MARK_MIN_PX ? s.mark : null}
            </button>
          );
        })}
      </div>
      <div className="day-bar-ticks" aria-hidden>
        {hourTicks(t0, t1).map((t) => (
          <span key={t.label} className="day-bar-tick" style={{ left: `${t.pct}%` }}>
            {t.label}
          </span>
        ))}
      </div>
      <div className="day-bar-scale small muted">
        <span>{fromMinutes(t0)}</span>
        <span>{fromMinutes(t1)}</span>
      </div>
    </div>
  );
}
