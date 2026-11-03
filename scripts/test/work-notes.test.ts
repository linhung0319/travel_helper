// scripts/lib/work-notes.mjs：給人看的欄位不能夾著整理資料時的筆記（T44a）。
// 單元測試看規則抓不抓得到、隱藏的欄位不檢查；最後一個用 validate 確認會報錯。

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, writeTestData, writeTestSchemas, testSpot } from './helpers/test-area.ts';
// @ts-expect-error 沒有型別宣告的 .mjs
import { findWorkNotes, shownStrings } from '../lib/work-notes.mjs';

const rulesOf = (rec: unknown) => (findWorkNotes(rec) as { rule: string; path: string }[]).map((h) => `${h.path}:${h.rule}`);

describe('findWorkNotes', () => {
  test('抓得到任務卡舉的例子', () => {
    const rec = {
      id: 'x',
      fares: { senior: '沒有長輩優惠（疑為舊資訊，見 conflicts）' },
      accessibility: { note: '建議中途休息；4travel 無障礙分 3.53。' },
      extra: { stayMinutesNote: 'jeepe 說看一圈約 2 小時；4travel 多人說半天不夠' },
    };
    assert.deepEqual(rulesOf(rec), ['fares.senior:field-ref', 'accessibility.note:site-subscore', 'extra.stayMinutesNote:site-says']);
  });

  test('工具、檔名、任務 ID', () => {
    const rec = {
      id: 'x',
      nearestStation: { note: '官網 3 分；OSRM 4 分' },
      notes: '兩站都不在 stations.json',
      assessment: { rationale: { groupFit: '15 人能在同一處訂到 → 4（T8g 規則）' } },
    };
    assert.deepEqual(rulesOf(rec), ['nearestStation.note:tool', 'notes:file-name', 'assessment.rationale.groupFit:task-id']);
  });

  test('給人看的寫法不算：Google、食べログ 有評分分頁；機場的 T1、T2 是航廈', () => {
    const rec = {
      id: 'x',
      summary: { cons: ['Google 低分說隔音差', '週日、週一休（說法不一）'], text: '走路直通 T1 和 T2' },
      nearestStation: { note: '官網 3 分；路線估算 4 分' },
    };
    assert.deepEqual(rulesOf(rec), []);
  });

  test('不給人看的欄位不檢查：sources、extra.conflicts、白名單外的 extra、評分的依據', () => {
    const rec = {
      id: 'x',
      sources: [{ note: 'jeepe 說約 2 小時（OSRM）' }],
      extra: { conflicts: ['見 conflicts'], coordsNote: 'OSRM 吸附', showTimes: '10:00、11:30' },
      summary: { basedOn: ['https://www.jeepe.jp/x.md'] },
      stationNumber: 'T20',
    };
    assert.deepEqual(rulesOf(rec), []);
    assert.deepEqual(
      [...shownStrings(rec)].map(([p]: [string]) => p),
      ['extra.showTimes'],
    );
  });
});

test('validate：給人看的欄位有整理時的筆記就失敗', () => {
  const schemaDir = writeTestSchemas();
  const dir = writeTestData({ spots: [testSpot('test-area-note', { closedNote: '週日（各來源說法不同，見 conflicts）' })] });
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/validate.mjs'), '--data', dir, '--schema', schemaDir], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /\[test-area-note\] closedNote 有整理時的筆記/);
});
