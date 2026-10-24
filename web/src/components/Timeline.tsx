// 這一天的時間軸（interaction-design §3、§6）：引擎算好的項目、相鄰兩點之間的交通、空檔、警告。
// 手機是直的清單，電腦放在地圖下方。點項目地圖跳過去；空檔可以點（看附近的餐廳）。
// 一般模式只顯示要看的（設計 §6）：開始時間、編號、類型圖示、名稱、停留時間、tag、❤️ 頭像、⚠ 數。
// 規劃模式下才有：停留時間 −／＋、點開始時間固定（📌）、⋯ 選單（刪除、移到第 _ 天、移進／移出分組、標用餐、標吃法）、
// 拖卡片換順序（電腦版拖、手機長按後拖）、多點卡片的「設為主要」「從這張卡片拿掉」、住宿的「換住宿」。

import { useEffect, useState } from 'react';
import { moveItemTo, removeItem, removeOption, selectOption, setLodging, fromMinutes, setStart, setStay, toMinutes, type DayPlan, type EngineWarning, type Gap, type LodgingMeals, type TimelineEntry } from '@travel-helper/engine';
import type { ItineraryDay, ItineraryItem, VisitItem } from '@travel-helper/engine/types';
import { appStore } from '../store.ts';
import { commands } from '../appCommands.ts';
import { shared } from '../appShared.ts';
import { useApp, useData, useIsDesktop } from '../hooks.ts';
import { dropOnEndProps, dropOnItemProps, itemDragProps, useLongPressDrag } from './planDrag.ts';
import { openDialog } from '../uiStore.ts';
import { dayBar, daySummary, findItemRef, formatStay, optionRows, stopMarks, timelineRows, WARNING_ICONS, warningsByItem, type BarSegment } from '../lib/planView.ts';
import { dayColor } from '../lib/visual.ts';
import { shortDayLabel, tripDates } from '../lib/trip.ts';
import { TYPE_ICONS } from '../lib/typeStyle.ts';
import { TYPE_LABELS } from '../lib/filter.ts';
import type { Place } from '../data/types.ts';
import { AvatarStack, PlaceChip } from './common.tsx';
import { LegRow } from './LegRow.tsx';
import { ReservationTag } from './Reservations.tsx';
import { ItemTags, useHasRestaurant } from './ItemTags.tsx';
import { useLiked } from './Wishlist.tsx';
import { showList } from './SidePanel.tsx';

const DATES = tripDates();

/** 地圖上同一個編號（宿、1、2…），那天的顏色 */
interface Marks {
  byEntry: Map<TimelineEntry, string>;
  color: string;
}

function Mark({ entry, marks }: { entry: TimelineEntry; marks: Marks }) {
  const label = marks.byEntry.get(entry);
  if (!label) return null;
  return (
    <span className="tl-mark" style={{ background: marks.color }} data-testid="tl-mark">
      {label}
    </span>
  );
}

