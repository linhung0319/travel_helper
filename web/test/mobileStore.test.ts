// mobileStore（手機版的畫面狀態）：整頁詳情和 history 的配合、一次只有一層整頁。
// node 沒有 window：先放一個假的 history（back() 跟瀏覽器一樣是非同步，之後才發 popstate），再載入 mobileStore。
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const entries: { state: unknown }[] = [{ state: null }];
let index = 0;
const listeners: (() => void)[] = [];
(globalThis as Record<string, unknown>).window = {
  history: {
    get state() {
      return entries[index].state;
    },
    pushState(state: unknown) {
      entries.splice(index + 1);
      entries.push({ state });
      index++;
    },
    back() {
      setTimeout(() => {
        if (index === 0) return;
        index--;
        for (const f of listeners) f();
      }, 5);
    },
  },
  addEventListener(type: string, f: () => void) {
    if (type === 'popstate') listeners.push(f);
  },
};

const { mobileStore, setMobileActive } = await import('../src/mobile/mobileStore.ts');
const { uiStore, openTimetable, closeTimetable } = await import('../src/uiStore.ts');
const { appStore } = await import('../src/store.ts');

/** 等非同步的 history.back() 跑完 */
const settle = () => new Promise((r) => setTimeout(r, 20));

beforeEach(async () => {
  mobileStore.getState().closePlace();
  mobileStore.getState().setTab('trip');
  await settle();
});

test('詳情開著時換一個點：不再推一筆 history', async () => {
  const before = index;
  mobileStore.getState().openPlace('a', 'explore');
  mobileStore.getState().openPlace('b', 'explore');
  assert.equal(index, before + 1);
  assert.equal(mobileStore.getState().detail?.placeId, 'b');
  // 上一頁一次就回到分頁
  window.history.back();
  await settle();
  assert.equal(mobileStore.getState().detail, null);
});

test('換分頁：詳情和整頁都關掉', async () => {
  mobileStore.getState().setPage('reservations');
  mobileStore.getState().setTab('me');
  assert.equal(mobileStore.getState().page, null);
  mobileStore.getState().openPlace('a', 'me');
  mobileStore.getState().setTab('explore');
  assert.equal(mobileStore.getState().detail, null);
  assert.equal(mobileStore.getState().tab, 'explore');
  await settle();
  assert.equal(mobileStore.getState().detail, null);
});

test('關掉後馬上再開：延遲到的 popstate 不會關掉新的詳情，上一頁還是關得掉', async () => {
  mobileStore.getState().openPlace('a', 'explore');
  await settle();
  mobileStore.getState().closePlace();
  mobileStore.getState().openPlace('b', 'explore');
  await settle();
  assert.equal(mobileStore.getState().detail?.placeId, 'b');
  // 新的詳情也有自己那一筆 history
  assert.equal((window.history.state as Record<string, unknown> | null)?.thMobileDetail, true);
  window.history.back();
  await settle();
  assert.equal(mobileStore.getState().detail, null);
});

test('換分頁後馬上開詳情：新的詳情留著', async () => {
  mobileStore.getState().openPlace('a', 'explore');
  await settle();
  mobileStore.getState().setTab('wish');
  mobileStore.getState().openPlace('b', 'wish');
  await settle();
  assert.equal(mobileStore.getState().detail?.placeId, 'b');
  assert.equal(mobileStore.getState().tab, 'wish');
});

test('一次只有一層整頁：開詳情關掉討論／預約，開討論／預約關掉詳情', async () => {
  mobileStore.getState().setPage('reservations');
  mobileStore.getState().openPlace('a', 'me');
  assert.equal(mobileStore.getState().page, null);
  assert.equal(mobileStore.getState().detail?.placeId, 'a');
  mobileStore.getState().setPage('reservations');
  assert.equal(mobileStore.getState().detail, null);
  assert.equal(mobileStore.getState().page, 'reservations');
  await settle();
  assert.equal(mobileStore.getState().page, 'reservations');
});

