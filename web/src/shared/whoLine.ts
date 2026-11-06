// 「誰想去」的字（T76 §35.7、35.9；T82 §36.T82 改成 Instagram 式）：列的最底一行和詳情按鈕那排下面那行用同一句。純函式，PlaceRow、PlaceDetail 用。
// 自己一律排第一、寫「你」；別人照按的順序。

/** 自己排第一，其他人照原本的順序 */
export const meFirst = (ids: readonly string[], me: string | null | undefined): string[] => [...ids.filter((id) => id === me), ...ids.filter((id) => id !== me)];

/**
 * 「你和阿姨 想去」「你想去」「小林、阿姨 想去，你還沒按」；沒人按是空字串（整行不出現）。
 * ids 是按想去的人（含自己）；別人最多寫 max 個名字，多的寫「等 N 人」（N 是全部的人數，含自己）
 */
export function whoText(ids: readonly string[], me: string | null | undefined, nameOf: (id: string) => string, max = 3): string {
  if (!ids.length) return '';
  const mine = !!me && ids.includes(me);
  const others = ids.filter((id) => id !== me);
  const shown = others.slice(0, mine ? max - 1 : max).map(nameOf);
  const more = others.length > shown.length ? ` 等 ${ids.length} 人` : '';
  if (mine) return others.length ? `你和${shown.join('、')}${more} 想去` : '你想去';
  return `${shown.join('、')}${more} 想去，你還沒按`;
}
