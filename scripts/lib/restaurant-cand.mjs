// 餐廳候選（CONVENTIONS §4 步驟 7）的規則部分：食べログ列表的一家店 → 類型、contexts、A／C 判斷（T9c 新增）。
// 規則照 CONVENTIONS「餐廳候選納入標準」和 data/raw/ise/log/T8c.md 的「納入判斷細則」；要判斷的（D、E、F、B、排除的例外、子地區）由
// Claude 寫在 rules.json 的 overrides，這裡不猜。

// 食べログ類別第一項 → §5.3 的類型（T8c 第 1～3 批的對應表；沒列到的 → 其他）
const TYPE_MAP = [
  ['咖啡・甜點', ['甘味処', '和菓子', 'カフェ', 'スイーツ', 'ジェラート・アイスクリーム', 'ティースタンド', 'プリン', 'ソフトクリーム', 'フルーツパーラー', '喫茶店', 'ジューススタンド', 'カステラ', 'パン', 'クレープ・ガレット', 'せんべい', 'コーヒースタンド', 'ケーキ', 'チョコレート', '売店', 'たい焼き・大判焼き', 'かき氷', '洋菓子', 'ドーナツ', 'パンケーキ', 'サンドイッチ']],
  ['烏龍麵・蕎麥', ['うどん', 'そば', '麺類', '沖縄そば', 'カレーうどん']],
  ['壽司', ['寿司', '立ち食い寿司', '回転寿司']],
  ['定食・食堂', ['食堂', '郷土料理', '定食']],
  ['海鮮丼', ['海鮮', '海鮮丼']],
  ['和食・割烹', ['豆腐料理', '日本料理', '料理旅館', 'うなぎ', 'ふぐ', '天ぷら', '旅館・民宿', 'オーベルジュ', '懐石・会席料理', '割烹・小料理']],
  ['燒肉・肉料理', ['ステーキ', '牛料理', 'しゃぶしゃぶ', '焼肉', '鳥料理', '串焼き', '焼き鳥', '鉄板焼き', 'すき焼き', 'バーベキュー', 'ホルモン']],
  ['牡蠣', ['かき']],
  ['伊勢海老・高級海鮮', ['伊勢海老', 'あわび']],
  ['洋食・義式', ['洋食', 'イタリアン', 'フレンチ', 'ビストロ', 'メキシコ料理', 'バル', 'ピザ', 'ハンバーグ', 'ハンバーガー', 'スペイン料理', 'ヨーロッパ料理', 'パスタ', 'オムライス']],
  ['居酒屋', ['居酒屋', '串揚げ', 'ろばた焼き']],
];
export const BAR_GENRES = ['バー', '日本酒バー', 'ワインバー', 'ビアバー', 'ダイニングバー', 'スナック'];
// 「其他」裡只賣小吃、外帶類的（contexts 給 snack）
const SNACK_OTHER = ['惣菜・デリ', 'おにぎり', '肉まん', 'からあげ', 'コロッケ', 'たこ焼き', '揚げ物', '弁当'];

export const firstGenre = (genre) => (genre ?? '').split('、')[0].trim();

export function typeOf(genre) {
  const g = firstGenre(genre);
  for (const [t, list] of TYPE_MAP) if (list.includes(g)) return t;
  return '其他';
}

// 初步的 contexts（T8c：只是初步，餐廳詳細的任務依營業時間修正）
export function contextsOf(shop) {
  const t = typeOf(shop.genre);
  const g = firstGenre(shop.genre);
  const cafe = /カフェ|喫茶/.test(shop.genre ?? '');
  if (t === '咖啡・甜點' || (t === '其他' && SNACK_OTHER.includes(g))) return cafe ? ['snack', 'cafe'] : ['snack'];
  const out = [];
  if (shop.lunch || !shop.dinner) out.push('lunch');
  if (shop.dinner) out.push('dinner');
  return out;
}

// 排除（規則能判斷的）：バー類、便利商店、閉店・移転・休業
export function autoExclusion(shop) {
  const g = firstGenre(shop.genre);
  if (BAR_GENRES.includes(g)) return `食べログ類別第一項是${g} → 酒吧排除`;
  if (/コンビニ/.test(g)) return '便利商店';
  if (shop.status) return `食べログ標示「${shop.status}」`;
  return null;
}

// A、C（門檻可以依子地區改，數量控制用；能坐 15 人的店 C 照原門檻 3.10，見 CONVENTIONS「數量控制」）
export function criteriaAC(shop, { aScore = 3.3, aReviews = 10, cScore = 3.1, cReviews = 15, inFilter = false, big15 = false } = {}) {
  const out = [];
  const s = shop.score ?? 0;
  const n = shop.reviews ?? 0;
  if (s >= aScore && n >= aReviews) out.push('A');
  const cMin = big15 ? Math.min(cScore, 3.1) : cScore;
  if (inFilter && s >= cMin && n >= cReviews) out.push('C');
  return out;
}