function focusPlace(id: string | null) {
  if (!id) return;
  commands.focus(id);
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

/** 規劃模式的手動選單；onTags：打開 tag 那一排的選單（造訪的卡片才有） */
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

/**
 * 多點卡片展開的「這個時段也可以去」：★ 主要、名稱、類型、❤️ 頭像、離主要那個走幾分。點一列地圖飛過去（不改主要）。
 * 規劃模式下每列多「設為主要」（後面的時間重算）、「從這張卡片拿掉」（放回這天的候選）。
 */
function OptionsList({ item, date }: { item: VisitItem; date: string }) {
  const byId = useData((s) => s.byId);
  const planning = useApp((s) => s.planning);
  const liked = useLiked();
  const rows = optionRows(item, byId);
  const makeMain = (index: number, p: Place) => void shared.changeItinerary((it) => selectOption(it, item.id, index), `${name(p)} 設為主要`);
  const takeOut = async (index: number, p: Place) => {
    const r = await shared.changeItinerary((it) => removeOption(it, item.id, index), `${name(p)} 從卡片拿掉`);
    if (r.ok) await shared.addCandidate(p.id, date);
  };
  return (
    <div className="tl-options" data-testid="options-list">
      <span className="tl-options-title small muted">這個時段也可以去</span>
      <ul>
        {rows.map((r) => {
          const l = liked.get(r.place.id);
          return (
            <li key={r.index} className={`tl-option ${r.main ? 'main' : ''}`} data-testid="option-row" data-place={r.place.id} data-main={r.main}>
              <button type="button" className="tl-option-name" onClick={() => focusPlace(r.place.id)}>
                <span className="tl-option-star" aria-label={r.main ? '主要' : undefined}>
                  {r.main ? '★' : ''}
                </span>
                {TYPE_ICONS[r.place.type]} {name(r.place)}
                <span className="muted small"> {TYPE_LABELS[r.place.type]}</span>
              </button>
              {l && <AvatarStack ids={l.likes} dislikes={l.dislikes} />}
              {r.walkMinutesFromMain != null && <span className="muted small">走 {r.walkMinutesFromMain} 分</span>}
              {planning && !r.main && (
                <button type="button" className="text-button small" onClick={() => makeMain(r.index, r.place)} data-testid="option-make-main">
                  設為主要
                </button>
              )}
              {planning && (
                <button type="button" className="text-button small" onClick={() => void takeOut(r.index, r.place)} data-testid="option-remove">
                  從這張卡片拿掉
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** 住宿這晚含的餐：照 lodgingMeals，沒填照住宿資料的 meals；「看方案」（varies）不顯示 */
function lodgingMealTags(day: ItineraryDay, p: Place | undefined): string[] {
  const meals = (day.lodgingMeals ?? p?.raw.meals ?? null) as LodgingMeals | 'varies' | null;
  if (meals === 'dinner+breakfast') return ['含晚餐', '含早餐'];
  if (meals === 'breakfast') return ['含早餐'];
  return [];
}

/** 住宿卡片的「換住宿」：切到想去分頁、類型設成住宿（地區篩選照現在的），在那裡按「設為 2/5 的住宿」 */
function changeLodging() {
  showList('wish');
  appStore.getState().setSheet({ tab: 'wish' });
  commands.setFilter({ types: ['lodging'] });
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

function EntryRow({ entry, day, warnings, gapsBeforeMeet, plan, marks }: { entry: TimelineEntry; day: ItineraryDay; warnings: Map<string, EngineWarning[]>; gapsBeforeMeet?: Gap[]; plan?: DayPlan; marks: Marks }) {
  const byId = useData((s) => s.byId);
  const itinerary = useData((s) => s.itinerary);
  const planning = useApp((s) => s.planning);
  const hovered = useApp((s) => s.hoveredId);
  const [warnOpen, setWarnOpen] = useState(false);
  const desktop = useIsDesktop();
  const ref = entry.itemId ? findItemRef(itinerary, entry.itemId) : null;
  const item = ref?.item ?? null;
  // 手機：長按後拖（hook 不能放在下面的提前 return 之後）
  const pressRef = useLongPressDrag<HTMLLIElement>(entry.itemId, planning && !desktop && !!item && item.type !== 'flight');
  const p = entry.placeId ? byId.get(entry.placeId) : undefined;
  const liked = useLiked().get(entry.placeId ?? '');
  const [tagsOpen, setTagsOpen] = useState(false);
  const [optsOpen, setOptsOpen] = useState(false);
  const optionPlaces = item?.type === 'visit' && item.options.length > 1 ? item.options.map((o) => o.place) : null;
  const optionKey = optsOpen && optionPlaces ? optionPlaces.join('|') : '';
  // 展開多點卡片時，地圖上這幾個點亮起來（主要實心、其他空心是行程圖層本來的畫法）；收起來時清掉自己亮的
  useEffect(() => {
    if (!optionKey) return;
    const ids = optionKey.split('|');
    commands.highlight(ids);
    return () => {
      const now = appStore.getState().highlights.primary ?? [];
      if (now.length === ids.length && now.every((x) => ids.includes(x))) commands.highlight([]);
    };
  }, [optionKey]);

  if (entry.kind === 'start') {
    return (
      <li className="tl-row tl-start">
        <span className="tl-time">{entry.start}</span>
        <span className="tl-body muted">
          <span className="tl-title">
            <Mark entry={entry} marks={marks} />
            從 {p ? `${TYPE_ICONS[p.type]} ${name(p)}` : '上一站'} 出發
          </span>
        </span>
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
                  <ol className="tl">
                    {g.entries
                      .filter((e) => e.kind !== 'meet')
                      .map((e, i) => (
                        <EntryRow key={i} entry={e} day={day} warnings={warnings} marks={marks} />
                      ))}
                  </ol>
                </div>
              );
            })}
          </div>
          <Warnings list={item ? warnings.get(item.id) : undefined} />
        </li>
        {plan && gapsBeforeMeet?.map((g, i) => <GapRow key={i} gap={g} plan={plan} />)}
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
        <li className="tl-row tl-lodging" data-testid="tl-row">
          <span className="tl-time">{entry.arrive}</span>
          <span className="tl-body">
            <span className="tl-title">
              <Mark entry={entry} marks={marks} />
              🏨 住宿：{p ? <PlaceChip id={p.id} /> : entry.placeId}
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
            {planning && (
              <span>
                <button type="button" className="button small" onClick={changeLodging} data-testid="lodging-change">
                  🔁 換住宿
                </button>
              </span>
            )}
          </span>
        </li>
      </>
    );
  }

  const visit = item?.type === 'visit' ? item : null;
  const flight = item?.type === 'flight' ? item : null;
  const icon = entry.kind === 'flight' ? '✈️' : entry.kind === 'free' ? '☕' : p ? TYPE_ICONS[p.type] : '📍';
  const stay = toMinutes(entry.end) - toMinutes(entry.start);
  // 規劃模式：電腦版拖曳、手機長按後拖（航班不能動）
  const movable = planning && !!item && item.type !== 'flight';
  const itemWarnings = entry.itemId ? warnings.get(entry.itemId) : undefined;
  return (
    <>
      <LegRow entry={entry} date={day.date} />
      <li
        className={`tl-row tl-card tl-${entry.kind} ${hovered && hovered === entry.placeId ? 'flash' : ''} ${movable ? 'movable' : ''}`}
        data-testid="tl-row"
        data-item={entry.itemId ?? ''}
        data-place={entry.placeId ?? ''}
        ref={pressRef}
        {...(movable && entry.itemId ? { ...(desktop ? itemDragProps(entry.itemId, entry.placeId, true) : {}), ...dropOnItemProps(entry.itemId, true) } : {})}
      >
        <span className="tl-time">
          <StartTime entry={entry} visit={visit} flight={flight} />
          {entry.waitMinutes > 0 && <span className="tl-wait">等 {entry.waitMinutes} 分</span>}
        </span>
        <span className="tl-body">
          <span className="tl-title">
            <Mark entry={entry} marks={marks} />
            <button type="button" className="link-button tl-name" onClick={() => focusPlace(entry.placeId)} onMouseEnter={() => appStore.getState().hover(entry.placeId)} onMouseLeave={() => appStore.getState().hover(null)}>
              {icon} {flight ? `${flight.direction === 'arrive' ? '抵達' : '起飛'} ${name(p)}` : entry.kind === 'free' ? `自由時間${p ? `：${name(p)}` : ''}` : name(p)}
            </button>
            {visit && visit.options.length > 1 && (
              <button type="button" className="badge options-toggle" aria-expanded={optsOpen} aria-label={`這個時段也可以去：另外 ${visit.options.length - 1} 個`} onClick={() => setOptsOpen(!optsOpen)} data-testid="options-toggle">
                ＋{visit.options.length - 1}
              </button>
            )}
            {visit && liked && <AvatarStack ids={liked.likes} dislikes={liked.dislikes} />}
            <WarnToggle list={itemWarnings} open={warnOpen} onToggle={() => setWarnOpen(!warnOpen)} />
            {planning && item && item.type !== 'flight' && <ItemMenu itemId={item.id} item={item} onTags={visit ? () => setTagsOpen(true) : undefined} />}
          </span>
          <span className="tl-meta">
            {!flight && stay > 0 && <StayChip itemId={visit?.id ?? null} minutes={stay} />}
            {visit && <ItemTags visit={visit} mealTag={entry.mealTag ?? null} date={day.date} placeId={entry.placeId} open={tagsOpen} onOpenChange={setTagsOpen} />}
          </span>
          {flight?.note && <span className="muted small">{flight.note}（{flight.depart} 起飛 → {flight.arrive} 抵達）</span>}
          {visit && optsOpen && visit.options.length > 1 && <OptionsList item={visit} date={day.date} />}
          {visit?.note && <span className="tl-note small">📝 {visit.note}</span>}
          {warnOpen && <Warnings list={itemWarnings} />}
        </span>
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

/** 開始時間（大字）；固定時間（訂位、表演）標 📌。規劃模式下點了切換固定／不固定 */
function StartTime({ entry, visit, flight }: { entry: TimelineEntry; visit: VisitItem | null; flight: Extract<ItineraryItem, { type: 'flight' }> | null }) {
  const planning = useApp((s) => s.planning);
  const time = flight ? (flight.direction === 'arrive' ? flight.arrive : flight.depart) : entry.start;
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

/** 停留時間的標籤；規劃模式下 −15／＋15（後面的時間跟著重算） */
function StayChip({ itemId, minutes }: { itemId: string | null; minutes: number }) {
  const planning = useApp((s) => s.planning);
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
      <span>⏱ {formatStay(minutes)}</span>
      {planning && itemId && (
        <button type="button" aria-label="多 15 分" onClick={() => change(15)} data-testid="stay-plus">
          ＋
        </button>
      )}
    </span>
  );
}


const GAP_ACTIONS: Record<Gap['kind'], { icon: string; look: string; types: ('restaurant' | 'spot' | 'lodging')[]; contexts?: ('lunch' | 'dinner')[] }> = {
  lodging: { icon: '🏨', look: '看住宿', types: ['lodging'] },
  idle: { icon: '⏳', look: '看附近的景點', types: ['spot'] },
};

/** 空檔：點了展開——看附近的餐廳／景點（篩選＋地圖框住前後兩站） */
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
              commands.setFilter({ types: a.types, contexts: a.contexts ?? [] });
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
  const byId = useData((s) => s.byId);
  const planning = useApp((s) => s.planning);
  const { byItem } = warningsByItem(plan);
  const marks: Marks = { byEntry: stopMarks(plan, (id) => byId.get(id)?.type === 'lodging').byEntry, color: dayColor(DATES, day.date) };
  return (
    <ol className="tl" data-testid="timeline">
      {timelineRows(plan).map((row, i) =>
        row.kind === 'gap' ? <GapRow key={`g${i}`} gap={row.gap} plan={plan} /> : <EntryRow key={`e${i}`} entry={row.entry} day={day} warnings={byItem} gapsBeforeMeet={row.gapsBeforeMeet} plan={plan} marks={marks} />,
      )}
      {planning && (
        <li className="tl-dropend small muted" data-testid="tl-dropend" {...dropOnEndProps(day.date, true)}>
          拖到這裡：放在這天的最後
        </li>
      )}
    </ol>
  );
}

const minutesText = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} 小時${m % 60 ? ` ${m % 60} 分` : ''}` : `${m} 分`);

/** 標題的一行：幾點出發、幾點回住宿、交通多久（含緩衝）、警告數 */
export function DaySummaryLine({ plan, warnOpen, onWarn, reminders = 0 }: { plan: DayPlan; warnOpen?: boolean; onWarn?: () => void; reminders?: number }) {
  const s = daySummary(plan);
  return (
    <span className="day-stats small" data-testid="day-summary">
      {[s.start && `${s.start} 出發`, s.back && `${s.back} 回住宿`, s.travelMinutes > 0 && `交通 ${minutesText(s.travelMinutes)}`].filter(Boolean).join('・')}
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

const BAR_LABELS: Record<BarSegment['kind'], string> = { visit: '停留', meal: '用餐', travel: '交通', idle: '空著' };

/** 按時間比例的橫條：一眼看出哪裡緊、哪裡空；分組的時段每組一條細線。點一段捲到那張卡片 */
export function DayBar({ plan, color, thin }: { plan: DayPlan; color: string; thin?: boolean }) {
  const segs = dayBar(plan);
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
