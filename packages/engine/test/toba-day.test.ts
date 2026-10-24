// 完成條件：拿鳥羽一天的假行程（真的 data/）跑得出時間軸、空檔和警告
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planItinerary, validateItinerary } from '../src/index.ts';
import { realData } from './fixtures.ts';
import { TOBA_DATE, tobaDay } from './toba-day.ts';

const it = tobaDay();
const day = planItinerary(it, realData()).days.find((d) => d.date === TOBA_DATE);

test('鳥羽一天：行程格式合法', () => {
  assert.deepEqual(validateItinerary(it), []);
});

test('鳥羽一天：時間軸從戶田家出發、分組會合、回到戶田家', () => {
  assert.ok(day);
  assert.deepEqual(
    day.entries.map((e) => [e.kind, e.placeId]),
    [
      ['start', 'toba-todaya'],
      ['visit', 'toba-aquarium'],
      ['visit', 'toba-amiyaki-tenbinya'],
      ['meet', 'toba-ichibangai'],
      ['visit', 'toba-mizunuma-sazae'],
      ['lodging', 'toba-todaya'],
    ],
  );
  // 戶田家 → 水族館：全員走超過 15 分，沒有更快的車 → 計程車 4 台／大型 2 台
  assert.equal(day.entries[1].travel?.mode, 'taxi');
  assert.equal(day.entries[1].travel?.taxi?.cars, 4);
  // 午餐指定 12:00，提早到就等
  assert.equal(day.entries[2].start, '12:00');
  assert.equal(day.entries[2].meal, 'lunch');
  assert.deepEqual(day.entries[3].groups?.map((g) => g.name), ['長輩組', '爬坡組']);
  assert.equal(day.entries[3].start, '15:45');
});

test('鳥羽一天：沒有空檔（不再產生晚餐未排）', () => {
  assert.ok(day);
  assert.deepEqual(day.gaps.map((g) => [g.kind, g.label]), []);
});

test('鳥羽一天：警告（全員點心坐不下、計程車台數）', () => {
  assert.ok(day);
  const codes = day.warnings.map((w) => w.code);
  assert.ok(codes.includes('group-seats'));
  assert.ok(codes.includes('taxi'));
  assert.ok(day.stats.tiring); // 爬坡組去了城山公園（階梯多）
});
