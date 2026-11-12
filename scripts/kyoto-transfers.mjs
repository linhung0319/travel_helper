#!/usr/bin/env node
// 京都、琵琶湖的站內轉乘（T87）：寫進 data/timetables/urban/_transfers.json（格式見 CONVENTIONS §3「轉乘」）。
// 分鐘的來源不一（見每筆 note 和 data/raw/access/kyoto.md §4）：近鐵官方是「月台中央 → 他社最近的剪票口」；estimate 是依構內圖、站的座標推估。
// 重跑會先拿掉本檔管的那幾組（from、to 都是下面清單的站），再加回去；大阪那 22 筆不動。
//
// 用法：node scripts/kyoto-transfers.mjs [--dry-run]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'data/timetables/urban/_transfers.json');
const R = '2026-11-12';
const src = (url, note, type = 'official') => ({ type, url, retrieved: R, note });
const KIN_KYOTO = src('https://www.kintetsu.co.jp/soukatsu/kounai/kyoto.html', '近鐵 京都駅構內圖・のりかえ案内（2026-03-14 現在；月台中央到他社最近剪票口的標準分鐘）');
const KOTSU = (n, what) => src(`https://www.city.kyoto.lg.jp/kotsu/page/000000${n}.html`, `京都市交通局 ${what}駅 駅施設（電梯、出入口）`);
const RAKU = (name) => src(`https://www.ecomo-rakuraku.jp/ja/station/${encodeURIComponent(name)}/`, `らくらくおでかけネット ${name}`, 'other');

