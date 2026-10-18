// scripts/chrome/google-reviews.js 的純函式測試（瀏覽器程式，只抽出標記之間的那段）。執行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../chrome/google-reviews.js', import.meta.url), 'utf8');
const body = src.match(/\/\/ <starsAscending>[^\n]*\n([\s\S]*?)\/\/ <\/starsAscending>/)?.[1];
const starsAscending = new Function(`${body}\nreturn starsAscending;`)() as (labels: (string | null)[]) => boolean;

test('低分順的檢查：星數由低到高才算有套用', () => {
  assert.equal(starsAscending(['1 つ星', '1 つ星', '2 つ星', '3 つ星']), true);
  // T8e 第 3 批 柚 クッチーナ：點了「評価の低い順」卻拿到關聯度順
  assert.equal(starsAscending(['4 つ星', '5 つ星', '5 つ星', '4 つ星']), false);
  // 沒有星數的（抓不到）略過，不當成錯
  assert.equal(starsAscending(['2 つ星', null, '3 つ星']), true);
  assert.equal(starsAscending([]), true);
});

const body2 = src.match(/\/\/ <reviewBody>[^\n]*\n([\s\S]*?)\/\/ <\/reviewBody>/)?.[1];
type El = { textContent: string; previousElementSibling: { textContent: string } | null };
const reviewBody = new Function(`${body2}\nreturn reviewBody;`)() as (els: El[]) => El | null;

test('評論內文：跳過店家回覆（T8e 第 6 批 日章館）', () => {
  const own: El = { textContent: '料理が美味しかった', previousElementSibling: null };
  const reply: El = { textContent: '口コミをいただき…', previousElementSibling: { textContent: ' オーナーからの返信 1 週間前' } };
  assert.equal(reviewBody([own, reply]), own);
  // 沒有內文、只有店家回覆的評論 → null（不要把回覆當成評論）
  assert.equal(reviewBody([reply]), null);
  assert.equal(reviewBody([]), null);
});
