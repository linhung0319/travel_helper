// 地圖指令（T12）：UI 和 AI（T16）都透過這裡操作地圖，改的是同一份 store（store.ts）。
// 每個指令都檢查輸入（AI 給的 ID 可能不存在），回傳 CommandResult，AI 可以讀結果決定下一步。
// 這個檔案不 import dataStore／appStore 本身（Node 的測試也能用），網站共用的那一份在 appCommands.ts。

import type { StoreApi } from 'zustand/vanilla';
import { diffItinerary, validateItinerary, type Change } from '@travel-helper/engine';
import type { Itinerary, TravelMode } from '@travel-helper/engine/types';
import { TRAVEL_MODES } from '@travel-helper/engine/types';
import { HIGHLIGHT_STYLES, type AppStore, type DaySelection, type HighlightStyle, type RouteEnd } from './store.ts';
import type { DataState } from './dataStore.ts';
import { CONTEXTS, PLACE_TYPES, TIERS, type Bbox, type LonLat, type Place } from './data/types.ts';
import { FIT15_VALUES, filterChips, matchesFilter, type Filter } from './lib/filter.ts';
import { areasExtent, extentOf, inBbox } from './lib/areas.ts';
import { stopsOn } from './lib/itinerary.ts';
import { tripDates, dayLabel } from './lib/trip.ts';
import { placeBadges } from './lib/badges.ts';

/** 指令的結果：成功時附上 AI 用得到的資訊；失敗時 error 是給人（和 AI）看的一句話，狀態不變 */
export type CommandResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * focus 的目標：
 * - 資料點 ID，或好幾個 ID（地圖框住全部）
 * - { area }、{ region }：區域、子地區（從 areas.json 讀，不寫死）
 * - { day }：那一天排的點
 * - { bbox }、{ center, zoom }
 */
export type FocusTarget =
  | string
  | string[]
  | { area: string }
  | { region: string }
  | { day: string }
  | { bbox: Bbox }
  | { center: LonLat; zoom?: number };

export interface DrawRouteOptions {
  /** 顯示的分鐘（例如 T14 算的 Leg.minutes）；沒給時步行、車程用路徑距離和預設速度算 */
  minutes?: number | null;
  /** 取代分鐘的文字，例如「特急 12:05 發」 */
  label?: string | null;
  /** 已經有的路徑（例如之後 T15 從別處拿到的）；給了就不查 */
  geometry?: LonLat[] | null;
}

/** 給 AI 的畫面狀態（interaction-design §5）：每次對話帶上 */
export interface ViewState {
  view: { center: LonLat; zoom: number; bounds: Bbox } | null;
  /** 目前畫面裡、符合篩選的點有幾個 */
  visibleCount: number;
  day: DaySelection;
  dayLabel: string | null;
  /** 選定那天依序經過的點 */
  dayStops: { place: string; name: string; time: string | null }[];
  filter: Filter;
  /** 地圖上方的篩選標籤（人看得懂的條件） */
  filterLabels: string[];
  /** 符合篩選的點有幾個 */
  filterCount: number;
  mode: 'map' | 'explore';
  planning: boolean;
  /** 「問 AI」選取的點 */
  selection: { id: string; name: string; type: string }[];
  /** 打開詳情的點 */
  detail: { id: string; name: string } | null;
  highlights: Partial<Record<HighlightStyle, string[]>>;
  compare: string[];
  routes: { id: string; from: string | null; to: string | null; mode: TravelMode; minutes: number | null; source: string }[];
  proposal: { dates: string[]; changes: Change[]; summary: string | null } | null;
}

const MAX_COMPARE = 6;
/** 單一個點的 focus：放大到這裡（S、A 級會出現照片） */
const FOCUS_ZOOM = 15;
/** 框住好幾個點時最多放大到這裡，避免只有一兩個點時貼太近 */
const FIT_MAX_ZOOM = 15;
/** 選一天時框住那天的點，最多放大到這裡（T11 的天數分頁） */
const DAY_MAX_ZOOM = 14;

const nameOf = (p: Place) => p.name.zh || p.name.ja;
const isLonLat = (v: unknown): v is LonLat =>
  Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n)) && Math.abs(v[0]) <= 180 && Math.abs(v[1]) <= 90;
