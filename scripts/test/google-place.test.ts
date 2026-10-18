// scripts/chrome/google-place.js 的純函式測試（瀏覽器程式，只抽出標記之間的那段）。執行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../chrome/google-place.js', import.meta.url), 'utf8');
const body = src.match(/\/\/ <closedStatus>[^\n]*\n([\s\S]*?)\/\/ <\/closedStatus>/)?.[1];
const closedStatus = new Function(`${body}\nreturn closedStatus;`)() as (t: string) => string | null;

test('營業狀態：只看「概要」分頁之前的面板開頭（T9d 第 3 批實測）', () => {
  // ポンチーズ・ピザ：星數那行後面接「閉業」
  assert.equal(closedStatus('\n写真を表示\nPONCHI\'S PIZZA\n4.7\n(144)·￥2,000～3,000\n閉業\n概要\nメニュー\n'), 'permanently-closed');
  // はしもと：類別下一行是「臨時休業」
  assert.equal(closedStatus('\nはしもと\n4.4\n(105)·￥2,000～3,000\nオイスターバー　レストラン\n臨時休業\n概要\nメニュー\nクチコミ\n'), 'temporarily-closed');
  // 的矢かきテラス：店家貼文「臨時休業のご案内」在概要之後 → 不算
  assert.equal(closedStatus('\n的矢かきテラス\n4.3\n(765)\nオイスターバー\n概要\nクチコミ\n臨時休業のご案内です。6月3日(水)は台風接近に伴い臨時休業\n'), null);
  // 鮨暁：訪問者提供の最新情報「2022年9月29日臨時休業でした」→ 不算
  assert.equal(closedStatus('\n鮨暁\n4.5\n(233)\n寿司店·\n概要\n訪問者提供の最新情報\n2022年9月29日臨時休業でした\n'), null);
});
