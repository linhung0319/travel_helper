// 詳細資料裡「✨ 問 AI」的建議問題（設計 §2.6），依地點類型不同。

import type { Place } from '../data/types.ts';

const SPOT = ['長輩走得上去嗎？', '下雨的話換哪裡？', '排進哪一天比較順？', '附近能坐 15 人的午餐'];
const RESTAURANT = ['15 人坐得下嗎？', '要預約嗎、怎麼訂？', '附近還有哪家可以替代？'];
const LODGING = ['能包棟嗎？', '離車站多遠、要叫幾台計程車？', '一泊二食的晚餐是什麼？'];

/** 建議問題；從行程打開的，最前面多一個「這天排它會不會太趕？」。沒列到的類型用景點那組 */
export function askAiPrompts(type: Place['type'], fromTrip: boolean): string[] {
  const list = type === 'restaurant' ? RESTAURANT : type === 'lodging' ? LODGING : SPOT;
  return fromTrip ? ['這天排它會不會太趕？', ...list] : [...list];
}
