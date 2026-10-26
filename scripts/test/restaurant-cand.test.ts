// scripts/lib/restaurant-cand.mjs、candidates-add.mjs、restaurant-candidates.mjs 的測試（T9c）。執行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { typeOf, contextsOf, autoExclusion, criteriaAC, criteriaOsaka, budgetMax, roomMax } from '../lib/restaurant-cand.mjs';
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
    regionDefaults: { kashiko: { status: 'excluded', reason: '休園' }, ugata: { note: '共用' } },
  });
  const by = Object.fromEntries(out.map((c) => [c.key, c]));
  assert.equal(by['tabelog-4'], undefined);
  assert.deepEqual(by['tabelog-1'].criteria, ['A', 'C']);
  assert.match(by['tabelog-1'].note, /個室（食べログ列表）：個室有\(2〜30人可\)/);
  assert.deepEqual(by['tabelog-2'].criteria, ['C']); // 20 人個室：C 照 3.10
  assert.equal(by['tabelog-3'].status, 'excluded');
  assert.equal(by['tabelog-5'].status, 'pending'); // 店家 override 優先於 regionDefaults
  assert.match(by['tabelog-2'].note, /共用/);
  assert.equal(by['tabelog-5'].region, 'kashiko');
  assert.equal(by['tabelog-1'].links.tabelog, 'https://tabelog.com/mie/A2403/A240303/1/');
});

test('build：onlyRegions 只輸出指定的子地區', () => {
  const { shops } = mergeLists([{ name: 'kw-rt-1.txt', text: page('kw', [
    '1|中六|うなぎ、丼|3.39|125|||2000～2999|磯部町上之郷392|||A2403-A240303|',
    '2|大田屋|たい焼き・大判焼き|3.37|62|||～999|阿児町鵜方4066|||A2403-A240303|',
  ]) }]);
  const out = build(shops, { minScore: 3.1, regions: [{ re: '磯部町', region: 'isobe' }, { re: '阿児町鵜方', region: 'ugata' }], onlyRegions: ['isobe'] });
  assert.deepEqual(out.map((c) => c.key), ['tabelog-1']);
});

test('build：檔名不對、沒讀完就停', () => {
  assert.throws(() => mergeLists([{ name: 'ugata-1.txt', text: page('x', []) }]), /檔名/);
  assert.throws(() => mergeLists([{ name: 'ugata-rt-1.txt', text: '#P|x|1-1/1|0\n' }]), /沒有讀完/);
});

test('大阪 G／S（T27c）：G 要個室 15 人以上；S 要名物或昼 1,999 円以下，甜點不算', () => {
  assert.equal(budgetMax('1000～1999'), 1999);
  assert.equal(budgetMax('～999'), 999);
  assert.equal(budgetMax(null), null);
  assert.deepEqual(criteriaOsaka({ score: 3.58, reviews: 2408, genre: 'うどん、うどんすき', lunch: '1000～1999', room: '完全個室有(2〜20人可)' }), ['G', 'S']);
  assert.deepEqual(criteriaOsaka({ score: 3.12, reviews: 20, genre: '居酒屋', dinner: '3000～3999', room: '個室有(4〜8人可)' }), []);
  assert.deepEqual(criteriaOsaka({ score: 3.12, reviews: 20, genre: '居酒屋', dinner: '3000～3999', room: '個室有(10〜20人可)' }), ['G']);
  assert.deepEqual(criteriaOsaka({ score: 3.7, reviews: 2000, genre: 'ラーメン', lunch: '～999' }), ['S']);
  assert.deepEqual(criteriaOsaka({ score: 3.7, reviews: 2000, genre: 'フレンチ', dinner: '10000～14999' }), []);
  assert.deepEqual(criteriaOsaka({ score: 3.64, reviews: 1883, genre: '喫茶店、パンケーキ', lunch: '～999' }), []);
  assert.deepEqual(criteriaOsaka({ score: 3.49, reviews: 3242, genre: 'たこ焼き', lunch: '～999' }), ['S']);
  assert.deepEqual(criteriaOsaka({ score: 3.49, reviews: 40, genre: 'たこ焼き', lunch: '～999' }), []);
});

