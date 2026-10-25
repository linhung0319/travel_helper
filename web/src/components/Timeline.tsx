// 這一天的時間軸（interaction-design §3、§6、第五輪 §2）：引擎算好的項目、相鄰兩點之間的交通、等待、警告。
// 手機是直的清單，電腦放在地圖下方。左邊一條虛線從一張資料卡串到下一張，交通卡在虛線右邊（右緣和資料卡對齊）。
// 點項目地圖跳過去；到了要等（📌、還沒開門）時交通卡下面一條黃色虛框的「⏳ 幾點到，等 N 分（原因）」，點了看附近的景點。
// 資料卡只顯示要看的（設計 §6）：左邊類型色塊（宿／景／餐／站／機／點）、右上角編號（類型色的實心圓）、
// 時間（開始–結束）、停留時間（X小時MM分）、名稱、tag、❤️ 頭像、⚠ 數。
// 卡片底色是類型的淡色；起點、終點的住宿和造訪是同樣的卡片（只寫一個時間）。有備卡的卡片疊著淡色卡、右上角 👑、‹ n/m › 換著看。
// 編輯中才有：停留時間 −／＋、點時間固定開始（📌）、⋯ 選單（刪除、移到第 _ 天、移進／移出分組、標用餐、標吃法）、
// 拖卡片（電腦版拖、手機長按後拖）：放在卡片中間合併、邊緣換順序；看備卡時拖的是那張備卡；看備卡時的「設為主要」「拿出來」。
// 看備卡時預約 tag、警告跟著那張備卡，⋯ 選單收起來（裡面的刪除是刪整張卡片）。

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { moveItemTo, removeItem, selectOption, setLodging, fromMinutes, setStart, setStay, toMinutes, type DayPlan, type EngineWarning, type Gap, type LodgingMeals, type TimelineEntry } from '@travel-helper/engine';
import type { ItineraryDay, ItineraryItem, VisitItem } from '@travel-helper/engine/types';
import { appStore } from '../store.ts';
import { commands } from '../appCommands.ts';
import { shared } from '../appShared.ts';
import { useApp, useData, useIsDesktop } from '../hooks.ts';
import { dragSourceProps, dropOnCardProps, dropOnEndProps, putBackOption, useLongPressDrag } from './planDrag.ts';
import type { DragSource } from '../lib/dropIntent.ts';
import { openDialog } from '../uiStore.ts';
import { cardTime, cardTypeLetter, dayBar, daySummary, findItemRef, formatStay, shownWarnings, stopMarks, timelineRows, waitNote, WARNING_ICONS, warningsByItem, type BarSegment } from '../lib/planView.ts';
import { shortDayLabel } from '../lib/trip.ts';
import { TYPE_COLORS } from '../lib/typeStyle.ts';
import type { Place } from '../data/types.ts';
import { AvatarStack, PlaceChip } from './common.tsx';
import { LegRow } from './LegRow.tsx';
import { ReservationTag } from './Reservations.tsx';
import { ItemTags, useHasRestaurant } from './ItemTags.tsx';
import { useLiked } from './Wishlist.tsx';
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
    <span className="tl-card-type" style={{ background: typeColor(type === 'airport' ? null : type) }} aria-hidden data-testid="tl-card-type">
      {cardTypeLetter(type)}
    </span>
  );
}

/** 資料卡右上角的編號（和地圖同一個號碼），類型色的實心圓、白字 */
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

