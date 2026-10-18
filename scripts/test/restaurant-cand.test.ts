// scripts/lib/restaurant-cand.mjs、candidates-add.mjs、restaurant-candidates.mjs 的測試（T9c）。執行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { typeOf, contextsOf, autoExclusion, criteriaAC, roomMax } from '../lib/restaurant-cand.mjs';
import { addCandidates } from '../lib/candidates-add.mjs';
import { build, mergeLists, sourceKinds } from '../restaurant-candidates.mjs';

test('類型：食べログ類別第一項（T8c 對應表）', () => {
  assert.equal(typeOf('うなぎ、弁当'), '和食・割烹');
  assert.equal(typeOf('海鮮'), '海鮮丼');
  assert.equal(typeOf('スペイン料理、カフェ'), '洋食・義式');
  assert.equal(typeOf('旅館・民宿、海鮮'), '和食・割烹');
  assert.equal(typeOf('たこ焼き'), '其他');
  assert.equal(typeOf('天丼、かつ丼、丼'), '其他');
});

test('contexts：甜點 snack（＋cafe）、只有晚餐價位只給 dinner、沒價位給 lunch', () => {
  assert.deepEqual(contextsOf({ genre: 'カフェ、ハンバーガー' }), ['snack', 'cafe']);
  assert.deepEqual(contextsOf({ genre: 'フレンチ', dinner: '20000～29999' }), ['dinner']);
  assert.deepEqual(contextsOf({ genre: '寿司', dinner: '1000～1999', lunch: '1000～1999' }), ['lunch', 'dinner']);
  assert.deepEqual(contextsOf({ genre: '食堂' }), ['lunch']);
  assert.deepEqual(contextsOf({ genre: 'たこ焼き', lunch: '～999' }), ['snack']);
});

test('排除：バー類第一項、便利商店、閉店；カフェ、ワインバー（第一項カフェ）不排除', () => {
  assert.match(autoExclusion({ genre: 'ビアバー' }), /酒吧/);
  assert.match(autoExclusion({ genre: 'コンビニ・スーパー' }), /便利商店/);
  assert.match(autoExclusion({ genre: '寿司', status: '閉店' }), /閉店/);
  assert.equal(autoExclusion({ genre: 'カフェ、ワインバー、ケーキ' }), null);
});

test('A／C；能坐 15 人的店 C 照 3.10', () => {
  assert.deepEqual(criteriaAC({ score: 3.3, reviews: 83 }, { inFilter: true }), ['A', 'C']);
  assert.deepEqual(criteriaAC({ score: 3.35, reviews: 9 }), []);
  assert.deepEqual(criteriaAC({ score: 3.12, reviews: 24 }, { inFilter: true }), ['C']);
  assert.deepEqual(criteriaAC({ score: 3.12, reviews: 14 }, { inFilter: true }), []);
  assert.deepEqual(criteriaAC({ score: 3.19, reviews: 51 }, { inFilter: true, cScore: 3.3 }), []);
  assert.deepEqual(criteriaAC({ score: 3.19, reviews: 51 }, { inFilter: true, cScore: 3.3, big15: true }), ['C']);
});

test('個室人數', () => {
  assert.equal(roomMax('個室有(2〜30人可)'), 30);
  assert.equal(roomMax('個室有(4人、10〜20人可)'), 20);
  assert.equal(roomMax('完全個室有(6人可)'), 6);
  assert.equal(roomMax('個室有'), null);
});

test('B：來源種類（觀光三重、觀光協會分開，日文媒體同一種只算 1）', () => {
  const k = sourceKinds([
    { type: 'tourism', url: 'https://www.kankomie.or.jp/report/1' },
    { type: 'media', url: 'https://www.mapple.net/a' },
    { type: 'blog-ja', url: 'https://example.jp/b' },
  ]);
  assert.deepEqual([...k].sort(), ['ja', 'kankomie']);
});

const page = (title: string, lines: string[]) => `#P|${title}|1-${lines.length}/${lines.length}|0\n${lines.join('\n')}\n#END\n`;
test('build：合併篩選、子地區、override、3.10 未満不記', () => {
  const rt = page('鵜方', [
    '1|鯛|日本料理、海鮮|3.56|220|月曜日|5000～5999|1000～1999|阿児町鵜方2037-1|||A2403-A240303|',
    '2|うえむら|焼肉|3.19|51|水曜日|2000～2999||阿児町鵜方2884-20|||A2403-A240303|',
    '3|Beer|ビアバー|3.12|14|||～999|阿児町鵜方1670-2|||A2403-A240303|',
    '4|低分|食堂|3.05|30||||阿児町鵜方1|||A2403-A240303|',
    '5|賢島の店|フレンチ|3.4|50||9000～||阿児町神明731|||A2403-A240303|',
  ]);
  const room = page('個室', [
    '1|鯛|日本料理、海鮮|3.56|220|月曜日|5000～5999|1000～1999|阿児町鵜方2037-1|個室有(2〜30人可)||A2403-A240303|',
    '2|うえむら|焼肉|3.19|51|水曜日|2000～2999||阿児町鵜方2884-20|個室有(2〜20人可)||A2403-A240303|',
  ]);
  const { shops } = mergeLists([
    { name: 'ugata-rt-1.txt', text: rt },
    { name: 'ugata-room-1.txt', text: room },
  ]);
  const out = build(shops, {
    minScore: 3.1,
    regions: [{ re: '阿児町神明7', region: 'kashiko' }, { re: '阿児町鵜方', region: 'ugata' }],
    thresholds: { ugata: { cScore: 3.3 } },
    overrides: { '5': { status: 'pending', reason: '住宿附設' } },
  });
  const by = Object.fromEntries(out.map((c) => [c.key, c]));
  assert.equal(by['tabelog-4'], undefined);
  assert.deepEqual(by['tabelog-1'].criteria, ['A', 'C']);
  assert.match(by['tabelog-1'].note, /個室（食べログ列表）：個室有\(2〜30人可\)/);
  assert.deepEqual(by['tabelog-2'].criteria, ['C']); // 20 人個室：C 照 3.10
  assert.equal(by['tabelog-3'].status, 'excluded');
  assert.equal(by['tabelog-5'].status, 'pending');
  assert.equal(by['tabelog-5'].region, 'kashiko');
  assert.equal(by['tabelog-1'].links.tabelog, 'https://tabelog.com/mie/A2403/A240303/1/');
});

test('build：檔名不對、沒讀完就停', () => {
  assert.throws(() => mergeLists([{ name: 'ugata-1.txt', text: page('x', []) }]), /檔名/);
  assert.throws(() => mergeLists([{ name: 'ugata-rt-1.txt', text: '#P|x|1-1/1|0\n' }]), /沒有讀完/);
});

test('candidates add：衝突、取代', () => {
  const cands = [{ key: 'a', v: 1 }];
  assert.deepEqual(addCandidates(cands, [{ key: 'a', v: 2 }]).conflicts, ['a']);
  const r = addCandidates(cands, [{ key: 'a', v: 2 }, { key: 'b' }], { replace: true });
  assert.deepEqual(r.result, [{ key: 'a', v: 2 }, { key: 'b' }]);
  assert.equal(r.added, 1);
  assert.throws(() => addCandidates([], [{ key: 'x' }, { key: 'x' }]));
});
