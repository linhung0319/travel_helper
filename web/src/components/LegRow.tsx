// 兩張資料卡中間的交通卡（第四輪設計 §5.1、§5.2）：圓角卡片，內容一直顯示，不收合——
// 第一行是方式、分鐘、計程車台數、等車、距離、📝 備註和 Google Maps 小圖示；搭電車、巴士、船時下面每一程一行。
// 點卡片：地圖只畫這一段（commands.drawRoute，搭車的照班次的站畫），每一程上下車的站亮起來；再點一次或點別段就恢復。
// 規劃模式下，點開的那張就在原地變成編輯狀態（不跳視窗）：自動／步行／計程車／大眾運輸、前一班後一班、備註；
// 算不出來（交通未定、指定的方式找不到班次）或已經填過分鐘時才出現「自己填分鐘」（清空＝回到自動）。按「完成」收起來。
// 一次只開一段（uiStore.legOpen）；這張卡不見了（換天、回整趟、換分頁）時也收起來，地圖的行程線才會恢復。
// 規劃模式下交通卡也是放置區：拖到這裡＝排在這段通往的那張卡片前面（planDrag.dropOnLegProps）。

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { getLegTravel, setLegTravel, type Itinerary, type Leg, type LegTarget, type TimelineEntry, type TravelSpec } from '@travel-helper/engine';
import type { TravelMode, TripRef } from '@travel-helper/engine/types';
import { commands, itineraryPathOf } from '../appCommands.ts';
import { dataStore } from '../dataStore.ts';
import { shared } from '../appShared.ts';
import { useApp, useData, useShared, useUi } from '../hooks.ts';
import { EDITOR_MODES, editorModeOf, formatDistance, legDetail, legMapsUrl, legTargetOf, legText, rideLines, showMinutesInput, type EditorMode } from '../lib/planView.ts';
import { rideStations } from '../lib/routing.ts';
import { haversineMeters } from '../lib/geo/distance.ts';
import { uiStore } from '../uiStore.ts';
import { dropOnLegProps } from './planDrag.ts';

/** 方式選單的字 */
const EDITOR_LABELS: Record<EditorMode, string> = { auto: '自動', walk: '🚶 步行', taxi: '🚕 計程車', transit: '🚃 大眾運輸' };
/** 選單不再提供的舊方式（卡片照原名寫） */
const LEGACY_LABELS: Partial<Record<TravelMode, string>> = { charter: '包車', car: '自駕', other: '其他' };

const isRide = (mode: Leg['mode']) => mode === 'train' || mode === 'bus' || mode === 'ferry';

/** 讀這段已經設定的值；找不到項目（剛被刪掉）時當作沒設定 */
function readSpec(it: Itinerary | null, target: LegTarget | null): TravelSpec | null {
  if (!it || !target) return null;
  try {
    return getLegTravel(it, target);
  } catch {
    return null;
  }
}

/** 舊的包車、自駕、其他：第一行接上原名（例如「・包車」），其他是空字串 */
function legacyLabel(spec: TravelSpec | null): string {
  return editorModeOf(spec) === 'legacy' && spec?.mode ? `・${LEGACY_LABELS[spec.mode] ?? spec.mode}` : '';
}

