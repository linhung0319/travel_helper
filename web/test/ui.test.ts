import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uiStore, askAboutPlace } from '../src/uiStore.ts';
import { appStore } from '../src/store.ts';

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
