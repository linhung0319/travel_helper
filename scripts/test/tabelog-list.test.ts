// scripts/chrome/tabelog-list.js 的純函式測試（瀏覽器程式，只抽出標記之間的那段）。執行：npm test
// 字樣取自 T9c 第 1 批看過的志摩市列表（2026-10-18）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../chrome/tabelog-list.js', import.meta.url), 'utf8');
const pick = (name: string) => {
  const body = src.match(new RegExp(`// <${name}>[^\\n]*\\n([\\s\\S]*?)// </${name}>`))?.[1];
  return new Function(`${body}\nreturn ${name};`)();
};
const parseCard = pick('parseCard');
const parseCount = pick('parseCount');

test('件數', () => {
  assert.deepEqual(parseCount('1～20 件を表示 ／ 全 549 件'), { from: 1, to: 20, total: 549 });
  assert.deepEqual(parseCount('1～9 件を表示 ／ 全 9 件'), { from: 1, to: 9, total: 9 });
  assert.deepEqual(parseCount('1,001～1,020 件を表示 ／ 全 1,268 件'), { from: 1001, to: 1020, total: 1268 });
  assert.equal(parseCount(null), null);
});

test('店卡：志摩観光ホテルのフレンチ', () => {
  const s = parseCard({
    href: 'https://tabelog.com/mie/A2403/A240303/24000053/',
    rank: '2',
    name: 'ラ・メール ザ クラシック',
    areaGenre: '志摩市 / フレンチ',
    score: '4.01',
    reviews: '552',
    dinner: '￥20,000～￥29,999',
    lunch: '￥10,000～￥14,999',
    holiday: '-',
    address: '三重県志摩市阿児町神明731 志摩観光ホテル ザ クラシック 1F',
    room: '個室有',
    pr: 'クラシカルな佇まいのレストランで華麗なる晩餐を。',
    status: '2 ラ・メール ザ クラシック',
  });
  assert.equal(s.id, '24000053');
  assert.equal(s.area, 'A2403-A240303');
  assert.equal(s.genre, 'フレンチ');
  assert.equal(s.areaText, '志摩市');
  assert.equal(s.score, 4.01);
  assert.equal(s.reviews, 552);
  assert.equal(s.holiday, null);
  assert.equal(s.address, '志摩市阿児町神明731 志摩観光ホテル ザ クラシック 1F');
  assert.equal(s.room, '個室有');
  assert.equal(s.status, null);
});

test('店卡：沒有分數、預算是「-」、多個類別、閉店', () => {
  const s = parseCard({
    href: '/mie/A2403/A240303/24014037/',
    name: '某店',
    areaGenre: '鵜方駅 450m / 居酒屋、海鮮',
    score: '-',
    reviews: '3',
    dinner: '-',
    lunch: '￥1,000～￥1,999',
    holiday: '火曜日',
    status: '某店 閉店',
  });
  assert.equal(s.score, null);
  assert.equal(s.dinner, null);
  assert.equal(s.lunch, '￥1,000～￥1,999');
  assert.equal(s.areaText, '鵜方駅 450m');
  assert.equal(s.genre, '居酒屋、海鮮');
  assert.equal(s.holiday, '火曜日');
  assert.equal(s.status, '閉店');
  assert.equal(s.rank, null);
});

const toLine = new Function(`${src.match(/\/\/ <toLine>[^\n]*\n([\s\S]*?)\/\/ <\/toLine>/)?.[1]}\nreturn toLine;`)();
const { parseLines, tabelogUrl } = await import('../lib/tabelog-list.mjs');

test('壓縮行 → parseLines 讀回（分段接起來、段落標記拿掉）', () => {
  const s = parseCard({
    href: '/mie/A2403/A240303/24006418/', name: '炭火焼うなぎ 東山物産', areaGenre: '志摩市 / うなぎ、弁当', score: '3.74', reviews: '931',
    dinner: '￥3,000～￥3,999', lunch: '￥2,000～￥2,999', holiday: '火曜日', address: '志摩市阿児町鵜方4032', room: '個室有 (2〜30人可)', pr: 'A|B',
  });
  const line = toLine(s);
  assert.equal(line, '24006418|炭火焼うなぎ 東山物産|うなぎ、弁当|3.74|931|火曜日|3000～3999|2000～2999|阿児町鵜方4032|個室有 (2〜30人可)||A2403-A240303|A｜B');
  const all = `#P|【個室あり】志摩市阿児町鵜方|1-1/1|5\n${line}\n#END\n`;
  // 900 字一段：在任意位置切開，接回去要一樣
  const raw = `[1/2]${all.slice(0, 40)}[2]${all.slice(40)}`;
  const r = parseLines(raw);
  assert.equal(r.complete, true);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.pages[0].total, 1);
  assert.equal(r.pages[0].skipped, 5);
  const shop = r.pages[0].shops[0];
  assert.equal(shop.score, 3.74);
  assert.equal(shop.reviews, 931);
  assert.equal(shop.status, null);
  assert.equal(shop.room, '個室有 (2〜30人可)');
  assert.equal(tabelogUrl(shop), 'https://tabelog.com/mie/A2403/A240303/24006418/');
});

test('parseLines：沒讀到 #END、件數不合 → complete false、warnings', () => {
  const r = parseLines('[1/2]#P|x|1-2/30|0\n1|a|b|3.1|20||||||||\n');
  assert.equal(r.complete, false);
  assert.equal(r.warnings.length, 1);
});
