// scripts/kyoto-urban.mjs 的路線設定（T87）。票價、notes 改這裡再重跑，不要手改 data/timetables/urban/*.json。
// 站名是時刻表網站上的寫法（JR おでかけネット、近鐵 T7），第三個值是寫進 stops[].note 的說明。
// count.out／count.in：計數用的兩個方向的時刻表（JR：站碼＋線碼＋方向；近鐵：[slCode, d]）。
// types：要數的車種（JR 是駅時刻表凡例的簡稱，去掉 ● 和空白後比對；普通是空字串）。dest：只數這些終點。

import { MANUAL_ROUTES } from './kyoto-urban.manual.mjs';

const JRB = 'https://timetable.jr-odekake.net/station-timetable/';
const KIN = 'https://eki.kintetsu.co.jp/norikae/';
const jrSrc = (code, label) => (days) =>
  Object.entries(days).map(([k, d]) => ({ url: `${JRB}${code}?date=${d.ref.replaceAll('-', '')}`, note: `JR おでかけネット 駅時刻表 ${label}（${k}，用 ${d.ref} 推算）` }));
const kinSrc = ([sl, d], label) => (days) =>
  Object.entries(days).map(([k, x]) => ({ url: `${KIN}T5?USR=PC&slCode=${sl}&d=${d}&dw=${x.dw}`, note: `近鐵 駅時刻表 ${label}（${k}）` }));
const both = (a, b) => (days) => [...a(days), ...b(days)];

const SUBWAY = 'https://www2.city.kyoto.lg.jp/kotsu/tikadia/diadata/';
const SUBWAY_PASSES = { 'kintetsu-rail-pass-5day': false };
// 地下鐵票價：區數制（1 區 220／110、2 區 260／130、3 區 290／150），站間區數照交通局的區數表
const SUBWAY_FARES = {
  currency: 'JPY',
  adult: {
    'subway-kyoto': { 'subway-shijo': 220, 'subway-karasuma-oike': 220, 'subway-imadegawa': 260, takeda: 260, 'subway-higashiyama': 260, 'subway-keage': 260, 'subway-sanjo-keihan': 260, 'subway-kyoto-shiyakusho-mae': 260, 'subway-nijo': 260, 'subway-uzumasa-tenjingawa': 260 },
    'subway-shijo': { 'subway-karasuma-oike': 220, 'subway-imadegawa': 260, 'subway-sanjo-keihan': 220, 'subway-higashiyama': 220 },
    'subway-karasuma-oike': { 'subway-imadegawa': 220, 'subway-kyoto-shiyakusho-mae': 220, 'subway-sanjo-keihan': 220, 'subway-higashiyama': 220, 'subway-keage': 220, 'subway-nijo': 220, 'subway-uzumasa-tenjingawa': 260, 'subway-yamashina': 260 },
    'subway-nijo': { 'subway-sanjo-keihan': 220, 'subway-higashiyama': 260, 'subway-keage': 260 },
    'subway-sanjo-keihan': { 'subway-higashiyama': 220, 'subway-keage': 220, 'subway-yamashina': 260 },
    'subway-uzumasa-tenjingawa': { 'subway-nijo': 220, 'subway-keage': 260, 'subway-yamashina': 290 },
  },
  child: '1 區 110、2 區 130、3 區 150（交通局運賃表）',
  note: '區數制：1 區 220、2 區 260、3 區 290、4 區 330、5 區 360（大人）；烏丸線、東西線之間轉乘照全程區數算（例：京都 → 東山 2 區 260）',
};
const SUBWAY_FARE_SOURCES = [
  { type: 'official', url: 'https://www.city.kyoto.lg.jp/kotsu/page/0000240757.html', retrieved: '2026-11-12', note: '地下鐵區別運賃（2026-11-10 更新）' },
  { type: 'official', url: 'https://www.city.kyoto.lg.jp/kotsu/page/0000163781.html', retrieved: '2026-11-12', note: '站間區數表' },
];
const SUBWAY_NOTE = '地下鉄1日券 大人 800／兒童 400、地下鉄・バス1日券 1,100／550（見 data/raw/access/kyoto.md 的票券比較）。KINTETSU RAIL PASS 不能用（竹田以北是地下鐵）。交通系 IC 卡可用。';
const EK = (sf, st, note) => ({ type: 'other', url: `https://ekitan.com/transit/fare/sf-${sf}/st-${st}`, retrieved: '2026-11-12', note: `駅探（非官方）：${note}` });
const JR_CHILD = '兒童半價，10 円未滿捨去（JR 西日本 旅客営業規則第 74 條）';
const JR_RULE = { type: 'official', url: 'https://www.jr-odekake.net/ticket/guide/assets/pdf/stipulation/2026/covenant2-03.pdf', retrieved: '2026-11-12', note: 'JR 西日本 旅客営業規則（2026-10-01 現行）第 73、74 條：兒童票' };
const KIN_CHILD = '兒童半價，10 円未滿進位（近鐵 旅客営業規則第 60 條）';
const KIN_RULE = { type: 'official', url: 'https://www.kintetsu.co.jp/gyoumu/kippu/pdf/10_kisoku_2-03-01.pdf', retrieved: '2026-11-12', note: '近鐵 旅客営業規則第 59、60 條：兒童票' };
const JR_PASSES = { 'kintetsu-rail-pass-5day': false };
const KIN_PASSES = { 'kintetsu-rail-pass-5day': true };
const JR_NOTE_COMMON = 'JR 不能用 KINTETSU RAIL PASS，車資另付；ICOCA 可用。時刻表 2026-03-14 改正，2027-03 可能改點，2 月應該還是這一版。';

