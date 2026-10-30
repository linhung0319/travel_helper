// 這一天的時間軸（interaction-design §3、§6、第五輪 §2；第七輪 Task 8 改成共用的卡片）：引擎算好的項目、相鄰兩點之間的交通、等待、警告。
// 資料卡是 shared/ui/TripCard.tsx（網頁、手機共用）：白底，縮圖 48px（左上角墨色編號圓；沒有照片是類型色底加一個字）、時間（開始–結束）、停留時間（X小時MM分）、名稱、標籤、❤️ 頭像、⚠ 數。
// 點卡片＝選中（地圖的數字水滴，地圖能不動就不動），這張卡原地展開（uiStore.expandedItem，一次一張，點同一張收起）：三張照片、介紹前兩句、「詳細資料」（詳情浮在地圖右邊）、「問 AI」。
// 滑鼠移到卡片上＝地圖的指到；只有從地圖指到的點，卡片才加 flash 框（卡片自己被指到時不回頭標自己）。
// 交通是一行細字（shared/ui/LegLine.tsx，LegRow.tsx）：圖示、方式、時間、距離，右邊「地圖 ↗」；到了要等（指定開始時間、還沒開門）時下面一條黃色虛框的「幾點到，等 N 分（原因）」，純文字、不能點。
// 編輯中才有：停留時間 −／＋、點時間固定開始（釘子）、有標籤的卡點標籤那一排開標籤彈窗（ItemTags.tsx；沒有標籤的從 ⋯ 加）、
// 「⋯」動作選單（ActionMenu.tsx，動作照 shared/cardActions.ts：重疊卡的主要、拿出，標籤、釘選、調整順序、移到第幾天、移進／移出分組、撤下；
// 回住宿的這晚的方案、清掉住宿；自由時間、分組的刪除）。出發的住宿、航班沒有「⋯」；有地點的卡沒有刪除（要先撤下回候選）。
// 拖卡片（滑鼠整張卡、手指按把手，planDrag.ts）：停在同類型卡片中間 0.6 秒合併、邊緣換順序；看備卡時拖的是那張備卡；拖到左邊聊天室＝問 AI。
// 有備卡的卡片（重疊卡）疊著淡色卡、‹ n/m › 換著看；看備卡時預約 tag、警告跟著那張備卡，「⋯」的主要、拿出作用在那張備卡，其他動作作用在整張卡片。
// 資料準備（項目、警告、編號、候選）在 useDayTimeline，手機版的行程（mobile/DaySheet.tsx）也用；時間條 DayBar 手機版用 compact（變矮）。

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { fromMinutes, setStart, setStay, toMinutes, type DayPlan, type EngineWarning, type Gap, type TimelineEntry } from '@travel-helper/engine';
import type { ItineraryDay, ItineraryItem, VisitItem } from '@travel-helper/engine/types';
import { appStore } from '../store.ts';
import { commands } from '../appCommands.ts';
import { shared } from '../appShared.ts';
import { useApp, useData, usePlan, useShared, useUi } from '../hooks.ts';
import { dayPlanOf, type PlanState } from '../planStore.ts';
import { dayCandidates } from '../lib/wishlist.ts';
import type { Candidate } from '../backend/types.ts';
import { dropOnCardProps, dropOnEndProps, usePlanDrag } from './planDrag.ts';
import type { DragSource } from '../lib/dropIntent.ts';
import { openDialog, toggleExpandedItem } from '../uiStore.ts';
import { cardTime, cardTypeLetter, dayBar, daySummary, findItemRef, formatStay, formatTravelTotal, hourTicks, isBarSelected, shownWarnings, stopMarks, timelineRows, waitNote, WARNING_ICONS, warningsByItem, type BarSegment, type TimelineRow } from '../lib/planView.ts';
import { typeSwatch } from '../lib/typeStyle.ts';
import type { Place } from '../data/types.ts';
import { AvatarStack, PlaceChip } from './common.tsx';
import { LegRow } from './LegRow.tsx';
import { ItemTags, LodgingTags, tagKindOf } from './ItemTags.tsx';
import { ActionMenu } from './ActionMenu.tsx';
import { Icon, type IconName } from './Icon.tsx';
import { groupTargetsOf } from './cardActionRun.ts';
import { useLiked } from '../shared/placeLists.ts';
import { DragHandle, TripCard, askAboutCardPlace } from '../shared/ui/TripCard.tsx';

