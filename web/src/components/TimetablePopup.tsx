// 地圖那側的班次表（T29c spec §8.8）：點交通卡步驟裡的上車站、或那一程「錯過的話」的標籤打開（uiStore.timetable）。只能看。
// 標題是圖示＋「上車站 → 下車站」，下一行「業者或路線・往哪・日期（星期）・HH:MM 到站」（巴士加票價）；標題列固定，下面的格子在彈窗裡捲。
// 格子一班一格（departureCells）：第一行「發車–到站」，第二行車種（特急靛藍字）＋標記（規劃、+N 分、末班）；搭不到灰底劃線。
// 打開時捲到「規劃」那一列，上面留一列（firstCellIndex；一列幾格看 CSS 排出來的欄數）。班距型那一程沒有格子，只寫班距和首末班。
// 打開時地圖框住這一程、上車站亮起來。✕、點地圖、換天、交通卡收起、這段不見了都關掉。
// 網頁版浮在地圖區左上（寬約 440px、四欄、最高地圖區的 60%）；手機版浮在行程上面那塊地圖（MobileApp 掛，高度固定、三欄；行程最高時降到中間是 mobileStore 做）。

import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Leg, TransitRide } from '@travel-helper/engine';
import { appStore } from '../store.ts';
import { commands } from '../appCommands.ts';
import { dataStore } from '../dataStore.ts';
import { currentEngineData, dayPlanOf, departuresOf, engineConfig } from '../planStore.ts';
import { useApp, useData, usePlan, useUi } from '../hooks.ts';
import { closeTimetable, type TimetableState } from '../uiStore.ts';
import { findLegEntry, rideReadyAt } from '../lib/planView.ts';
import { departureCells, firstCellIndex, type DepartureCell } from '../lib/legView.ts';
import { headwayText, timetableSource, timetableSubtitle } from '../lib/timetableView.ts';
import type { LonLat } from '../data/types.ts';
import { ModeIcon } from './ModeIcon.tsx';
import { Icon } from './Icon.tsx';

/** 一程上下車站的座標：車站是資料點；巴士、船的停留所用路線檔裡的座標（用站名對） */
function stopCoords(ride: TransitRide, id: string): LonLat | null {
  const p = dataStore.getState().byId.get(id);
  if (p) return p.coords;
  const doc = currentEngineData()?.routes?.find((r) => r.id === ride.routeId);
  return doc?.stops.find((s) => s.name === id || s.id === id)?.coords ?? null;
}

export function TimetablePopup() {
  const tt = useUi((s) => s.timetable);
  const legOpen = useUi((s) => s.legOpen);
  const day = useApp((s) => s.day);
  const plan = usePlan((s) => s.plan);
  const entry = tt ? findLegEntry(dayPlanOf(plan, tt.date), tt.legKey) : null;
  const leg = entry?.travel ?? null;
  const ride = tt && leg ? leg.rides[tt.rideIndex] : undefined;
  // 換天、交通卡收起來（或換別段）、這段或這一程不見了（刪掉、改成計程車）就關掉；時間軸還沒算好時先不判斷
  const stale = !!tt && (day !== tt.date || legOpen !== tt.legKey || (plan != null && !ride));
  useEffect(() => {
    if (stale) closeTimetable();
  }, [stale]);
  if (!tt || !leg || !ride || stale) return null;
  return <TimetableBody key={`${tt.legKey}#${tt.rideIndex}`} tt={tt} leg={leg} ride={ride} />;
}

