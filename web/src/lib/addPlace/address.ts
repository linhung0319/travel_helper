// 判斷一段文字像不像日本地址（T31）。刻意從嚴：店名、地名（鳥羽市場、おはらい町）不能被當成地址。

const HAN = String.raw`\p{Script=Han}`;

const RULES: RegExp[] = [
  // (a) 都道府県 緊接著 ○○市区町村郡：三重県鳥羽市、北海道札幌市
  new RegExp(`${HAN}[都道府県]${HAN}+[市区町村郡]`, 'u'),
  // (b) ○市區町村郡 之後有數字：鳥羽市相差町1238
  new RegExp(`${HAN}[市区町村郡].*\\d`, 'u'),
  // (c) 丁目
  /丁目/,
  // (d) 漢字緊接著「數字-數字」的門牌：鳥羽1-2-3
  new RegExp(`${HAN}\\d+-\\d+`, 'u'),
];

export function looksLikeAddress(s: string): boolean {
  // 全形數字、連字號統一；日期（2027-02-02）不算門牌
  const t = s.normalize('NFKC').replace(/\d{4}-\d{1,2}-\d{1,2}/g, '');
  return RULES.some((r) => r.test(t));
}
