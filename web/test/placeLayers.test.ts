// 清單層、詳情層（worker/src/lib/placeLayers.ts）：真的資料。
// 清單層少了欄位時畫面不會報錯，只是標章、警告靜靜地不見，所以這裡用清單層和完整資料各算一次，要一樣。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createItinerary, DEFAULT_CONFIG, planItinerary, placeLookup, type EngineData, type PlaceRecord } from '@travel-helper/engine';
import type { Itinerary, VisitItem } from '@travel-helper/engine/types';
import { cleanDinnerNote, detailLayer, EXTRA_HIDDEN, EXTRA_LABELS, listLayer } from '../../worker/src/lib/placeLayers.ts';
import { normalizePlace } from '../src/data/normalize.ts';
import { fullPlace } from '../src/dataStore.ts';
import { placeBadges } from '../src/lib/badges.ts';
import { closedDaysLabel } from '../src/lib/hours.ts';
import { ratingOf } from '../src/lib/explore.ts';
import { placeFit15 } from '../src/lib/filter.ts';
import { rowHighlights } from '../src/shared/rowHighlights.ts';
import { noteRows } from '../src/lib/reservations.ts';
import { searchPlaces, type SearchInput } from '../src/ai/search.ts';
import type { Place } from '../src/data/types.ts';
import type { PlaceEdit } from '../src/backend/types.ts';

type Rec = Record<string, unknown>;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = (p: string) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

function allRecords(): Rec[] {
  const out: Rec[] = [...readJson('data/stations.json')];
  for (const a of fs.readdirSync(path.join(ROOT, 'data/areas'))) {
    for (const f of ['spots', 'lodging', 'restaurants']) {
      const p = `data/areas/${a}/${f}.json`;
      if (fs.existsSync(path.join(ROOT, p))) out.push(...readJson(p));
    }
  }
  return out;
}

const RECORDS = allRecords();
const place = (r: Rec) => normalizePlace(r)!;
const FULL = RECORDS.map(place);
const LIST = RECORDS.map((r) => place(listLayer(r)));

test('清單＋詳情還原成原始資料（extra 只留給人看的）', () => {
  for (const r of RECORDS) {
    const { extra: _x, ...orig } = r;
    const { extra: _y, ...merged } = { ...listLayer(r), ...detailLayer(r) };
    assert.deepEqual(merged, orig, String(r.id));
  }
});

test('extra 每個鍵都決定過要不要顯示；新的鍵要放進 EXTRA_LABELS 或 EXTRA_HIDDEN', () => {
  const unknown = new Set<string>();
  for (const r of RECORDS) for (const k of Object.keys((r.extra as Rec | undefined) ?? {})) if (!(k in EXTRA_LABELS) && !EXTRA_HIDDEN.has(k)) unknown.add(k);
  assert.deepEqual([...unknown], []);
  for (const k of Object.keys(EXTRA_LABELS)) assert.ok(!EXTRA_HIDDEN.has(k), `${k} 兩邊都有`);
});

test('研究用的內容不進詳情層；詳情看得到溫泉、停車', () => {
  const extras = RECORDS.map((r) => detailLayer(r).extra as Rec | undefined).filter(Boolean) as Rec[];
  for (const e of extras) for (const k of ['conflicts', 'rakutenVacancy', 'dossierFacts']) assert.ok(!(k in e));
  assert.ok(extras.some((e) => e.onsen));
  assert.ok(extras.some((e) => e.parking));
});

test('dinnerAccessNote 的工作註記去掉，內容留著', () => {
  assert.equal(cleanDinnerNote('步行 20 分內 4 家：花栞 3 分 等（選素泊、朝食付方案時；OSRM，scripts/lodging-dinner-access.mjs，2026-10-18）'), '步行 20 分內 4 家：花栞 3 分 等（選素泊、朝食付方案時）');
  assert.equal(cleanDinnerNote('步行 20 分內 4 家（OSRM，scripts/lodging-dinner-access.mjs，2026-10-18）'), '步行 20 分內 4 家');
  assert.equal(cleanDinnerNote('附近有店。T7f（2026-10-18，OSRM 步行，係數 1）'), '附近有店。');
  for (const r of RECORDS) {
    const note = (detailLayer(r).extra as Rec | undefined)?.dinnerAccessNote;
    if (typeof note === 'string') assert.ok(!/scripts\/|OSRM|T7f/.test(note), note);
  }
});

test('清單畫面的標章、重點、評分、篩選用清單層算出來一樣', () => {
  const status = { candidate: [], scheduled: [] };
  FULL.forEach((f, i) => {
    const l = LIST[i];
    assert.deepEqual(placeBadges(l, 9), placeBadges(f, 9), f.id);
    assert.deepEqual(rowHighlights(l, status, 9), rowHighlights(f, status, 9), f.id);
    assert.equal(ratingOf(l), ratingOf(f), f.id);
    assert.equal(placeFit15(l), placeFit15(f), f.id);
    assert.equal(closedDaysLabel(l.hours), closedDaysLabel(f.hours), f.id);
    assert.deepEqual([l.contexts, l.cuisine, l.tags, l.tier, l.area, l.region, l.coords, l.name], [f.contexts, f.cuisine, f.tags, f.tier, f.area, f.region, f.coords, f.name], f.id);
    assert.deepEqual(l.photos.map((p) => p.url), f.photos.map((p) => p.url), f.id);
  });
});

