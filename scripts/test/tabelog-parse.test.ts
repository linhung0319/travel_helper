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

// T8e 第 1 批：scripts/chrome/tabelog-info.js 在實際頁面抽到的 rows（2026-10-18，data/cache/work/t8e-1/tabelog.jsonl 節錄）
describe('實際頁面的 rows（T8e）', () => {
  test('桂 外宮：個室 30 人以上、貸切 20～50 → yes；座位、預約電話', () => {
    const p = parseTabelog(info({
      予約可否: '予約可',
      '予約・お問い合わせ': '050-5890-2301',
      電話番号: '0596-28-3001',
      席数: '46席 （カウンター12席 お座敷34席）',
      個室: '有 （2人可、4人可、6人可、8人可、10～20人可、20～30人可、30人以上可）',
      貸切: '可 （20人～50人可）',
      '空間・設備': 'オシャレな空間、落ち着いた空間、席が広い、カウンター席あり、座敷あり、掘りごたつあり',
      お子様連れ: '子供可',
      予算: '￥4,000～￥4,999 ￥1,000～￥1,999',
      '予算（口コミ集計）': '￥2,000～￥2,999 利用金額分布を見る',
    }));
    assert.equal(p.group.seats, 46);
    assert.equal(p.group.privateRoomMax, 30);
    assert.equal(p.group.fit15, 'yes');
    assert.deepEqual(p.seating, ['zashiki', 'horigotatsu', 'counter']);
    assert.equal(p.kids.allowed, 'yes');
    assert.equal(p.phone, '050-5890-2301');
    assert.equal(p.budget, '￥4,000～￥4,999 ￥1,000～￥1,999');
  });
  test('居酒屋 ふぐや：沒有「予算」只有「予算（口コミ集計）」→ budget 是 null；貸切「可」沒有人數', () => {
    const p = parseTabelog(info({
      予約可否: '予約可',
      '予算（口コミ集計）': '￥5,000～￥5,999 利用金額分布を見る',
      席数: '60席',
      個室: '有 （10～20人可）',
      貸切: '可',
      '禁煙・喫煙': '全席喫煙可',
    }));
    assert.equal(p.budget, null);
    assert.equal(p.group.buyout, '可');
    assert.equal(p.group.privateRoomMax, 20);
    assert.equal(p.group.fit15, 'yes');
    assert.equal(p.smoking, '全席喫煙可');
  });
  test('たまちゃん：「有 （30人以上可） 最大48人収容可」、貸切不可、バリアフリー', () => {
    const p = parseTabelog(info({
      予約可否: '予約可',
      席数: '96席',
      個室: '有 （30人以上可） 最大48人収容可',
      貸切: '不可',
      '空間・設備': 'オシャレな空間、落ち着いた空間、座敷あり、掘りごたつあり、バリアフリー',
      お子様連れ: '子供可（乳児可、未就学児可、小学生可）',
      公式アカウント: 'https://www.facebook.com/yakinikutamachan/ https://x.com/maybach7650 https://www.instagram.com/yakiniku_tamachan/',
    }));
    assert.equal(p.group.privateRoomMax, 48);
    assert.equal(p.group.buyout, '不可');
    assert.equal(p.group.fit15, 'yes');
    assert.equal(p.barrierFree, 'バリアフリー');
    assert.equal(p.instagram, '@yakiniku_tamachan');
  });
  test('やきとり能代：最大予約「着席時 44人」、席數有明細', () => {
    const p = parseTabelog(info({
      予約可否: '予約可 紙たばこ・電子たばこ共に店舗内喫煙不可となります。',
      席数: '50席 （カウンター10席/ ２名様テーブル3 /４名様（最大6名様）テーブル2 /７名様（最大8名様）個室3）',
      最大予約可能人数: '着席時 44人',
      個室: '有 （4人可、6人可、8人可、10～20人可、20～30人可） ～8名席、～11名席、～15名席',
      貸切: '不可',
      お子様連れ: '子供可（乳児可、未就学児可、小学生可）、ベビーカー入店可 お子様連れ歓迎',
    }));
    assert.equal(p.group.seats, 50);
    assert.equal(p.group.maxReservation, 44);
    assert.equal(p.group.fit15, 'yes');
    assert.equal(p.reservation.accepted, 'yes');
  });
  test('柚子：席數 21（明細裡的數字不算）、備考寫宴會 25 名 → 提醒', () => {
    const p = parseTabelog(info({
      予約可否: '予約可 アレルギーなどございましたら事前にお申し付けください。',
      席数: '21席 （カウンター5席、2名様用個室1室。4名様用個室2室。6名個室1室。）',
      個室: '有 （2人可、4人可、6人可、8人可、10～20人可） 最大20名様までの個室ご用意できます。',
      貸切: '可 （20人以下可）',
      備考: '※昼はミニ懐石￥3500以上のコース料理のみ要予約 ※夜は￥10000コースのみ要予約 ※宴会は25名まで可能 ※仕出し弁当あり',
      お子様連れ: '子供可（乳児可、未就学児可、小学生可）、お子様メニューあり、ベビーカー入店可 お子様メニューは要予約。',
    }));
    assert.equal(p.group.seats, 21);
    assert.equal(p.group.fit15, 'yes');
    assert.equal(p.kids.kidsMenu, true);
    assert.ok(p.warnings.some((w) => w.includes('備考')));
  });
});