/** 規劃模式的編輯狀態：方式、班次、（算不出來時）分鐘、備註、完成 */
function LegEditor({ target, spec, leg }: { target: LegTarget; spec: TravelSpec | null; leg: Leg }) {
  const saving = useShared((s) => s.saving);
  // 每次都從最新的行程讀目前的設定再改
  const change = (fn: (cur: TravelSpec | null) => TravelSpec | null, label = '調整交通') => void shared.changeItinerary((it) => setLegTravel(it, target, fn(getLegTravel(it, target))), label);
  const current = editorModeOf(spec);
  const [minutes, setMinutes] = useState(spec?.minutes != null ? String(spec.minutes) : '');
  const [note, setNote] = useState(spec?.note ?? '');
  // 換方式時清掉班次和自己填的分鐘，只留備註
  const pickMode = (m: EditorMode) => {
    if (m === current) return;
    change((cur) => ({ ...(m === 'auto' ? {} : { mode: m }), ...(cur?.note ? { note: cur.note } : {}) }));
  };
  const pickTrip = (trip: TripRef) => change((cur) => ({ ...cur, mode: cur?.mode ?? 'transit', trip }), '換班次');
  const commitMinutes = () => {
    const n = minutes.trim() === '' ? null : Number(minutes);
    if (n != null && !(Number.isFinite(n) && n >= 0)) return setMinutes(spec?.minutes != null ? String(spec.minutes) : '');
    if (n !== (spec?.minutes ?? null)) change((cur) => ({ ...cur, minutes: n }));
  };
  const commitNote = () => {
    const v = note.trim() === '' ? null : note.trim();
    if (v !== (spec?.note ?? null)) change((cur) => ({ ...cur, note: v }));
  };
  const noTransit = leg.transitAvailable === false;
  const showTrips = current === 'transit' || isRide(leg.mode);
  // 清單的形狀（之後換 RAPTOR 會有好幾條候選），這一輪只有目前這班
  const trips = leg.trip ? [leg.trip] : [];
  const transfers = Math.max(0, leg.rides.length - 1);
  return (
    <div className="leg-edit" data-testid="leg-editor">
      <div className="leg-edit-row">
        <span className="leg-modes" role="group" aria-label="交通方式">
          {EDITOR_MODES.map((m) => (
            <button
              key={m}
              type="button"
              className="chip"
              aria-pressed={current === m}
              disabled={saving || (m === 'transit' && noTransit)}
              onClick={() => pickMode(m)}
              data-testid="leg-mode"
              data-mode={m}
            >
              {EDITOR_LABELS[m]}
            </button>
          ))}
        </span>
        {noTransit && (
          <span className="muted small" data-testid="leg-no-transit">
            這兩點之間沒有電車或巴士
          </span>
        )}
      </div>
      {showTrips && (
        <div className="leg-trips">
          <ul className="leg-trip-list">
            {trips.map((t) => (
              <li key={t.id} className="leg-trip" aria-current="true" data-testid="leg-trip">
                <b>
                  {t.depart} → {t.arrive}
                </b>
                <span className="muted small">
                  {' '}
                  {transfers ? `轉乘 ${transfers} 次` : '直達'}
                  {leg.rides.length > 0 && `・${leg.rides.map((r) => r.line).join(' → ')}`}
                </span>
              </li>
            ))}
            {trips.length === 0 && <li className="muted small">找不到班次</li>}
          </ul>
          <div className="leg-trip-nav">
            <button type="button" className="chip" disabled={saving || !leg.prevTrip} onClick={() => leg.prevTrip && pickTrip(leg.prevTrip)} data-testid="leg-prev-trip">
              ‹ 前一班
            </button>
            <button type="button" className="chip" disabled={saving || !leg.nextTrip} onClick={() => leg.nextTrip && pickTrip(leg.nextTrip)} data-testid="leg-next-trip">
              後一班 ›
            </button>
          </div>
        </div>
      )}
      {showMinutesInput(leg, spec) && (
        <div className="leg-edit-row">
          <span className="leg-edit-label">時間</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            className="leg-minutes"
            placeholder="分鐘"
            aria-label="自己填交通分鐘（空白：自動）"
            value={minutes}
            disabled={saving}
            onChange={(e) => setMinutes(e.target.value)}
            onBlur={commitMinutes}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            data-testid="leg-minutes"
          />
          <span className="muted small">分</span>
        </div>
      )}
      <div className="leg-edit-row">
        <span className="leg-edit-label">備註</span>
        <input
          type="text"
          className="leg-note"
          placeholder="例如：在車站前集合"
          aria-label="交通備註"
          value={note}
          disabled={saving}
          onChange={(e) => setNote(e.target.value)}
          onBlur={commitNote}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          data-testid="leg-note"
        />
        <button type="button" className="chip" onClick={() => uiStore.setState({ legOpen: null })} data-testid="leg-done">
          完成
        </button>
      </div>
    </div>
  );
}