// 列表的個室字樣「個室有(2〜30人可)」「個室有(4人、10〜20人可)」→ 最多人數（沒寫人數 → null）
export function roomMax(room) {
  const nums = [...String(room ?? '').matchAll(/(\d+)\s*人/g)].map((m) => Number(m[1]));
  const range = [...String(room ?? '').matchAll(/\d+\s*[〜～~-]\s*(\d+)/g)].map((m) => Number(m[1]));
  const all = [...nums, ...range];
  return all.length ? Math.max(...all) : null;
}

// G 全員／S 分組（CONVENTIONS §4「大阪（都市區）的做法」，T27c 加；T86c 把名物改成從 rules 讀，京都、琵琶湖共用），取代 A～F。
// S 的「名物和平價」：名物（rules.meibutsu），或昼的預算上限 1,999 円以下（沒有昼就看夜）；甜點、咖啡不算。
// rules.meibutsu（沒寫 → 大阪的 OSAKA_RULES）：
//   first：類別第一項是這些就算。只看第一項：「フレンチ、シーフード、串揚げ」這種不算串カツ店。
//   any：出現在類別任一項就算（京都的 豆腐料理、棒寿司：いづう 是「日本料理、寿司、棒寿司」）。
//   budgetMax：{ 類別: 上限 }，這幾類要昼預算上限（沒有昼看夜）在這以下才算（京都的 日本料理：排掉一人 1～4 萬円的料亭）；沒有預算 → 不算。
//   sameAs：{ 類別: 歸成哪一類 }，S 的同類型上限用（うどんすき 算 うどん；京都的 そば、うどん 算同一類）。
// rules.sweets（京都的抹茶甘味，👤 2026-11-12）：{ genres: ['甘味処'] }，類別第一項是這些、過 S 的分數門檻 → 也是 S，
//   但不佔 S 的名額，另外照 caps.sweets 取（沒寫上限的子地區不收）。
export const OSAKA_MEIBUTSU = ['たこ焼き', 'お好み焼き', 'もんじゃ焼き', '串揚げ', 'ふぐ', 'うどん', 'うどんすき', 'ホルモン', '肉まん'];
export const OSAKA_RULES = { first: OSAKA_MEIBUTSU, sameAs: { うどんすき: 'うどん' } };
export const genresOf = (genre) => (genre ?? '').split('、').map((g) => g.trim()).filter(Boolean);
// 列表的預算字樣「1000～1999」「～999」→ 上限（円）；空 → null
export const budgetMax = (s) => {
  const m = String(s ?? '').replace(/[￥,]/g, '').match(/(\d+)\s*$/);
  return m ? Number(m[1]) : null;
};
const budgetOf = (shop) => budgetMax(shop.lunch) ?? budgetMax(shop.dinner);
// 這家店算哪一類名物（照 sameAs 歸併後的類別名）；不是名物 → null
export function meibutsuOf(shop, m = OSAKA_RULES) {
  const list = genresOf(shop.genre);
  const ok = (g) => {
    const cap = m.budgetMax?.[g];
    if (cap == null) return true;
    const b = budgetOf(shop);
    return b != null && b <= cap;
  };
  const hit = (m.first?.includes(list[0]) && ok(list[0]) ? list[0] : null) ?? list.find((g) => m.any?.includes(g) && ok(g)) ?? null;
  return hit == null ? null : (m.sameAs?.[hit] ?? hit);
}
export const isMeibutsu = (genre) => meibutsuOf({ genre }) != null;
// 同類型上限用的類別：名物照 meibutsuOf，其他照類別第一項（也套 sameAs）
export const sameTypeKey = (shop, m = OSAKA_RULES) => meibutsuOf(shop, m) ?? m.sameAs?.[firstGenre(shop.genre)] ?? firstGenre(shop.genre);
// → { criteria: ['G', 'S'], meibutsu: 類別或 null, sweet: 是不是只靠甘味進來的 }
export function criteriaGS(shop, { gScore = 3.1, gReviews = 15, sScore = 3.3, sReviews = 50, cheapMax = 1999 } = {}, { meibutsu = OSAKA_RULES, sweets = null } = {}) {
  const criteria = [];
  const s = shop.score ?? 0;
  const n = shop.reviews ?? 0;
  const max = roomMax(shop.room);
  if (s >= gScore && n >= gReviews && max != null && max >= 15) criteria.push('G');
  const kind = meibutsuOf(shop, meibutsu);
  const budget = budgetOf(shop);
  const cheap = budget != null && budget <= cheapMax && typeOf(shop.genre) !== '咖啡・甜點';
  const sweet = !!sweets?.genres?.includes(firstGenre(shop.genre));
  if (s >= sScore && n >= sReviews && (kind != null || cheap || sweet)) criteria.push('S');
  return { criteria, meibutsu: kind, sweet: sweet && kind == null && !cheap };
}
export const criteriaOsaka = (shop, th) => criteriaGS(shop, th).criteria;
