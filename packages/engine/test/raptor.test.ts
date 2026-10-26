// RAPTOR 公共交通搜尋（T29）：資料讀檔、一天的網路
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, toMinutes, type UrbanService } from '../src/index.ts';
import { buildNetwork, headwayWait, type HeadwayRoute, type TimedRoute } from '../src/raptor/network.ts';
import { realData } from './fixtures.ts';

test('realData 讀得到班距型路線和轉乘', () => {
  const d = realData();
  assert.equal(d.urban?.length, 10);
  const loop = d.urban?.find((r) => r.id === 'jr-osaka-loop');
  assert.ok(loop);
  assert.equal(loop.loop, true);
  assert.equal(d.urbanTransfers?.length, 22);
});

test('transit 新設定的預設值', () => {
  const t = DEFAULT_CONFIG.transit;
  assert.deepEqual([t.maxRides, t.maxAlternatives, t.urbanTransferDefault, t.transferMaxMeters, t.transferPenalty], [4, 3, 5, 300, 10]);
});

// --- 一天的網路（network.ts） ------------------------------------------------

const svc = (over: Partial<UrbanService> = {}): UrbanService => ({ first: '05:24', last: '24:12', headway: [{ from: '10:00', to: '16:00', min: 7.5 }], ...over });

test('headwayWait：全員等整個班距、分組等一半，向上取整', () => {
  assert.deepEqual(headwayWait(svc(), 600, true), { wait: 8, headway: 7.5 });
  assert.deepEqual(headwayWait(svc(), 600, false), { wait: 4, headway: 7.5 });
});

test('headwayWait：首班前、末班後不能搭（24:12 過午夜）', () => {
  assert.equal(toMinutes('24:12'), 1452);
  assert.equal(headwayWait(svc(), 300, true), null);
  assert.notEqual(headwayWait(svc(), 1430, true), null);
  assert.equal(headwayWait(svc(), 1460, true), null);
});

test('headwayWait：t 不在任何時段時用最近的時段', () => {
  const s = svc({ headway: [{ from: '06:00', to: '07:00', min: 8 }] });
  assert.deepEqual(headwayWait(s, 330, true), { wait: 8, headway: 8 });
  const two = svc({ headway: [{ from: '06:00', to: '07:00', min: 8 }, { from: '20:00', to: '21:00', min: 15 }] });
  assert.deepEqual(headwayWait(two, 1300, true), { wait: 15, headway: 15 });
});

test('headwayWait：服務、班距、分鐘是 null 都不能搭', () => {
  assert.equal(headwayWait(null, 600, true), null);
  assert.equal(headwayWait(svc({ headway: null }), 600, true), null);
  assert.equal(headwayWait(svc({ first: null }), 600, true), null);
  assert.equal(headwayWait(svc({ headway: [{ from: '10:00', to: '16:00', min: null }] }), 600, true), null);
});

const headway = (routes: readonly { kind: string; key: string }[], key: string) =>
  routes.find((r): r is HeadwayRoute => r.kind === 'headway' && r.key === key);

test('buildNetwork：班距型路線兩個方向', () => {
  const net = buildNetwork(realData(), DEFAULT_CONFIG, '2027-02-12');
  const plus = headway(net.routes, 'metro-chuo:+');
  const minus = headway(net.routes, 'metro-chuo:-');
  assert.ok(plus && minus);
  assert.equal(plus.group, 'metro-chuo');
  assert.equal(minus.group, 'metro-chuo');
  assert.equal(plus.routeId, 'metro-chuo');
  assert.deepEqual(minus.stops, [...plus.stops].reverse());
  const gaps = (o: number[]) => o.slice(1).map((x, i) => x - o[i]);
  assert.deepEqual(gaps(minus.offsets), gaps(plus.offsets).reverse());
  assert.equal(plus.offsets[0], 0);
  assert.equal(minus.offsets[0], 0);
  assert.equal(plus.service?.first, '05:24');
});

