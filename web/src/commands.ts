// 地圖指令（T12）：UI 和 AI（T16）都透過這裡操作地圖，改的是同一份 store（store.ts）。
// 每個指令都檢查輸入（AI 給的 ID 可能不存在），回傳 CommandResult，AI 可以讀結果決定下一步。
// 這個檔案不 import dataStore／appStore 本身（Node 的測試也能用），網站共用的那一份在 appCommands.ts。

import type { StoreApi } from 'zustand/vanilla';
import { diffItinerary, lodgingOn, validateItinerary, type Change } from '@travel-helper/engine';
import type { Itinerary, TravelMode } from '@travel-helper/engine/types';
import { TRAVEL_MODES } from '@travel-helper/engine/types';
import { HIGHLIGHT_STYLES, type AppStore, type DaySelection, type HighlightStyle, type RouteEnd } from './store.ts';
import type { DataState } from './dataStore.ts';
import { CONTEXTS, PLACE_TYPES, TIERS, type Bbox, type LonLat, type Place } from './data/types.ts';
import { FIT15_VALUES, LODGING_FILTER_VALUES, STAY_VALUES, SUIT_VALUES, VOTE_FILTER_VALUES, WEATHER_VALUES, WHO_VALUES, filterChips, matchesFilter, type Filter } from './lib/filter.ts';
import { areasExtent, extentOf, inBbox } from './lib/areas.ts';
import { stopsOn } from './lib/itinerary.ts';
import { hullAround } from './lib/mapLayers.ts';
import { tripDates, dayLabel } from './lib/trip.ts';

/**
 * 提議出現時右欄、地圖跳到哪裡（T48）：只動到 1 天的點 → 那天；動到 2 天以上，或有任何「住哪一區」「住宿」的變動 → 整趟。
 * dates 是提議動到的日期（showProposal 算的）
 */
export function proposalTarget(changes: Change[], dates: string[]): DaySelection {
  if (changes.some((c) => c.kind === 'night-area' || c.kind === 'lodging')) return 'all';
  return dates.length === 1 ? dates[0] : 'all';
}

/** 一區的範圍的兩個角（相機框住整區用） */
const areaCorners = (a: { bbox: Bbox } | undefined): LonLat[] => (a ? [[a.bbox[0], a.bbox[1]], [a.bbox[2], a.bbox[3]]] : []);

/** 指令的結果：成功時附上 AI 用得到的資訊；失敗時 error 是給人（和 AI）看的一句話，狀態不變 */
export type CommandResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * focus 的目標：
 * - 資料點 ID：地圖照 selectCamera 讓它看得到（能不動就不動，第七輪 §8.2）；好幾個 ID：地圖框住全部
 * - { area }、{ region }：區域、子地區（從 areas.json 讀，不寫死）
 * - { day }：那一天排的點；{ day: 'all' }：整趟
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
  /** 交通未定：線照 mode 畫，標籤的圖示改成問號 */
  unknown?: boolean;
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
  mode: 'map' | 'explore' | 'wish';
  planning: boolean;
  /** 「問 AI」選取的點 */
  /** 打開詳情的點 */
  detail: { id: string; name: string } | null;
  highlights: Partial<Record<HighlightStyle, string[]>>;
  /** 選中的點（點開的卡、地圖上點的） */
  selected: { id: string; name: string } | null;
  /** 「AI 挑的」結果集：順序、理由（再給一組時要帶著） */
  aiResult: { title: string; ids: string[]; notes: Record<string, string>; lettered: boolean } | null;
  routes: { id: string; from: string | null; to: string | null; mode: TravelMode; minutes: number | null; source: string }[];
  proposal: { dates: string[]; changes: Change[]; summary: string | null } | null;
}

