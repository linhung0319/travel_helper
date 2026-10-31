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