test('討論／預約整頁也推一筆 history：上一頁（手機的返回鍵）關掉，‹（setPage(null)）把那筆退回去', async () => {
  const before = index;
  mobileStore.getState().setPage('reservations');
  assert.equal(index, before + 1);
  window.history.back();
  await settle();
  assert.equal(mobileStore.getState().page, null);
  assert.equal(index, before);
  mobileStore.getState().setPage('reservations');
  await settle();
  mobileStore.getState().setPage(null);
  await settle();
  assert.equal(mobileStore.getState().page, null);
  assert.equal(index, before);
});

test('詳情換成討論頁：只佔一筆 history，上一頁一次就回到分頁', async () => {
  const before = index;
  mobileStore.getState().openPlace('a', 'me');
  mobileStore.getState().setPage('reservations');
  assert.equal(index, before + 1);
  await settle();
  assert.equal(mobileStore.getState().page, 'reservations');
  window.history.back();
  await settle();
  assert.equal(mobileStore.getState().page, null);
  assert.equal(mobileStore.getState().detail, null);
  assert.equal(index, before);
});

test('返回鍵一次關一層：詳情 → 半屏（手機版掛著時）', async () => {
  const before = index;
  setMobileActive(true);
  mobileStore.getState().openChatSheet();
  await settle();
  assert.equal(index, before + 1);
  mobileStore.getState().openPlace('a', 'trip');
  assert.equal(index, before + 2);
  window.history.back();
  await settle();
  assert.equal(mobileStore.getState().detail, null);
  assert.equal(mobileStore.getState().chatSheet, true);
  window.history.back();
  await settle();
  assert.equal(mobileStore.getState().chatSheet, false);
  assert.equal(index, before);
  setMobileActive(false);
  await settle();
});

test('對話清單也佔一筆；按 ✕ 關半屏把筆數退回去', async () => {
  const before = index;
  setMobileActive(true);
  const s = mobileStore.getState();
  s.openChatSheet();
  s.setChatOverlay('list');
  await settle();
  assert.equal(index, before + 2);
  window.history.back();
  await settle();
  assert.equal(mobileStore.getState().chatOverlay, null);
  assert.equal(mobileStore.getState().chatSheet, true);
  mobileStore.getState().closeChatSheet();
  await settle();
  assert.equal(index, before);
  setMobileActive(false);
  await settle();
});

test('從聊天跳來的：返回鍵回聊天（行程頁開半屏，探索回 AI 分頁）', async () => {
  setMobileActive(true);
  mobileStore.getState().setTab('explore');
  mobileStore.setState({ fromChat: true });
  await settle();
  window.history.back();
  await settle();
  assert.equal(mobileStore.getState().tab, 'ai');
  assert.equal(mobileStore.getState().fromChat, false);
  mobileStore.getState().setTab('trip');
  mobileStore.setState({ fromChat: true });
  await settle();
  window.history.back();
  await settle();
  assert.equal(mobileStore.getState().tab, 'trip');
  assert.equal(mobileStore.getState().chatSheet, true);
  mobileStore.getState().closeChatSheet();
  await settle();
  setMobileActive(false);
  await settle();
});

test('拉滿、關掉半屏、換分頁都不動提議；換分頁記下最後看的內容分頁', () => {
  appStore.setState({ proposal: { itinerary: {}, dates: [], changes: [], summary: '' } as never });
  const s = mobileStore.getState();
  s.openChatSheet();
  s.setChatFull(true);
  s.closeChatSheet();
  assert.equal(mobileStore.getState().chatFull, false);
  s.setTab('wish');
  s.setTab('ai');
  assert.equal(mobileStore.getState().lastTab, 'wish');
  assert.notEqual(appStore.getState().proposal, null);
  appStore.setState({ proposal: null });
  s.setTab('trip');
});

