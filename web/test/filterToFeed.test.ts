// AI 的 set_filter 接到手機的 feed（規格 §4.2）：換過去再換回來，篩選的意思不變。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feedFilter, filterToFeed } from '../src/lib/explore.ts';
import { EMPTY_FILTER, type Filter } from '../src/lib/filter.ts';

const f = (patch: Partial<Filter>): Filter => ({ ...EMPTY_FILTER, ...patch });

test('一個類型、一個地區：放在手機的晶片', () => {
  assert.deepEqual(filterToFeed(f({ types: ['restaurant'], areas: ['toba'] })), { type: 'restaurant', area: 'toba', quick: [] });
});

test('其他條件放進 quick', () => {
  assert.deepEqual(filterToFeed(f({ who: ['all'], dinner: ['walk'] })), { type: 'all', area: null, quick: ['who:all', 'dinner:walk'] });
});

test('一次多個類型、多個地區：手機的晶片表達不了，也不會弄丟', () => {
  const filter = f({ types: ['spot', 'restaurant'], areas: ['toba', 'ise'], who: ['all'] });
  const back = feedFilter(filterToFeed(filter));
  assert.deepEqual(back.types, ['spot', 'restaurant']);
  assert.deepEqual(back.areas, ['toba', 'ise']);
  assert.deepEqual(back.who, ['all']);
});

test('空的篩選', () => {
  assert.deepEqual(filterToFeed(EMPTY_FILTER), { type: 'all', area: null, quick: [] });
});
