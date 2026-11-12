// 京都、琵琶湖的情境測試（T88）：伊勢 → 京都、京都一天、京都 ↔ 大阪、不住京都的走法，都用真的 data/。
// 市巴士還沒進來（T87 等 ODPT）：清水寺、金閣寺那兩段只確認不會當掉，真正的斷言是 test.todo，市巴士進來時由 T87 那一輪改成真的
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addItem, createItinerary, planItinerary, planLeg, resolveConfig, setLodging, type EngineData, type Endpoint, type LegContext } from '../src/index.ts';
import { buildNetwork } from '../src/raptor/network.ts';
import { realData } from './fixtures.ts';

const cfg = resolveConfig();
const base = realData();
const WHOLE = { size: 15, elders: 5, kids: 4 };

/**
 * T86d 還沒填景點的 nearestStation：伏見稻荷大社的座標在本殿一帶，離 JR 稲荷直線約 770 m（×1.3 ÷ 80 × 1.4 超過單段步行上限），
 * 照 data/raw/kyoto/README.md「JR 稲荷站下車即到」先補 3 分。資料有寫了就用資料的
 */
const STAND_IN: Record<string, { id: string; minutes: number }> = { 'kyoto-fushimi-inari': { id: 'jr-inari', minutes: 3 } };
const real: EngineData = {
  ...base,
  getPlace: (id) => {
    const r = base.getPlace(id);
    const s = STAND_IN[id];
    if (!r || !s || r.record.nearestStation) return r;
    return { ...r, record: { ...r.record, nearestStation: { id: s.id, minutes: s.minutes, mode: 'walk' } } };
  },
};

const P = (id: string): Endpoint => {
  const r = real.getPlace(id)?.record ?? null;
  return { id, coords: r?.coords ?? null, record: r };
};
const ctx = (over: Partial<LegContext>): LegContext => ({ date: '2027-02-08', depart: 600, party: WHOLE, data: real, cfg, ...over });
const hm = (h: number, m = 0) => h * 60 + m;

// --- 伊勢 → 京都 --------------------------------------------------------------

test('伊勢市 → 京都：直達特急（平日 伊勢市 15:07 → 京都 17:15，不用換車）', () => {
  const { leg } = planLeg(P('iseshi'), P('kyoto'), ctx({ date: '2027-02-08', depart: hm(14, 50) }));
  assert.equal(leg.mode, 'train');
  assert.equal(leg.rides.length, 1);
  assert.equal(leg.rides[0].operator, 'kintetsu');
  assert.equal(leg.rides[0].depart, '15:07');
  assert.equal(leg.rides[0].arrive, '17:15');
});

test('伊勢市 → 京都：大和八木換車，同站換近鐵用近鐵官方 4 分 × 團體係數（stopChangeMin）', () => {
  const { leg } = planLeg(P('iseshi'), P('kyoto'), ctx({ date: '2027-02-08', depart: hm(8, 30) }));
  assert.equal(leg.rides.length, 2);
  assert.ok(leg.rides.every((r) => r.operator === 'kintetsu'));
  assert.equal(leg.rides[0].to, 'yamato-yagi');
  assert.equal(leg.rides[1].from, 'yamato-yagi');
  assert.equal(leg.rides[1].to, 'kyoto');
  assert.equal(leg.transfers?.[0].walkMinutes, Math.ceil(4 * cfg.walk.factorWhole));
  // 八木到站到發車至少隔換車時間
  assert.ok(Number(leg.rides[1].depart.replace(':', '')) > Number(leg.rides[0].arrive.replace(':', '')));
});

test('大和八木以外的近鐵同站換車照舊：minTransfer、轉乘步行顯示 0', () => {
  const net = buildNetwork(real, cfg, '2027-02-08');
  assert.deepEqual(net.sameStopChange('ise-nakagawa', 'kintetsu', 'kintetsu'), { walk: cfg.transit.minTransfer, transfer: null, none: true });
  assert.deepEqual(net.sameStopChange('yamato-yagi', 'kintetsu', 'kintetsu'), { walk: 4, transfer: null, none: false });
});