export const ROUTES = [
  {
    id: 'jr-shinkaisoku',
    kind: 'jr',
    mode: 'jr',
    operator: 'JR 西日本',
    name: { ja: 'JR新快速（大阪～京都～草津）', zh: 'JR 新快速（大阪～京都～草津）' },
    serviceType: '新快速',
    stops: [
      ['大阪', 'jr-osaka', '大阪站 新快速多在 7～10 號月台（見 _transfers）'],
      ['京都', 'jr-kyoto'],
      ['山科', 'jr-yamashina', '琵琶湖線、湖西線分岔；轉地下鐵東西線'],
      ['大津', 'jr-otsu', '轉京阪石山坂本線要走到京阪びわ湖浜大津（約 10 分）'],
      ['石山', 'jr-ishiyama', '轉京阪石山（石山寺）'],
      ['草津', 'jr-kusatsu', '琵琶湖博物館的巴士'],
    ],
    types: /^新/,
    count: { out: '2784013001', in: '2784011001', sourceUrls: both(jrSrc('2784013001', '京都 琵琶湖線 山科・草津・米原方面'), jrSrc('2784011001', '京都 JR京都線 新大阪・大阪・三ノ宮方面')) },
    countNote: '班距數京都站的新快速：往米原方向（琵琶湖線）和往大阪方向各一張，取較少的一方。往大阪方向也含從湖西線來的新快速，所以取較少的一方是琵琶湖線那一側的班數',
    sampleHour: 12,
    fares: { currency: 'JPY', adult: { 'jr-kyoto': { 'jr-osaka': 580, 'jr-yamashina': 180, 'jr-otsu': 200, 'jr-ishiyama': 240, 'jr-kusatsu': 410 }, 'jr-osaka': { 'jr-otsu': 960, 'jr-kusatsu': 1120 } }, child: JR_CHILD, note: 'IC 卡同價' },
    fareSources: [EK(5198, 5006, '京都 ↔ 大阪 580'), EK(5198, 6112, '京都 ↔ 山科 180'), EK(5198, 5021, '京都 ↔ 大津 200'), EK(5198, 4881, '京都 ↔ 石山 240'), EK(5198, 5221, '京都 ↔ 草津 410'), EK(5006, 5021, '大阪 ↔ 大津 960'), EK(5006, 5221, '大阪 ↔ 草津 1,120'), JR_RULE],
    passes: JR_PASSES,
    notes:
      '同一班新快速穿過京都站（姫路・大阪 ↔ 京都 ↔ 米原・長浜・敦賀），存成一條：拆成大阪 ↔ 京都、京都 ↔ 琵琶湖兩條會在京都多算一次換車。' +
      '往湖西線的新快速（大阪 → 京都 → 山科 → 堅田 → 近江今津・敦賀）在 jr-kosei（時刻表型），這裡只算琵琶湖線那一側。' +
      '這一條數所有往琵琶湖線的新快速（含只到草津、野洲的）；過了野洲往近江八幡、彥根的車比較少，另一條 jr-shinkaisoku-maibara。' +
      '有付費座位 Aシート（A）、うれしート（う）的車廂，一般車廂不用另外付費。' +
      JR_NOTE_COMMON,
  },
  {
    id: 'jr-shinkaisoku-maibara',
    kind: 'jr',
    mode: 'jr',
    operator: 'JR 西日本',
    name: { ja: 'JR新快速（大阪～京都～彦根・米原方面）', zh: 'JR 新快速（大阪～京都～彥根・米原方面）' },
    serviceType: '新快速',
    stops: [
      ['大阪', 'jr-osaka', '大阪站 新快速多在 7～10 號月台（見 _transfers）'],
      ['京都', 'jr-kyoto'],
      ['山科', 'jr-yamashina', '琵琶湖線、湖西線分岔；轉地下鐵東西線'],
      ['大津', 'jr-otsu', '轉京阪石山坂本線要走到京阪びわ湖浜大津（約 10 分）'],
      ['石山', 'jr-ishiyama', '轉京阪石山（石山寺）'],
      ['草津', 'jr-kusatsu', '琵琶湖博物館的巴士'],
      ['守山', 'jr-moriyama', '佐川美術館的巴士'],
      ['近江八幡', 'jr-omi-hachiman', 'La Collina、八幡堀的巴士'],
      ['彦根', 'jr-hikone', '彥根城走約 15 分'],
    ],
    types: /^(新|A快|快)/,
    sampleTypes: /^新/,
    dest: { out: ['米', '浜', '塩', '敦'] },
    count: { out: '2784013001', in: '2784011001', sourceUrls: both(jrSrc('2784013001', '京都 琵琶湖線 山科・草津・米原方面'), jrSrc('2784011001', '京都 JR京都線 新大阪・大阪・三ノ宮方面')) },
    countNote: '班距數京都站往米原方向、終點是米原、長浜、近江塩津、敦賀（過了彥根）的新快速和快速，和往大阪方向的新快速、快速，取較少的一方（實際上就是往米原方向的班數）',
    sampleHour: 12,
    fares: { currency: 'JPY', adult: { 'jr-kyoto': { 'jr-osaka': 580, 'jr-yamashina': 180, 'jr-otsu': 200, 'jr-ishiyama': 240, 'jr-kusatsu': 410, 'jr-moriyama': 490, 'jr-omi-hachiman': 680, 'jr-hikone': 1170 }, 'jr-osaka': { 'jr-otsu': 960, 'jr-kusatsu': 1120, 'jr-omi-hachiman': 1520, 'jr-hikone': 1980 } }, child: JR_CHILD, note: 'IC 卡同價' },
    fareSources: [EK(5198, 5006, '京都 ↔ 大阪 580'), EK(5198, 6091, '京都 ↔ 守山 490'), EK(5198, 4991, '京都 ↔ 近江八幡 680'), EK(5198, 5877, '京都 ↔ 彦根 1,170'), EK(5006, 4991, '大阪 ↔ 近江八幡 1,520'), EK(5006, 5877, '大阪 ↔ 彦根 1,980（新快速經由）'), JR_RULE],
    passes: JR_PASSES,
    notes:
      '同一班新快速穿過京都站（姫路・大阪 ↔ 京都 ↔ 米原・長浜・敦賀），存成一條：拆成大阪 ↔ 京都、京都 ↔ 琵琶湖兩條會在京都多算一次換車。' +
      '往湖西線的新快速（大阪 → 京都 → 山科 → 堅田 → 近江今津・敦賀）在 jr-kosei（時刻表型），這裡只算琵琶湖線那一側。' +
      '只算會開到彥根以東的新快速和快速（白天新快速到野洲為止的多，往米原、長浜的多是快速）；快速在草津以東各站停，比新快速慢幾分鐘，站間分鐘用新快速。到草津為止的用 jr-shinkaisoku（班次比較多）。往大阪方向沒有分終點，是用全部新快速、快速數的（不影響取較少的一方）。' +
      '有付費座位 Aシート（A）、うれしート（う）的車廂，一般車廂不用另外付費。' +
      JR_NOTE_COMMON,
  },
  {
    id: 'jr-nara',
    kind: 'jr',
    mode: 'jr',
    operator: 'JR 西日本',
    name: { ja: 'JR奈良線（京都～宇治）', zh: 'JR 奈良線（京都～宇治）' },
    serviceType: null,
    stops: [
      ['京都', 'jr-kyoto', '奈良線在 8～10 號月台（京都站南側、近鐵那一邊）'],
      ['東福寺', 'jr-tofukuji', '轉京阪本線'],
      ['稲荷', 'jr-inari', '伏見稻荷大社正門前'],
      ['宇治', 'jr-uji'],
    ],
    types: /^(|D区|区|Dみ快|み快)$/,
    sampleTypes: /^$/,
    count: { out: '2784064001', in: '3021064002', sourceUrls: both(jrSrc('2784064001', '京都 奈良線 宇治・奈良方面'), jrSrc('3021064002', '稲荷 奈良線 京都方面')) },
    countNote: '班距數普通、区間快速、みやこ路快速（三種都停京都、東福寺、稲荷、宇治）：往外看京都站發車、往回看稲荷站往京都的發車',
    sampleHour: 12,
    fares: { currency: 'JPY', adult: { 'jr-kyoto': { 'jr-tofukuji': 150, 'jr-inari': 150, 'jr-uji': 240 } }, child: JR_CHILD, note: 'IC 卡同價' },
    fareSources: [EK(5198, 5651, '京都 ↔ 東福寺 150'), EK(5198, 4913, '京都 ↔ 稲荷 150'), EK(5198, 4944, '京都 ↔ 宇治 240'), JR_RULE],
    passes: JR_PASSES,
    notes:
      '普通、区間快速、みやこ路快速都停稲荷（伏見稻荷）和宇治；站間分鐘用普通（較慢、保守），みやこ路快速京都 → 宇治約 18 分、普通約 22 分。伏見稻荷參拜旺季（新年～2 月初）稲荷站很擠。' +
      JR_NOTE_COMMON,
  },
  {
    id: 'jr-sagano',
    kind: 'jr',
    mode: 'jr',
    operator: 'JR 西日本',
    name: { ja: 'JR嵯峨野線（京都～嵯峨嵐山）', zh: 'JR 嵯峨野線（京都～嵯峨嵐山）' },
    serviceType: null,
    stops: [
      ['京都', 'jr-kyoto', '嵯峨野線在 31～33 號月台（京都站西側，從中央口走約 5 分）'],
      ['梅小路京都西', 'jr-umekoji-kyotonishi', '京都鐵道博物館、京都水族館'],
      ['二条', 'jr-nijo', '轉地下鐵東西線'],
      ['嵯峨嵐山', 'jr-saga-arashiyama'],
    ],
    types: /^$/,
    count: { out: '2784055001', in: '3191055002', sourceUrls: both(jrSrc('2784055001', '京都 嵯峨野線 亀岡・園部・福知山方面'), jrSrc('3191055002', '亀岡 嵯峨野線 京都方面')) },
    countNote: '班距只數普通（快速不停梅小路京都西，特急要另買特急券）：往外看京都站發車、往回看亀岡站往京都的發車（嵯峨嵐山始發的少數班次沒算，所以偏保守）',
    sampleHour: 12,
    fares: { currency: 'JPY', adult: { 'jr-kyoto': { 'jr-umekoji-kyotonishi': 150, 'jr-nijo': 180, 'jr-saga-arashiyama': 240 } }, child: JR_CHILD, note: 'IC 卡同價' },
    fareSources: [EK(5198, 9892, '京都 ↔ 梅小路京都西 150'), EK(5198, 5774, '京都 ↔ 二条 180'), EK(5198, 5320, '京都 ↔ 嵯峨嵐山 240'), JR_RULE],
    passes: JR_PASSES,
    notes: '另有快速（停二条、嵯峨嵐山，不停梅小路京都西）白天每小時約 1 班，班距沒有算進來。嵯峨野觀光小火車（トロッコ嵯峨）是另一家公司（嵯峨野観光鉄道），冬季（12/30～2 月底）停駛。' + JR_NOTE_COMMON,
  },
  {
    id: 'kintetsu-kyoto-local',
    kind: 'kintetsu',
    mode: 'private',
    operator: '近畿日本鉄道',
    name: { ja: '近鉄京都線（普通，京都～小倉）', zh: '近鐵京都線（普通，京都～小倉）' },
    serviceType: '普通',
    stops: [
      ['京都', 'kyoto', '近鐵京都站在 JR 京都站南側（八条口那一邊）2F'],
      ['東寺', 'toji'],
      ['竹田', 'takeda', '和地下鐵烏丸線直通、同一個車站'],
      ['近鉄丹波橋', 'kintetsu-tambabashi', '轉京阪丹波橋'],
      ['桃山御陵前', 'momoyamagoryo-mae', '伏見（酒藏、寺田屋）一帶'],
      ['小倉', 'ogura', '任天堂博物館（宇治市小倉，和北九州的小倉無關）'],
    ],
    types: ['普通'],
    dest: { in: ['京都'] },
    count: { out: ['360-0', 1], in: ['360-6', 1], sourceUrls: both(kinSrc(['360-0', 1], '近鉄京都 京都線 近鉄奈良・天理・橿原神宮前・賢島方面'), kinSrc(['360-6', 1], '近鉄丹波橋 京都線 京都方面')) },
    countNote: '班距數普通：往外看近鉄京都發車、往回看近鉄丹波橋往京都的普通（往国際会館的普通在竹田轉進地下鐵、不到東寺、京都，不算）',
    sampleHour: 12,
    fares: { currency: 'JPY', adult: { kyoto: { toji: 180, takeda: 240, 'kintetsu-tambabashi': 240, 'momoyamagoryo-mae': 300, ogura: 360 } }, child: KIN_CHILD, note: '京都 ↔ 近鐵丹波橋是官方表；東寺、竹田、桃山御陵前、小倉是駅探（非官方）' },
    fareSources: [{ type: 'official', url: 'https://www.kintetsu.co.jp/railway/Dia/pdf/price_limited_express_d.pdf', retrieved: '2026-11-12', note: '近鐵 運賃特急料金表 京都⇔近鉄奈良・橿原神宮前（括號內是普通運賃）' }, EK(5198, 5649, '近鐵 京都 ↔ 東寺 180'), EK(5198, 5548, '近鐵 京都 ↔ 竹田 240（地下鐵經由是 260）'), EK(5198, 6082, '近鐵 京都 ↔ 桃山御陵前 300'), EK(5198, 5035, '近鐵 京都 ↔ 小倉 360'), KIN_RULE],
    passes: KIN_PASSES,
    notes: '急行不停東寺；從京都到丹波橋、桃山御陵前急行比較快，見 kintetsu-kyoto-express。KINTETSU RAIL PASS 可用（竹田以北直通地下鐵烏丸線的區間不行）。時刻表 2026-03-14 現在。',
  },
  {
    id: 'kintetsu-kyoto-express',
    kind: 'kintetsu',
    mode: 'private',
    operator: '近畿日本鉄道',
    name: { ja: '近鉄京都線（急行，京都～大和西大寺）', zh: '近鐵京都線（急行，京都～大和西大寺）' },
    serviceType: '急行',
    stops: [
      ['京都', 'kyoto'],
      ['竹田', 'takeda'],
      ['近鉄丹波橋', 'kintetsu-tambabashi'],
      ['桃山御陵前', 'momoyamagoryo-mae'],
      ['大和西大寺', 'yamato-saidaiji', '轉奈良線往大阪難波（見 kintetsu-nara-osaka）；京都線、奈良線的月台互相在旁邊'],
    ],
    types: ['急行'],
    dest: { out: ['橿原神宮前', '奈良', '天理', '大和西大寺'], in: ['京都'] },
    count: { out: ['360-0', 1], in: ['360-25', 1], sourceUrls: both(kinSrc(['360-0', 1], '近鉄京都 京都線 近鉄奈良・天理・橿原神宮前・賢島方面'), kinSrc(['360-25', 1], '大和西大寺 京都線 京都方面')) },
    countNote: '班距數急行：往外看近鉄京都發車（往橿原神宮前、奈良、天理、大和西大寺）、往回看大和西大寺往京都的急行',
    sampleHour: 12,
    fares: { currency: 'JPY', adult: { kyoto: { takeda: 240, 'kintetsu-tambabashi': 240, 'momoyamagoryo-mae': 300, 'yamato-saidaiji': 680 } }, child: KIN_CHILD, note: '京都 ↔ 近鐵丹波橋、大和西大寺是官方表；竹田、桃山御陵前是駅探（非官方）。京都 ↔ 大阪難波通算的運賃沒查（西大寺分開買 680＋590 是上限）' },
    fareSources: [{ type: 'official', url: 'https://www.kintetsu.co.jp/railway/Dia/pdf/price_limited_express_d.pdf', retrieved: '2026-11-12', note: '近鐵 運賃特急料金表 京都⇔近鉄奈良・橿原神宮前（括號內是普通運賃）' }, EK(5198, 5548, '近鐵 京都 ↔ 竹田 240'), EK(5198, 6082, '近鐵 京都 ↔ 桃山御陵前 300'), KIN_RULE],
    passes: KIN_PASSES,
    notes: '京都 ↔ 大阪難波用近鐵要在大和西大寺換車（約 1 小時 15～20 分，比 JR 新快速、阪急、京阪慢），好處是 KINTETSU RAIL PASS 可用。特急（另買特急券）在 _travel-times.json。時刻表 2026-03-14 現在。',
  },
  {
    id: 'kintetsu-nara-osaka',
    kind: 'kintetsu',
    mode: 'private',
    operator: '近畿日本鉄道',
    name: { ja: '近鉄奈良線（快速急行・急行，大和西大寺～大阪難波）', zh: '近鐵奈良線（快速急行・急行，大和西大寺～大阪難波）' },
    serviceType: '快速急行・急行',
    stops: [
      ['大和西大寺', 'yamato-saidaiji'],
      ['鶴橋', 'tsuruhashi'],
      ['大阪上本町', 'osaka-uehommachi', '停地下月台'],
      ['大阪難波', 'osaka-namba'],
    ],
    types: ['快速急行', '急行'],
    dest: { in: ['奈良'] },
    count: { out: ['350-21', 1], in: ['350-0', 1], sourceUrls: both(kinSrc(['350-21', 1], '大和西大寺 奈良線 大阪難波・神戸三宮方面'), kinSrc(['350-0', 1], '大阪難波 難波線 奈良・名古屋・賢島方面')) },
    countNote: '班距數快速急行和急行（兩種都停這四站）：往大阪看大和西大寺發車、往西大寺看大阪難波往奈良的發車',
    sampleHour: 12,
    fares: { currency: 'JPY', adult: { 'yamato-saidaiji': { tsuruhashi: 530, 'osaka-uehommachi': 590, 'osaka-namba': 590 } }, child: KIN_CHILD, note: '官方運賃特急料金表的普通運賃' },
    fareSources: [{ type: 'official', url: 'https://www.kintetsu.co.jp/railway/Dia/pdf/price_limited_express_e.pdf', retrieved: '2026-11-12', note: '近鐵 運賃特急料金表 大阪難波⇔近鉄奈良' }, KIN_RULE],
    passes: KIN_PASSES,
    notes: '京都 ↔ 大阪的近鐵路線的後半段（京都線急行在大和西大寺換這條）。KINTETSU RAIL PASS 可用。時刻表 2026-03-14 現在。',
  },
  // ---------- 京都市營地下鐵（全列車 CSV） ----------
  {
    id: 'subway-karasuma',
    kind: 'subway',
    mode: 'metro',
    operator: '京都市交通局',
    name: { ja: '京都市営地下鉄 烏丸線', zh: '京都市營地下鐵 烏丸線' },
    serviceType: null,
    stops: [
      ['今出川', 'subway-imadegawa', '京都御所'],
      ['烏丸御池', 'subway-karasuma-oike', '轉東西線'],
      ['四条', 'subway-shijo', '轉阪急烏丸；錦市場'],
      ['京都', 'subway-kyoto'],
      ['竹田', 'takeda', '和近鐵京都線直通（往新田辺、近鉄奈良的車），同一個車站'],
    ],
    types: null,
    count: {
      out: { file: 'tn02{day}00_dia_utf8.csv', station: '四条' },
      in: { file: 'tn02{day}01_dia_utf8.csv', station: '四条' },
      sourceUrls: (days) => Object.entries(days).flatMap(([k, d]) => ['00', '01'].map((x) => ({ url: `${SUBWAY}tn02${d.csvDay}${x}_dia_utf8.csv`, note: `京都市交通局 地下鉄 烏丸線 全列車時刻表 CSV（${k}、${x === '00' ? '下り 竹田方面' : '上り 国際会館方面'}；ハイパー地下鉄ダイヤ用的資料）` }))),
    },
    countNote: '班距數四条站兩個方向、而且今出川～竹田每站都有時刻的車（所有車在這段都每站停）',
    sampleHour: 11,
    validFrom: '2025-02-22',
    fares: SUBWAY_FARES,
    fareSources: SUBWAY_FARE_SOURCES,
    passes: SUBWAY_PASSES,
    notes: '時刻表「令和7年02月22日現在」。' + SUBWAY_NOTE,
  },
  {
    id: 'subway-tozai',
    kind: 'subway',
    mode: 'metro',
    operator: '京都市交通局',
    name: { ja: '京都市営地下鉄 東西線', zh: '京都市營地下鐵 東西線' },
    serviceType: null,
    stops: [
      ['太秦天神川', 'subway-uzumasa-tenjingawa', '轉嵐電嵐電天神川；東映太秦映畫村'],
      ['二条', 'subway-nijo', '轉 JR 嵯峨野線'],
      ['二条城前', 'subway-nijojo-mae', '二条城'],
      ['烏丸御池', 'subway-karasuma-oike', '轉烏丸線'],
      ['京都市役所前', 'subway-kyoto-shiyakusho-mae'],
      ['三条京阪', 'subway-sanjo-keihan', '轉京阪三条'],
      ['東山', 'subway-higashiyama', '平安神宮'],
      ['蹴上', 'subway-keage', '南禪寺、京都市動物園'],
      ['山科', 'subway-yamashina', '轉 JR 山科（琵琶湖線、湖西線）'],
    ],
    types: null,
    count: {
      out: { file: 'tn01{day}01_dia_utf8.csv', station: '烏丸御池' },
      in: { file: 'tn01{day}00_dia_utf8.csv', station: '烏丸御池' },
      sourceUrls: (days) => Object.entries(days).flatMap(([k, d]) => ['01', '00'].map((x) => ({ url: `${SUBWAY}tn01${d.csvDay}${x}_dia_utf8.csv`, note: `京都市交通局 地下鉄 東西線 全列車時刻表 CSV（${k}、${x === '01' ? '上り 六地蔵・びわ湖浜大津方面' : '下り 太秦天神川方面'}）` }))),
    },
    countNote: '班距只數經過山科的車（六地蔵～太秦天神川）；京阪京津線直通的車在御陵分岔、不經山科，另見 keihan-keishin。太秦天神川～蹴上之間兩種都停，實際上更密',
    sampleHour: 11,
    validFrom: '2025-02-22',
    fares: SUBWAY_FARES,
    fareSources: SUBWAY_FARE_SOURCES,
    passes: SUBWAY_PASSES,
    notes: '時刻表「令和7年02月22日現在」。' + SUBWAY_NOTE,
  },
  {
    id: 'keihan-keishin',
    kind: 'subway',
    mode: 'private',
    operator: '京阪電気鉄道・京都市交通局',
    name: { ja: '京阪京津線（地下鉄東西線直通，京都市役所前～びわ湖浜大津）', zh: '京阪京津線（地下鐵東西線直通，京都市役所前～琵琶湖濱大津）' },
    serviceType: null,
    stops: [
      ['京都市役所前', 'subway-kyoto-shiyakusho-mae'],
      ['三条京阪', 'subway-sanjo-keihan'],
      ['東山', 'subway-higashiyama'],
      ['蹴上', 'subway-keage'],
      ['御陵', 'subway-misasagi', '和東西線（往山科、六地蔵）分岔'],
      ['びわ湖浜大津', 'keihan-biwako-hamaotsu', '轉京阪石山坂本線；密西根號遊船的大津港'],
    ],
    types: null,
    count: {
      out: { file: 'tn01{day}01_dia_utf8.csv', station: '蹴上' },
      in: { file: 'tn01{day}00_dia_utf8.csv', station: '蹴上' },
      sourceUrls: (days) => Object.entries(days).flatMap(([k, d]) => ['01', '00'].map((x) => ({ url: `${SUBWAY}tn01${d.csvDay}${x}_dia_utf8.csv`, note: `京都市交通局 地下鉄 東西線 全列車時刻表 CSV（${k}；京津線直通的車也在裡面，京津線區間只列御陵、四宮、びわ湖浜大津）` }))),
    },
    countNote: '班距數地下鐵 CSV 裡京都市役所前～びわ湖浜大津每站都有時刻的直通車（在蹴上數）',
    sampleHour: 11,
    validFrom: '2025-02-22',
    fares: { currency: 'JPY', adult: {}, child: null, note: null },
    fareSources: [],
    passes: { 'kintetsu-rail-pass-5day': false },
    notes: '京阪京津線的車直通地下鐵東西線（京都市役所前、有的到太秦天神川），不用在御陵換車。地下鐵區間和京阪區間的票價相加（見 fares）。',
  },
  ...MANUAL_ROUTES,
];
