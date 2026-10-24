// 規劃模式的拖曳（設計 §4）：拖的是什麼（DragSource）、放在哪（DropTargetInfo），算出放開時要做什麼。
// 卡片上下各 1/4 高是插入（before／after），中間是合併；不能合併時中間照上下半插入。
// 純函式，不碰畫面；planDrag.ts 每次移動都呼叫，標記和放開的動作照這個結果。

/** 拖的東西：時間軸的卡片（options：幾個選項）、這天的候選、合併卡片正在看的備卡 */
export type DragSource =
  | { kind: 'item'; itemId: string; placeType: string | null; options: number }
  | { kind: 'candidate'; candidateId: number; placeId: string; placeType: string | null }
  | { kind: 'option'; itemId: string; index: number; placeType: string | null };

/** 放的地方：某張卡片、這天最後的放置區、候選區 */
export type DropTargetInfo = { kind: 'card'; itemId: string; placeType: string | null; isFlight: boolean } | { kind: 'end' } | { kind: 'candidates' };

export type DropIntent = 'merge' | 'before' | 'after' | 'none';

/** 拖的東西能不能合併到這張卡片：同類型、都不是住宿、不是整張有備卡的卡片、目標不是航班 */
export function canMerge(src: DragSource, target: Extract<DropTargetInfo, { kind: 'card' }>): boolean {
  if (target.isFlight) return false;
  if (src.kind === 'item' && src.options > 1) return false;
  if (!src.placeType || !target.placeType) return false;
  if (src.placeType === 'lodging' || target.placeType === 'lodging') return false;
  return src.placeType === target.placeType;
}

/** 放開時要做什麼；rect、clientY 是目標卡片的位置和游標的高度（只有 card 用得到） */
export function dropIntent(src: DragSource, target: DropTargetInfo, rect: { top: number; height: number }, clientY: number): DropIntent {
  if (target.kind === 'end') return 'after';
  if (target.kind === 'candidates') return src.kind === 'option' ? 'after' : 'none';
  if (src.kind !== 'candidate' && src.itemId === target.itemId) return 'none';
  const y = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5;
  if (y < 0.25) return 'before';
  if (y > 0.75) return 'after';
  if (canMerge(src, target)) return 'merge';
  return y < 0.5 ? 'before' : 'after';
}
