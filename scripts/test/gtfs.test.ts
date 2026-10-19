// scripts/lib/gtfs.mjs、unzip.mjs 的測試。執行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { parseCsv, serviceRunsOn, feedRange, hhmm, dayType, referenceDate, tripsByDayType } from '../lib/gtfs.mjs';
import { readZip } from '../lib/unzip.mjs';

test('CSV：BOM、引號裡的逗號和換行、CRLF', () => {
  const rows = parseCsv('﻿a,b\r\n"x,1","he said ""hi""\nok"\r\n3,\r\n');
  assert.deepEqual(rows, [
    { a: 'x,1', b: 'he said "hi"\nok' },
    { a: '3', b: '' },
  ]);
});

test('時刻：GTFS 的 H:MM:SS 和過午夜', () => {
  assert.equal(hhmm('8:05:00'), '08:05');
  assert.equal(hhmm('25:10:00'), '25:10');
  assert.equal(hhmm(''), null);
});

test('zip：deflate 和不壓縮的檔案都讀得到', () => {
  const entries = [
    { name: 'a.txt', data: Buffer.from('hello'), method: 0 },
    { name: 'b.txt', data: Buffer.from('world world world'), method: 8 },
  ];
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const body = e.method === 8 ? zlib.deflateRawSync(e.data) : e.data;
    const name = Buffer.from(e.name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(e.method, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(e.method, 10);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, body);
    centrals.push(central, name);
    offset += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  const files = readZip(Buffer.concat([...locals, cd, eocd]));
  assert.equal(files.get('a.txt').toString(), 'hello');
  assert.equal(files.get('b.txt').toString(), 'world world world');
});

// 像三重交通的 feed：平日、土曜、日祝三種 service，國定假日用 calendar_dates 換成日祝；feed 只到 1 月中
const feed = {
  calendar: [
    { service_id: 'W', monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '0', sunday: '0', start_date: '20261001', end_date: '20270119' },
    { service_id: 'S', monday: '0', tuesday: '0', wednesday: '0', thursday: '0', friday: '0', saturday: '1', sunday: '0', start_date: '20261001', end_date: '20270119' },
    { service_id: 'H', monday: '0', tuesday: '0', wednesday: '0', thursday: '0', friday: '0', saturday: '0', sunday: '1', start_date: '20261001', end_date: '20270119' },
  ],
  calendarDates: [
    { service_id: 'W', date: '20261103', exception_type: '2' },
    { service_id: 'H', date: '20261103', exception_type: '1' },
  ],
  trips: [
    { trip_id: 'w1', service_id: 'W' },
    { trip_id: 's1', service_id: 'S' },
    { trip_id: 'h1', service_id: 'H' },
  ],
};
const holidays = new Set(['2027-02-11']);

test('service：星期、期間、calendar_dates 的例外', () => {
  assert.equal(serviceRunsOn(feed, 'W', '2026-11-02'), true);
  assert.equal(serviceRunsOn(feed, 'W', '2026-11-03'), false);
  assert.equal(serviceRunsOn(feed, 'H', '2026-11-03'), true);
  assert.equal(serviceRunsOn(feed, 'W', '2027-02-02'), false); // feed 期間外
  assert.deepEqual(feedRange(feed), { from: '2026-10-01', to: '2027-01-19' });
});

test('日別：國定假日算日祝', () => {
  assert.equal(dayType('2027-02-11', holidays), 'holiday');
  assert.equal(dayType('2027-02-13', holidays), 'saturday');
  assert.equal(dayType('2027-02-07', holidays), 'holiday');
  assert.equal(dayType('2027-02-12', holidays), 'weekday');
});

test('feed 期間外：用 feed 裡同星期幾的一般日推算，國定假日用星期日', () => {
  assert.equal(referenceDate(feed, '2026-11-02', holidays), '2026-11-02'); // 期間內用當天
  assert.equal(referenceDate(feed, '2027-02-02', holidays), '2027-01-19'); // 星期二
  assert.equal(referenceDate(feed, '2027-02-12', holidays), '2027-01-15'); // 星期五
  assert.equal(referenceDate(feed, '2027-02-11', holidays), '2027-01-17'); // 國定假日 → 星期日
});

test('依日別整理班次', () => {
  const r = tripsByDayType(feed, ['w1', 's1', 'h1'], ['2027-02-10', '2027-02-11', '2027-02-13'], holidays);
  assert.deepEqual([...r.weekday.trips.keys()], ['w1']);
  assert.deepEqual([...r.holiday.trips.keys()], ['h1']);
  assert.deepEqual([...r.saturday.trips.keys()], ['s1']);
  assert.deepEqual(r.basis.map((b) => b.ref), ['2027-01-13', '2027-01-17', '2027-01-16']);
});