/** 地圖上同一個編號（0、1、2…）；顏色是那個點的類型色 */
export interface Marks {
  byEntry: Map<TimelineEntry, string>;
}

/** 車站、機場、使用者加的點、沒有資料的點：中性灰 */
const NEUTRAL_COLOR = '#5d6680';

/** 縮圖邊長（網頁 48px；手機 56px） */
const THUMB = 48;

/** 類型色塊、編號圓圈的底色和字色：景點、住宿、餐廳、車站用類型色（餐廳的字是墨色），其他中性灰 */
function typeColor(type: Place['type'] | null | undefined): { background: string; color: string } {
  return type === 'spot' || type === 'lodging' || type === 'restaurant' || type === 'station' ? typeSwatch(type) : { background: NEUTRAL_COLOR, color: '#ffffff' };
}

/** 資料卡（和候選卡）左邊的類型色塊：宿、景、餐、站、機、點 */
export function CardType({ type }: { type: Place['type'] | 'airport' | null }) {
  return (
    <span className="tc-type-tile" style={typeColor(type === 'airport' ? null : type)} aria-hidden data-testid="item-type">
      {cardTypeLetter(type)}
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
    <span className="tl-mark" style={typeColor(type)} data-testid="tl-mark">
      {label}
    </span>
  );
}

function Warnings({ list }: { list: EngineWarning[] | undefined }) {
  if (!list?.length) return null;
  return (
    <ul className="tl-warnings">
      {list.map((w, i) => (
        <li key={i} className={`warning-${w.level}`}>
          <Icon name={WARNING_ICONS[w.level]} size={16} /> {w.message}
        </li>
      ))}
    </ul>
  );
}

const name = (p: Place | undefined) => (p ? p.name.zh || p.name.ja : '（不明）');

/** ⋯ 選單用不到的子畫面 */
const NO_UI = { openTags: () => {}, openMove: () => {}, openLodgingPlan: () => {} };

interface ShownOption {
  placeId: string;
  /** 看的是主卡 */
  isMain: boolean;
  /** 那個選項自己填的停留分鐘（沒填是 null：引擎只替主卡算好時間） */
  stayMinutes: number | null;
  /** tag 那一排右邊的 ‹ n/m › */
  switcher: ReactNode;
  /** 卡片的 li 要加的屬性：手機左右滑換卡、data-shown／data-main（看第幾張、是不是主卡） */
  stackProps: Record<string, unknown>;
}

/**
 * 有備卡的卡片（visit.options 超過一個）：本地 state shown 是「看的是第幾個」，只是看，不改主卡。
 * ‹ n/m › 或手機左右滑換卡；看備卡時選中那個點（地圖的數字水滴，不是 AI 的標示）。主要、拿出在「⋯」選單裡（作用在正在看的那張）。
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

  // 看備卡時選中那個點；換回主卡時選中主卡的點（選中的本來就是這張的點才換）
  const lit = isMain ? '' : placeId;
  const mainPlace = visit.options[visit.selected]?.place;
  useEffect(() => {
    if (!lit) return;
    appStore.getState().select(lit);
    return () => {
      if (appStore.getState().selectedId === lit) appStore.getState().select(mainPlace ?? null);
    };
  }, [lit, mainPlace]);

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
  const stackProps = {
    'data-shown': index,
    'data-main': isMain,
    onPointerDown: (e: ReactPointerEvent<HTMLLIElement>) => {
      start.current = { x: e.clientX, y: e.clientY };
    },
    onPointerUp: (e: ReactPointerEvent<HTMLLIElement>) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const dx = e.clientX - s.x;
      if (e.pointerType === 'touch' && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - s.y)) go(dx < 0 ? 1 : -1);
    },
    onPointerCancel: () => {
      start.current = null;
    },
  };
  return <>{children({ placeId, isMain, stayMinutes: option.stayMinutes ?? null, switcher, stackProps })}</>;
}

/** 網頁版點時間軸的卡：選中那個點（再點一次水滴再跳）、地圖照移動規則，這張卡原地展開（再點一次收起）。key 是項目 ID（出發、回住宿是 start、lodging） */
function useCardExpand(key: string, placeId: string | null | undefined) {
  const expanded = useUi((s) => s.expandedItem) === key;
  const toggle = () => {
    if (placeId) {
      appStore.getState().select(placeId);
      commands.focus(placeId);
    }
    toggleExpandedItem(key);
  };
  // 「詳細資料」：彈窗蓋在地圖右側（右欄的時間軸不動，§13.3 第 1 點）
  const onDetail = placeId ? () => appStore.getState().openDetail(placeId, 'map', undefined, 'map') : undefined;
  return { expanded, toggle, onDetail };
}