// --- 近鐵時刻表型不在市內短程搭 --------------------------------------------------

test('近鐵時刻表型不短程搭的站從資料來：班距型的近鐵路線（大阪、京都）停的站', () => {
  const net = buildNetwork(real, cfg, '2027-02-08');
  for (const s of ['osaka-namba', 'osaka-uehommachi', 'tsuruhashi', 'kyoto', 'toji', 'takeda', 'kintetsu-tambabashi', 'yamato-saidaiji']) assert.ok(net.kintetsuShort.has(s), s);
  for (const s of ['iseshi', 'yamato-yagi', 'jr-kyoto']) assert.ok(!net.kintetsuShort.has(s), s);
});

test('京都 → 近鐵丹波橋：搭班距型的近鐵京都線，不搭京都發的特急', () => {
  const { leg } = planLeg(P('kyoto'), P('kintetsu-tambabashi'), ctx({ date: '2027-02-08', depart: hm(9) }));
  assert.ok(leg.rides.length > 0, leg.mode);
  assert.ok(leg.rides.every((r) => r.kind === 'headway'), leg.rides.map((r) => r.line).join(','));
});

// --- 京都一天（不含巴士） --------------------------------------------------------

test('京都一天（不含巴士）：京都站的住宿 → 伏見稻荷 → 錦市場 → 住宿，都搭電車', () => {
  const date = '2027-02-09';
  let it = createItinerary();
  it = setLodging(it, '2027-02-08', 'kyoto-miyako-hachijo');
  it = setLodging(it, date, 'kyoto-miyako-hachijo');
  for (const place of ['kyoto-fushimi-inari', 'kyoto-nishiki-market']) it = addItem(it, date, { type: 'visit', options: [{ place }] }).itinerary;
  const day = planItinerary(it, real).days.find((d) => d.date === date);
  assert.ok(day);
  const codes = day.warnings.map((w) => w.code);
  assert.ok(!codes.includes('travel-unknown') && !codes.includes('taxi'), codes.join(','));
  assert.deepEqual(
    day.entries.map((e) => [e.kind, e.placeId]),
    [
      ['start', 'kyoto-miyako-hachijo'],
      ['visit', 'kyoto-fushimi-inari'],
      ['visit', 'kyoto-nishiki-market'],
      ['lodging', 'kyoto-miyako-hachijo'],
    ],
  );
  // 京都站 → 稲荷：JR 奈良線（班距型）
  assert.ok(day.entries[1].travel?.rides.some((r) => r.routeId === 'jr-nara'));
  for (const e of day.entries.slice(1)) {
    assert.ok(e.travel && e.travel.mode === 'train', `${e.placeId} ${e.travel?.mode}`);
    assert.ok(e.travel.minutes < 60, `${e.placeId} ${e.travel.minutes} 分`);
  }
});

// --- 只有巴士到的點（市巴士還沒進來） ---------------------------------------------

test('京都站 → 清水寺、金閣寺：市巴士還沒進來，不會當掉（現在是計程車）', () => {
  for (const to of ['kyoto-kiyomizudera', 'kyoto-kinkakuji']) {
    const { leg } = planLeg(P('jr-kyoto'), P(to), ctx({ date: '2027-02-09', depart: hm(10) }));
    assert.ok(leg.minutes > 0 && leg.minutes < 60, `${to} ${leg.mode} ${leg.minutes}`);
    assert.notEqual(leg.mode, 'unknown');
  }
});

