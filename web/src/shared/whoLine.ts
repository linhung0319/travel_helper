// 「誰想去」的字（T76，interaction-design §35.7、35.9）：列的一行和詳情動作列下面那行。純函式，PlaceRow、PlaceDetail 用。
// 自己一律排第一、寫「你」；別人照按的順序。

/** 自己排第一，其他人照原本的順序 */
export const meFirst = (ids: readonly string[], me: string | null | undefined): string[] => [...ids.filter((id) => id === me), ...ids.filter((id) => id !== me)];

/** 列的「誰想去」（§35.7）：「你、小林、阿姨 想去」；最多寫 max 個名字，多的寫「等 N 人」；沒人是空字串 */
export function whoText(ids: readonly string[], me: string | null | undefined, nameOf: (id: string) => string, max = 3): string {
  if (!ids.length) return '';
  const order = meFirst(ids, me);
  const names = order.slice(0, max).map((id) => (id === me ? '你' : nameOf(id)));
  return `${names.join('、')}${order.length > max ? ` 等 ${order.length} 人` : ''} 想去`;
}

/**
 * 詳情動作列下面那行（§35.9）：「你想去，小林、阿姨也想去」「你想去，家人都看得到」「小林、阿姨想去，你還沒按」「還沒有人按想去」。
 * others 是自己以外按想去的人；mine 是自己按了沒有
 */
export function detailWhoText(others: readonly string[], mine: boolean, nameOf: (id: string) => string): string {
  const names = others.map(nameOf).join('、');
  if (mine) return others.length ? `你想去，${names}也想去` : '你想去，家人都看得到';
  return others.length ? `${names}想去，你還沒按` : '還沒有人按想去';
}