/** 時間軸上的一段交通（交通卡）；date 是這天的日期 */
export function LegRow({ entry, date }: { entry: TimelineEntry; date: string }) {
  const leg = entry.travel;
  const byId = useData((s) => s.byId);
  const itinerary = useData((s) => s.itinerary);
  const planning = useApp((s) => s.planning);
  const target = legTargetOf(entry, date);
  // 每一段交通有自己的 key（起點、會合這類不能改的也可以點，但不會開到別段）
  const key = `${date}:${entry.kind === 'lodging' ? 'lodging' : `${entry.kind}:${entry.itemId ?? entry.placeId ?? ''}`}`;
  const open = useUi((s) => s.legOpen) === key;
  const routes = useApp((s) => s.routes);
  const spec = readSpec(itinerary, target);
  // 使用者設定過的（包含分鐘填 0）或有備註的不能藏起來，否則改不回來
  const userSet = !!leg?.specified || !!spec;
  const hidden = !leg || (!userSet && (leg.mode === 'none' || (leg.minutes === 0 && !leg.rides.length)));
  const nameOf = (id: string) => byId.get(id)?.name.zh || byId.get(id)?.name.ja || id;
  const fromId = leg?.from ?? null;
  const toId = leg?.to ?? null;
  const mode: TravelMode = leg && leg.mode !== 'none' && leg.mode !== 'unknown' ? leg.mode : 'other';
  const minutes = leg?.minutes ?? 0;
  const ridesKey = leg ? leg.rides.map((r) => `${r.mode}:${r.from}>${r.to}`).join('|') : '';
  // 班次本身放 ref：時間軸重算時陣列換了但站一樣，不用重畫
  const ridesRef = useRef(leg?.rides ?? []);
  ridesRef.current = leg?.rides ?? [];

  // 點開時地圖只畫這一段，每一程上下車的站亮起來；收起來（或換成別段、離開）就清掉
  useEffect(() => {
    if (!open || !fromId || !toId) return;
    commands.clearHighlights();
    const rides = ridesRef.current;
    // 搭車的照班次的站畫（和地圖上整天的行程線一樣）；其他交給 routeResolver 查
    const byId = dataStore.getState().byId;
    const a = byId.get(fromId);
    const b = byId.get(toId);
    const geometry = rides.length && a && b && isRide(mode) ? itineraryPathOf(a, b, mode, rides) : null;
    commands.drawRoute(fromId, toId, mode, { minutes, geometry });
    const stations = rideStations(rides).filter((id) => byId.has(id));
    if (stations.length) commands.highlight(stations);
    return () => void commands.clearHighlights();
  }, [open, fromId, toId, mode, minutes, ridesKey]);

  // 這張卡不見了（換天、回整趟、換分頁）或換成別段時，開著的是這段就收起來，否則地圖的行程線一直是淡的
  useEffect(() => {
    if (!open) return;
    return () => {
      if (uiStore.getState().legOpen === key) uiStore.setState({ legOpen: null });
    };
  }, [open, key]);

  if (hidden || !leg) return null;
  const detail = legDetail(leg);
  const editing = open && planning && !!target;
  const from = fromId ? byId.get(fromId) : undefined;
  const to = toId ? byId.get(toId) : undefined;
  const rides = rideLines(leg, nameOf);
  // 距離：這段畫在地圖上的路線查到了就用（沿道路），否則直線距離
  const drawn = routes.find((r) => r.from.place === fromId && r.to.place === toId && r.meters != null && r.source !== 'pending');
  const straight = from && to ? haversineMeters(from.coords, to.coords) : null;
  const distance = drawn?.meters != null ? (drawn.source === 'straight' ? `${formatDistance(drawn.meters)}（直線）` : formatDistance(drawn.meters)) : straight != null ? `${formatDistance(straight)}（直線）` : null;
  // 點卡片上任何地方都切換（編輯區、地圖連結裡的點擊不算）；鍵盤用第一行的按鈕
  const toggle = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('a, .leg-edit')) return;
    uiStore.setState({ legOpen: open ? null : key });
  };
  return (
    <li className={`tl-leg mode-${leg.mode} ${open ? 'open' : ''}`} data-testid="tl-leg" {...dropOnLegProps(entry.itemId, date, planning)}>
      <div className="tl-leg-card" onClick={toggle}>
        <div className="tl-leg-head">
          <button type="button" className="tl-leg-text" aria-pressed={open}>
            {legText(leg) || '交通 0 分'}
            {legacyLabel(spec)}
            {distance && `・${distance}`}
            {detail.length > 0 && <span className="small">（{detail.join('、')}）</span>}
          </button>
          {spec?.note && !editing && (
            <span className="tl-leg-note" data-testid="leg-note-text">
              📝 {spec.note}
            </span>
          )}
          {from && to && (
            <a className="leg-maps" href={legMapsUrl(from, to, mode)} target="_blank" rel="noreferrer" aria-label="在 Google Maps 開路線" title="在 Google Maps 開路線" data-testid="leg-maps">
              🗺️
            </a>
          )}
        </div>
        {rides.length > 0 && (
          <ul className="leg-rides">
            {rides.map((line, i) => (
              <li key={i} className={line.startsWith('轉乘') ? 'leg-transfer' : ''} data-testid="leg-ride">
                {line}
              </li>
            ))}
          </ul>
        )}
        {editing && target && <LegEditor key={JSON.stringify(spec)} target={target} spec={spec} leg={leg} />}
      </div>
    </li>
  );
}
