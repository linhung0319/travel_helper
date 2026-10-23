// 這一天的時間軸（interaction-design §3、§6）：引擎算好的項目、相鄰兩點之間的交通、空檔、警告。
// 手機是直的清單，電腦放在地圖下方。點項目地圖跳過去；空檔可以點（看附近的餐廳、寫建議）。
// 規劃模式下每個項目有手動選單（刪除、移到第 _ 天、上移／下移、切換備案）。

import { useState } from 'react';
import { moveItem, removeItem, selectOption, setLodging, type DayPlan, type EngineWarning, type Gap, type TimelineEntry } from '@travel-helper/engine';
import type { ItineraryDay, ItineraryItem, VisitItem } from '@travel-helper/engine/types';
import { appStore } from '../store.ts';
import { commands } from '../appCommands.ts';
import { shared } from '../appShared.ts';
import { useApp, useData } from '../hooks.ts';
import { openDialog } from '../uiStore.ts';
import { findItemRef, legDetail, legText, stopMarks, timelineRows, WARNING_ICONS, warningsByItem } from '../lib/planView.ts';
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
  return (
    <span className="item-menu">
      <button type="button" className="icon-button small" aria-label={`${label} 的選單`} aria-expanded={open} onClick={() => setOpen(!open)} data-testid="item-menu">
        ⋯
      </button>
      {open && (
        <span className="menu" role="menu">
          <button type="button" role="menuitem" onClick={() => void run((it) => moveItem(it, itemId, 'up'), `${label} 上移`)}>
            ⬆ 上移
          </button>
          <button type="button" role="menuitem" onClick={() => void run((it) => moveItem(it, itemId, 'down'), `${label} 下移`)}>
            ⬇ 下移
          </button>
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
  const ref = entry.itemId ? findItemRef(itinerary, entry.itemId) : null;
  const item = ref?.item ?? null;
  const p = entry.placeId ? byId.get(entry.placeId) : undefined;
  const timeRange = entry.start === entry.end ? entry.start : `${entry.start}–${entry.end}`;

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
  return (
    <>
      <Leg entry={entry} />
      <li className={`tl-row tl-${entry.kind} ${hovered && hovered === entry.placeId ? 'flash' : ''}`} data-testid="tl-row" data-item={entry.itemId ?? ''} data-place={entry.placeId ?? ''}>
        <span className="tl-time">
          {flight ? (flight.direction === 'arrive' ? flight.arrive : flight.depart) : timeRange}
          {entry.waitMinutes > 0 && <span className="tl-wait">等 {entry.waitMinutes} 分</span>}
        </span>
        <span className="tl-body">
          <span className="tl-title">
            <Mark entry={entry} marks={marks} />
            <button type="button" className="link-button" onClick={() => focusPlace(entry.placeId)} onMouseEnter={() => appStore.getState().hover(entry.placeId)} onMouseLeave={() => appStore.getState().hover(null)}>
              {icon} {flight ? `${flight.direction === 'arrive' ? '抵達' : '起飛'} ${name(p)}` : entry.kind === 'free' ? `自由時間${p ? `：${name(p)}` : ''}` : name(p)}
            </button>
            {entry.meal && <span className="badge">{MEAL_LABELS[entry.meal]}</span>}
            {visit?.start && <span className="badge" title="指定的開始時間（訂位、表演）">⏰ {visit.start}</span>}
            {planning && item && item.type !== 'flight' && <ItemMenu itemId={item.id} item={item} />}
          </span>
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
          <Warnings list={entry.itemId ? warnings.get(entry.itemId) : undefined} />
        </span>
      </li>
    </>
  );
}


const GAP_ACTIONS: Record<Gap['kind'], { icon: string; look: string; types: ('restaurant' | 'spot' | 'lodging')[]; contexts?: ('lunch' | 'dinner')[] }> = {
  lunch: { icon: '🍴', look: '看附近可以吃午餐的', types: ['restaurant'], contexts: ['lunch'] },
  dinner: { icon: '🍴', look: '看附近可以吃晚餐的', types: ['restaurant'], contexts: ['dinner'] },
  lodging: { icon: '🏨', look: '看住宿', types: ['lodging'] },
  idle: { icon: '⏳', look: '看附近的景點', types: ['spot'] },
};

/** 空檔：點了展開——看附近的餐廳／景點（篩選＋地圖框住前後兩站）、寫建議 */
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
          <button type="button" className="text-button" onClick={() => openDialog({ kind: 'suggest', day: gap.date })}>
            ✏️ 寫建議
          </button>
        </span>
      )}
    </li>
  );
}

export function Timeline({ plan, day }: { plan: DayPlan; day: ItineraryDay }) {
  const byId = useData((s) => s.byId);
  const { byItem } = warningsByItem(plan);
  const marks: Marks = { byEntry: stopMarks(plan, (id) => byId.get(id)?.type === 'lodging').byEntry, color: dayColor(DATES, day.date) };
  return (
    <ol className="tl" data-testid="timeline">
      {timelineRows(plan).map((row, i) =>
        row.kind === 'gap' ? <GapRow key={`g${i}`} gap={row.gap} plan={plan} /> : <EntryRow key={`e${i}`} entry={row.entry} day={day} warnings={byItem} gapsBeforeMeet={row.gapsBeforeMeet} plan={plan} marks={marks} />,
      )}
    </ol>
  );
}