test('結果集出現：探索的篩選收起來；清掉時還原', () => {
  const m = mobileStore.getState();
  m.setFeed({ type: 'restaurant', area: 'toba', query: '海' });
  appStore.getState().setAiResult({ title: 't', ids: ['a'], notes: {}, lettered: false });
  assert.equal(mobileStore.getState().feed.type, 'all');
  assert.equal(mobileStore.getState().feed.query, '');
  // 再給一組：還是最早收起來的那份
  appStore.getState().setAiResult({ title: 't2', ids: ['b'], notes: {}, lettered: false });
  m.setFeed({ query: '再搜尋' });
  appStore.getState().setAiResult(null);
  assert.equal(mobileStore.getState().feed.type, 'restaurant');
  assert.equal(mobileStore.getState().feed.area, 'toba');
  assert.equal(mobileStore.getState().feed.query, '海');
  m.setFeed({ type: 'all', area: null, query: '' });
});

test('focusItem 不改面板高度', () => {
  const s = mobileStore.getState();
  s.setSnap('low');
  s.focusItem('i-2');
  assert.equal(mobileStore.getState().tripSnap, 'low');
  assert.equal(mobileStore.getState().focused, 'i-2');
  s.setSnap('mid');
  s.focusItem('i-3');
  assert.equal(mobileStore.getState().tripSnap, 'mid');
  s.focusItem(null);
});

test('expandItem：點同一張收起，點別張換過去，null 收起', () => {
  const s = mobileStore.getState();
  s.expandItem(null);
  s.expandItem('i-2');
  assert.equal(mobileStore.getState().expanded, 'i-2');
  s.expandItem('i-3');
  assert.equal(mobileStore.getState().expanded, 'i-3');
  s.expandItem('i-3');
  assert.equal(mobileStore.getState().expanded, null);
  s.expandItem('i-2');
  s.expandItem(null);
  assert.equal(mobileStore.getState().expanded, null);
});

test('換分頁：展開的卡收起來', () => {
  mobileStore.getState().expandItem('i-2');
  mobileStore.getState().setTab('explore');
  assert.equal(mobileStore.getState().expanded, null);
  mobileStore.getState().setTab('trip');
});

test('開半屏聊天不改行程面板高度', () => {
  const s = mobileStore.getState();
  s.setSnap('high');
  s.openChatSheet();
  assert.equal(mobileStore.getState().tripSnap, 'high');
  s.closeChatSheet();
  assert.equal(mobileStore.getState().tripSnap, 'high');
  s.setSnap('mid');
});

test('手機打開班次表（大彈窗）：開、關都不動行程面板的高度', () => {
  const s = mobileStore.getState();
  const tt = { date: '2027-02-10', legKey: '2027-02-10:visit:i-1', rideIndex: 0 };
  setMobileActive(true);
  for (const snap of ['high', 'mid', 'low'] as const) {
    s.setSnap(snap);
    openTimetable(tt);
    assert.equal(mobileStore.getState().tripSnap, snap);
    closeTimetable();
    assert.equal(mobileStore.getState().tripSnap, snap);
  }
  setMobileActive(false);
  assert.equal(uiStore.getState().timetable, null);
  s.setSnap('mid');
});

test('目前地區（T42）：手機的探索、想去共用地區、子地區，其他條件各自記', () => {
  const m = mobileStore.getState();
  m.setFeed({ type: 'all', area: null, quick: [], query: '' });
  m.setWish({ type: 'all', area: null, quick: ['votes:mine'], query: '' });
  mobileStore.getState().setFeed({ area: 'toba', quick: ['regions:osatsu', 'tiers:S'] });
  assert.equal(mobileStore.getState().wish.area, 'toba');
  assert.deepEqual(mobileStore.getState().wish.quick, ['votes:mine', 'regions:osatsu']);
  // 想去換子地區：探索跟著換，探索自己的等級還在
  mobileStore.getState().toggleWishQuick('regions:osatsu');
  assert.deepEqual(mobileStore.getState().feed.quick, ['tiers:S']);
  mobileStore.getState().setWish({ area: null });
  assert.equal(mobileStore.getState().feed.area, null);
  mobileStore.getState().setFeed({ type: 'all', area: null, quick: [], query: '' });
  mobileStore.getState().setWish({ type: 'all', area: null, quick: [], query: '' });
});