const isBbox = (v: unknown): v is Bbox => Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === 'number' && Number.isFinite(n)) && v[0] <= v[2] && v[1] <= v[3];

export function createCommands(app: StoreApi<AppStore>, data: StoreApi<DataState>) {
  const dates = () => tripDates();

  /** 檢查 ID：回傳找得到的點和找不到的 ID */
  function resolveIds(ids: unknown): { places: Place[]; unknown: string[] } | null {
    const list = typeof ids === 'string' ? [ids] : ids;
    if (!Array.isArray(list) || list.some((x) => typeof x !== 'string')) return null;
    const { byId } = data.getState();
    const places: Place[] = [];
    const unknown: string[] = [];
    for (const id of new Set(list as string[])) {
      const p = byId.get(id);
      if (p) places.push(p);
      else unknown.push(id);
    }
    return { places, unknown };
  }

  function moveTo(coords: LonLat[], maxZoom = FIT_MAX_ZOOM): Bbox | null {
    if (coords.length === 1) {
      app.getState().moveCamera({ center: coords[0], zoom: FOCUS_ZOOM });
      return [coords[0][0], coords[0][1], coords[0][0], coords[0][1]];
    }
    const ext = extentOf(coords);
    if (ext) app.getState().moveCamera({ bbox: ext, zoom: maxZoom });
    return ext;
  }

  function focus(target: FocusTarget): CommandResult<{ bbox: Bbox | null; unknown?: string[] }> {
    const { areas, places } = data.getState();
    if (typeof target === 'string' || Array.isArray(target)) {
      const r = resolveIds(target);
      if (!r) return { ok: false, error: 'focus：目標要是資料點 ID 或 ID 的陣列' };
      if (!r.places.length) return { ok: false, error: `focus：找不到資料點 ${r.unknown.join('、')}` };
      const bbox = moveTo(r.places.map((p) => p.coords));
      // 一個點時讓它閃一下，看得出是哪個
      if (r.places.length === 1) app.getState().hover(r.places[0].id);
      return { ok: true, bbox, ...(r.unknown.length ? { unknown: r.unknown } : {}) };
    }
    if (!target || typeof target !== 'object') return { ok: false, error: 'focus：不認得的目標' };
    if ('area' in target) {
      const a = areas.find((x) => x.id === target.area);
      if (!a) return { ok: false, error: `focus：沒有區域 ${target.area}（可用：${areas.map((x) => x.id).join('、')}）` };
      const bbox = areasExtent([a], places) ?? a.bbox;
      app.getState().moveCamera({ bbox });
      return { ok: true, bbox };
    }
    if ('region' in target) {
      const area = areas.find((a) => a.regions?.some((r) => r.id === target.region));
      if (!area) return { ok: false, error: `focus：沒有子地區 ${target.region}` };
      const coords = places.filter((p) => p.region === target.region).map((p) => p.coords);
      const center = area.regions!.find((r) => r.id === target.region)!.center;
      if (!coords.length && center) coords.push(center);
      const bbox = moveTo(coords);
      return bbox ? { ok: true, bbox } : { ok: false, error: `focus：子地區 ${target.region} 沒有資料點` };
    }
    if ('day' in target) {
      if (!dates().includes(target.day)) return { ok: false, error: `focus：${target.day} 不在旅程的日期裡` };
      const { byId, itinerary } = data.getState();
      const coords = stopsOn(itinerary, target.day)
        .map((s) => byId.get(s.place)?.coords)
        .filter((c): c is LonLat => !!c);
      if (!coords.length) return { ok: true, bbox: null };
      // 一個點也框成範圍（和 T11 的天數分頁一樣），不拉到單點的放大倍率
      const ext = extentOf(coords)!;
      app.getState().moveCamera({ bbox: ext, zoom: DAY_MAX_ZOOM });
      return { ok: true, bbox: ext };
    }
    if ('bbox' in target) {
      if (!isBbox(target.bbox)) return { ok: false, error: 'focus：bbox 要是 [西, 南, 東, 北]' };
      app.getState().moveCamera({ bbox: target.bbox });
      return { ok: true, bbox: target.bbox };
    }
    if ('center' in target) {
      if (!isLonLat(target.center)) return { ok: false, error: 'focus：center 要是 [經度, 緯度]' };
      app.getState().moveCamera({ center: target.center, zoom: target.zoom });
      return { ok: true, bbox: [target.center[0], target.center[1], target.center[0], target.center[1]] };
    }
    return { ok: false, error: 'focus：不認得的目標' };
  }

  function highlight(ids: string[] | string, style: HighlightStyle = 'primary'): CommandResult<{ ids: string[]; unknown?: string[] }> {
    if (!HIGHLIGHT_STYLES.includes(style)) return { ok: false, error: `highlight：樣式要是 ${HIGHLIGHT_STYLES.join('、')}` };
    const r = resolveIds(ids);
    if (!r) return { ok: false, error: 'highlight：ids 要是資料點 ID 的陣列' };
    if (!r.places.length && r.unknown.length) return { ok: false, error: `highlight：找不到資料點 ${r.unknown.join('、')}` };
    const got = r.places.map((p) => p.id);
    app.getState().setHighlight(style, got);
    return { ok: true, ids: got, ...(r.unknown.length ? { unknown: r.unknown } : {}) };
  }

  function routeEnd(v: string | LonLat): RouteEnd | string {
    if (typeof v === 'string') {
      const p = data.getState().byId.get(v);
      return p ? { place: p.id, coords: p.coords } : `找不到資料點 ${v}`;
    }
    return isLonLat(v) ? { place: null, coords: v } : '座標要是 [經度, 緯度]';
  }

  /**
   * 畫一條路線。路徑在背景查（routeResolver.ts）：步行、車沿道路，電車沿車站，查不到畫直線。
   * 回傳路線 ID；clearHighlights 會一起清掉。
   */
  function drawRoute(from: string | LonLat, to: string | LonLat, mode: TravelMode = 'walk', opts: DrawRouteOptions = {}): CommandResult<{ routeId: string }> {
    if (!TRAVEL_MODES.includes(mode)) return { ok: false, error: `drawRoute：交通方式要是 ${TRAVEL_MODES.join('、')}` };
    const a = routeEnd(from);
    const b = routeEnd(to);
    if (typeof a === 'string') return { ok: false, error: `drawRoute 起點：${a}` };
    if (typeof b === 'string') return { ok: false, error: `drawRoute 終點：${b}` };
    if (opts.minutes != null && !(Number.isFinite(opts.minutes) && opts.minutes >= 0)) return { ok: false, error: 'drawRoute：minutes 要是 0 以上的數字' };
    const geometry = opts.geometry && opts.geometry.length >= 2 && opts.geometry.every(isLonLat) ? opts.geometry : null;
    const routeId = app.getState().addRoute({
      from: a,
      to: b,
      mode,
      minutes: opts.minutes ?? null,
      minutesGiven: opts.minutes != null,
      label: opts.label ?? null,
      geometry,
      meters: null,
      source: geometry ? 'given' : 'pending',
    });
    return { ok: true, routeId };
  }

  /** 比較幾個點：地圖標 A、B、C 並框住，上方出現比較列；回傳每個點的重點給 AI */
  function compare(ids: string[]): CommandResult<{ places: { letter: string; id: string; name: string; type: string; tier: string | null; badges: string[]; summary: string | null }[]; unknown?: string[] }> {
    const r = resolveIds(ids);
    if (!r) return { ok: false, error: 'compare：ids 要是資料點 ID 的陣列' };
    if (r.places.length < 2) return { ok: false, error: `compare：至少要兩個找得到的點${r.unknown.length ? `（找不到 ${r.unknown.join('、')}）` : ''}` };
    if (r.places.length > MAX_COMPARE) return { ok: false, error: `compare：最多 ${MAX_COMPARE} 個` };
    app.getState().setCompare(r.places.map((p) => p.id));
    moveTo(r.places.map((p) => p.coords));
    return {
      ok: true,
      places: r.places.map((p, i) => ({
        letter: String.fromCharCode(65 + i),
        id: p.id,
        name: nameOf(p),
        type: p.type,
        tier: p.tier,
        badges: placeBadges(p, 4).map((b) => b.label),
        summary: p.summary?.text ?? null,
      })),
      ...(r.unknown.length ? { unknown: r.unknown } : {}),
    };
  }

  /** 清掉標示、路線、比較（篩選、選取、提議不動） */
  function clearHighlights(): CommandResult {
    app.getState().clearHighlights();
    return { ok: true };
  }

  /** 切換天數；選了某一天時地圖移到那天排的點（沒排東西就不動） */
  function selectDay(day: DaySelection): CommandResult<{ day: DaySelection; stops: number }> {
    if (day !== 'all' && !dates().includes(day)) return { ok: false, error: `selectDay：要是 all 或 ${dates()[0]}～${dates().at(-1)} 的日期` };
    app.getState().selectDay(day);
    if (day === 'all') return { ok: true, day, stops: 0 };
    const f = focus({ day });
    const stops = stopsOn(data.getState().itinerary, day).length;
    return f.ok ? { ok: true, day, stops } : f;
  }

  /** 檢查篩選的值；選項從 areas.json 和常數來，不寫死區域 */
  function checkFilter(patch: Partial<Filter>): string | null {
    const { areas } = data.getState();
    const allowed: Record<keyof Filter, readonly string[]> = {
      areas: areas.map((a) => a.id),
      regions: areas.flatMap((a) => (a.regions ?? []).map((r) => r.id)),
      types: PLACE_TYPES,
      contexts: CONTEXTS,
      tiers: TIERS,
      fit15: FIT15_VALUES,
    };
    for (const [k, v] of Object.entries(patch)) {
      if (!(k in allowed)) return `不認得的篩選 ${k}（可用：${Object.keys(allowed).join('、')}）`;
      if (!Array.isArray(v)) return `${k} 要是陣列`;
      const bad = v.filter((x) => !allowed[k as keyof Filter].includes(x as string));
      if (bad.length) return `${k} 沒有 ${bad.join('、')}（可用：${allowed[k as keyof Filter].join('、')}）`;
    }
    return null;
  }

  function filterResult() {
    const { filter } = app.getState();
    const { places, areas } = data.getState();
    return { filter, labels: filterChips(filter, areas).map((c) => c.label), count: places.filter((p) => matchesFilter(p, filter)).length };
  }

  /**
   * 套用篩選：給的那幾項整個取代（例如 { types: ['restaurant'], fit15: ['yes'] }），沒給的不動；
   * 地圖上方會出現可以取消的篩選標籤（interaction-design §5）。
   */
  function setFilter(patch: Partial<Filter>): CommandResult<{ filter: Filter; labels: string[]; count: number }> {
    if (!patch || typeof patch !== 'object') return { ok: false, error: 'setFilter：要是物件' };
    const err = checkFilter(patch);
    if (err) return { ok: false, error: `setFilter：${err}` };
    const clean = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, [...new Set(v as string[])]])) as Partial<Filter>;
    app.getState().setFilter(clean);
    return { ok: true, ...filterResult() };
  }

  function clearFilter(): CommandResult<{ filter: Filter; labels: string[]; count: number }> {
    app.getState().clearFilter();
    return { ok: true, ...filterResult() };
  }

  /** 把點加進「問 AI」的選取（累加，不重複） */
  function select(ids: string[] | string): CommandResult<{ selection: string[]; unknown?: string[] }> {
    const r = resolveIds(ids);
    if (!r) return { ok: false, error: 'select：ids 要是資料點 ID 的陣列' };
    if (!r.places.length) return { ok: false, error: `select：找不到資料點 ${r.unknown.join('、')}` };
    const s = app.getState();
    s.setSelection([...s.selection, ...r.places.map((p) => p.id)]);
    return { ok: true, selection: app.getState().selection, ...(r.unknown.length ? { unknown: r.unknown } : {}) };
  }

  /** 取消選取；不給 ids 時全部取消 */
  function unselect(ids?: string[] | string): CommandResult<{ selection: string[] }> {
    const s = app.getState();
    if (ids === undefined) {
      s.setSelection([]);
      return { ok: true, selection: [] };
    }
    const list = typeof ids === 'string' ? [ids] : ids;
    if (!Array.isArray(list)) return { ok: false, error: 'unselect：ids 要是資料點 ID 的陣列' };
    s.setSelection(s.selection.filter((x) => !list.includes(x)));
    return { ok: true, selection: app.getState().selection };
  }

  /**
   * 在地圖上用虛線、半透明畫出 AI 提議的行程（interaction-design §0）。不改確定的行程；
   * 採用由 T15／T16 用 engine 的操作寫進行程，之後呼叫 clearProposal。
   * 只有一天改動時，順便切到那一天；地圖框住提議的點。
   */
  function showProposal(itinerary: Itinerary, opts: { summary?: string | null } = {}): CommandResult<{ dates: string[]; changes: Change[]; unknownPlaces?: string[] }> {
    const errs = validateItinerary(itinerary);
    if (errs.length) return { ok: false, error: `showProposal：行程格式不對：${errs.slice(0, 3).join('；')}` };
    const { itinerary: current, byId } = data.getState();
    const changes = current ? diffItinerary(current, itinerary) : [];
    const changed = new Set(changes.flatMap((c) => [c.date, ...(c.fromDate ? [c.fromDate] : [])]));
    // 沒有確定的行程可以比時，有排東西的天都算
    const proposalDates = current ? [...changed].sort() : itinerary.days.filter((d) => stopsOn(itinerary, d.date).length).map((d) => d.date);
    if (!proposalDates.length) return { ok: false, error: 'showProposal：和確定的行程一樣，沒有改動' };
    const missing = proposalDates.flatMap((d) => stopsOn(itinerary, d).filter((s) => !byId.has(s.place)).map((s) => s.place));
    app.getState().setProposal({ itinerary, dates: proposalDates, changes, summary: opts.summary ?? null });
    if (proposalDates.length === 1) app.getState().selectDay(proposalDates[0]);
    const coords = proposalDates.flatMap((d) => stopsOn(itinerary, d).map((s) => byId.get(s.place)?.coords)).filter((c): c is LonLat => !!c);
    if (coords.length) moveTo(coords);
    return { ok: true, dates: proposalDates, changes, ...(missing.length ? { unknownPlaces: [...new Set(missing)] } : {}) };
  }

  function clearProposal(): CommandResult {
    app.getState().setProposal(null);
    return { ok: true };
  }

  /** 目前的畫面狀態（給 AI 當脈絡，interaction-design §5） */
  function getViewState(): ViewState {
    const s = app.getState();
    const { places, byId, itinerary, areas } = data.getState();
    const name = (id: string) => {
      const p = byId.get(id);
      return p ? nameOf(p) : id;
    };
    const bounds = s.view?.bounds ?? null;
    return {
      view: s.view,
      visibleCount: bounds ? places.filter((p) => inBbox(p.coords, bounds) && matchesFilter(p, s.filter)).length : 0,
      day: s.day,
      dayLabel: s.day === 'all' ? null : dayLabel(s.day),
      dayStops: s.day === 'all' ? [] : stopsOn(itinerary, s.day).map((x) => ({ place: x.place, name: name(x.place), time: x.time })),
      filter: s.filter,
      filterLabels: filterChips(s.filter, areas).map((c) => c.label),
      filterCount: places.filter((p) => matchesFilter(p, s.filter)).length,
      mode: s.mode,
      planning: s.planning,
      selection: s.selection.map((id) => ({ id, name: name(id), type: byId.get(id)?.type ?? 'unknown' })),
      detail: s.detailId ? { id: s.detailId, name: name(s.detailId) } : null,
      highlights: s.highlights,
      compare: s.compare,
      routes: s.routes.map((r) => ({ id: r.id, from: r.from.place, to: r.to.place, mode: r.mode, minutes: r.minutes, source: r.source })),
      proposal: s.proposal && { dates: s.proposal.dates, changes: s.proposal.changes, summary: s.proposal.summary },
    };
  }

  return {
    focus,
    highlight,
    drawRoute,
    compare,
    clearHighlights,
    selectDay,
    setFilter,
    clearFilter,
    select,
    unselect,
    showProposal,
    clearProposal,
    getViewState,
  };
}

export type MapCommands = ReturnType<typeof createCommands>;