/** 子地區只有一個點時放大到這裡 */
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
      // 一個點：MapView 照 selectCamera 決定不動、平移、還是拉近（不固定拉到 15）
      const one = r.places.length === 1 ? r.places[0].coords : null;
      if (one) app.getState().moveCamera({ reveal: one });
      const bbox = one ? ([one[0], one[1], one[0], one[1]] as Bbox) : moveTo(r.places.map((p) => p.coords));
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
      // 有點：框子地區的範圍（T56：點外圍往外擴 1 km，和地圖畫的框一樣大，框不會被切掉）
      const shape = hullAround(coords);
      if (shape) {
        const bbox = extentOf(shape.coordinates[0] as LonLat[])!;
        app.getState().moveCamera({ bbox, zoom: FIT_MAX_ZOOM });
        return { ok: true, bbox };
      }
      const center = area.regions!.find((r) => r.id === target.region)!.center;
      if (center) coords.push(center);
      const bbox = moveTo(coords);
      return bbox ? { ok: true, bbox } : { ok: false, error: `focus：子地區 ${target.region} 沒有資料點` };
    }
    if ('day' in target && target.day === 'all') {
      // 整趟：每天排的點（含分組裡的點）和住宿
      const { byId, itinerary } = data.getState();
      const ids = (itinerary?.days ?? []).flatMap((d) => [
        ...stopsOn(itinerary, d.date).map((x) => x.place),
        ...(itinerary && lodgingOn(itinerary, d.date) ? [lodgingOn(itinerary, d.date)!] : []),
        ...d.items.flatMap((i) => (i.type === 'split' ? i.groups.flatMap((g) => g.items.flatMap((x) => (x.type === 'visit' ? [x.options[x.selected]?.place] : []))) : [])),
      ]);
      const coords = ids.map((id) => (id ? byId.get(id)?.coords : undefined)).filter((c): c is LonLat => !!c);
      if (!coords.length) return { ok: true, bbox: null };
      const ext = extentOf(coords)!;
      app.getState().moveCamera({ bbox: ext, zoom: DAY_MAX_ZOOM });
      return { ok: true, bbox: ext };
    }
    if ('day' in target) {
      if (!dates().includes(target.day)) return { ok: false, error: `focus：${target.day} 不在旅程的日期裡` };
      const { byId, itinerary } = data.getState();
      // 前一晚的住宿（那天的起點）、分組裡各組去的點也框進來
      const day = itinerary?.days.find((d) => d.date === target.day);
      const prevDate = dates()[dates().indexOf(target.day) - 1];
      const prevLodging = itinerary && prevDate ? lodgingOn(itinerary, prevDate) : null;
      const groupPlaces = (day?.items ?? []).flatMap((i) => (i.type === 'split' ? i.groups.flatMap((g) => g.items.flatMap((x) => (x.type === 'visit' ? [x.options[x.selected]?.place] : []))) : []));
      const coords = [...stopsOn(itinerary, target.day).map((s) => s.place), ...(prevLodging ? [prevLodging] : []), ...groupPlaces]
        .map((id) => (id ? byId.get(id)?.coords : undefined))
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
    if (!(HIGHLIGHT_STYLES as readonly string[]).includes(style)) return { ok: false, error: `highlight：樣式要是 ${HIGHLIGHT_STYLES.join('、')}` };
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
      ...(opts.unknown ? { unknown: true } : {}),
    });
    return { ok: true, routeId };
  }

  /** AI 給了新的一組：之前選中的點不在這組裡就取消選中，地圖上只留最新的（詳情開著時那個點還在看，不動） */
  function dropStaleSelection(ids: string[]) {
    const s = app.getState();
    if (s.selectedId && !s.detailId && !ids.includes(s.selectedId)) s.select(null);
  }

  /** 「AI 挑的」結果集（T16m 規格 §3.1）：地圖框住這幾個點，探索只列它們；探索原本的篩選、搜尋收起來，clearResult 還原 */
  function showResult(ids: string[], opts: { title: string; notes?: Record<string, string>; lettered?: boolean }): CommandResult<{ ids: string[]; unknown?: string[] }> {
    const r = resolveIds(ids);
    if (!r) return { ok: false, error: 'showResult：ids 要是資料點 ID 的陣列' };
    if (!r.places.length) return { ok: false, error: `showResult：找不到資料點 ${r.unknown.join('、')}` };
    const got = r.places.map((p) => p.id);
    app.getState().setAiResult({ title: opts.title, ids: got, notes: opts.notes ?? {}, lettered: !!opts.lettered });
    dropStaleSelection(got);
    moveTo(r.places.map((p) => p.coords));
    return { ok: true, ids: got, ...(r.unknown.length ? { unknown: r.unknown } : {}) };
  }

  function clearResult(): CommandResult {
    app.getState().setAiResult(null);
    return { ok: true };
  }

  /** 清掉標示、路線（結果集、篩選、選取、提議不動） */
  function clearHighlights(): CommandResult {
    app.getState().clearHighlights();
    return { ok: true };
  }

  /** 切換天數；選了某一天時地圖移到那天排的點（沒排東西就不動）；選整趟框住整趟 */
  function selectDay(day: DaySelection): CommandResult<{ day: DaySelection; stops: number }> {
    if (day !== 'all' && !dates().includes(day)) return { ok: false, error: `selectDay：要是 all 或 ${dates()[0]}～${dates().at(-1)} 的日期` };
    app.getState().selectDay(day);
    if (day === 'all') {
      focus({ day: 'all' });
      return { ok: true, day, stops: 0 };
    }
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
      votes: VOTE_FILTER_VALUES,
      weather: WEATHER_VALUES,
      lodging: LODGING_FILTER_VALUES,
      suits: SUIT_VALUES,
      who: WHO_VALUES,
      stay: STAY_VALUES,
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

  /**
   * 在地圖上用虛線、半透明畫出 AI 提議的行程（interaction-design §0）。不改確定的行程；
   * 採用由 T15／T16 用 engine 的操作寫進行程，之後呼叫 clearProposal。
   * 跳到哪裡照 proposalTarget（只動 1 天的點 → 那天；2 天以上、改區、改住宿 → 整趟）；地圖框住提議的點、牽涉到的區和住宿。
   * navigate: false（行程變了重算差異）只更新提議，不換天、不動地圖。
   */
  function showProposal(itinerary: Itinerary, opts: { summary?: string | null; navigate?: boolean } = {}): CommandResult<{ dates: string[]; changes: Change[]; unknownPlaces?: string[] }> {
    const errs = validateItinerary(itinerary);
    if (errs.length) return { ok: false, error: `showProposal：行程格式不對：${errs.slice(0, 3).join('；')}` };
    const { itinerary: current, byId } = data.getState();
    const changes = current ? diffItinerary(current, itinerary) : [];
    const changed = new Set(changes.flatMap((c) => [c.date, ...(c.fromDate ? [c.fromDate] : [])]));
    // 沒有確定的行程可以比時，有排東西的天都算
    const proposalDates = current ? [...changed].sort() : itinerary.days.filter((d) => stopsOn(itinerary, d.date).length).map((d) => d.date);
    if (!proposalDates.length) return { ok: false, error: 'showProposal：和確定的行程一樣，沒有改動' };
    const missing = proposalDates.flatMap((d) => stopsOn(itinerary, d).filter((s) => !byId.has(s.place)).map((s) => s.place));
    // 同一個提議重算（別人改了行程）不動使用者選的點；新的提議才算 AI 換了一組
    if (app.getState().proposal?.summary !== (opts.summary ?? null)) dropStaleSelection(proposalDates.flatMap((d) => stopsOn(itinerary, d).map((s) => s.place)));
    app.getState().setProposal({ itinerary, dates: proposalDates, changes, summary: opts.summary ?? null });
    if (opts.navigate === false) return { ok: true, dates: proposalDates, changes, ...(missing.length ? { unknownPlaces: [...new Set(missing)] } : {}) };
    const target = proposalTarget(changes, proposalDates);
    // 編輯中不跳到整趟（整趟會結束編輯）；1 天的照舊跳過去
    if (target !== 'all' || !app.getState().planning) app.getState().selectDay(target);
    // 相機：提議那幾天排了的點，加上牽涉到的區（整區的範圍，只框中心一個點會拉得太近）、新舊住宿（只改區、那幾天還沒排點時也會動，T48）
    const { areas } = data.getState();
    const coords = [
      ...proposalDates.flatMap((d) => stopsOn(itinerary, d).map((s) => byId.get(s.place)?.coords)),
      ...changes.flatMap((c) =>
        c.kind === 'night-area' || c.kind === 'day-area'
          ? [c.before, c.after].flatMap((id) => areaCorners(areas.find((x) => x.id === id)))
          : c.kind === 'lodging'
            ? [c.before, c.after].map((p) => (p ? byId.get(p)?.coords : undefined))
            : [],
      ),
    ].filter((c): c is LonLat => !!c);
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
      detail: s.detailId ? { id: s.detailId, name: name(s.detailId) } : null,
      highlights: s.highlights,
      selected: s.selectedId ? { id: s.selectedId, name: name(s.selectedId) } : null,
      aiResult: s.aiResult && { title: s.aiResult.title, ids: s.aiResult.ids, notes: s.aiResult.notes, lettered: s.aiResult.lettered },
      routes: s.routes.map((r) => ({ id: r.id, from: r.from.place, to: r.to.place, mode: r.mode, minutes: r.minutes, source: r.source })),
      proposal: s.proposal && { dates: s.proposal.dates, changes: s.proposal.changes, summary: s.proposal.summary },
    };
  }

  return {
    focus,
    highlight,
    drawRoute,
    showResult,
    clearResult,
    checkFilter,
    clearHighlights,
    selectDay,
    setFilter,
    clearFilter,
    showProposal,
    clearProposal,
    getViewState,
  };
}

export type MapCommands = ReturnType<typeof createCommands>;
