// scripts/lib/tabelog-parse.mjs 的測試。字樣取自 T8d 讀過的店（data/raw/ise/log/T8d.md），
// 實際頁面的寫法有出入時，把那家的 rows 加成新的測試再修正解析。
// 執行：npm test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseTabelog, parseKids, parseSeating, parseReservation, suggestFit15 } from '../lib/tabelog-parse.mjs';

const info = (rows: Record<string, string>, extra = {}) => ({ score: 3.4, reviews: 100, owner: false, tabs: [], rows, ...extra });

describe('予約可否', () => {
  test('一般', () => {
    assert.equal(parseReservation('予約可').accepted, 'yes');
    assert.equal(parseReservation('予約不可').accepted, 'no');
    assert.equal(parseReservation('予約不可 （持ち帰り予約可）').accepted, 'no');
    assert.deepEqual(parseReservation('完全予約制'), { accepted: 'yes', fullyReserved: true });
    assert.equal(parseReservation(null).accepted, 'unknown');
  });
});

describe('お子様連れ', () => {
  test('乳兒到小學生都可以、有兒童餐', () => {
    const k = parseKids('子供可 （乳児可、未就学児可、小学生可） お子様メニューあり ベビーカー入店可');
    assert.equal(k.allowed, 'yes');
    assert.equal(k.kidsMenu, true);
  });
  test('不接小孩', () => assert.equal(parseKids('子供不可').allowed, 'no'));
  test('只有小學生可 → 有年齡限制', () => assert.equal(parseKids('子供可 （小学生可）').allowed, 'age-limit'));
  test('只寫子供可', () => {
    const k = parseKids('子供可');
    assert.equal(k.allowed, 'yes');
    assert.equal(k.kidsMenu, null);
  });
});

describe('空間・設備', () => {
  test('只認「〇〇あり」', () => {
    assert.deepEqual(parseSeating('落ち着いた空間、座敷あり、掘りごたつあり、カウンター席あり'), ['zashiki', 'horigotatsu', 'counter']);
    assert.deepEqual(parseSeating('ソファー席あり、テラス席あり、車椅子で入店可'), ['sofa', 'terrace']);
  });
  test('沒寫的不推測（T7e 曾把「沒有座敷」轉成 zashiki）', () => {
    assert.deepEqual(parseSeating('落ち着いた空間、オシャレな空間'), []);
    assert.deepEqual(parseSeating(null), []);
  });
});

describe('fit15 建議值', () => {
  test('最大予約 ≥15 → yes（とんかつ 四十三番：18 席、最大予約 18）', () => {
    const p = parseTabelog(info({ 予約可否: '予約可', 席数: '18席', 最大予約可能人数: '着席時 18人', 個室: '無', 貸切: '不可' }));
    assert.equal(p.group.seats, 18);
    assert.equal(p.group.maxReservation, 18);
    assert.equal(p.group.privateRoom, false);
    assert.equal(p.group.buyout, '不可');
    assert.equal(p.group.fit15, 'yes');
  });
  test('個室 15 人以上 → yes（パセプション：2～30 人個室）', () => {
    const p = parseTabelog(info({ 予約可否: '予約可', 席数: '46席 （宴会着席最大30人）', 個室: '有 （2人可、4人可、10～20人可、20～30人可）' }));
    assert.equal(p.group.seats, 46);
    assert.equal(p.group.privateRoomMax, 30);
    assert.equal(p.group.fit15, 'yes');
  });
  test('貸切 20～50 → yes（オランジェ）', () => {
    const p = parseTabelog(info({ 予約可否: '予約可', 席数: '44席', 個室: '無', 貸切: '可 （20人～50人可）' }));
    assert.equal(p.group.fit15, 'yes');
  });
  test('可預約、席數 20 以上、沒寫 15 人 → split（リビエラ：60 席、個室 6）', () => {
    const p = parseTabelog(info({ 予約可否: '予約可', 席数: '60席', 個室: '有 （6人可）', 貸切: '不可' }));
    assert.equal(p.group.privateRoomMax, 6);
    assert.equal(p.group.fit15, 'split');
  });
  test('不能預約，席數再多也是 unknown（Knott\'s Berry、一月家）', () => {
    const p = parseTabelog(info({ 予約可否: '予約不可', 席数: '70席', 貸切: '不可' }));
    assert.equal(p.group.fit15, 'unknown');
  });
  test('席數不到 15 → no（貫 6 席）', () => {
    assert.equal(suggestFit15({ accepted: 'yes', seats: 6, maxReservation: null, privateRoomMax: null, buyoutAllowed: false, buyoutMax: null }).value, 'no');
  });
  test('最大予約有著席、立食兩個數字時取著席', () => {
    const p = parseTabelog(info({ 予約可否: '予約可', 最大予約可能人数: '着席時 14人、立食時 30人' }));
    assert.equal(p.group.maxReservation, 14);
  });
});

describe('其他欄位', () => {
  test('電話、IG、無障礙、備考提醒', () => {
    const p = parseTabelog(
      info({
        '予約・お問い合わせ': '0596-67-5866',
        公式アカウント: 'https://www.instagram.com/tonkatsu43ban/',
        '空間・設備': 'カウンター席あり、車椅子で入店可',
        備考: '団体様もご相談ください',
        '禁煙・喫煙': '全席禁煙 2020年4月1日より',
      }),
    );
    assert.equal(p.phone, '0596-67-5866');
    assert.equal(p.instagram, '@tonkatsu43ban');
    assert.equal(p.barrierFree, '車椅子で入店可');
    assert.equal(p.smoking, '全席禁煙');
    assert.ok(p.warnings.some((w) => w.includes('備考')));
  });
  test('th 有附加字也對得到（予約・お問い合わせ）', () => {
    const p = parseTabelog(info({ '予約・お問い合わせ': '050-5872-1234 （予約専用番号）' }));
    assert.equal(p.phone, '050-5872-1234');
  });
});