export const TRANSFERS = [
  {
    from: 'kyoto',
    to: 'jr-kyoto',
    fromLine: null,
    toLine: null,
    walkMin: 5,
    walkMinBasis: 'official',
    elevator: true,
    elevatorRoute:
      '近鐵京都 2F 月台 → 近鐵改札口（2F，八条側）→ 出改札左轉約 30 m → 樓梯右側的電梯上一層 → 直走約 50 m → JR 在來線西口改札（2F 跨線橋上）→ 西口改札內的電梯下到各月台（0、2～10、30～33 番都有電梯）。',
    elevatorWalkMin: null,
    exitGates: true,
    note:
      '**沒有近鐵・JR 中間改札**：要出近鐵剪票口、再進 JR 剪票口（車票分開買；IC 卡會各扣各的）。walkMin 5 是近鐵官方「月台中央 → JR 在來線西改札口」，不含 JR 剪票口到月台（月台到月台推估 8～10 分）。' +
      'はるか多在 30 番（1F 西側頭端式月台，從 0 番月台往西走），推估從近鐵 10～12 分；早上滋賀發的はるか 3、9、11 號在 7 番。15 人帶行李箱、電梯要分批，抓 25～30 分。' +
      '伊勢志摩 → 琵琶湖（近鐵特急到京都、換 JR 湖西線或琵琶湖線）都經過這裡。電梯一次能載多少人加行李：查不到。',
    sources: [
      KIN_KYOTO,
      src('https://www.kintetsu.co.jp/station/station_info/pdf/Kyoto_BF_02.pdf', '近鐵 京都駅 段差なく乗換可能なルート（JR 在來線，2026-01-20 現在）'),
      src('https://eki.jr-odekake.net/premises?id=0610116', 'JR 京都駅構內圖（2026-01-31 時點）'),
      src('https://eki.jr-odekake.net/barrierfree?id=0610116', 'JR 京都駅 バリアフリー情報：每個月台從西口、中央口都有電梯'),
    ],
  },
  {
    from: 'kyoto',
    to: 'subway-kyoto',
    fromLine: null,
    toLine: null,
    walkMin: 8,
    walkMinBasis: 'official',
    elevator: true,
    elevatorRoute:
      '近鐵改札口 → 右轉約 30 m → 再約 30 m、手扶梯／樓梯右側通路約 20 m → 電梯下到地面（八条口側）→ 過斑馬線 → 右轉直走約 100 m →「地下通路へのエレベーター」下樓 → 通路約 50 m 左轉 → 地下鐵京都駅南改札（改札內有電梯到月台）。約 260 m、2 段電梯、1 個斑馬線，有一段在戶外。',
    elevatorWalkMin: null,
    exitGates: true,
    note: 'walkMin 8 是近鐵官方到地下鐵剪票口的分鐘。地下鐵南改札除了尖峰時段沒有站員（有對講機）。下雨要撐傘。',
    sources: [KIN_KYOTO, src('https://www.kintetsu.co.jp/station/station_info/pdf/Kyoto_BF_03.pdf', '近鐵 京都駅 段差なく乗換可能なルート（地下鐵，2026-01-20 現在）'), KOTSU(9812, '京都')],
  },
  {
    from: 'jr-kyoto',
    to: 'subway-kyoto',
    fromLine: null,
    toLine: null,
    walkMin: 6,
    walkMinBasis: 'estimate',
    elevator: true,
    elevatorRoute: 'JR 中央口（1F）出站 → 地面往北 → 地下鐵 5 番出入口的電梯（「JR 京都駅正面東」）→ 地下鐵中央 1 改札（改札內有電梯到月台）。',
    elevatorWalkMin: null,
    exitGates: true,
    note: '官方沒有分鐘，依交通局的出入口說明推估 5～7 分。',
    sources: [KOTSU(9812, '京都'), src('https://eki.jr-odekake.net/premises?id=0610116', 'JR 京都駅構內圖')],
  },
  {
    from: 'takeda',
    to: 'takeda',
    fromLine: 'kintetsu-kyoto-local',
    toLine: 'subway-karasuma',
    walkMin: 1,
    walkMinBasis: 'official',
    elevator: true,
    elevatorRoute: '同一個車站、同一組剪票口；兩座島式月台各有電梯到 2F 大廳。',
    elevatorWalkMin: null,
    exitGates: false,
    note: '近鐵京都線的車很多直通地下鐵烏丸線（往国際会館），坐到直通車就不用換。近鐵 5 日券只到竹田，竹田以北的地下鐵要另付。哪一班停哪個月台、同向能不能對面換車：查不到。',
    sources: [src('https://www.kintetsu.co.jp/soukatsu/kounai/takeda.html', '近鐵 竹田駅構內圖（換地下鐵 1 分）'), KOTSU(9853, '竹田')],
  },
  {
    from: 'takeda',
    to: 'takeda',
    fromLine: 'kintetsu-kyoto-express',
    toLine: 'subway-karasuma',
    walkMin: 1,
    walkMinBasis: 'official',
    elevator: true,
    elevatorRoute: '同上（近鐵急行 ↔ 地下鐵烏丸線）。',
    elevatorWalkMin: null,
    exitGates: false,
    note: '同 kintetsu-kyoto-local ↔ subway-karasuma 那一筆。',
    sources: [src('https://www.kintetsu.co.jp/soukatsu/kounai/takeda.html', '近鐵 竹田駅構內圖')],
  },
  {
    from: 'kintetsu-tambabashi',
    to: 'keihan-tambabashi',
    fromLine: null,
    toLine: null,
    walkMin: 5,
    walkMinBasis: 'official',
    elevator: true,
    elevatorRoute: '近鐵月台（1F）→ 電梯 → 近鐵改札（2F 橋上）→ 2F 通路往京阪 → 通路端的電梯下 1F → 京阪**南改札口**（有電梯到月台）。',
    elevatorWalkMin: null,
    exitGates: true,
    note: 'walkMin 5 是近鐵官方「月台中央 → 京阪最近的剪票口」。京阪那邊要用南改札才有電梯。',
    sources: [src('https://www.kintetsu.co.jp/soukatsu/kounai/tambabashi.html', '近鐵 近鉄丹波橋駅構內圖'), RAKU('丹波橋')],
  },
  {
    from: 'yamato-saidaiji',
    to: 'yamato-saidaiji',
    fromLine: 'kintetsu-kyoto-express',
    toLine: 'kintetsu-nara-osaka',
    walkMin: 4,
    walkMinBasis: 'official',
    elevator: true,
    elevatorRoute: '每座月台都有電梯到 2F 大廳（構內圖的無障礙路線）。',
    elevatorWalkMin: null,
    exitGates: false,
    note: '近鐵官方：同一座島式月台（1↔2、3↔4 番）2 分，換到別的月台 4 分；京都線的車停哪個月台看當天時刻，取保守的 4 分。',
    sources: [src('https://www.kintetsu.co.jp/soukatsu/kounai/saidaiji.html', '近鐵 大和西大寺駅構內圖・のりかえ案内')],
  },
  {
    from: 'subway-karasuma-oike',
    to: 'subway-karasuma-oike',
    fromLine: 'subway-karasuma',
    toLine: 'subway-tozai',
    walkMin: 3,
    walkMinBasis: 'estimate',
    elevator: true,
    elevatorRoute: '北改札內左右各一台電梯，連東西線月台和烏丸線兩個方向的月台。',
    elevatorWalkMin: null,
    exitGates: false,
    note: '官方沒有分鐘，推估 2～4 分。',
    sources: [KOTSU(9448, '烏丸御池')],
  },
  {
    from: 'subway-shijo',
    to: 'hankyu-karasuma',
    fromLine: null,
    toLine: null,
    walkMin: 4,
    walkMinBasis: 'estimate',
    elevator: false,
    elevatorRoute:
      '**旅程期間地下連絡通路沒有無障礙設備**（階段昇降機 2026-11-10 起停用拆除，新電梯預計 2027 年 3 月上旬啟用）。全程電梯要繞到地面：地下鐵南改札 → 4 番出入口電梯到地面（烏丸通西側）→ 四条烏丸ビル／ラクエ四条烏丸的電梯下到阪急**西**改札（B1，有電梯到月台；東改札到月台只有樓梯）。',
    elevatorWalkMin: null,
    exitGates: true,
    note: '一般路線（連絡通路、有樓梯）推估 3～5 分，電梯繞行 10 分以上（推估）。交通局 2026-10-20 公告：連絡通路新設電梯工程，階段昇降機 2026-11-10 起停用，新電梯 2027 年 3 月上旬啟用。',
    sources: [
      KOTSU(9769, '四条'),
      src('https://www.city.kyoto.lg.jp/kotsu/page/0000359396.html', '京都市交通局 四条駅↔阪急烏丸駅 連絡通路電梯新設工程、階段昇降機停用（2026-10-20 公告）'),
      src('https://www.hankyu.co.jp/station/karasuma.html', '阪急 烏丸駅 駅情報'),
      RAKU('烏丸'),
    ],
  },
  {
    from: 'subway-sanjo-keihan',
    to: 'keihan-sanjo',
    fromLine: null,
    toLine: null,
    walkMin: null,
    walkMinBasis: 'estimate',
    elevator: null,
    elevatorRoute: '地下鐵的電梯只有 2 番出入口（三条通南側）到地面、改札到月台；京阪三条站有電梯、斜坡。兩站之間的地下通路是不是全程無段差：查不到。',
    elevatorWalkMin: null,
    exitGates: true,
    note: '交通局：「京阪電車三条駅と地下通路で連絡」。分鐘查不到。',
    sources: [KOTSU(9980, '三条京阪'), src('https://www.keihan.co.jp/traffic/station/stationinfo/170.html', '京阪 三条駅 駅情報')],
  },
  {
    from: 'jr-tofukuji',
    to: 'keihan-tofukuji',
    fromLine: null,
    toLine: null,
    walkMin: 3,
    walkMinBasis: 'estimate',
    elevator: true,
    elevatorRoute: '京阪 2 番のりば（往淀屋橋）經 B1F 地下通路（有電梯）。',
    elevatorWalkMin: null,
    exitGates: true,
    note: '京阪 1 番のりば（往三条・出町柳）有直通 JR 的「JR 線のりかえ口」，只開 7:00～19:00。JR 東福寺：月台的形狀關係，輪椅由站員引導。同一個站體，推估 2～4 分。',
    sources: [src('https://www.keihan.co.jp/traffic/station/assets/pdf/info/station-153.pdf', '京阪 東福寺駅構內圖（2025-03-27）'), RAKU('東福寺')],
  },
  {
    from: 'jr-inari',
    to: 'keihan-fushimi-inari',
    fromLine: null,
    toLine: null,
    walkMin: 5,
    walkMinBasis: 'estimate',
    elevator: false,
    elevatorRoute: null,
    elevatorWalkMin: null,
    exitGates: true,
    note: '兩站要走街道（直線約 300 m，中間是伏見稻荷大社的參道口）。京阪伏見稲荷沒有電梯（有斜坡，常常沒有站員）；JR 稲荷有電梯。伏見稻荷大社官方：JR 稲荷站「徒歩直ぐ」、京阪伏見稲荷站「東へ徒歩 5 分」。',
    sources: [src('https://inari.jp/access/', '伏見稻荷大社 交通'), RAKU('稲荷'), RAKU('伏見稲荷')],
  },
  {
    from: 'keihan-gion-shijo',
    to: 'hankyu-kyoto-kawaramachi',
    fromLine: null,
    toLine: null,
    walkMin: 7,
    walkMinBasis: 'estimate',
    elevator: true,
    elevatorRoute: '京阪祇園四条：月台 B2、改札 B1，7 號出入口有電梯到地面（四条大橋東南）→ 過四条大橋（約 300 m）→ 阪急京都河原町：四条河原町交差點東北側「コトクロス阪急河原町」的電梯下到東改札口。',
    elevatorWalkMin: null,
    exitGates: true,
    note: '要上地面過四条大橋，推估 6～8 分。',
    sources: [src('https://www.keihan.co.jp/traffic/station/stationinfo/162.html', '京阪 祇園四条駅 駅情報'), src('https://www.hankyu.co.jp/station/kawaramachi.html', '阪急 京都河原町駅 駅情報'), RAKU('祇園四条'), RAKU('京都河原町')],
  },
  {
    from: 'jr-yamashina',
    to: 'subway-yamashina',
    fromLine: null,
    toLine: null,
    walkMin: 5,
    walkMinBasis: 'estimate',
    elevator: true,
    elevatorRoute: '地下鐵 1 番出入口「JR 山科駅に連絡」有電梯和上下手扶梯；地下鐵月台中央的電梯到改札（改札無人，有對講機）。JR 側的走法查不到。',
    elevatorWalkMin: null,
    exitGates: true,
    note: '官方沒有分鐘，推估 4～6 分。',
    sources: [KOTSU(9937, '山科'), RAKU('山科')],
  },
];

const ids = new Set(TRANSFERS.flatMap((t) => [t.from, t.to]));
const mine = (t) => ids.has(t.from) && ids.has(t.to);
const order = ['fromLine', 'toLine', 'from', 'to', 'walkMin', 'walkMinBasis', 'elevator', 'elevatorRoute', 'elevatorWalkMin', 'exitGates', 'note', 'sources'];
const tidy = (t) => Object.fromEntries(order.filter((k) => k in t).map((k) => [k, t[k]]));

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const all = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const kept = all.filter((t) => !mine(t));
  const out = [...kept, ...TRANSFERS.map(tidy)];
  console.log(`大阪等原有 ${kept.length} 筆、京都 ${TRANSFERS.length} 筆`);
  if (!process.argv.includes('--dry-run')) fs.writeFileSync(FILE, JSON.stringify(out, null, 2) + '\n');
}
