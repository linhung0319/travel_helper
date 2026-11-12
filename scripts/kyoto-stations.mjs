#!/usr/bin/env node
// 京都、琵琶湖的車站（T87）：寫進 data/stations.json（例外允許，同 T28 的大阪）。
//   - 名稱、區域、業者、線、近鐵 5 日券、互相轉乘：寫在下面的 STATIONS。
//   - 座標：ja.wikipedia 各車站條目的座標（--coords，{ id: { coords: [經度, 緯度], url, title } }）。多業者共用一篇條目的站
//     （京都、丹波橋、二条、東福寺、山科、石山）取對應業者那一欄的座標。overpass-api.de 的 robots.txt 禁止 /api/，不能用。
//   - 地址、站號、站員、置物櫃、無障礙、官網：研究筆記整理的 JSON（--facts，見 data/raw/access/kyoto.md §6）。
// 重跑會先拿掉 STATIONS 裡的 ID 再加回去；其他區域的車站不動。
//
// 用法：node scripts/kyoto-stations.mjs --coords <座標.json> --facts <facts.json> [--retrieved YYYY-MM-DD] [--dry-run]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'data/stations.json');
const KRP = { type: 'official', url: 'https://www.kintetsu.co.jp/foreign/english/ticket/krp_5day.html', note: 'KINTETSU RAIL PASS 5day：近鐵全線可搭（特急另外買特急券），不含 JR、地下鐵、京阪、阪急、嵐電' };

