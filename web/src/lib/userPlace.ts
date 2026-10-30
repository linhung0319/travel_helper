// 自己加的點（T31）在畫面上的幾個小判斷：Google Maps 連結、誰能刪、分頁、日期。
// 純函式，詳情、清單卡片都用；不碰 store，單元測試直接跑。

import type { Place } from '../data/types.ts';
import { memberName } from '../sharedStore.ts';
import type { Member } from '../backend/types.ts';

/** 詳情黃色提示框的全文 */
export const USER_PLACE_WARNING = '我們沒查過這個點：營業時間、能不能坐 15 人都不知道。排行程時只用位置估交通時間。';

export const isUserPlace = (p: Place): boolean => p.origin === 'user';

/** 「在 Google Maps 開啟」的網址：有存 links.googleMaps 就用，沒有用座標組一個（座標存的是 [經度, 緯度]） */
export function googleMapsUrl(p: Place): string {
  const saved = p.links.googleMaps;
  if (typeof saved === 'string' && saved) return saved;
  const [lon, lat] = p.coords;
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}

/** 刪除只有加的人看得到 */
export function canDeleteUserPlace(p: Place, meId: string | null | undefined): boolean {
  return p.origin === 'user' && !!p.user && !!meId && p.user.author === meId;
}

/** 自己加的點沒有評論分頁 */
export function hasReviewsTab(p: Place): boolean {
  return p.origin !== 'user';
}

/** 加的時間：M/D（本機時區）；讀不懂就空字串 */
export function addedDateLabel(createdAt: string): string {
  const d = new Date(createdAt);
  return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 清單卡片的副標：自己加的 · <加的人> */
export function userSubtitle(p: Place, members: Member[]): string {
  return `自己加的 · ${memberName(members, p.user?.author)}`;
}
