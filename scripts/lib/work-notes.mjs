// T44a：給人看的欄位不能夾著整理資料時的筆記（「見 conflicts」「jeepe 說」這類）。
// validate 用；哪些欄位給人看，照詳情、AI 讀得到的範圍（worker/src/lib/placeLayers.ts 的 extra 白名單）。
import { EXTRA_LABELS } from '../../worker/src/lib/placeLayers.ts';

/** 不給人看的路徑（整個子樹略過）：來源、照片、連結、評分的依據、extra 裡不在白名單的鍵 */
const HIDDEN_TOP = new Set(['id', 'sources', 'photos', 'links', 'ratings', 'coordsSource', 'verified', 'rakutenHotelNo', 'googleName', 'aliases', 'name', 'address', 'stationNumber']);
const HIDDEN_SUB = { summary: new Set(['basedOn', 'generated']), assessment: new Set(['rubric', 'assessed', 'confidence']) };

/** 給人看的欄位的所有字串：[路徑, 文字, 所在的物件或陣列, 鍵]（後兩個給改寫用） */
export function* shownStrings(record) {
  function* walk(node, p, parent = record, key = p) {
    if (typeof node === 'string') yield [p, node, parent, key];
    else if (Array.isArray(node)) for (let i = 0; i < node.length; i++) yield* walk(node[i], `${p}[${i}]`, node, i);
    else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) yield* walk(v, p ? `${p}.${k}` : k, node, k);
  }
  if (!record || typeof record !== 'object') return;
  for (const [k, v] of Object.entries(record)) {
    if (HIDDEN_TOP.has(k)) continue;
    if (k === 'extra') {
      if (!v || typeof v !== 'object') continue;
      for (const [ek, ev] of Object.entries(v)) if (ek in EXTRA_LABELS) yield* walk(ev, `extra.${ek}`, v, ek);
      continue;
    }
    if (HIDDEN_SUB[k] && v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [sk, sv] of Object.entries(v)) if (!HIDDEN_SUB[k].has(sk)) yield* walk(sv, `${k}.${sk}`, v, sk);
      continue;
    }
    yield* walk(v, k);
  }
}

/** 只當研究來源、畫面上沒有評分的網站：「X 說」看的人不知道是誰（Google、食べログ、楽天、じゃらん 在評論分頁有分數，可以寫） */
const RESEARCH_SITES = 'jeepe|4travel|フォートラベル|HAMONI|Retty|まっぷる|mapple|MAPPLE|るるぶ|KNT|asoview|アソビュー|いこーよ|Relux|ぐるなび|ホットペッパー|Yahoo|トリップアドバイザー|TripAdvisor';

/** 整理資料時的筆記：[規則名稱, 正規式, 說明] */
export const WORK_NOTE_RULES = [
  ['field-ref', /見 ?(?:conflicts|notes|questions|sources|README|extra\b|extra\.|data\/)|另見 ?extra/, '指向資料欄位（「見 conflicts」這類）；衝突寫進 extra.conflicts，這裡寫給人看的結論'],
  ['file-name', /[A-Za-z0-9_-]+\.(?:json|md|mjs|ts)\b/, '檔名（stations.json、geo.mjs 這類）；寫給人看的說法（「不在車站資料裡」「直線估算」）'],
  ['tool', /OSRM|scripts\/|係數 1/, '工具名稱（OSRM、scripts/）；寫「路線估算」，出處放 sources'],
  ['task-id', /(?<![A-Za-z0-9])T(?:[3-9]|[1-9]\d)[a-z]?(?![A-Za-z0-9])/, '任務 ID（T8g 這類）；規則、改了什麼記在任務的結果，不寫在給人看的欄位'],
  ['site-says', new RegExp(`(?:${RESEARCH_SITES}) ?[^，。；、\\s]{0,6}說`), '研究來源的網站名加「說」；寫「心得說」「評論說」，網站放 sources'],
  ['site-subscore', /4travel ?(?:無障礙|バリアフリー)/, '研究來源的細項分數；寫結論（例如「無障礙的評價偏低」），分數放 sources 的 note'],
];

/** 一筆資料點裡給人看的欄位有沒有整理時的筆記：[{ path, rule, hint, match }] */
export function findWorkNotes(record) {
  const out = [];
  for (const [p, s] of shownStrings(record)) {
    for (const [rule, re, hint] of WORK_NOTE_RULES) {
      const m = s.match(re);
      if (m) out.push({ path: p, rule, hint, match: s.slice(Math.max(0, m.index - 12), m.index + m[0].length + 12) });
    }
  }
  return out;
}