// [id, 日文名, 中文名（同名的標業者）, 區域, operator, lines, （舊欄位，不用）, transfers]
// operator：近鐵 kintetsu、JR jr、其他 other（lines 前面寫業者）。passCovered 只有近鐵是 true。
export const STATIONS = [
  // 近鐵
  ['kyoto', '京都', '京都（近鐵）', 'kyoto', 'kintetsu', ['京都線'], null, ['jr-kyoto', 'subway-kyoto']],
  ['toji', '東寺', '東寺', 'kyoto', 'kintetsu', ['京都線'], null, []],
  ['takeda', '竹田', '竹田', 'kyoto', 'kintetsu', ['京都線', '京都市営地下鉄 烏丸線'], null, []],
  ['kintetsu-tambabashi', '近鉄丹波橋', '近鐵丹波橋', 'kyoto', 'kintetsu', ['京都線'], null, ['keihan-tambabashi']],
  ['momoyamagoryo-mae', '桃山御陵前', '桃山御陵前', 'kyoto', 'kintetsu', ['京都線'], null, []],
  ['ogura', '小倉', '小倉（近鐵）', 'kyoto', 'kintetsu', ['京都線'], null, []],
  ['yamato-saidaiji', '大和西大寺', '大和西大寺', 'kyoto', 'kintetsu', ['京都線', '奈良線', '橿原線'], null, []],
  ['yamato-yagi', '大和八木', '大和八木', 'kyoto', 'kintetsu', ['大阪線', '橿原線'], null, []],
  // JR（京都市內）
  ['jr-kyoto', '京都', '京都（JR）', 'kyoto', 'jr', ['JR京都線', '琵琶湖線', '湖西線', '嵯峨野線', '奈良線'], null, ['kyoto', 'subway-kyoto']],
  ['jr-umekoji-kyotonishi', '梅小路京都西', '梅小路京都西', 'kyoto', 'jr', ['嵯峨野線'], null, []],
  ['jr-nijo', '二条', '二条（JR）', 'kyoto', 'jr', ['嵯峨野線'], null, ['subway-nijo']],
  ['jr-saga-arashiyama', '嵯峨嵐山', '嵯峨嵐山', 'kyoto', 'jr', ['嵯峨野線'], null, []],
  ['jr-tofukuji', '東福寺', '東福寺（JR）', 'kyoto', 'jr', ['奈良線'], null, ['keihan-tofukuji']],
  ['jr-inari', '稲荷', '稻荷', 'kyoto', 'jr', ['奈良線'], null, []],
  ['jr-uji', '宇治', '宇治（JR）', 'kyoto', 'jr', ['奈良線'], null, []],
  ['jr-yamashina', '山科', '山科（JR）', 'kyoto', 'jr', ['琵琶湖線', '湖西線'], null, ['subway-yamashina']],
  // 阪急
  ['hankyu-osaka-umeda', '大阪梅田', '大阪梅田（阪急）', 'osaka', 'other', ['阪急 京都線', '阪急 神戸線', '阪急 宝塚線'], null, []],
  ['hankyu-katsura', '桂', '桂', 'kyoto', 'other', ['阪急 京都線', '阪急 嵐山線'], null, []],
  ['hankyu-karasuma', '烏丸', '烏丸', 'kyoto', 'other', ['阪急 京都線'], null, ['subway-shijo']],
  ['hankyu-kyoto-kawaramachi', '京都河原町', '京都河原町', 'kyoto', 'other', ['阪急 京都線'], null, ['keihan-gion-shijo']],
  ['hankyu-arashiyama', '嵐山', '嵐山（阪急）', 'kyoto', 'other', ['阪急 嵐山線'], null, []],
  // 京阪
  ['keihan-yodoyabashi', '淀屋橋', '淀屋橋（京阪）', 'osaka', 'other', ['京阪 本線'], null, []],
  ['keihan-chushojima', '中書島', '中書島', 'kyoto', 'other', ['京阪 本線', '京阪 宇治線'], null, []],
  ['keihan-tambabashi', '丹波橋', '丹波橋（京阪）', 'kyoto', 'other', ['京阪 本線'], null, ['kintetsu-tambabashi']],
  ['keihan-fushimi-inari', '伏見稲荷', '伏見稻荷（京阪）', 'kyoto', 'other', ['京阪 本線'], null, []],
  ['keihan-tofukuji', '東福寺', '東福寺（京阪）', 'kyoto', 'other', ['京阪 本線'], null, ['jr-tofukuji']],
  ['keihan-shichijo', '七条', '七条', 'kyoto', 'other', ['京阪 本線'], null, []],
  ['keihan-kiyomizu-gojo', '清水五条', '清水五条', 'kyoto', 'other', ['京阪 本線'], null, []],
  ['keihan-gion-shijo', '祇園四条', '祇園四条', 'kyoto', 'other', ['京阪 本線'], null, ['hankyu-kyoto-kawaramachi']],
  ['keihan-sanjo', '三条', '三条（京阪）', 'kyoto', 'other', ['京阪 本線'], null, ['subway-sanjo-keihan']],
  ['keihan-uji', '宇治', '宇治（京阪）', 'kyoto', 'other', ['京阪 宇治線'], null, []],
  // 嵐電
  ['randen-shijo-omiya', '四条大宮', '四条大宮', 'kyoto', 'other', ['嵐電 嵐山本線'], null, []],
  ['randen-tenjingawa', '嵐電天神川', '嵐電天神川', 'kyoto', 'other', ['嵐電 嵐山本線'], null, ['subway-uzumasa-tenjingawa']],
  ['randen-uzumasa-koryuji', '太秦広隆寺', '太秦廣隆寺', 'kyoto', 'other', ['嵐電 嵐山本線'], null, []],
  ['randen-katabiranotsuji', '帷子ノ辻', '帷子之辻', 'kyoto', 'other', ['嵐電 嵐山本線', '嵐電 北野線'], null, []],
  ['randen-arashiyama', '嵐山', '嵐山（嵐電）', 'kyoto', 'other', ['嵐電 嵐山本線'], null, []],
  ['randen-kitano-hakubaicho', '北野白梅町', '北野白梅町', 'kyoto', 'other', ['嵐電 北野線'], null, []],
  // 京都市營地下鐵
  ['subway-kyoto', '京都', '京都（地下鐵）', 'kyoto', 'other', ['京都市営地下鉄 烏丸線'], null, ['kyoto', 'jr-kyoto']],
  ['subway-shijo', '四条', '四条（地下鐵）', 'kyoto', 'other', ['京都市営地下鉄 烏丸線'], null, ['hankyu-karasuma']],
  ['subway-karasuma-oike', '烏丸御池', '烏丸御池', 'kyoto', 'other', ['京都市営地下鉄 烏丸線', '京都市営地下鉄 東西線'], null, []],
  ['subway-imadegawa', '今出川', '今出川', 'kyoto', 'other', ['京都市営地下鉄 烏丸線'], null, []],
  ['subway-uzumasa-tenjingawa', '太秦天神川', '太秦天神川', 'kyoto', 'other', ['京都市営地下鉄 東西線'], null, ['randen-tenjingawa']],
  ['subway-nijo', '二条', '二条（地下鐵）', 'kyoto', 'other', ['京都市営地下鉄 東西線'], null, ['jr-nijo']],
  ['subway-nijojo-mae', '二条城前', '二条城前', 'kyoto', 'other', ['京都市営地下鉄 東西線'], null, []],
  ['subway-kyoto-shiyakusho-mae', '京都市役所前', '京都市役所前', 'kyoto', 'other', ['京都市営地下鉄 東西線', '京阪 京津線（直通）'], null, []],
  ['subway-sanjo-keihan', '三条京阪', '三条京阪', 'kyoto', 'other', ['京都市営地下鉄 東西線', '京阪 京津線（直通）'], null, ['keihan-sanjo']],
  ['subway-higashiyama', '東山', '東山', 'kyoto', 'other', ['京都市営地下鉄 東西線', '京阪 京津線（直通）'], null, []],
  ['subway-keage', '蹴上', '蹴上', 'kyoto', 'other', ['京都市営地下鉄 東西線', '京阪 京津線（直通）'], null, []],
  ['subway-misasagi', '御陵', '御陵', 'kyoto', 'other', ['京都市営地下鉄 東西線', '京阪 京津線'], null, []],
  ['subway-yamashina', '山科', '山科（地下鐵）', 'kyoto', 'other', ['京都市営地下鉄 東西線'], null, ['jr-yamashina']],
  // 琵琶湖：JR
  ['jr-otsu', '大津', '大津', 'biwako', 'jr', ['琵琶湖線'], null, []],
  ['jr-ishiyama', '石山', '石山（JR）', 'biwako', 'jr', ['琵琶湖線'], null, ['keihan-ishiyama']],
  ['jr-kusatsu', '草津', '草津', 'biwako', 'jr', ['琵琶湖線', '草津線'], null, []],
  ['jr-moriyama', '守山', '守山', 'biwako', 'jr', ['琵琶湖線'], null, []],
  ['jr-omi-hachiman', '近江八幡', '近江八幡', 'biwako', 'jr', ['琵琶湖線'], null, []],
  ['jr-hikone', '彦根', '彥根', 'biwako', 'jr', ['琵琶湖線'], null, []],
  ['jr-otsukyo', '大津京', '大津京', 'biwako', 'jr', ['湖西線'], null, []],
  ['jr-hieizan-sakamoto', '比叡山坂本', '比叡山坂本', 'biwako', 'jr', ['湖西線'], null, []],
  ['jr-ogotoonsen', 'おごと温泉', '雄琴溫泉', 'biwako', 'jr', ['湖西線'], null, []],
  ['jr-katata', '堅田', '堅田', 'biwako', 'jr', ['湖西線'], null, []],
  ['jr-shiga', '志賀', '志賀', 'biwako', 'jr', ['湖西線'], null, []],
  ['jr-omi-takashima', '近江高島', '近江高島', 'biwako', 'jr', ['湖西線'], null, []],
  // 琵琶湖：京阪大津線、坂本纜車
  ['keihan-biwako-hamaotsu', 'びわ湖浜大津', '琵琶湖濱大津', 'biwako', 'other', ['京阪 石山坂本線', '京阪 京津線'], null, []],
  ['keihan-miidera', '三井寺', '三井寺（京阪）', 'biwako', 'other', ['京阪 石山坂本線'], null, []],
  ['keihan-omi-jingu-mae', '近江神宮前', '近江神宮前', 'biwako', 'other', ['京阪 石山坂本線'], null, []],
  ['keihan-sakamoto-hieizanguchi', '坂本比叡山口', '坂本比叡山口', 'biwako', 'other', ['京阪 石山坂本線'], null, []],
  ['keihan-ishiyamadera', '石山寺', '石山寺（京阪）', 'biwako', 'other', ['京阪 石山坂本線'], null, []],
  ['keihan-ishiyama', '京阪石山', '京阪石山', 'biwako', 'other', ['京阪 石山坂本線'], null, ['jr-ishiyama']],
  ['sakamoto-cable-sakamoto', 'ケーブル坂本', '坂本纜車 坂本站', 'biwako', 'other', ['比叡山坂本ケーブル'], null, []],
  ['sakamoto-cable-enryakuji', 'ケーブル延暦寺', '坂本纜車 延曆寺站', 'biwako', 'other', ['比叡山坂本ケーブル'], null, []],
];

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
}