test.todo('等 T87 市巴士：京都站 → 清水寺 搭市巴士（京都駅前 → 五条坂・清水道），時間合理（約 30 分內）');
test.todo('等 T87 市巴士：京都站 → 金閣寺 搭市巴士（京都駅前 → 金閣寺道），時間合理（約 45 分內）');
test.todo('等 T87 市巴士：京都一天加清水寺（京都站 → 伏見稻荷 → 清水寺 → 四条 → 京都站），含一段巴士、沒有計程車');

// --- 京都 ↔ 大阪 --------------------------------------------------------------

test('京都 ↔ 大阪當天來回：京都站的住宿 ↔ 道頓堀，都搭電車、1 小時半內', () => {
  for (const [a, b, t] of [
    ['kyoto-miyako-hachijo', 'osaka-dotonbori', hm(9, 30)],
    ['osaka-dotonbori', 'kyoto-miyako-hachijo', hm(16)],
  ] as const) {
    const { leg, warnings } = planLeg(P(a), P(b), ctx({ date: '2027-02-09', depart: t }));
    assert.equal(leg.mode, 'train', `${a} → ${b}`);
    assert.ok(leg.minutes <= 90, `${a} → ${b} ${leg.minutes} 分`);
    assert.ok(!warnings.some((w) => w.code === 'travel-unknown'));
  }
});

test('京都 → 關西機場：到得了（はるか沒收，走 JR 新快速、地鐵、南海）', () => {
  const { leg } = planLeg(P('kyoto'), P('kansai-airport'), ctx({ date: '2027-02-13', depart: hm(8) }));
  assert.equal(leg.mode, 'train');
  assert.equal(leg.rides[leg.rides.length - 1].to, 'kansai-airport');
  assert.ok(leg.minutes < 180, `${leg.minutes} 分`);
});

// --- 不住京都的走法 --------------------------------------------------------------

test('伊勢市 → 雄琴溫泉的住宿：近鐵直達京都、換 JR 湖西線，只換一次', () => {
  const { leg } = planLeg(P('iseshi'), P('biwako-yumotokan'), ctx({ date: '2027-02-08', depart: hm(14, 50) }));
  assert.equal(leg.rides.length, 2, leg.rides.map((r) => r.line).join(' → '));
  assert.equal(leg.rides[0].operator, 'kintetsu');
  assert.equal(leg.rides[0].to, 'kyoto');
  assert.equal(leg.rides[1].routeId, 'jr-kosei');
  assert.equal(leg.rides[1].to, 'おごと温泉');
  // 京都站 近鐵 → JR 出站再進站：官方 5 分 × 團體係數
  assert.equal(leg.transfers?.[0].walkMinutes, Math.ceil(5 * cfg.walk.factorWhole));
});

test('大阪難波的住宿 → 白鬚神社：JR 從大阪直通近江高島，京都不算換車；近江高島之後走路或計程車', () => {
  const { leg } = planLeg(P('osaka-grids-premium-namba'), P('biwako-shirahige-jinja'), ctx({ date: '2027-02-09', depart: hm(9, 30) }));
  const jr = leg.rides.filter((r) => r.routeId === 'jr-kosei' || r.routeId?.startsWith('jr-shinkaisoku'));
  assert.equal(jr.length, 1, leg.rides.map((r) => r.line).join(' → '));
  assert.equal(jr[0].to, '近江高島');
  assert.ok(!leg.rides.some((r) => r.from === '京都' || r.to === '京都'));
  assert.ok(leg.taxiAfter?.station === 'jr-omi-takashima' || (leg.walkAfter ?? 0) > 0);
});

test('琵琶湖的住宿 → 大阪的住宿：到得了、沒有「找不到交通」', () => {
  const { leg, warnings } = planLeg(P('biwako-yumotokan'), P('osaka-grids-premium-namba'), ctx({ date: '2027-02-10', depart: hm(9, 30) }));
  assert.ok(leg.mode === 'train', leg.mode);
  assert.ok(leg.minutes < 150, `${leg.minutes} 分`);
  assert.ok(!warnings.some((w) => w.code === 'travel-unknown'));
});
