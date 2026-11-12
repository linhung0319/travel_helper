// scripts/lib/restaurant-cand.mjs、candidates-add.mjs、restaurant-candidates.mjs 的測試（T9c）。執行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { typeOf, contextsOf, autoExclusion, criteriaAC, criteriaOsaka, criteriaGS, meibutsuOf, budgetMax, roomMax } from '../lib/restaurant-cand.mjs';
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

// 京都的名物規則（T86c，👤 2026-11-12）：和 rules.json 寫的一樣
const KYOTO = {
  first: ['豆腐料理', '日本料理', '京料理', 'そば', 'うどん', 'ラーメン', 'つけ麺', '寿司', 'うなぎ'],
  any: ['豆腐料理', '棒寿司'],
  budgetMax: { 日本料理: 5999, 京料理: 5999 },
  sameAs: { つけ麺: 'ラーメン', そば: 'そば・うどん', うどん: 'そば・うどん', 棒寿司: '寿司', 京料理: '日本料理' },
};

test('名物從 rules 讀（T86c）：第一項、任一項、預算上限、同類歸併', () => {
  assert.equal(meibutsuOf({ genre: 'つけ麺、ラーメン' }, KYOTO), 'ラーメン');
  assert.equal(meibutsuOf({ genre: 'そば、天ぷら' }, KYOTO), 'そば・うどん');
  // 日本料理：昼預算上限 5,999 円以下才算；沒有昼看夜；沒有預算不算
  assert.equal(meibutsuOf({ genre: '日本料理', dinner: '10000～14999', lunch: '4000～4999' }, KYOTO), '日本料理');
  assert.equal(meibutsuOf({ genre: '日本料理', dinner: '30000～39999', lunch: '10000～14999' }, KYOTO), null);
  assert.equal(meibutsuOf({ genre: '日本料理', dinner: '20000～29999' }, KYOTO), null);
  assert.equal(meibutsuOf({ genre: '日本料理' }, KYOTO), null);
  // 第一項的日本料理太貴，但任一項有豆腐料理 → 算豆腐料理
  assert.equal(meibutsuOf({ genre: '日本料理、豆腐料理', lunch: '8000～9999' }, KYOTO), '豆腐料理');
  // 任一項：居酒屋裡的棒寿司
  assert.equal(meibutsuOf({ genre: '居酒屋、寿司、棒寿司' }, KYOTO), '寿司');
  // 第二項的 ラーメン 不算
  assert.equal(meibutsuOf({ genre: '中華料理、食堂、ラーメン' }, KYOTO), null);
  // 沒給規則 → 大阪的清單
  assert.equal(meibutsuOf({ genre: 'うどんすき' }), 'うどん');
  assert.equal(meibutsuOf({ genre: 'ラーメン' }), null);
  // 甘味：過 S 的門檻才算，標 sweet；平價的喫茶店照舊不算
  const sweets = { genres: ['甘味処'] };
  assert.deepEqual(criteriaGS({ score: 3.76, reviews: 2279, genre: '甘味処、和菓子、かき氷', lunch: '1000～1999' }, {}, { meibutsu: KYOTO, sweets }), { criteria: ['S'], meibutsu: null, sweet: true });
  assert.deepEqual(criteriaGS({ score: 3.2, reviews: 2279, genre: '甘味処' }, {}, { meibutsu: KYOTO, sweets }).criteria, []);
  assert.deepEqual(criteriaGS({ score: 3.73, reviews: 1901, genre: '喫茶店、ケーキ', lunch: '1000～1999' }, {}, { meibutsu: KYOTO, sweets }).criteria, []);
  assert.deepEqual(criteriaGS({ score: 3.76, reviews: 2279, genre: '甘味処', lunch: '1000～1999' }, {}, { meibutsu: KYOTO }).criteria, []);
});