/** 滑鼠移上去／移開：地圖的「指到」 */
const hoverPlace = (id: string | null | undefined) => (over: boolean) => appStore.getState().hover(over ? (id ?? null) : null);

function EntryRow({ entry, day, warnings, plan, marks }: { entry: TimelineEntry; day: ItineraryDay; warnings: Map<string, EngineWarning[]>; plan: DayPlan; marks: Marks }) {
  const byId = useData((s) => s.byId);
  const itinerary = useData((s) => s.itinerary);
  const planning = useApp((s) => s.planning);
  // 只有從地圖指到的點才標出這張卡
  const hovered = useApp((s) => (s.hoverFromMap ? s.hoveredId : null));
  const [warnOpen, setWarnOpen] = useState(false);
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
  // 拖曳：滑鼠整張卡、手指按把手；放在左邊的聊天室＝問那個點（看備卡時是那張備卡）
  const pressRef = usePlanDrag<HTMLLIElement>(dragSrc, true, { askPlace: dragSrc?.kind === 'option' ? (backupPlace ?? null) : (entry.placeId ?? null) });
  const likedMap = useLiked();
  const [tagsOpen, setTagsOpen] = useState(false);
  // 結束編輯時關掉標籤彈窗：不然下次進編輯會自己打開
  useEffect(() => {
    if (!planning) setTagsOpen(false);
  }, [planning]);
  const cardKey = entry.itemId ?? entry.kind;
  const expand = useCardExpand(cardKey, entry.placeId);

  // 編輯中每張資料卡都留把手欄（宿的卡沒有把手，也留空白）
  const editing = planning ? 'editing' : '';

  if (entry.kind === 'start') {
    // 出發的住宿：只顯示前一晚的方案（唯讀）
    const dayIndex = itinerary?.days.findIndex((d) => d.date === day.date) ?? -1;
    const prevNight = dayIndex > 0 ? itinerary!.days[dayIndex - 1] : undefined;
    return (
      <TripCard
        testId="tl-start"
        itemKey={cardKey}
        place={p}
        mark={marks.byEntry.get(entry)}
        time={<span className="tl-start-time">{cardTime(entry).text}</span>}
        name={p ? name(p) : '上一站'}
        label={p ? name(p) : '上一站'}
        meta={p?.type === 'lodging' ? <LodgingTags day={prevNight} place={p} reservationDate={null} editable={false} open={false} onOpenChange={() => {}} /> : null}
        thumb={THUMB}
        className={`tl-start ${editing}`}
        selected={expand.expanded}
        expanded={expand.expanded}
        onToggle={expand.toggle}
        onDetail={expand.onDetail}
        onAsk={p ? () => askAboutCardPlace(p) : undefined}
      />
    );
  }

  if (entry.kind === 'meet' && entry.groups) {
    return (
      <>
        <li className="tl-split" data-testid="tl-split">
          <div className="tl-split-head">
            <span className="ic-text">
              <Icon name="users" size={16} /> 分組行動
            </span>
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
                  <ol className="tl tc-list">
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
              <Icon name="users" size={16} /> 會合：{entry.placeId ? <PlaceChip id={entry.placeId} /> : '（未定）'}
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
        <TripCard
          testId="tl-row"
          itemKey={cardKey}
          place={p}
          fallbackType="lodging"
          mark={marks.byEntry.get(entry)}
          time={<span className="tl-start-time">{cardTime(entry).text}</span>}
          name={p ? name(p) : (entry.placeId ?? '')}
          label={p ? name(p) : (entry.placeId ?? '住宿')}
          meta={<LodgingTags day={day} place={p} reservationDate={day.date} editable={planning} open={tagsOpen} onOpenChange={setTagsOpen} />}
          thumb={THUMB}
          className={`tl-lodging ${editing}`}
          selected={expand.expanded}
        expanded={expand.expanded}
          onToggle={expand.toggle}
          onDetail={expand.onDetail}
          onAsk={p ? () => askAboutCardPlace(p) : undefined}
          more={planning ? <ActionMenu ctx={{ kind: 'lodging-end', surface: 'desktop' }} target={{ date: day.date, placeId: entry.placeId ?? undefined }} ui={{ ...NO_UI, openLodgingPlan: () => setTagsOpen(true) }} label="住宿" /> : null}
        />
      </>
    );
  }

  const visit = item?.type === 'visit' ? item : null;
  const flight = item?.type === 'flight' ? item : null;
  const free = item?.type === 'free' ? item : null;
  const time = cardTime(entry);
  // 編輯：滑鼠整張卡拖、手指按把手拖（航班不能動）
  const movable = !!dragSrc;
  const itemWarnings = entry.itemId ? warnings.get(entry.itemId) : undefined;
  const stacked = !!visit && visit.options.length > 1;
  // ⋯ 選單的主要、拿出作用在正在看的那張（不是重疊卡、或看主卡時是主卡）
  const shownIndex = visit ? (stacked && backup != null && backup < visit.options.length ? backup : visit.selected) : undefined;

  // 卡片；有備卡時 v 是現在看的那個選項（名稱、縮圖、❤️ 頭像、停留時間換成它）
  const card = (v?: ShownOption) => {
    const sp = v ? byId.get(v.placeId) : p;
    const liked = likedMap.get(v?.placeId ?? entry.placeId ?? '');
    const isBackup = !!v && !v.isMain;
    const stay = isBackup ? v.stayMinutes : time.stay;
    // 看備卡時：預約 tag、警告跟著那張備卡
    const shownPlace = v?.placeId ?? entry.placeId;
    const shownWarns = shownWarnings(itemWarnings, shownPlace, !isBackup);
    const title = flight ? `${flight.direction === 'arrive' ? '抵達' : '起飛'} ${name(sp)}` : entry.kind === 'free' ? `自由時間${sp ? `：${name(sp)}` : ''}` : name(sp);
    return (
      <TripCard
        testId="tl-row"
        itemKey={cardKey}
        place={sp}
        dataPlace={entry.placeId ?? ''}
        fallbackType={flight ? 'airport' : null}
        mark={marks.byEntry.get(entry)}
        time={
          <>
            {isBackup ? <span className="tl-start-time">{entry.start}</span> : <StartTime entry={entry} visit={visit} flight={flight} text={time.text} />}
            {!flight && stay != null && stay > 0 && <StayChip itemId={visit?.id ?? free?.id ?? null} minutes={stay} readOnly={isBackup} />}
          </>
        }
        name={title}
        label={title}
        meta={
          <>
            {visit && <ItemTags visit={visit} kind={tagKindOf(p?.type)} date={day.date} placeId={shownPlace} open={tagsOpen} onOpenChange={setTagsOpen} />}
            {v?.switcher}
            {visit && liked && <AvatarStack ids={liked.likes} dislikes={liked.dislikes} />}
            <WarnToggle list={shownWarns} open={warnOpen} onToggle={() => setWarnOpen(!warnOpen)} />
          </>
        }
        below={
          <>
            {flight?.note && <span className="muted small">{flight.note}（{flight.depart} 起飛 → {flight.arrive} 抵達）</span>}
            {visit?.note && <span className="tl-note small ic-text">
                <Icon name="pen" size={16} /> {visit.note}
              </span>}
            {warnOpen && <Warnings list={shownWarns} />}
          </>
        }
        thumb={THUMB}
        stacked={!!stacked}
        className={`tl-${entry.kind} ${editing} ${hovered && hovered === entry.placeId ? 'flash' : ''}`}
        selected={expand.expanded}
        expanded={expand.expanded}
        onToggle={expand.toggle}
        onDetail={sp ? () => appStore.getState().openDetail(sp.id, 'map', undefined, 'map') : undefined}
        onAsk={sp ? () => askAboutCardPlace(sp) : undefined}
        onHover={hoverPlace(shownPlace)}
        liRef={pressRef}
        liProps={{
          ...(movable && entry.itemId ? dropOnCardProps({ kind: 'card', itemId: entry.itemId, placeType: visit ? (p?.type ?? null) : null, isFlight: false }, true) : {}),
          ...(v ? v.stackProps : {}),
        }}
        handle={movable ? <DragHandle testId="tl-handle" /> : null}
        movable={movable}
        more={
          planning && item && (visit || free) ? (
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
          ) : null
        }
      />
    );
  };

  return (
    <>
      <LegRow entry={entry} date={day.date} />
      <WaitRow entry={entry} item={visit} />
      {visit && stacked ? (
        <OptionStack visit={visit} onShown={setBackup}>
          {(v) => card(v)}
        </OptionStack>
      ) : (
        card()
      )}
    </>
  );
}


