// 資料欄位的固定值 → 顯示用的中文（值的清單見 CONVENTIONS §3）

export const SCORE_LABELS: Record<string, string> = {
  recommend: '推薦',
  localFlavor: '在地特色',
  groupFit: '15 人',
  elderFit: '長輩',
  kidsFit: '小孩',
  winterFit: '2 月',
  accessEase: '交通',
  meals: '餐食',
};

export const FIT15_LABELS: Record<string, string> = { yes: '可以', split: '要分桌或分批', no: '坐不下', unknown: '不明' };
export const FIT_SUBGROUP_LABELS: Record<string, string> = { yes: '可以', no: '不行', unknown: '不明' };
export const RESERVATION_LABELS: Record<string, string> = { yes: '可以預約', no: '不接受預約', 'groups-only': '只有團體可以預約', unknown: '不明' };
export const METHOD_LABELS: Record<string, string> = {
  phone: '電話',
  web: '網路',
  'instagram-dm': 'IG 私訊',
  line: 'LINE',
  other: '其他',
  rakuten: '楽天',
  jalan: 'じゃらん',
  official: '官網',
};
export const SEATING_LABELS: Record<string, string> = {
  table: '椅子',
  zashiki: '榻榻米',
  horigotatsu: '下挖式',
  counter: '吧台',
  terrace: '露天',
  sofa: '沙發',
  other: '其他',
};
export const KIDS_ALLOWED_LABELS: Record<string, string> = { yes: '可以帶小孩', no: '不接受小孩', 'age-limit': '有年齡限制', unknown: '不明' };
export const KIDS_FRIENDLY_LABELS: Record<string, string> = { high: '很適合', medium: '還可以', low: '不太適合' };
export const MEALS_LABELS: Record<string, string> = { none: '不含餐', breakfast: '含早餐', 'dinner+breakfast': '一泊二食' };
export const LODGING_KIND_LABELS: Record<string, string> = {
  hotel: '飯店',
  ryokan: '旅館',
  minshuku: '民宿',
  'rental-house': '包棟',
  other: '其他',
};
export const CONFIDENCE_LABELS: Record<string, string> = { high: '根據充足', medium: '根據普通', low: '根據少' };
export const LINK_LABELS: Record<string, string> = {
  official: '官網',
  googleMaps: 'Google Maps',
  tabelog: '食べログ',
  instagram: 'Instagram',
  rakuten: '楽天トラベル',
  jalan: 'じゃらん',
  booking: 'Booking.com',
};

export function label(map: Record<string, string>, v: unknown): string | null {
  if (typeof v !== 'string') return null;
  return map[v] ?? v;
}