test('buildNetwork：環狀線跨過接點加 loopMin', () => {
  const d = realData();
  const loop = d.urban?.find((r) => r.id === 'jr-osaka-loop');
  assert.ok(loop?.loopMin);
  const n = loop.stops.length;
  const net = buildNetwork(d, DEFAULT_CONFIG, '2027-02-12');
  for (const dir of ['+', '-']) {
    const r = headway(net.routes, `jr-osaka-loop:${dir}`);
    assert.ok(r);
    assert.equal(r.offsets[0], 0);
    assert.equal(r.stops[0], 'jr-osaka');
    assert.notEqual(r.stops[0], r.stops[r.stops.length - 1]);
    for (let i = 1; i < r.offsets.length; i++) assert.ok(r.offsets[i] > r.offsets[i - 1], `${r.key} offsets 遞增`);
    // 一圈之後接著第二圈，到第一站的前一站為止：任兩站都能直達
    assert.equal(r.stops.length, 2 * n - 1);
    assert.ok(r.offsets[r.offsets.length - 1] < loop.loopMin + Math.max(...loop.stops.slice(1).map((s) => s.min)));
    // 第二圈的同一站剛好晚 loopMin
    for (let i = 0; i < n - 1; i++) {
      assert.equal(r.stops[n + i], r.stops[i]);
      assert.equal(r.offsets[n + i] - r.offsets[i], loop.loopMin);
    }
  }
  const last = loop.stops[n - 1];
  // 内回り：一圈的分鐘照資料；最後一站（大阪城公園）→ 第一站（大阪）跨過接點，要 loopMin − 34 = 11 分
  const plus = headway(net.routes, 'jr-osaka-loop:+') as HeadwayRoute;
  assert.deepEqual(plus.offsets.slice(0, n), loop.stops.map((s) => s.min));
  assert.equal(plus.stops[n - 1], last.id);
  assert.ok(plus.offsets[n - 1] < loop.loopMin);
  assert.equal(plus.offsets[n] - plus.offsets[n - 1], loop.loopMin - last.min);
  // 外回り：大阪 → 大阪城公園 也是 11 分
  const minus = headway(net.routes, 'jr-osaka-loop:-') as HeadwayRoute;
  assert.equal(minus.stops[1], last.id);
  assert.equal(minus.offsets[1], loop.loopMin - last.min);
  assert.deepEqual(minus.stops.slice(1, n), loop.stops.slice(1).map((s) => s.id).reverse());
});

test('buildNetwork：轉乘的步行和同站換線', () => {
  const d = realData();
  const net = buildNetwork(d, DEFAULT_CONFIG, '2027-02-12');
  const fp = net.footpaths.get('osaka-namba')?.find((f) => f.to === 'nankai-namba' && f.transfer);
  assert.ok(fp);
  assert.equal(fp.walk, 11);
  assert.equal(fp.transfer?.elevator, true);
  // 不是 oneWay：反方向也有
  assert.ok(net.footpaths.get('nankai-namba')?.some((f) => f.to === 'osaka-namba' && f.walk === 11 && f.transfer));
  // oneWay 只加一個方向：兩個方向各一筆，不會被反過來多加
  const nm = net.footpaths.get('nankai-namba')?.filter((f) => f.to === 'metro-namba' && f.transfer) ?? [];
  assert.deepEqual(nm.map((f) => f.transfer?.toLine), ['metro-midosuji']);
  const mn = net.footpaths.get('metro-namba')?.filter((f) => f.to === 'nankai-namba' && f.transfer) ?? [];
  assert.deepEqual(mn.map((f) => f.transfer?.fromLine), ['metro-midosuji']);
  // 森ノ宮 JR → Metro 的 walkMin 是 null：用 urbanTransferDefault
  assert.equal(net.footpaths.get('jr-morinomiya')?.find((f) => f.to === 'metro-morinomiya')?.walk, 5);
  // stations.json 的 transfers 沒在轉乘表的（iseshi ↔ jr-iseshi）：直線 × detourFactor ÷ 步速
  const ise = net.footpaths.get('iseshi')?.find((f) => f.to === 'jr-iseshi');
  assert.ok(ise && ise.transfer === null && ise.walk > 0 && ise.walk < 3);
  assert.ok(net.footpaths.get('jr-iseshi')?.some((f) => f.to === 'iseshi'));
  // 同站換線：本町 御堂筋線 → 中央線（轉乘表 walkMin 是 null → 5）
  const rec = d.urbanTransfers?.find((t) => t.from === 'metro-hommachi' && t.to === 'metro-hommachi');
  assert.ok(rec);
  assert.equal(net.sameStopChange('metro-hommachi', 'metro-midosuji', 'metro-chuo').walk, rec.walkMin ?? 5);
  // 反方向也用同一筆（不是 oneWay）
  assert.equal(net.sameStopChange('metro-hommachi', 'metro-chuo', 'metro-midosuji').transfer, rec);
  assert.equal(net.sameStopChange('jr-nishikujo', 'jr-osaka-loop', 'jr-yumesaki').walk, 1);
  // 轉乘表沒有、一邊是班距型 → urbanTransferDefault；都不是 → minTransfer；同 group → minTransfer
  assert.deepEqual(net.sameStopChange('metro-namba', 'metro-midosuji', 'kintetsu-namba-osaka'), { walk: 5, transfer: null });
  assert.deepEqual(net.sameStopChange('toba', 'kintetsu', 'sanco-ise-toba'), { walk: 3, transfer: null });
  assert.equal(net.sameStopChange('metro-hommachi', 'metro-chuo', 'metro-chuo').walk, DEFAULT_CONFIG.transit.minTransfer);
});

