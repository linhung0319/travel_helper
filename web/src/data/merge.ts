// 預設資料套上修改層（architecture §3.2）：合併規則和 Worker 用同一份（worker/src/lib/merge.ts），
// 在瀏覽器合併。T15m 的修改紀錄從假後端來，T15 從 GET /api/edits。

import { applyEdits, type Edit } from '../../../worker/src/lib/merge.ts';
import { normalizePlace } from './normalize.ts';
import type { FieldEdit, Place } from './types.ts';
import type { PlaceEdit } from '../backend/types.ts';

const toEdit = (e: PlaceEdit): Edit => ({
  id: e.id,
  placeId: e.placeId,
  fieldPath: e.fieldPath,
  value: e.value,
  baseValue: e.baseMissing ? { present: false } : { present: true, value: e.baseValue },
  author: e.author,
  createdAt: e.createdAt,
  revertedAt: e.revertedAt,
  closedAt: e.closedAt,
});

/** 有修改的點重新正規化；沒修改的點原樣回傳（同一個物件，React 不用重畫） */
export function mergePlaceEdits(base: Place[], edits: PlaceEdit[]): Place[] {
  const byPlace = new Map<string, PlaceEdit[]>();
  for (const e of edits) byPlace.set(e.placeId, [...(byPlace.get(e.placeId) ?? []), e]);
  if (byPlace.size === 0) return base;
  return base.map((p) => {
    const list = byPlace.get(p.id);
    if (!list) return p;
    const merged = applyEdits(p.raw, list.map(toEdit));
    if (Object.keys(merged.edited).length === 0) return p;
    const next = normalizePlace(merged.data);
    if (!next) return p;
    const editedFields: Record<string, FieldEdit> = {};
    for (const [path, info] of Object.entries(merged.edited)) {
      const e = list.find((x) => x.id === info.editId)!;
      editedFields[path] = { editId: info.editId, author: info.author, at: info.createdAt, baseValue: e.baseMissing ? null : e.baseValue };
    }
    return { ...next, edited: editedFields };
  });
}

/** 詳情面板的「已修改」：這一區的欄位（`group`、`group.fit15`…）有沒有被改過，回傳最新的一筆 */
export function editedUnder(place: Place, ...fields: string[]): FieldEdit | null {
  let latest: FieldEdit | null = null;
  for (const [path, info] of Object.entries(place.edited)) {
    const top = path.split('.')[0];
    if (!fields.includes(top) && !fields.includes(path)) continue;
    if (!latest || info.at > latest.at) latest = info;
  }
  return latest;
}
