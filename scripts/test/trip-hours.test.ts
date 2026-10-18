// scripts/lib/trip-hours.mjs 的測試。執行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tripDays, tripCount, isDinner, isLunch, closedOn, slotsOn } from '../lib/trip-hours.mjs';

const days = tripDays('2027-02-09', '2027-02-11', ['2027-02-11']);

test('旅程日期與國定假日', () => {
  assert.deepEqual(days.map((d) => `${d.iso} ${d.dow} ${d.holiday}`), ['2027-02-09 tue false', '2027-02-10 wed false', '2027-02-11 thu true']);
});

test('晚餐：18:00～19:00 有一天營業才算；hours 不明不算', () => {
  const r = { contexts: ['dinner'], hours: { tue: [], wed: [['17:00', '21:00']], thu: [], holiday: null } };
  assert.deepEqual(tripCount(r, '18:00', '19:00', days), { open: 1, unknown: 0 });
  assert.equal(isDinner(r, days), true);
  assert.equal(isDinner({ contexts: ['dinner'], hours: { tue: [['11:00', '17:00']], wed: [], thu: [] } }, days), false);
  assert.equal(isDinner({ contexts: ['dinner'], hours: null }, days), false);
  // 國定假日用 holiday
  const h = { contexts: ['dinner'], hours: { tue: [], wed: [], thu: [], holiday: [['18:00', '20:00']] } };
  assert.equal(isDinner(h, days), true);
});

test('午餐：hours 不明也算（營業時間不明）', () => {
  assert.equal(isLunch({ contexts: ['lunch'], hours: null }, days), true);
  assert.equal(isLunch({ contexts: ['lunch'], hours: { tue: [], wed: null, thu: [] } }, days), true);
  assert.equal(isLunch({ contexts: ['lunch'], hours: { tue: [], wed: [], thu: [] } }, days), false);
});

test('closures 涵蓋的日子算休（T9e）', () => {
  const r = { contexts: ['dinner'], hours: { tue: [['17:00', '21:00']], wed: [['17:00', '21:00']], thu: [['17:00', '21:00']], holiday: null }, closures: [{ from: '2027-02-09', to: '2027-02-10' }] };
  assert.equal(closedOn(r, days[0]), true);
  assert.equal(closedOn(r, days[2]), false);
  assert.deepEqual(slotsOn(r, days[1]), []);
  assert.deepEqual(tripCount(r, '18:00', '19:00', days), { open: 1, unknown: 0 });
  // 整段旅程都在 closures 裡：不算晚餐店
  assert.equal(isDinner({ ...r, closures: [{ from: '2027-01-23', to: '2027-03-04' }] }, days), false);
});