/** 卡片右上角的 ⚠ 數字：警告預設收起來，點了才展開 */
function WarnToggle({ list, open, onToggle }: { list: EngineWarning[] | undefined; open: boolean; onToggle: () => void }) {
  if (!list?.length) return null;
  const level = list.some((w) => w.level === 'error') ? 'error' : list.some((w) => w.level === 'warning') ? 'warning' : 'info';
  return (
    <button type="button" className={`warn-toggle level-${level}`} aria-expanded={open} onClick={onToggle} data-testid="warn-toggle" title={list.map((w) => w.message).join('\n')}>
      <Icon name={WARNING_ICONS[level]} size={16} /> {list.length}
    </button>
  );
}

/** 時間（大字，造訪是「開始–結束」）；固定時間（訂位、表演）標釘子。編輯中點了切換固定／不固定 */
function StartTime({ entry, visit, flight, text }: { entry: TimelineEntry; visit: VisitItem | null; flight: Extract<ItineraryItem, { type: 'flight' }> | null; text: string }) {
  const planning = useApp((s) => s.planning);
  const time = flight ? (flight.direction === 'arrive' ? flight.arrive : flight.depart) : text;
  const fixed = !!visit?.start;
  if (!planning || !visit)
    return (
      <span className="tl-start-time">
        {fixed && (
          <span title="指定的開始時間（訂位、表演）">
            <Icon name="pin" size={16} />
          </span>
        )}
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
      {fixed ? <Icon name="pin" size={16} /> : null}
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

/** 空檔的圖示和「看…」：只剩「住宿（未排）」（idle 是等待，planView 不放進時間軸的列） */
const GAP_ACTIONS: Record<Exclude<Gap['kind'], 'idle'>, { icon: IconName; look: string; types: ('restaurant' | 'spot' | 'lodging')[] }> = {
  lodging: { icon: 'bed', look: '看住宿', types: ['lodging'] },
};

/** 空檔（「住宿（未排）」這類，不是等待）：點了展開——看住宿（篩選＋地圖框住前後兩站） */
function GapRow({ gap, plan }: { gap: Gap; plan: DayPlan }) {
  const [open, setOpen] = useState(false);
  if (gap.kind === 'idle') return null;
  const a = GAP_ACTIONS[gap.kind];
  const around = [gap.afterItemId, gap.beforeItemId]
    .map((id) => plan.entries.find((e) => e.itemId === id)?.placeId)
    .filter((x): x is string => !!x);
  return (
    <li className={`tl-gap gap-${gap.kind}`} data-testid="tl-gap">
      <button type="button" className="tl-gap-button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="tl-time">{gap.from && gap.to ? `${gap.from}–${gap.to}` : ''}</span>
        <span className="ic-text">
          <Icon name={a.icon} size={16} /> {gap.label}
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
            <Icon name="search" size={16} /> {a.look}
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
      <span className="tl-wait ic-text">
        <Icon name="clock" size={16} />
        {text}
      </span>
    </li>
  );
}

/** 一天的時間軸要畫的東西（網頁版、手機版共用）：行程的那天、引擎算好的時間軸、一列一列（項目和空檔）、每個項目的警告、這天的警告、編號、這天的候選 */
export interface DayTimeline {
  /** 行程裡的那天；選「全部」或行程沒有這天是 null */
  itDay: ItineraryDay | null;
  plan: DayPlan | null;
  status: PlanState['status'];
  error: string | null;
  rows: TimelineRow[];
  byItem: Map<string, EngineWarning[]>;
  dayWarnings: EngineWarning[];
  marks: Marks;
  candidates: Candidate[];
}

/** 某一天（'all' 時全部是空的）的時間軸資料準備；時間軸、警告、編號只在引擎重算時重新整理 */
export function useDayTimeline(date: string): DayTimeline {
  const itinerary = useData((s) => s.itinerary);
  const byId = useData((s) => s.byId);
  const status = usePlan((s) => s.status);
  const error = usePlan((s) => s.error);
  const plan = usePlan((s) => (date === 'all' ? null : dayPlanOf(s.plan, date)));
  const all = useShared((s) => s.candidates);
  const derived = useMemo(() => {
    const { byItem, day } = warningsByItem(plan);
    return { rows: plan ? timelineRows(plan) : [], byItem, dayWarnings: day, marks: { byEntry: stopMarks(plan).byEntry } };
  }, [plan]);
  const candidates = useMemo(() => (date === 'all' ? [] : dayCandidates(all, date, itinerary, byId)), [all, date, itinerary, byId]);
  const itDay = date === 'all' ? null : (itinerary?.days.find((d) => d.date === date) ?? null);
  return { itDay, plan, status, error: error ?? null, ...derived, candidates };
}

export function Timeline({ tl }: { tl: DayTimeline & { plan: DayPlan; itDay: ItineraryDay } }) {
  const planning = useApp((s) => s.planning);
  const { plan, itDay: day, byItem, marks } = tl;
  return (
    <ol className={`tl tc-list tl-axis ${planning ? 'in-planning' : ''}`} data-testid="timeline">
      {/* 用項目 ID 當 key：上面的卡片增減時，備卡看第幾張、警告展開這些本地 state 不會跑到別張卡片 */}
      {tl.rows.map((row, i) =>
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
      {[times, s.travelMinutes > 0 && `交通 ${formatTravelTotal(s.travelMinutes)}`].filter(Boolean).join(' · ')}
      {onWarn && reminders > 0 ? (
        <button type="button" className={`badge warn-button ${s.warnings > 0 ? 'badge-warn' : ''}`} aria-expanded={!!warnOpen} onClick={onWarn} data-testid="day-warn-toggle">
          <Icon name={s.warnings > 0 ? 'warn' : WARNING_ICONS.info} size={16} /> {reminders}{' '}
          <span className={`chev ${warnOpen ? 'up' : ''}`}>
            <Icon name="chevron" size={16} />
          </span>
        </button>
      ) : (
        s.warnings > 0 && (
          <span className="badge badge-warn ic-text">
            <Icon name="warn" size={16} /> {s.warnings}
          </span>
        )
      )}
      {plan.stats.tiring && <span className="badge badge-warn">累</span>}
    </span>
  );
}

const BAR_LABELS: Record<BarSegment['kind'], string> = { spot: '景點', restaurant: '用餐', other: '停留', travel: '交通', wait: '等待' };
const BAR_HEIGHT = 22;
/** 手機版的時間條（compact）比較矮 */
const BAR_HEIGHT_COMPACT = 14;
const MARK_MIN_PX = 18;

/** 捲到那張卡（交通卡或資料卡；網頁版 tl-*、手機版 m-*）並閃一下 */
function jumpToCard(seg: BarSegment) {
  const sel = seg.legKey
    ? `:is([data-testid="tl-leg"], [data-testid="m-leg"])[data-leg="${CSS.escape(seg.legKey)}"]`
    : seg.itemId
      ? `:is([data-testid="tl-row"], [data-testid="m-card"])[data-item="${CSS.escape(seg.itemId)}"]`
      : null;
  const el = sel ? document.querySelector<HTMLElement>(sel) : null;
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.add('flash');
  window.setTimeout(() => el.classList.remove('flash'), 1600);
}

/**
 * 按時間比例的橫條（高 22px）：景點、餐廳用類型色並寫卡片編號，交通是細灰點線，等待是黃色斜紋，其他停留是灰色；
 * 分組的時段每組一條細條（總高度不變）。下面每個整點一個刻度，兩端寫出發、回住宿時間。
 * 點一段捲到那張卡並閃一下；selected（目前點的卡片的項目 ID 或交通卡 key）那段加藍框。compact：手機版，高度變矮
 */
export function DayBar({ plan, selected, compact = false }: { plan: DayPlan; selected?: string | null; compact?: boolean }) {
  const BAR_H = compact ? BAR_HEIGHT_COMPACT : BAR_HEIGHT;
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
  const laneH = lanes ? BAR_H / lanes : BAR_H;
  return (
    <div className={compact ? 'day-bar compact' : 'day-bar'} data-testid="day-bar">
      <div className="day-bar-track" ref={trackRef} style={{ height: BAR_H }}>
        {segs.map((s, i) => {
          const w = ((toMinutes(s.to) - toMinutes(s.from)) / span) * 100;
          const lane = s.lane > 0;
          const h = s.kind === 'travel' ? 6 : lane ? laneH - 1 : BAR_H;
          const top = lane ? (s.lane - 1) * laneH + (s.kind === 'travel' ? (laneH - 6) / 2 : 0) : s.kind === 'travel' ? (BAR_H - 6) / 2 : 0;
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
                ...(s.kind === 'spot' || s.kind === 'restaurant' ? typeSwatch(s.kind) : {}),
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
