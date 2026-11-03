// scripts/validate.mjs 的區域不寫死（T24）：區域 ID、路徑、座標範圍都從 areas.json 讀。
// 用假的新區域 test-area 確認不用改程式就能驗證。

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, TEST_COORDS, writeTestData, writeTestSchemas, testSpot, testArea } from './helpers/test-area.ts';
// @ts-expect-error 沒有型別宣告的 .mjs
import { expandBbox, envelope } from '../validate.mjs';
// @ts-expect-error 沒有型別宣告的 .mjs
import { relaxAreaId } from '../lib/schemas.mjs';

const schemaDir = writeTestSchemas();

function validate(dataDir: string) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/validate.mjs'), '--data', dataDir, '--schema', schemaDir], {
    encoding: 'utf8',
  });
  return { ok: r.status === 0, out: r.stdout + r.stderr };
}

describe('validate：新的區域（test-area）', () => {
  test('只有 test-area 的資料可以通過', () => {
    const r = validate(writeTestData());
    assert.ok(r.ok, r.out);
    assert.match(r.out, /區域 1 個/);
  });

  test('座標用該區域的 bbox 檢查：test-area 在大阪，不會被當成超出伊勢志摩', () => {
    const r = validate(writeTestData());
    assert.doesNotMatch(r.out, /超出|不在.*範圍內/);
  });

  test('離 bbox 太遠是錯誤，稍微超出只警告', () => {
    const far = validate(writeTestData({ spots: [testSpot('test-area-far', { coords: [136.0, 34.69] })] }));
    assert.ok(!far.ok);
    assert.match(far.out, /test-area-far\] 座標 .* 不在區域「test-area」的範圍內/);

    const near = validate(writeTestData({ spots: [testSpot('test-area-near', { coords: [135.6, 34.69] })] }));
    assert.ok(near.ok, near.out);
    assert.match(near.out, /test-area-near\] 座標不在區域「test-area」的大致範圍內/);
  });

  test('經緯度寫反會提示', () => {
    const r = validate(writeTestData({ spots: [testSpot('test-area-swap', { coords: [34.69, 135.5] })] }));
    assert.match(r.out, /經緯度可能寫反了/);
  });

  test('areas/ 底下的目錄不在 areas.json：錯誤', () => {
    const dir = writeTestData();
    fs.mkdirSync(path.join(dir, 'areas/osaka'));
    fs.writeFileSync(path.join(dir, 'areas/osaka/spots.json'), '[]');
    const r = validate(dir);
    assert.ok(!r.ok);
    assert.match(r.out, /區域「osaka」不在 areas.json/);
  });

  test('raw/<area>/candidates 也照 areas.json', () => {
    const dir = writeTestData({ extraFiles: { 'raw/test-area/candidates/spots.json': [] } });
    assert.ok(validate(dir).ok);
    const bad = writeTestData({ extraFiles: { 'raw/nowhere/candidates/spots.json': [] } });
    assert.match(validate(bad).out, /區域「nowhere」不在 areas.json/);
  });

  test('資料點的 area 不在 areas.json：錯誤', () => {
    const r = validate(writeTestData({ spots: [testSpot('test-area-x', { area: 'nowhere' })] }));
    assert.ok(!r.ok);
    assert.match(r.out, /區域「nowhere」不在 areas.json/);
  });

  test('ID 不能用 user- 開頭（保留給網站上自己加的點）', () => {
    const r = validate(writeTestData({ spots: [testSpot('user-abc')] }));
    assert.match(r.out, /user-abc\] ID 不能用「user-」開頭/);
  });
});

