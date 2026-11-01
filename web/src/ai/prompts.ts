// 問 AI 的建議問題（規格 §6）：照脈絡晶片的種類；地點的問題沿用 shared/askAiPrompts.ts。

import type { Place } from '../data/types.ts';
import { askAiPrompts } from '../shared/askAiPrompts.ts';
import type { ChatContext } from './types.ts';

export function promptsFor(c: ChatContext, place?: Place): string[] {
  switch (c.kind) {
    case 'place':
      if (c.itemId) return ['這天排它會不會太趕？', '換一家類似的', '前後怎麼去？'];
      return place ? askAiPrompts(place.type, false) : [];
    case 'day':
      return ['幫我檢查這天', '午餐吃哪裡？', '長輩會不會太累？'];
    case 'trip':
      return ['哪天最趕？', '哪幾晚還沒定住宿？'];
    case 'list':
      return c.source === 'wish' ? ['把還沒排的分到各天', '大家最想去的是？'] : ['挑 3 家最適合全員的', '這些哪幾家適合長輩？'];
  }
}

export interface StarterInput {
  /** 正在看的那天；null＝整趟 */
  day: string | null;
  /** 還沒排住宿的晚上 */
  nightsMissing: number;
  /** 行程裡的警告數 */
  warnings: number;
  /** 有人想去、還沒排進行程的點 */
  wishesUnplaced: number;
}

const MAX_STARTERS = 3;

/** 空白的新對話要推薦的問題：照使用者現在的狀況挑，最有用的在前面；不夠時用示範句補滿 */
export function startersFor(i: StarterInput): string[] {
  const m = i.day ? /^\d{4}-(\d{2})-(\d{2})$/.exec(i.day) : null;
  return [
    ...(m ? [`幫我檢查 ${Number(m[1])}/${Number(m[2])}`] : []),
    ...(i.nightsMissing > 0 ? ['哪幾晚還沒定住宿？'] : []),
    ...(i.warnings > 0 ? ['哪天最趕？'] : []),
    ...(i.wishesUnplaced > 0 ? ['把想去的排進行程'] : []),
    '鳥羽能坐 15 人的海鮮餐廳',
    '長輩走起來輕鬆的景點',
  ].slice(0, MAX_STARTERS);
}

/** 一次帶著的所有晶片：多個地點時問比較、怎麼排；其他照最後一個（剛帶進來的） */
export function promptsForAll(contexts: ChatContext[], last: ChatContext | undefined, place?: Place): string[] {
  const places = contexts.filter((c) => c.kind === 'place').length;
  if (places >= 2) return [`比較這 ${places} 家`, `這 ${places} 個排哪天比較順？`];
  return last ? promptsFor(last, place) : [];
}