test('AI 搜尋用清單層篩，結果和完整資料一樣（摘要從 full 拿）', () => {
  const env = (places: Place[]) => ({ places, byId: new Map(places.map((p) => [p.id, p])), bounds: null, likes: () => 0, config: DEFAULT_CONFIG });
  const fullById = new Map(FULL.map((p) => [p.id, p]));
  const inputs: SearchInput[] = [
    { types: ['restaurant'], limit: 30, fit15: ['yes'] },
    { types: ['restaurant'], limit: 30, reservable: true, fitSubgroup: true },
    { types: ['spot'], limit: 30, elderly: true, kids: true },
    { types: ['spot'], limit: 30, indoor: true },
    { types: ['lodging'], limit: 30, wholeRental: true, maxGuestsAtLeast: 10 },
    { text: '水族館', limit: 30 },
    { types: ['restaurant'], cuisine: ['海鮮丼'], openAt: { date: '2027-02-05', time: '12:00' }, limit: 30 },
    { near: { place: 'toba-aquarium', walkMinutes: 20 }, limit: 30, sort: 'rating' },
  ];
  for (const input of inputs) {
    assert.deepEqual(searchPlaces(input, { ...env(LIST), full: (id) => fullById.get(id) ?? null }), searchPlaces(input, env(FULL)), JSON.stringify(input));
  }
});

test('預約清單用清單層算出來一樣（電話、訂位方式、網址）', () => {
  const it = sampleItinerary();
  const plan = planItinerary(it, engineData(RECORDS as unknown as PlaceRecord[]), DEFAULT_CONFIG);
  const rows = (places: Place[]) => noteRows(it, plan, new Map(places.map((p) => [p.id, p])), []);
  assert.ok(rows(FULL).length > 0);
  assert.deepEqual(rows(LIST), rows(FULL));
});

/** 每天排幾個點，涵蓋餐廳、景點、住宿 */
function sampleItinerary(): Itinerary {
  const it = createItinerary();
  const pick = (type: string) => FULL.filter((p) => p.type === type && !p.retiredAt);
  const spots = pick('spot');
  const rest = pick('restaurant');
  const lodging = pick('lodging');
  const days = it.days.slice(1, -1);
  let n = 100;
  days.forEach((day, i) => {
    const ids = [spots[(i * 7) % spots.length], rest[(i * 23) % rest.length], spots[(i * 7 + 3) % spots.length], rest[(i * 23 + 11) % rest.length]];
    for (const p of ids) {
      const item: VisitItem = { id: `i-${++n}`, type: 'visit', options: [{ place: p.id, stayMinutes: null, note: null }], selected: 0, start: null, travel: null, note: null } as VisitItem;
      day.items.push(item);
    }
    it.nights[day.date] = { lodging: lodging[(i * 13) % lodging.length].id };
  });
  it.seq = n;
  return it;
}

function engineData(records: PlaceRecord[]): EngineData {
  const urbanFiles = fs.readdirSync(path.join(ROOT, 'data/timetables/urban')).filter((f) => f.endsWith('.json'));
  return {
    getPlace: placeLookup(records),
    stations: records.filter((r) => r.type === 'station'),
    kintetsu: readJson('data/timetables/kintetsu/_travel-times.json'),
    routes: ['bus', 'ferry', 'jr'].flatMap((d) =>
      fs
        .readdirSync(path.join(ROOT, 'data/timetables', d))
        .filter((f) => f.endsWith('.json'))
        .map((f) => readJson(`data/timetables/${d}/${f}`))
        .filter((x) => x.stops && x.trips),
    ),
    urban: urbanFiles.filter((f) => !f.startsWith('_')).map((f) => readJson(`data/timetables/urban/${f}`)),
    urbanTransfers: readJson('data/timetables/urban/_transfers.json'),
  };
}

test('引擎用清單層和完整資料算出同樣的時間軸、警告', () => {
  const it = sampleItinerary();
  const a = planItinerary(it, engineData(RECORDS.map(listLayer) as unknown as PlaceRecord[]), DEFAULT_CONFIG);
  const b = planItinerary(it, engineData(RECORDS as unknown as PlaceRecord[]), DEFAULT_CONFIG);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  assert.ok(a.days.some((d) => d.warnings.length > 0), '這份行程要有警告才有比到');
});

test('fullPlace：詳情層上再套修改；只改子欄位時其他子欄位還在；還沒到回傳清單層', () => {
  const r = RECORDS.find((x) => x.type === 'restaurant' && (x.group as Rec | undefined)?.seats != null)!;
  const list = place(listLayer(r));
  const edit = (id: number, fieldPath: string, value: unknown): PlaceEdit => ({ id, placeId: list.id, fieldPath, value, baseValue: null, baseMissing: false, note: null, author: 'a', createdAt: 't', updatedAt: 't', revertedAt: null, revertedBy: null, closedAt: null });
  const placeEdits = [edit(1, 'group.fit15', 'no'), edit(2, 'notes', '改過的介紹')];
  const state = (details: Map<string, Rec> | null) => ({ byId: new Map([[list.id, list]]), basePlaces: [list], details, placeEdits });
  assert.equal(fullPlace(state(null), list.id), list);
  const s = state(new Map([[list.id, detailLayer(r)]]));
  const f = fullPlace(s, list.id)!;
  assert.equal((f.raw.group as Rec).fit15, 'no');
  assert.equal((f.raw.group as Rec).seats, (r.group as Rec).seats, '詳情層的子欄位還在');
  assert.equal(f.raw.notes, '改過的介紹');
  assert.deepEqual(Object.keys(f.edited).sort(), ['group.fit15', 'notes']);
  assert.ok(f.sources.length > 0);
  assert.equal(fullPlace(s, list.id), f, '同一份詳情層回傳同一個物件');
  assert.equal(fullPlace(s, 'nope'), null);
});