/** 編輯的手動選單；onTags：打開 tag 那一排的選單（造訪的卡片才有） */
function ItemMenu({ itemId, item, onTags }: { itemId: string; item: ItineraryItem; onTags?: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const byId = useData((s) => s.byId);
  const run = async (fn: Parameters<typeof shared.changeItinerary>[0], reason: string) => {
    setOpen(false);
    setConfirm(false);
    await shared.changeItinerary(fn, reason);
  };
  const label = item.type === 'visit' ? name(byId.get(item.options[item.selected]?.place ?? '')) : item.type === 'split' ? '分組' : '項目';
  // 分組的日子：可以移進某一組（放在那組的最前面）或移出分組（放在分組後面）
  const itinerary = useData((s) => s.itinerary);
  const ref = findItemRef(itinerary, itemId);
  const date = ref?.date ?? '';
  const dayItems = itinerary?.days.find((d) => d.date === date)?.items ?? [];
  const inGroup = !!ref?.split;
  const groupMoves =
    item.type === 'split'
      ? []
      : dayItems.flatMap((x) => (x.type === 'split' ? x.groups.filter((g) => g.id !== ref?.split?.group || x.id !== ref?.split?.id).map((g) => ({ splitId: x.id, groupId: g.id, name: g.name })) : []));
  const outIndex = ref?.split ? dayItems.findIndex((x) => x.id === ref.split!.id) + 1 : 0;
  const hasRestaurant = useHasRestaurant(item.type === 'visit' ? item : null);
  return (
    <span className="item-menu">
      <button type="button" className="icon-button small" aria-label={`${label} 的選單`} aria-expanded={open} onClick={() => setOpen(!open)} data-testid="item-menu">
        ⋯
      </button>
      {open && (
        <span className="menu" role="menu">
          {groupMoves.map((g) => (
            <button key={`${g.splitId}:${g.groupId}`} type="button" role="menuitem" onClick={() => void run((it) => moveItemTo(it, itemId, date, 0, { id: g.splitId, group: g.groupId }), `${label} 移到${g.name}`)}>
              👥 移到{g.name}
            </button>
          ))}
          {inGroup && (
            <button type="button" role="menuitem" onClick={() => void run((it) => moveItemTo(it, itemId, date, outIndex), `${label} 移出分組`)}>
              👥 移出分組（全員一起）
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              openDialog({ kind: 'move', itemId });
            }}
          >
            📅 移到第 _ 天
          </button>
          {item.type === 'visit' && onTags && (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onTags();
                }}
                data-testid="menu-tag-meal"
              >
                🍱 標用餐
              </button>
              {hasRestaurant && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onTags();
                  }}
                  data-testid="menu-tag-dining"
                >
                  👥 標吃法
                </button>
              )}
            </>
          )}
          {!confirm ? (
            <button type="button" role="menuitem" className="danger" onClick={() => setConfirm(true)} data-testid="item-delete">
              🗑 刪除
            </button>
          ) : (
            <button type="button" role="menuitem" className="danger" onClick={() => void run((it) => removeItem(it, itemId), `－${label}`)} data-testid="item-delete-confirm">
              🗑 確定刪除（會先存快照）
            </button>
          )}
        </span>
      )}
    </span>
  );
}

const name = (p: Place | undefined) => (p ? p.name.zh || p.name.ja : '（不明）');

/** 住宿這晚含的餐：照 lodgingMeals，沒填照住宿資料的 meals；「看方案」（varies）不顯示 */
function lodgingMealTags(day: ItineraryDay, p: Place | undefined): string[] {
  const meals = (day.lodgingMeals ?? p?.raw.meals ?? null) as LodgingMeals | 'varies' | null;
  if (meals === 'dinner+breakfast') return ['含晚餐', '含早餐'];
  if (meals === 'breakfast') return ['含早餐'];
  return [];
}

/** 住宿卡片的 ⋯ 選單：清掉這晚的住宿 */
function LodgingMenu({ date }: { date: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="item-menu">
      <button type="button" className="icon-button small" aria-label="住宿的選單" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="item-menu">
        ⋯
      </button>
      {open && (
        <span className="menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => {
              setOpen(false);
              void shared.changeItinerary((it) => setLodging(it, date, null), `清掉 ${shortDayLabel(date)} 的住宿`);
            }}
            data-testid="lodging-clear"
          >
            🗑 清掉這晚的住宿
          </button>
        </span>
      )}
    </span>
  );
}

const typeClass = (p: Place | undefined) => `type-${p?.type ?? 'other'}`;

interface ShownOption {
  placeId: string;
  /** 看的是主卡 */
  isMain: boolean;
  /** 那個選項自己填的停留分鐘（沒填是 null：引擎只替主卡算好時間） */
  stayMinutes: number | null;
  /** tag 那一排右邊的 ‹ n/m › */
  switcher: ReactNode;
  /** 編輯、看備卡時的「設為主要」「拿出來」 */
  actions: ReactNode;
}

/**
 * 有備卡的卡片（visit.options 超過一個）：本地 state shown 是「看的是第幾個」，只是看，不改主卡。
 * 右上角 👑 在看主卡時亮、看備卡時灰；‹ n/m › 或手機左右滑換卡；看備卡時地圖上那個點亮起來。
 * 編輯看備卡：「設為主要」（selectOption）、「拿出來」（放回這天的候選，可復原）。
 * onShown：看的備卡換了就告訴卡片（看主卡是 null），拖卡片時拖的就是那張備卡。
 */