describe('validate：區域的介紹（intro，T40）', () => {
  const spot = (id: string, over: Record<string, unknown> = {}) => testSpot(id, over);
  const bTier = (id: string) => {
    const s = testSpot(id) as Record<string, any>;
    return { ...s, tier: 'B', assessment: { ...s.assessment, scores: { ...s.assessment.scores, recommend: 3 } } };
  };
  const intro = (over: Record<string, unknown> = {}) => ({
    summary: '測試用的區域，一句特色寫在這裡，大概三十個字左右就夠了。',
    transport: '走路就到。',
    highlights: ['test-area-a', 'test-area-b', 'test-area-c'],
    february: [{ text: '2 月照常', points: ['test-area-a'] }],
    basedOn: ['test-area-a'],
    ...over,
  });
  const regionIntro = (over: Record<string, unknown> = {}) => ({
    summary: '子地區的特色',
    highlights: ['test-area-a'],
    febNote: null,
    basedOn: ['test-area-a'],
    ...over,
  });
  const run = (areaOver: Record<string, unknown>, spots = [spot('test-area-a'), spot('test-area-b'), spot('test-area-c')]) => {
    const area = { ...testArea(), ...areaOver } as Record<string, any>;
    return validate(writeTestData({ spots, extraFiles: { 'areas.json': [area] } }));
  };
  const regions = (ri: unknown) => [{ ...testArea().regions[0], intro: ri }];

  test('正確的介紹可以通過，沒有警告', () => {
    const r = run({ intro: intro(), regions: regions(regionIntro()) });
    assert.ok(r.ok, r.out);
    assert.match(r.out, /警告 0/);
  });

  test('沒有 intro：警告', () => {
    const r = run({});
    assert.ok(r.ok, r.out);
    assert.match(r.out, /\[test-area\] 沒有 intro/);
    assert.match(r.out, /\[test-area\/test-region\] 沒有 intro/);
  });

  test('代表的點不存在、不是 S/A 級、屬於別區：錯誤', () => {
    const r = run(
      { intro: intro({ highlights: ['test-area-a', 'test-area-b', 'nowhere'] }), regions: regions(regionIntro()) },
      [spot('test-area-a'), bTier('test-area-b'), spot('test-area-c')],
    );
    assert.ok(!r.ok);
    assert.match(r.out, /intro\.highlights 引用的「nowhere」不存在/);
    assert.match(r.out, /「test-area-b」是 B 級/);

    const other = run(
      { intro: intro(), regions: regions(regionIntro()) },
      [spot('test-area-a'), spot('test-area-b', { area: 'ise', region: 'ise-geku' }), spot('test-area-c')],
    );
    assert.match(other.out, /「test-area-b」不屬於這一區/);
  });

  test('這區有 S/A 級餐廳時，代表的點至少要有 1 間餐廳', () => {
    const real = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/areas/ise/restaurants.json'), 'utf8')).find(
      (x: Record<string, unknown>) => x.tier === 'A' || x.tier === 'S',
    );
    const rest = { ...real, id: 'test-area-r', area: 'test-area', region: 'test-region', coords: [135.502, 34.692], access: [], nearestStation: null };
    delete rest.anchors;
    const area = { ...testArea(), intro: intro(), regions: regions(regionIntro()) };
    const dir = writeTestData({
      spots: [spot('test-area-a'), spot('test-area-b'), spot('test-area-c')],
      extraFiles: { 'areas.json': [area], 'areas/test-area/restaurants.json': [rest] },
    });
    const r = validate(dir);
    assert.match(r.out, /intro\.highlights 至少要有 1 間餐廳/);
  });

  test('子地區的代表點要在這個子地區；basedOn、february 的點要存在', () => {
    const r = run(
      {
        intro: intro({ basedOn: ['gone-1'], february: [{ text: 'x', points: ['gone-2'] }] }),
        regions: [
          { ...testArea().regions[0], intro: regionIntro({ highlights: ['test-area-c'], basedOn: ['gone-3'] }) },
          { id: 'test-region-2', name: { ja: 'テスト2', zh: '測試2' }, center: TEST_COORDS, intro: regionIntro() },
        ],
      },
      [spot('test-area-a', { region: 'test-region-2' }), spot('test-area-b'), spot('test-area-c')],
    );
    assert.ok(!r.ok);
    assert.match(r.out, /intro\.basedOn 引用的「gone-1」不存在/);
    assert.match(r.out, /february\[0\]\.points 引用的「gone-2」不存在/);
    assert.match(r.out, /\[test-area\/test-region\] intro\.basedOn 引用的「gone-3」不存在/);
    assert.doesNotMatch(r.out, /「test-area-c」不屬於這個子地區/);
    assert.doesNotMatch(r.out, /test-region-2\] intro\.highlights/);

    const wrong = run(
      {
        intro: intro(),
        regions: [
          { ...testArea().regions[0], intro: regionIntro({ highlights: ['test-area-a'] }) },
          { id: 'test-region-2', name: { ja: 'テスト2', zh: '測試2' }, center: TEST_COORDS, intro: regionIntro({ highlights: [] }) },
        ],
      },
      [spot('test-area-a', { region: 'test-region-2' }), spot('test-area-b'), spot('test-area-c')],
    );
    assert.ok(!wrong.ok);
    assert.match(wrong.out, /\[test-area\/test-region\] intro\.highlights 的「test-area-a」不屬於這個子地區/);
    assert.match(wrong.out, /\[test-area\/test-region-2\] intro\.highlights 是空的/);
  });

  test('schema：沒有 basedOn 也沒有 sources、二月注意沒有根據：錯誤', () => {
    const { basedOn: _b, ...noBasis } = intro();
    const r = run({ intro: { ...noBasis, february: [{ text: '沒有根據' }] }, regions: regions(regionIntro()) });
    assert.ok(!r.ok);
  });
});