function TimetableBody({ tt, leg, ride }: { tt: TimetableState; leg: Leg; ride: TransitRide }) {
  const byId = useData((s) => s.byId);
  const nameOf = (id: string) => byId.get(id)?.name.zh || byId.get(id)?.name.ja || id;

  // 打開時（或換到別程）地圖框住這一程、上車站亮起來（點開的交通 legRoute 的站，不是 AI 的標示）；關掉時把交通卡亮的站換回來（交通卡已經收起的就不動）
  const board = ride.from;
  const alight = ride.to;
  useEffect(() => {
    const coords = [stopCoords(ride, board), stopCoords(ride, alight)].filter((c): c is LonLat => !!c);
    if (coords.length) {
      const xs = coords.map((c) => c[0]);
      const ys = coords.map((c) => c[1]);
      commands.focus({ bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] });
    }
    const leg = appStore.getState().legRoute;
    if (!leg || !dataStore.getState().byId.has(board)) return;
    const prev = leg.stations;
    appStore.setState({ legRoute: { ...leg, stations: [board] } });
    return () => {
      const now = appStore.getState().legRoute;
      if (now?.id === leg.id && now.stations.length === 1 && now.stations[0] === board) appStore.setState({ legRoute: { ...now, stations: prev } });
    };
    // 時間軸重算時 ride 換了物件但站一樣，不用重做
  }, [board, alight]);

  const data = currentEngineData();
  const readyAt = rideReadyAt(leg, tt.rideIndex);
  const headway = ride.kind === 'headway';
  const cells = data && !headway ? departureCells(departuresOf(tt.date, ride), ride, readyAt) : [];
  const source = data && !headway ? timetableSource(ride, data, tt.date, engineConfig.holidays) : null;
  const title = `${nameOf(board)} → ${nameOf(alight)}`;

  return (
    <section className="timetable-pop" data-testid="timetable-popup" aria-label={`${title} 的班次`}>
      <header className="timetable-head">
        <ModeIcon mode={ride.mode} size="l" />
        <div className="timetable-title">
          <h2>{title}</h2>
          <div className="timetable-sub" data-testid="timetable-sub">
            {timetableSubtitle(ride, tt.date, readyAt)}
          </div>
        </div>
        <button type="button" className="text-button" onClick={closeTimetable} aria-label="關掉" data-testid="timetable-close">
          <Icon name="close" size={20} />
        </button>
      </header>
      {headway ? (
        <div className="timetable-body">
          <p className="tt-headway" data-testid="tt-headway">
            {headwayText(ride)}
          </p>
        </div>
      ) : !data ? (
        <div className="timetable-body muted small">時刻表載入中…</div>
      ) : cells.length === 0 ? (
        <div className="timetable-body muted small">時刻表裡查不到這一程的班次</div>
      ) : (
        <CellGrid cells={cells} />
      )}
      {source && (
        <div className="timetable-src" data-testid="timetable-source">
          {source.url ? (
            <a href={source.url} target="_blank" rel="noreferrer">
              {source.text}
            </a>
          ) : (
            source.text
          )}
        </div>
      )}
    </section>
  );
}

/** 格子那塊（自己捲）：打開時捲到規劃那列的前一列；欄數照 CSS 排出來的（網頁 4、手機 3） */
function CellGrid({ cells }: { cells: DepartureCell[] }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLOListElement>(null);
  useLayoutEffect(() => {
    const body = bodyRef.current;
    const grid = gridRef.current;
    if (!body || !grid) return;
    const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
    const el = grid.children[firstCellIndex(cells, cols)] as HTMLElement | undefined;
    if (el) body.scrollTop = el.offsetTop - grid.offsetTop;
    // 只在打開時捲一次（換一程是新的 TimetableBody）
  }, []);
  return (
    <div className="timetable-body" ref={bodyRef}>
      <ol className="tt-grid" ref={gridRef}>
        {cells.map((c, i) => (
          <Cell key={i} cell={c} />
        ))}
      </ol>
    </div>
  );
}

/** 一格：發車粗體、到站淡色；第二行車種＋標記。搭不到不寫標記（規劃、+N 分除外）；標記 data-mark 照 規劃 > +N 分 > 末班 */
function Cell({ cell }: { cell: DepartureCell }) {
  const mark = cell.mark ?? (cell.isLast ? 'last' : null);
  const lastText = cell.isLast && !cell.gone;
  return (
    <li className={`tt-cell${cell.mark ? ` ${cell.mark}` : ''}${cell.gone ? ' gone' : ''}`} data-testid="tt-cell" data-mark={mark ?? undefined} data-gone={cell.gone || undefined}>
      <div className="tt-time">
        <b>{cell.depart}</b>
        <span>–{cell.arrive}</span>
      </div>
      <div className="tt-kind">
        {cell.kind && <span className={cell.express ? 'tt-express' : undefined}>{cell.kind}</span>}
        {cell.mark === 'plan' && <b>規劃</b>}
        {cell.mark === 'next' && cell.late != null && <b>+{cell.late} 分</b>}
        {lastText && <b>末班</b>}
        {/* 空的第二行也佔一行高，格子對齊 */}
        {!cell.kind && !cell.mark && !lastText && ' '}
      </div>
    </li>
  );
}