function OptionStack({ visit, date, onShown, children }: { visit: VisitItem; date: string; onShown: (index: number | null) => void; children: (v: ShownOption) => ReactNode }) {
  const byId = useData((s) => s.byId);
  const planning = useApp((s) => s.planning);
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
  const label = name(byId.get(placeId));
  const makeMain = () => void shared.changeItinerary((it) => selectOption(it, visit.id, index), `${label} 設為主要`);
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
  const actions =
    planning && !isMain ? (
      <span className="option-actions">
        <button type="button" className="button small" onClick={makeMain} data-testid="option-make-main">
          👑 設為主要
        </button>
        <button type="button" className="text-button small" onClick={() => void putBackOption(visit.id, index, date)} data-testid="option-takeout">
          拿出來
        </button>
      </span>
    ) : null;
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
      {isMain || !planning ? (
        <span className={`option-crown ${isMain ? 'on' : ''}`} aria-label={isMain ? '主要' : '備案'} title={isMain ? '主要' : '備案'} data-testid="option-crown">
          👑
        </span>
      ) : (
        <button type="button" className="option-crown" aria-label="設為主要" title="設為主要" onClick={makeMain} data-testid="option-crown">
          👑
        </button>
      )}
      {children({ placeId, isMain, stayMinutes: option.stayMinutes ?? null, switcher, actions })}
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

  if (entry.kind === 'start') {
    return (
      <li className={`tl-row tl-card tl-start ${typeClass(p)}`} data-testid="tl-start" data-place={entry.placeId ?? ''}>
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
          </span>
        </span>
        <CardNo entry={entry} marks={marks} />
      </li>
    );
  }

  if (entry.kind === 'meet' && entry.groups) {
    return (
      <>
        <li className="tl-split" data-testid="tl-split">
          <div className="tl-split-head">
            <span>👥 分組行動</span>
            {planning && item && <ItemMenu itemId={item.id} item={item} />}
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
        <WaitRow entry={entry} item={null} plan={plan} />
        <li className={`tl-row tl-card tl-lodging ${typeClass(p)}`} data-testid="tl-row" data-place={entry.placeId ?? ''}>
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
                {planning && <LodgingMenu date={day.date} />}
              </span>
              <span className="item-tags">
                {lodgingMealTags(day, p).map((t) => (
                  <span key={t} className="badge tag-meal" data-testid="lodging-meal">
                    {t}
                  </span>
                ))}
                {p && <ReservationTag date={day.date} placeId={p.id} />}
              </span>
            </span>
          </span>
          <CardNo entry={entry} marks={marks} />
        </li>
      </>
    );
  }

  const visit = item?.type === 'visit' ? item : null;
  const flight = item?.type === 'flight' ? item : null;
  const time = cardTime(entry);
  // 編輯：電腦版拖曳、手機長按後拖（航班不能動）
  const movable = !!dragSrc;
  const itemWarnings = entry.itemId ? warnings.get(entry.itemId) : undefined;
  const stacked = visit && visit.options.length > 1 ? Math.min(visit.options.length - 1, 2) : 0;

  // 卡片的內容；有備卡時 v 是現在看的那個選項（名稱、類型圖示、❤️ 頭像、停留時間換成它）
  const content = (v?: ShownOption) => {
    const sp = v ? byId.get(v.placeId) : p;
    const liked = likedMap.get(v?.placeId ?? entry.placeId ?? '');
    const backup = !!v && !v.isMain;
    const stay = backup ? v.stayMinutes : time.stay;
    // 看備卡時：預約 tag、警告跟著那張備卡；⋯ 選單（刪除是刪整張卡片）收起來
    const shownPlace = v?.placeId ?? entry.placeId;
    const shownWarns = shownWarnings(itemWarnings, shownPlace, !backup);
    return (
      <span className="tl-card-inner">
        <CardType type={flight ? 'airport' : (sp?.type ?? null)} />
        <span className="tl-body">
          <span className="tl-timeline">
            {backup ? <span className="tl-start-time">{entry.start}</span> : <StartTime entry={entry} visit={visit} flight={flight} text={time.text} />}
            {!flight && stay != null && stay > 0 && <StayChip itemId={visit?.id ?? null} minutes={stay} readOnly={backup} />}
          </span>
          <span className="tl-title">
            <button type="button" className="link-button tl-name" onClick={() => focusPlace(v?.placeId ?? entry.placeId)} onMouseEnter={() => appStore.getState().hover(v?.placeId ?? entry.placeId)} onMouseLeave={() => appStore.getState().hover(null)}>
              {flight ? `${flight.direction === 'arrive' ? '抵達' : '起飛'} ${name(sp)}` : entry.kind === 'free' ? `自由時間${sp ? `：${name(sp)}` : ''}` : name(sp)}
            </button>
            {visit && liked && <AvatarStack ids={liked.likes} dislikes={liked.dislikes} />}
            <WarnToggle list={shownWarns} open={warnOpen} onToggle={() => setWarnOpen(!warnOpen)} />
            {planning && item && item.type !== 'flight' && !backup && <ItemMenu itemId={item.id} item={item} onTags={visit ? () => setTagsOpen(true) : undefined} />}
          </span>
          <span className="tl-meta">
            {visit && <ItemTags visit={visit} mealTag={entry.mealTag ?? null} date={day.date} placeId={shownPlace} open={tagsOpen} onOpenChange={setTagsOpen} />}
            {v?.switcher}
          </span>
          {v?.actions}
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
      <WaitRow entry={entry} item={visit} plan={plan} />
      <li
        className={`tl-row tl-card tl-${entry.kind} ${typeClass(p)} ${stacked ? `stacked stacked-${stacked}` : ''} ${hovered && hovered === entry.placeId ? 'flash' : ''} ${movable ? 'movable' : ''}`}
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
          <OptionStack visit={visit} date={day.date} onShown={setBackup}>
            {(v) => content(v)}
          </OptionStack>
        ) : (
          content()
        )}
        <CardNo entry={entry} marks={marks} />
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
  idle: { icon: '⏳', look: '看附近的景點', types: ['spot'] },
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
 * 交通卡下面、資料卡上面「到了要等」的那條（第五輪 §2）：文字是 waitNote；點了展開——看附近的景點（篩選＋地圖框住前後兩站）。
 * 不用等就不畫；會合那列自己寫「最早到的組等 N 分」
 */
function WaitRow({ entry, item, plan }: { entry: TimelineEntry; item: VisitItem | null; plan: DayPlan }) {
  const [open, setOpen] = useState(false);
  const byId = useData((s) => s.byId);
  const text = waitNote(entry, item, entry.placeId ? byId.get(entry.placeId) : undefined);
  if (!text) return null;
  const a = GAP_ACTIONS.idle;
  // 前一站：交通的起點，沒有交通時找時間軸上的前一列
  const prev = entry.travel?.from ?? plan.entries[plan.entries.indexOf(entry) - 1]?.placeId ?? null;
  const around = [prev, entry.placeId].filter((x): x is string => !!x);
  return (
    <li className="tl-wait-row" data-testid="tl-wait">
      <button type="button" className="tl-wait" aria-expanded={open} onClick={() => setOpen(!open)}>
        {text}
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

/** 標題的一行：幾點出發、幾點回住宿、交通總分鐘（含等車）、警告數 */
export function DaySummaryLine({ plan, warnOpen, onWarn, reminders = 0 }: { plan: DayPlan; warnOpen?: boolean; onWarn?: () => void; reminders?: number }) {
  const s = daySummary(plan);
  return (
    <span className="day-stats small" data-testid="day-summary">
      {[s.start && `${s.start} 出發`, s.back && `${s.back} 回住宿`, s.travelMinutes > 0 && `交通 ${formatStay(s.travelMinutes)}`].filter(Boolean).join('・')}
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

/** 按時間比例的橫條：一眼看出哪裡緊、哪裡空；分組的時段每組一條細線。點一段捲到那張卡片 */
export function DayBar({ plan, color, thin }: { plan: DayPlan; color: string; thin?: boolean }) {
  const byId = useData((s) => s.byId);
  const segs = dayBar(plan, (id) => (id ? (byId.get(id)?.type ?? null) : null));
  if (!segs.length) return null;
  const t0 = Math.min(...segs.map((s) => toMinutes(s.from)));
  const t1 = Math.max(...segs.map((s) => toMinutes(s.to)));
  const span = Math.max(1, t1 - t0);
  const lanes = Math.max(...segs.map((s) => s.lane));
  const jump = (itemId: string | null) => {
    if (!itemId) return;
    document.querySelector<HTMLElement>(`[data-testid="tl-row"][data-item="${CSS.escape(itemId)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  return (
    <div className="day-bar" data-testid="day-bar" style={{ ['--day' as string]: color }}>
      <div className="day-bar-track" style={{ height: thin ? (lanes ? 6 + lanes * 4 : 6) : lanes ? 10 + lanes * 6 : 10 }}>
        {segs.map((s, i) => (
          <button
            key={i}
            type="button"
            className={`day-bar-seg seg-${s.kind}`}
            style={{
              left: `${((toMinutes(s.from) - t0) / span) * 100}%`,
              width: `${((toMinutes(s.to) - toMinutes(s.from)) / span) * 100}%`,
              top: s.lane ? (thin ? 6 + (s.lane - 1) * 4 : 10 + (s.lane - 1) * 6) : 0,
              height: s.lane ? (thin ? 3 : 5) : thin ? 6 : 10,
            }}
            title={`${BAR_LABELS[s.kind]} ${s.from}–${s.to}`}
            aria-label={`${BAR_LABELS[s.kind]} ${s.from}–${s.to}`}
            onClick={() => jump(s.itemId)}
          />
        ))}
      </div>
      <div className="day-bar-scale small muted">
        <span>{fromMinutes(t0)}</span>
        <span>{fromMinutes(t1)}</span>
      </div>
    </div>
  );
}
