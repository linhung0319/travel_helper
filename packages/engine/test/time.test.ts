import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, busDayType, dateRange, dayOfWeek, DEFAULT_CONFIG, fromMinutes, isDate, isTime, kintetsuDayType, resolveConfig, toMinutes } from '../src/index.ts';

test('時間字串和分鐘互換，過了午夜寫 25:00', () => {
  assert.equal(toMinutes('09:30'), 570);
  assert.equal(toMinutes('25:00'), 1500);
  assert.equal(fromMinutes(570), '09:30');
  assert.equal(fromMinutes(1500), '25:00');
  assert.ok(isTime('9:05') && !isTime('09:60') && !isTime('0930'));
  assert.throws(() => toMinutes('9點'));
});

test('星期幾不經過 Date：2027-02-02 是週二、02-13 是週六', () => {
  assert.equal(dayOfWeek('2027-02-02'), 2);
  assert.equal(dayOfWeek('2027-02-13'), 6);
  assert.equal(dayOfWeek('2027-02-07'), 0);
  assert.equal(dayOfWeek('2024-02-29'), 4);
});

test('日期運算與檢查', () => {
  assert.equal(addDays('2027-01-31', 1), '2027-02-01');
  assert.equal(addDays('2027-03-01', -1), '2027-02-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(dateRange('2027-02-02', '2027-02-13').length, 12);
  assert.ok(isDate('2027-02-28') && !isDate('2027-02-29') && !isDate('2027-2-1'));
});

test('ダイヤ：近鐵週六日、國定假日是土休日；巴士分平日、土曜、日祝', () => {
  const h = DEFAULT_CONFIG.holidays;
  assert.equal(kintetsuDayType('2027-02-11', h), 'holiday'); // 建国記念の日（週四）
  assert.equal(kintetsuDayType('2027-02-06', h), 'holiday');
  assert.equal(kintetsuDayType('2027-02-05', h), 'weekday');
  assert.equal(busDayType('2027-02-06', h), 'saturday');
  assert.equal(busDayType('2027-02-07', h), 'holiday');
  assert.equal(busDayType('2027-02-11', h), 'holiday');
});

test('設定可以部分覆蓋，其他維持預設', () => {
  const c = resolveConfig({ walk: { legMaxWhole: 20 }, holidays: [] });
  assert.equal(c.walk.legMaxWhole, 20);
  assert.equal(c.walk.factorWhole, 1.4);
  assert.deepEqual(c.holidays, []);
  assert.equal(DEFAULT_CONFIG.walk.legMaxWhole, 15);
});