test('build（大阪）：area 對子地區、G 依口コミ數取、超過 G 上限的進 S、S 名物優先', () => {
  const { shops } = mergeLists([{ name: 'namba_rvcn-room-1.txt', text: page('難波', [
    '1|今井|うどん、うどんすき|3.58|2408||1000～1999|1000～1999||完全個室有(2〜20人可)||A2701-A270202|',
    '2|はつせ|お好み焼き、鉄板焼き|3.49|520||1000～1999|1000～1999||個室有(2〜30人可)||A2701-A270202|',
    '3|焼肉|焼肉|3.44|637||4000～4999|||完全個室有(2〜30人可)||A2701-A270202|',
    '4|ラーメン|ラーメン|3.7|3000||～999|～999||||A2701-A270202|',
    '5|わなか|たこ焼き|3.49|900||～999|～999||||A2701-A270202|',
    '6|梅田の店|居酒屋|3.4|300||3000～3999|||個室有(2〜30人可)||A2701-A270101|',
  ]) }]);
  const out = build(shops, {
    scheme: 'osaka',
    minScore: 3.1,
    regions: [{ area: 'A270202', region: 'namba' }, { area: 'A270101', region: 'umeda' }],
    caps: { G: { namba: 1, default: 2 }, S: { default: 2 } },
  });
  const by = Object.fromEntries(out.map((c) => [c.key, c]));
  assert.equal(by['tabelog-6'].region, 'umeda');
  assert.equal(by['tabelog-1'].status, 'included'); // G 第 1
  assert.deepEqual(by['tabelog-1'].criteria, ['G', 'S']);
  assert.equal(by['tabelog-3'].status, 'over-limit'); // G 第 2、不符合 S
  assert.equal(by['tabelog-2'].status, 'included'); // G 超過上限 → S（名物）
  assert.equal(by['tabelog-5'].status, 'included'); // S 名物
  assert.equal(by['tabelog-4'].status, 'over-limit'); // 平價但不是名物，排在名物後
  assert.match(by['tabelog-4'].reason, /上限外/);
  assert.equal(by['tabelog-1'].links.tabelog, 'https://tabelog.com/osaka/A2701/A270202/1/');
});

test('build（大阪）：S 同類型上限、名物只看類別第一項', () => {
  const { shops } = mergeLists([{ name: 'umeda_rvcn-rt-1.txt', text: page('梅田', [
    '1|うどんA|うどん、天ぷら|3.7|3000||～999|～999||||A2701-A270101|',
    '2|うどんB|うどんすき|3.7|2900||～999|～999||||A2701-A270101|',
    '3|うどんC|うどん|3.7|2800||～999|～999||||A2701-A270101|',
    '4|ラーメン|ラーメン|3.7|100||～999|～999||||A2701-A270101|',
    '5|フレンチ|フレンチ、シーフード、串揚げ|3.4|5000||10000～14999|3000～3999||||A2701-A270101|',
  ]) }]);
  const out = build(shops, { scheme: 'osaka', minScore: 3.1, regions: [{ area: 'A270101', region: 'umeda' }], caps: { S: { default: 3 }, sameType: 2 } });
  const by = Object.fromEntries(out.map((c) => [c.key, c]));
  assert.equal(by['tabelog-3'].status, 'over-limit');
  assert.equal(by['tabelog-4'].status, 'included');
  assert.equal(by['tabelog-5'].status, 'not-included');
});

test('candidates add：衝突、取代', () => {
  const cands = [{ key: 'a', v: 1 }];
  assert.deepEqual(addCandidates(cands, [{ key: 'a', v: 2 }]).conflicts, ['a']);
  const r = addCandidates(cands, [{ key: 'a', v: 2 }, { key: 'b' }], { replace: true });
  assert.deepEqual(r.result, [{ key: 'a', v: 2 }, { key: 'b' }]);
  assert.equal(r.added, 1);
  assert.throws(() => addCandidates([], [{ key: 'x' }, { key: 'x' }]));
});