test('build（gs，京都）：名物照 rules、車站對子地區排在 area 前、甘味另計不佔 S 名額', () => {
  const { shops } = mergeLists([{ name: 'gion-rt-1.txt', text: page('祇園', [
    '1|山元麺蔵|うどん|3.95|2840|||1000～1999|駅:東山駅 600m|||A2601-A260301|',
    '2|おかる|うどん、そば、食堂|3.59|1432||1000～1999|1000～1999|駅:祇園四条駅 250m|||A2601-A260301|',
    '3|松葉|そば、食堂|3.49|861|水曜日|1000～1999|1000～1999|駅:祇園四条駅 50m|||A2601-A260301|',
    '4|権兵衛|うどん、そば|3.5|800||1000～1999|1000～1999|駅:祇園四条駅 300m|||A2601-A260301|',
    '5|いづう|日本料理、寿司、棒寿司|3.69|700|火曜日|2000～2999|2000～2999|駅:祇園四条駅 300m|||A2601-A260301|',
    '6|洋食|洋食、オムライス|3.65|1216||1000～1999|1000～1999|駅:祇園四条駅 300m|||A2601-A260301|',
    '7|徳屋|甘味処、和菓子、かき氷|3.76|2279||1000～1999|1000～1999|駅:祇園四条駅 300m|||A2601-A260301|',
    '8|鍵善|甘味処、和菓子、カフェ|3.78|1969||1000～1999|1000～1999|駅:祇園四条駅 200m|||A2601-A260301|',
    '9|料亭|日本料理|3.9|900||30000～39999|10000～14999|駅:祇園四条駅 200m|完全個室有(2〜20人可)||A2601-A260301|',
  ]) }]);
  const out = build(shops, {
    scheme: 'gs',
    minScore: 3.1,
    regions: [{ re: '^駅:(東山|蹴上)駅', region: 'okazaki' }, { area: 'A260301', region: 'higashiyama' }],
    meibutsu: KYOTO,
    sweets: { genres: ['甘味処'] },
    caps: { G: { default: 1 }, S: { default: 3 }, sweets: { higashiyama: 1 }, sameType: 2 },
  });
  const by = Object.fromEntries(out.map((c) => [c.key, c]));
  assert.equal(by['tabelog-1'].region, 'okazaki');
  assert.equal(by['tabelog-1'].status, 'included');
  assert.equal(by['tabelog-2'].status, 'included'); // そば・うどん 第 1
  assert.equal(by['tabelog-3'].status, 'included'); // そば・うどん 第 2
  assert.equal(by['tabelog-4'].status, 'over-limit'); // そば・うどん 第 3（そば、うどん 算同一類）
  assert.equal(by['tabelog-5'].status, 'included'); // 棒寿司在第三項、日本料理 2,999 円以下
  assert.equal(by['tabelog-6'].status, 'over-limit'); // 平價，排在名物後、名額滿了
  assert.equal(by['tabelog-7'].status, 'included'); // 甘味第 1，不佔 S 的 3 家
  assert.equal(by['tabelog-8'].status, 'over-limit');
  assert.match(by['tabelog-8'].reason, /甘味/);
  assert.equal(by['tabelog-9'].status, 'included'); // G：料亭太貴不算名物，但有 20 人個室
  assert.deepEqual(by['tabelog-9'].criteria, ['G']);
  assert.equal(by['tabelog-1'].links.tabelog, 'https://tabelog.com/kyoto/A2601/A260301/1/');
});

test('build（gs）：沒寫 caps.sweets 的子地區不收甘味；沒寫 meibutsu 就只有平價', () => {
  const { shops } = mergeLists([{ name: 'otsu-rt-1.txt', text: page('大津', [
    '1|力餅|甘味処|3.67|901||～999|～999||||A2501-A250101|',
    '2|かねよ|うなぎ|3.5|694||5000～5999|3000～3999||||A2501-A250101|',
    '3|ラーメン|ラーメン|3.49|641||～999|～999||||A2501-A250101|',
  ]) }]);
  const out = build(shops, { scheme: 'gs', minScore: 3.1, regions: [{ area: 'A250101', region: 'otsu' }], sweets: { genres: ['甘味処'] }, caps: { S: { default: 3 } } });
  const by = Object.fromEntries(out.map((c) => [c.key, c]));
  assert.equal(by['tabelog-1'].status, 'over-limit');
  assert.equal(by['tabelog-2'].status, 'not-included');
  assert.equal(by['tabelog-3'].status, 'included');
  assert.equal(by['tabelog-3'].links.tabelog, 'https://tabelog.com/shiga/A2501/A250101/3/');
});

test('candidates add：衝突、取代', () => {
  const cands = [{ key: 'a', v: 1 }];
  assert.deepEqual(addCandidates(cands, [{ key: 'a', v: 2 }]).conflicts, ['a']);
  const r = addCandidates(cands, [{ key: 'a', v: 2 }, { key: 'b' }], { replace: true });
  assert.deepEqual(r.result, [{ key: 'a', v: 2 }, { key: 'b' }]);
  assert.equal(r.added, 1);
  assert.throws(() => addCandidates([], [{ key: 'x' }, { key: 'x' }]));
});
