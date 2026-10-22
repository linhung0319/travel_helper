// 測試用：讀 data/ 建 EngineData（引擎本身不讀檔，由呼叫的人傳資料進去）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { placeLookup, type EngineData, type KintetsuTimes, type PlaceRecord, type RouteTimetable } from '../src/index.ts';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/^﻿/, ''));

let cached: { places: PlaceRecord[]; stations: PlaceRecord[]; kintetsu: KintetsuTimes; routes: RouteTimetable[]; needsCar: Record<string, boolean> } | null = null;

function load() {
  if (cached) return cached;
  const stations: PlaceRecord[] = read('data/stations.json');
  const places: PlaceRecord[] = [...stations];
  for (const area of fs.readdirSync(path.join(ROOT, 'data/areas'))) {
    for (const f of ['spots', 'lodging', 'restaurants']) {
      const p = `data/areas/${area}/${f}.json`;
      if (fs.existsSync(path.join(ROOT, p))) places.push(...read(p));
    }
  }
  const routes: RouteTimetable[] = [];
  for (const mode of ['bus', 'ferry', 'jr']) {
    const dir = path.join(ROOT, 'data/timetables', mode);
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      const doc = read(`data/timetables/${mode}/${f}`);
      if (doc.stops && doc.trips) routes.push(doc);
    }
  }
  const needsCar: Record<string, boolean> = {};
  for (const a of read('data/areas.json')) for (const r of a.regions ?? []) needsCar[r.id] = !!r.needsCar;
  cached = { places, stations, kintetsu: read('data/timetables/kintetsu/_travel-times.json'), routes, needsCar };
  return cached;
}

/** 真的資料；users、retired 用來測使用者加的點、已下架的點 */
export function realData(opts: { users?: PlaceRecord[]; retired?: string[] } = {}): EngineData {
  const d = load();
  return {
    getPlace: placeLookup(d.places, opts),
    stations: d.stations,
    kintetsu: d.kintetsu,
    routes: d.routes,
    regionNeedsCar: d.needsCar,
  };
}

export function place(id: string): PlaceRecord {
  const p = load().places.find((x) => x.id === id);
  if (!p) throw new Error(`fixture: 找不到 ${id}`);
  return p;
}
