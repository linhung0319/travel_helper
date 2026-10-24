// 這一天的時間軸（interaction-design §3、§6）：引擎算好的項目、相鄰兩點之間的交通、空檔、警告。
// 手機是直的清單，電腦放在地圖下方。點項目地圖跳過去；空檔可以點（看附近的餐廳）。
// 規劃模式下：電腦版拖卡片換順序（手機長按後拖），每個項目有選單（刪除、移到第 _ 天、移進／移出分組、切換備案）。

import { useState } from 'react';
import { moveItemTo, removeItem, selectOption, setLodging, fromMinutes, setStart, setStay, toMinutes, type DayPlan, type EngineWarning, type Gap, type TimelineEntry } from '@travel-helper/engine';
import type { ItineraryDay, ItineraryItem, VisitItem } from '@travel-helper/engine/types';
import { appStore } from '../store.ts';
import { commands } from '../appCommands.ts';
import { shared } from '../appShared.ts';
import { useApp, useData, useIsDesktop } from '../hooks.ts';
import { dropOnEndProps, dropOnItemProps, itemDragProps, useLongPressDrag } from './planDrag.ts';
import { openDialog } from '../uiStore.ts';
import { dayBar, daySummary, findItemRef, formatStay, legDetail, legText, stopMarks, timelineRows, WARNING_ICONS, warningsByItem, type BarSegment } from '../lib/planView.ts';
import { dayColor } from '../lib/visual.ts';
import { tripDates } from '../lib/trip.ts';
import { TYPE_ICONS } from '../lib/typeStyle.ts';
import type { Place } from '../data/types.ts';
import { MemberName, PlaceChip } from './common.tsx';

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

const MEAL_LABELS: Record<string, string> = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '點心' };

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

function Leg({ entry }: { entry: TimelineEntry }) {
  const leg = entry.travel;
  if (!leg || leg.mode === 'none' || (leg.minutes === 0 && !leg.rides.length)) return null;
  const detail = legDetail(leg);
  return (
    <li className={`tl-leg mode-${leg.mode}`} data-testid="tl-leg">
      <span className="tl-leg-line" aria-hidden />
      <span className="tl-leg-text">
        {legText(leg)}
        {detail.length > 0 && <span className="muted small">（{detail.join('、')}）</span>}
      </span>
    </li>
  );
}

/** 規劃模式的手動選單 */
function ItemMenu({ itemId, item }: { itemId: string; item: ItineraryItem }) {
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
          {item.type === 'visit' &&
            item.options.map((o, i) =>
              i === item.selected ? null : (
                <button key={i} type="button" role="menuitem" onClick={() => void run((it) => selectOption(it, itemId, i), `改用備案：${name(byId.get(o.place))}`)}>
                  🔁 改用備案：{name(byId.get(o.place))}
                </button>
              ),
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

/** 時段備案：主選／備選；規劃模式下點備選就切換（引擎用主選算） */
function Options({ item }: { item: VisitItem }) {
  const byId = useData((s) => s.byId);
  const planning = useApp((s) => s.planning);
  if (item.options.length < 2) return null;
  return (
    <div className="tl-options">
      {item.options.map((o, i) => (
        <button
          key={i}
          type="button"
          className={`option ${i === item.selected ? 'on' : ''}`}
          disabled={!planning && i !== item.selected}
          title={planning ? '點了切換，時間軸會重算' : '規劃模式才能切換'}
          onClick={() => {
            if (i === item.selected) return focusPlace(o.place);
            if (planning) void shared.changeItinerary((it) => selectOption(it, item.id, i), `改用備案：${name(byId.get(o.place))}`);
          }}
        >
          {i === item.selected ? '主' : '備'}：{name(byId.get(o.place))}
        </button>
      ))}
    </div>
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
        <Leg entry={entry} />
        <li className="tl-row tl-lodging" data-testid="tl-row">
          <span className="tl-time">{entry.arrive}</span>
          <span className="tl-body">
            <span className="tl-title">
              <Mark entry={entry} marks={marks} />
              🏨 住宿：{p ? <PlaceChip id={p.id} /> : entry.placeId}
              {planning && (
                <button type="button" className="text-button small" onClick={() => void shared.changeItinerary((it) => setLodging(it, day.date, null), `清掉 ${day.date} 的住宿`)}>
                  清掉
                </button>
              )}
            </span>
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
      <Leg entry={entry} />
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
            {entry.meal && <span className="badge">{MEAL_LABELS[entry.meal]}</span>}
            <WarnToggle list={itemWarnings} open={warnOpen} onToggle={() => setWarnOpen(!warnOpen)} />
            {planning && item && item.type !== 'flight' && <ItemMenu itemId={item.id} item={item} />}
          </span>
          {!flight && stay > 0 && <StayChip itemId={visit?.id ?? null} minutes={stay} />}
          {flight?.note && <span className="muted small">{flight.note}（{flight.depart} 起飛 → {flight.arrive} 抵達）</span>}
          {visit && <Options item={visit} />}
          {visit?.note && <span className="tl-note small">📝 {visit.note}</span>}
          {visit?.travel?.note && <span className="muted small">交通：{visit.travel.note}</span>}
          {visit?.proposedBy?.length ? (
            <span className="muted small">
              💬 {visit.proposedBy.map((m, i) => (
                <span key={m}>
                  {i > 0 && '、'}
                  <MemberName id={m} />
                </span>
              ))}{' '}
              提的
            </span>
          ) : null}
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
export function DaySummaryLine({ plan, warnOpen, onWarn }: { plan: DayPlan; warnOpen?: boolean; onWarn?: () => void }) {
  const s = daySummary(plan);
  return (
    <span className="day-stats small" data-testid="day-summary">
      {[s.start && `${s.start} 出發`, s.back && `${s.back} 回住宿`, s.travelMinutes > 0 && `交通 ${minutesText(s.travelMinutes)}`].filter(Boolean).join('・')}
      {s.warnings > 0 &&
        (onWarn ? (
          <button type="button" className="badge badge-warn warn-button" aria-expanded={!!warnOpen} onClick={onWarn} data-testid="day-warn-toggle">
            ⚠ {s.warnings} {warnOpen ? '▴' : '▾'}
          </button>
        ) : (
          <span className="badge badge-warn">⚠ {s.warnings}</span>
        ))}
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
              top: s.lane ? 10 + (s.lane - 1) * 6 : 0,
              height: s.lane ? 5 : 10,
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
