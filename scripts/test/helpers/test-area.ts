// 測試用的假區域「test-area」（T24：區域不寫死）。
// 從真的資料複製一個車站、一個景點，改成大阪附近的座標，放進暫存的 data/ 目錄。
// 程式裡沒有任何地方寫到 test-area，validate、匯入都要不改程式就能處理。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const readJson = (p: string) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export const TEST_COORDS: [number, number] = [135.5, 34.69];

export function testArea() {
  const real = readJson('data/areas.json')[0];
  return {
    ...clone(real),
    id: 'test-area',
    name: { ja: 'テスト', zh: '測試區域' },
    municipality: 'テスト市',
    definition: '測試用的假區域',
    tripOrder: 99,
    center: TEST_COORDS,
    bbox: [135.45, 34.65, 135.55, 34.73],
    stations: ['test-station'],
    regions: [{ id: 'test-region', name: { ja: 'テスト', zh: '測試' }, center: TEST_COORDS }],
    extra: undefined,
  };
}

export function testStation() {
  const st = clone(readJson('data/stations.json')[0]);
  return { ...st, id: 'test-station', area: 'test-area', coords: [135.501, 34.691], transfers: [] };
}

export function testSpot(id = 'test-area-spot', over: Record<string, unknown> = {}) {
  const sp = clone(readJson('data/areas/ise/spots.json')[0]);
  sp.id = id;
  sp.area = 'test-area';
  sp.region = 'test-region';
  sp.coords = [135.502, 34.692];
  if (sp.nearestStation) sp.nearestStation = { ...sp.nearestStation, id: 'test-station' };
  sp.access = [];
  delete sp.anchors;
  if (sp.group && typeof sp.group === 'object') sp.group.nearbyCombos = [];
  return { ...sp, ...over };
}

/** 寫一個暫存的 data/ 目錄：只有 test-area。回傳目錄路徑 */
export function writeTestData(opts: { spots?: unknown[]; extraFiles?: Record<string, unknown> } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-test-area-'));
  const write = (rel: string, data: unknown) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), JSON.stringify(data, null, 2));
  };
  write('areas.json', [testArea()]);
  write('stations.json', [testStation()]);
  write('areas/test-area/spots.json', opts.spots ?? [testSpot()]);
  for (const [rel, data] of Object.entries(opts.extraFiles ?? {})) write(rel, data);
  return dir;
}

/** docs/requests.md「[T24] data/redirects.json 的 schema」提的 schema；正式加進 schema/ 之前，測試用這份 */
export const REDIRECTS_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://travel-helper.local/schema/redirects.schema.json',
  title: '轉址（data/redirects.json）：合併重複的資料點時，被合併的舊 ID → 保留的 ID',
  type: 'array',
  items: {
    type: 'object',
    properties: {
      from: { description: '被合併掉的舊 ID（資料裡已經沒有）', $ref: 'common.schema.json#/$defs/id' },
      to: { description: '保留的 ID（資料裡要有；不能再轉址）', $ref: 'common.schema.json#/$defs/id' },
      date: { description: '合併的日期', $ref: 'common.schema.json#/$defs/date' },
      reason: { description: '為什麼合併（例如「同一家店，食べログ有兩頁」）', type: 'string', minLength: 1 },
      task: { description: '做合併的任務 ID', type: ['string', 'null'] },
    },
    required: ['from', 'to', 'date', 'reason'],
    additionalProperties: false,
  },
};

/** 複製 schema/，再加上還沒正式加進去的 redirects schema */
export function writeTestSchemas() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-test-schema-'));
  for (const f of fs.readdirSync(path.join(ROOT, 'schema'))) {
    fs.copyFileSync(path.join(ROOT, 'schema', f), path.join(dir, f));
  }
  if (!fs.existsSync(path.join(dir, 'redirects.schema.json'))) {
    fs.writeFileSync(path.join(dir, 'redirects.schema.json'), JSON.stringify(REDIRECTS_SCHEMA, null, 2));
  }
  return dir;
}
