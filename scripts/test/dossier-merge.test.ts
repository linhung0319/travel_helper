// scripts/lib/dossier-merge.mjs 的測試。執行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNote, mergeDossier, findSourceList } from '../lib/dossier-merge.mjs';

const NOTE = [
  '- 來源：',
  '  - [tabelog] 食べログ口コミ（最新 20 則；2026-10-19 讀）https://tabelog.com/x/dtlrvwlst/',
  '- [推薦] 好吃',
  '- 待確認：週二營業',
  '  - [google-maps] Google 評論（評価の低い順 10 則；2026-10-19 讀）https://maps.google.com/?cid=1',
  '- [缺點] 很慢',
  '- 資料量：心得 3 則（食べログ口コミ 2、Google 評論 1）',
].join('\n');

const DOSSIER = [
  '# x 店',
  '',
  '- 讀文日期：2026-10-19',
  '- 來源：',
  '  1. [official] 官網 https://example.jp/',
  '  2. [tourism] 觀光協會 https://example.jp/k',
  '',
  '## 重點',
  '- [推薦] 官網寫的（1）',
  '',
  '## 資料量',
  '- 心得 0 篇（只有官網）；部落格心得：未查（深入調查）',
  '',
].join('\r\n');

test('notes 的重點引用前面最近的來源', () => {
  const n = parseNote(NOTE);
  assert.equal(n.sources.length, 2);
  assert.deepEqual(n.points.map((p) => p.src), [1, 2]);
  assert.equal(n.pending[0].src, 1);
  assert.match(n.amount, /^心得 3 則/);
});

test('併進 dossier：新來源接在編號後面、各自引用、保留 CRLF', () => {
  const out = mergeDossier(DOSSIER, parseNote(NOTE));
  assert.ok(out.includes('\r\n'));
  const lines = out.split('\r\n');
  assert.ok(lines.includes('  3. [tabelog] 食べログ口コミ（最新 20 則；2026-10-19 讀）https://tabelog.com/x/dtlrvwlst/'));
  assert.ok(lines.includes('- [推薦] 好吃（3）'));
  assert.ok(lines.includes('- [缺點] 很慢（4）'));
  assert.ok(lines.includes('- 待確認：週二營業（3）'));
  assert.ok(lines.includes('## 衝突、待確認'));
  assert.ok(lines.includes('- 心得 3 則（食べログ口コミ 2、Google 評論 1）；部落格心得：未查（深入調查）'));
  assert.ok(!lines.some((l) => l.startsWith('- 心得 0 篇')));
  assert.equal(mergeDossier(out, parseNote(NOTE)), null, '第二次跳過');
});

test('來源清單的寫法：## 來源、沒縮排、1) 都可以；續行不算結束', () => {
  const a = ['## 來源', '', '1. 官網', '   （補充說明）', '2) 觀光協會', '', '## 重點'];
  assert.deepEqual(findSourceList(a), { last: 4, maxN: 2 });
  assert.deepEqual(findSourceList(['- 來源：', '  （官網讀取失敗）', '  1. 官網', '## 重點']), { last: 2, maxN: 1 });
  assert.throws(() => findSourceList(['# x', '## 重點']), /找不到來源清單/);
  assert.throws(() => parseNote('- [推薦] 沒有來源'), /來源行/);
});
