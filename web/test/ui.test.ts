import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uiStore, askAboutPlace } from '../src/uiStore.ts';
import { appStore } from '../src/store.ts';
import { googleMapsUrl, canDeleteUserPlace, canEditUserPlace, hasReviewsTab, addedDateLabel, userSubtitle, placeMetaText, USER_PLACE_WARNING } from '../src/lib/addPlace/view.ts';
import type { Place } from '../src/data/types.ts';


test('askAboutPlace 寫 chatDraft、加進選取', () => {
  askAboutPlace('shima-yokoyama', '長輩走得上去嗎？', 'other');
  const d = uiStore.getState().chatDraft;
  assert.equal(d?.text, '長輩走得上去嗎？');
  assert.equal(d?.placeId, 'shima-yokoyama');
  assert.equal(d?.from, 'other');
  assert.equal(d?.date, null);
  assert.ok(appStore.getState().selection.includes('shima-yokoyama'));
});

test('askAboutPlace：seq 每次加 1、帶目前選的那天', () => {
  const before = uiStore.getState().chatDraft?.seq ?? 0;
  appStore.setState({ day: '2027-02-03' });
  askAboutPlace('shima-yokoyama', '下雨的話換哪裡？', 'trip');
  const d = uiStore.getState().chatDraft;
  assert.equal(d?.seq, before + 1);
  assert.equal(d?.date, '2027-02-03');
  assert.equal(d?.from, 'trip');
});

// 自己加的點的畫面判斷（T31 Task 4）

const userPlace = (over: Partial<Place> = {}): Place =>
  ({
    id: 'user-0123456789ab',
    type: 'restaurant',
    name: { ja: 'まつや', zh: null },
    coords: [136.9, 34.5],
    links: {},
    origin: 'user',
    user: { author: 'm1', createdAt: '2026-11-03T05:00:00Z', updatedBy: null, note: null, addedVia: 'map', deletedAt: null },
    ...over,
  }) as unknown as Place;

test('googleMapsUrl：有存就用，沒有用座標（緯度,經度）', () => {
  assert.equal(googleMapsUrl(userPlace({ links: { googleMaps: 'https://maps.app.goo.gl/x' } })), 'https://maps.app.goo.gl/x');
  assert.equal(googleMapsUrl(userPlace()), 'https://www.google.com/maps/search/?api=1&query=34.5,136.9');
});

test('只有加的人能刪', () => {
  assert.equal(canDeleteUserPlace(userPlace(), 'm1'), true);
  assert.equal(canDeleteUserPlace(userPlace(), 'm2'), false);
  assert.equal(canDeleteUserPlace(userPlace(), null), false);
  assert.equal(canDeleteUserPlace(userPlace({ origin: 'base', user: null }), 'm1'), false);
});

test('自己加的點沒有評論分頁', () => {
  assert.equal(hasReviewsTab(userPlace()), false);
  assert.equal(hasReviewsTab(userPlace({ origin: 'base', user: null })), true);
});

test('加的日期、副標、提示框全文', () => {
  assert.match(addedDateLabel('2026-11-03T05:00:00Z'), /^11\/3$/);
  assert.equal(addedDateLabel('壞掉'), '');
  assert.equal(userSubtitle(userPlace(), [{ id: 'm1', displayName: '小明' } as never]), '自己加的 · 小明');
  assert.equal(USER_PLACE_WARNING, '我們沒查過這個點：營業時間、能不能坐 15 人都不知道。排行程時只用位置估交通時間。');
});

test('已刪除的自己加的點：不能修改、不能刪', () => {
  const gone = userPlace();
  gone.user!.deletedAt = '2026-11-04T00:00:00Z';
  assert.equal(canEditUserPlace(gone), false);
  assert.equal(canDeleteUserPlace(gone, 'm1'), false);
  assert.equal(canEditUserPlace(userPlace()), true);
});

test('placeMetaText：自己加的點沒有評分文字', () => {
  const p = userPlace({ raw: { ratings: { google: 4.5, tabelog: 3.6 } } });
  assert.doesNotMatch(placeMetaText(p, []), /★|食べログ/);
});

test('googleMapsUrl：存的不是地圖連結就用座標', () => {
  assert.equal(googleMapsUrl(userPlace({ links: { googleMaps: 'https://evil.example.com/x' } })), 'https://www.google.com/maps/search/?api=1&query=34.5,136.9');
});