test('buildNetwork：停靠點 ID、近鐵和路線檔的 route', () => {
  const net = buildNetwork(realData(), DEFAULT_CONFIG, '2027-02-02');
  assert.equal(net.stops.get('toba')?.stationId, 'toba');
  assert.equal(net.stops.get('toba')?.name, '鳥羽');
  assert.equal(net.stops.get('jr-toba')?.stationId, 'jr-toba');
  const bus = net.routes.find((r): r is TimedRoute => r.kind === 'timetable' && r.group === 'sanco-ise-toba');
  assert.ok(bus);
  assert.equal(bus.mode, 'bus');
  assert.equal(bus.key, 'sanco-ise-toba');
  assert.equal(bus.routeId, 'sanco-ise-toba');
  assert.ok(bus.stops.every((s) => s.startsWith('sanco-ise-toba/')));
  assert.equal(net.stops.get(bus.stops[0])?.stationId, null);
  assert.ok(net.stops.get(bus.stops[0])?.coords);
  const jr = net.routes.find((r): r is TimedRoute => r.kind === 'timetable' && r.group === 'jr-sangu');
  assert.ok(jr && jr.mode === 'train' && jr.stops.includes('jr-toba'));
  const ferry = net.routes.find((r): r is TimedRoute => r.kind === 'timetable' && r.group === 'toba-teikisen-toshi');
  assert.equal(ferry?.mode, 'ferry');
  const kin = net.routes.filter((r): r is TimedRoute => r.kind === 'timetable' && r.group === 'kintetsu');
  assert.ok(kin.length > 0 && kin.every((r) => r.key === 'kintetsu' && r.mode === 'train' && r.routeId === null));
  // 每個 route 的班次依發車排序、FIFO：後發車的每一站都不比前一班早
  for (const r of net.routes) {
    if (r.kind !== 'timetable') continue;
    for (const t of r.trips) assert.ok(t.arr.length === r.stops.length && t.dep.length === r.stops.length);
    for (let k = 1; k < r.trips.length; k++) {
      const [p, q] = [r.trips[k - 1], r.trips[k]];
      for (let i = 0; i < r.stops.length; i++) assert.ok(q.arr[i] >= p.arr[i] && q.dep[i] >= p.dep[i], `${r.key} FIFO`);
    }
  }
  // routesAt 指回 stops 的位置
  for (const [stop, list] of net.routesAt) for (const { route, index } of list) assert.equal(net.routes[route].stops[index], stop);
  // 停靠點之間 transferMaxMeters 內的：巴士停留所之間有直線估算的步行
  assert.ok([...net.footpaths].some(([s, fps]) => s.includes('/') && fps.some((f) => f.transfer === null && f.to.includes('/'))));
});

test('buildNetwork：特急、しまかぜ固定停駛', () => {
  const d = realData();
  const trips = (cfg: typeof DEFAULT_CONFIG, date: string) =>
    buildNetwork(d, cfg, date).routes.flatMap((r) => (r.kind === 'timetable' && r.group === 'kintetsu' ? r.trips : []));
  const noExp = { ...DEFAULT_CONFIG, transit: { ...DEFAULT_CONFIG.transit, allowExpress: false } };
  assert.ok(trips(DEFAULT_CONFIG, '2027-02-03').some((t) => t.line.startsWith('特急')));
  assert.ok(!trips(noExp, '2027-02-03').some((t) => t.line.startsWith('特急') || t.line.startsWith('しまかぜ')));
  // 大阪難波発着的しまかぜ週二停駛（2027-02-02 是週二），週三（02-03）有
  const shima = (date: string) => new Set(trips(DEFAULT_CONFIG, date).filter((t) => t.line.startsWith('しまかぜ')).map((t) => t.tripId));
  const offNo = Object.entries(d.kintetsu!.trains.weekday)
    .filter(([, t]) => t.type === 'しまかぜ' && t.note?.startsWith('大阪難波発着'))
    .map(([no]) => no);
  assert.ok(offNo.length > 0);
  const tue = shima('2027-02-02');
  const wed = shima('2027-02-03');
  assert.ok(offNo.every((no) => !tue.has(no) && wed.has(no)));
});

test('buildNetwork：同一天同設定用快取', () => {
  const d = realData();
  assert.equal(buildNetwork(d, DEFAULT_CONFIG, '2027-02-12'), buildNetwork(d, DEFAULT_CONFIG, '2027-02-12'));
});

test('buildNetwork：國定假日空港急行沒有服務', () => {
  const net = buildNetwork(realData(), DEFAULT_CONFIG, '2027-02-11');
  const r = net.routes.find((x): x is HeadwayRoute => x.kind === 'headway' && x.routeId === 'nankai-airport-express');
  assert.ok(r);
  assert.equal(r.service?.headway ?? null, null);
  assert.equal(headwayWait(r.service, 600, true), null);
});