export function build({ coords, facts, retrieved }) {
  const factById = new Map(facts.map((f) => [f.id, f]));
  const problems = [];
  const out = STATIONS.map(([id, ja, zh, area, operator, lines, , transfers]) => {
    const c = coords[id];
    if (!c?.coords) problems.push(`${id}：沒有座標`);
    const f = factById.get(id) ?? {};
    if (!factById.has(id)) problems.push(`${id}：facts 裡沒有這一站`);
    if (f.ja && f.ja.replace(/（.*）|\(.*\)/g, '') !== ja) problems.push(`${id}：facts 的站名「${f.ja}」和「${ja}」不同`);
    return {
      id,
      type: 'station',
      name: { ja, kana: f.kana ?? null, zh, en: f.en ?? null },
      area,
      coords: c?.coords ?? null,
      coordsSource: 'wikipedia',
      address: f.address ?? null,
      links: { official: f.official ?? null },
      operator,
      stationNumber: f.stationNumber ?? null,
      lines,
      passCovered: operator === 'kintetsu',
      staffed: f.staffed ?? null,
      transfers,
      coinLockers: f.coinLockers ?? null,
      accessibility: f.accessibility ?? null,
      sources: [
        ...(f.sources ?? []),
        { type: 'wikipedia', url: c?.url, retrieved, note: '座標（條目「' + (c?.title ?? '') + '」）' },
        { ...KRP, retrieved },
      ],
      verified: false,
      ...(area === 'kyoto' && ['yamato-saidaiji', 'yamato-yagi'].includes(id)
        ? { extra: { via: true, note: '換車用的經由站（在奈良縣），不是京都的景點區域；只為了近鐵京都 ↔ 伊勢志摩（大和八木）、京都 ↔ 大阪（大和西大寺）的換車放進來，area 掛在 kyoto。validate 對 extra.via 的車站放寬座標範圍' } }
        : {}),
    };
  });
  return { out, problems };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const coords = JSON.parse(fs.readFileSync(arg('--coords'), 'utf8'));
  const facts = JSON.parse(fs.readFileSync(arg('--facts'), 'utf8'));
  const retrieved = arg('--retrieved') ?? new Date().toISOString().slice(0, 10);
  const { out, problems } = build({ coords, facts, retrieved });
  const ids = new Set(out.map((s) => s.id));
  const all = JSON.parse(fs.readFileSync(FILE, 'utf8')).filter((s) => !ids.has(s.id));
  for (const p of problems) console.log('⚠️ ' + p);
  console.log(`其他區域 ${all.length} 站、京都・琵琶湖 ${out.length} 站`);
  if (!process.argv.includes('--dry-run')) fs.writeFileSync(FILE, JSON.stringify([...all, ...out], null, 2) + '\n');
}