describe('validate：data/redirects.json', () => {
  const date = '2026-10-22';
  test('正確的轉址可以通過', () => {
    const dir = writeTestData({ extraFiles: { 'redirects.json': [{ from: 'test-area-old', to: 'test-area-spot', date, reason: '重複' }] } });
    const r = validate(dir);
    assert.ok(r.ok, r.out);
  });

  test('舊 ID 還在資料裡、目的地不存在、連鎖、重複：都是錯誤', () => {
    const dir = writeTestData({
      extraFiles: {
        'redirects.json': [
          { from: 'test-area-spot', to: 'test-station', date, reason: '舊 ID 還在' },
          { from: 'a-old', to: 'nowhere', date, reason: '目的地不存在' },
          { from: 'b-old', to: 'a-old', date, reason: '連鎖' },
          { from: 'b-old', to: 'test-station', date, reason: '重複' },
        ],
      },
    });
    const r = validate(dir);
    assert.ok(!r.ok);
    assert.match(r.out, /\[test-area-spot\] 已經轉址/);
    assert.match(r.out, /\[a-old\] 轉址的目的地「nowhere」不存在/);
    assert.match(r.out, /\[b-old\] 轉到「a-old」，但「a-old」本身也轉址了/);
    assert.match(r.out, /\[b-old\] 轉址重複/);
  });
});

describe('validate 的工具函式', () => {
  test('expandBbox、envelope', () => {
    assert.deepEqual(expandBbox([1, 2, 3, 4], 0.5), [0.5, 1.5, 3.5, 4.5]);
    assert.deepEqual(envelope([[1, 2, 3, 4], [0, 3, 5, 3.5]]), [0, 2, 5, 4]);
  });

  test('relaxAreaId：areaId 的 enum 換成一般的 ID 格式，其他不動', () => {
    const s = { $defs: { areaId: { enum: ['ise'] }, id: { type: 'string' } } };
    const r = relaxAreaId(s);
    assert.equal(r.$defs.areaId.$ref, '#/$defs/id');
    assert.equal(r.$defs.id, s.$defs.id);
    assert.deepEqual(s.$defs.areaId.enum, ['ise'], '不改原本的物件');
    const already = { $defs: { areaId: { $ref: '#/$defs/id' } } };
    assert.equal(relaxAreaId(already), already);
  });

  test('真的資料照樣通過（現有五個區域）', () => {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/validate.mjs')], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout);
  });
});
