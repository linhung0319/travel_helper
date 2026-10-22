// 預設資料層＋修改層的合併規則（architecture §3.2）和重新匯入時的三方比對（§3.4）。
// 純函式：Worker 和匯入腳本（scripts/db-import.mjs）共用，Node 用 type stripping 直接跑。

/** 修改指到的位置：最上層欄位，或往下一層（`group.maxSeats`） */
export type FieldPath = [string] | [string, string];

const SEGMENT = /^[A-Za-z][A-Za-z0-9_]*$/;
/** 不能改的欄位：ID 是連接所有東西的關鍵，type 決定用哪個 schema */
export const PROTECTED_FIELDS = new Set(['id', 'type']);

/** `hours`、`group.maxSeats` → ['hours']、['group', 'maxSeats']；格式不對回傳 null */
export function parseFieldPath(path: string): FieldPath | null {
  const segs = path.split('.');
  if (segs.length < 1 || segs.length > 2 || !segs.every((s) => SEGMENT.test(s))) return null;
  if (PROTECTED_FIELDS.has(segs[0])) return null;
  return segs as FieldPath;
}

export interface Lookup {
  present: boolean;
  value?: unknown;
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

export function getAt(obj: unknown, path: FieldPath): Lookup {
  let cur: unknown = obj;
  for (const seg of path) {
    if (!isObject(cur) || !Object.hasOwn(cur, seg)) return { present: false };
    cur = cur[seg];
  }
  return { present: true, value: cur };
}

/** 複製一份再改：值整個取代那個位置（陣列也整個取代）。上一層不是物件（null、沒有）就建一個新的物件 */
export function setAt<T extends Record<string, unknown>>(obj: T, path: FieldPath, value: unknown): T {
  const out: Record<string, unknown> = { ...obj };
  if (path.length === 1) {
    out[path[0]] = value;
  } else {
    const parent = isObject(out[path[0]]) ? { ...(out[path[0]] as Record<string, unknown>) } : {};
    parent[path[1]] = value;
    out[path[0]] = parent;
  }
  return out as T;
}

/** JSON 值的相等（物件不管鍵的順序） */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => jsonEqual(x, b[i]));
  if (isObject(a)) {
    if (!isObject(b)) return false;
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && jsonEqual(a[k], b[k]));
  }
  return false;
}

const lookupEqual = (a: Lookup, b: Lookup) => a.present === b.present && (!a.present || jsonEqual(a.value, b.value));

/** 一筆修改（值已經從 JSON 文字解開） */
export interface Edit {
  id: number;
  placeId: string;
  fieldPath: string;
  value: unknown;
  /** 修改時的預設值；present: false＝預設資料沒有這個欄位 */
  baseValue: Lookup;
  author: string;
  createdAt: string;
  revertedAt: string | null;
  closedAt: string | null;
}

/** 還有效的修改：沒有復原、沒有在匯入時收掉 */
export const isActive = (e: Edit) => !e.revertedAt && !e.closedAt;

/** 每個欄位最新一筆、還有效的修改（id 越大越新），照 id 由舊到新排好 */
export function effectiveEdits(edits: Edit[]): Edit[] {
  const latest = new Map<string, Edit>();
  for (const e of edits) {
    if (!isActive(e)) continue;
    const cur = latest.get(e.fieldPath);
    if (!cur || e.id > cur.id) latest.set(e.fieldPath, e);
  }
  return [...latest.values()].sort((a, b) => a.id - b.id);
}

export interface EditedField {
  editId: number;
  author: string;
  createdAt: string;
}

export interface Merged<T> {
  data: T;
  /** 被改過的欄位（field_path → 最新那筆修改），給畫面標「已修改（誰、何時）」 */
  edited: Record<string, EditedField>;
}

/**
 * 預設資料套上修改。由舊到新套用，所以 `group` 整個換掉之後再改 `group.maxSeats` 會保留，
 * 反過來先改 `group.maxSeats` 再整個換掉 `group`，就以後來的 `group` 為準。
 */
export function applyEdits<T extends Record<string, unknown>>(base: T, edits: Edit[]): Merged<T> {
  let data = base;
  const edited: Record<string, EditedField> = {};
  for (const e of effectiveEdits(edits)) {
    const path = parseFieldPath(e.fieldPath);
    if (!path) continue;
    data = setAt(data, path, e.value);
    edited[e.fieldPath] = { editId: e.id, author: e.author, createdAt: e.createdAt };
  }
  return { data, edited };
}

/**
 * 重新匯入時，內容變了的點，逐筆修改做三方比對（architecture §3.4）：
 * - keep：新的預設值 ＝ base_value（預設值沒變）→ 保留使用者的修改
 * - same：新的預設值 ＝ 使用者改的值（兩邊改成一樣）→ 這筆修改收掉
 * - conflict：三個都不一樣 → 列成衝突，不自動決定
 */
export type ThreeWay = 'keep' | 'same' | 'conflict';

export function threeWay(edit: Pick<Edit, 'fieldPath' | 'value' | 'baseValue'>, newBase: unknown): ThreeWay {
  const path = parseFieldPath(edit.fieldPath);
  const next: Lookup = path ? getAt(newBase, path) : { present: false };
  if (lookupEqual(next, edit.baseValue)) return 'keep';
  if (next.present && jsonEqual(next.value, edit.value)) return 'same';
  return 'conflict';
}

/** D1 的一列 → Edit（JSON 文字解開；base_value 是 NULL 表示預設資料沒有這個欄位） */
export interface EditRow {
  id: number;
  place_id: string;
  field_path: string;
  value: string;
  base_value: string | null;
  author: string;
  created_at: string;
  reverted_at: string | null;
  closed_at: string | null;
}

export function editFromRow(r: EditRow): Edit {
  return {
    id: r.id,
    placeId: r.place_id,
    fieldPath: r.field_path,
    value: JSON.parse(r.value),
    baseValue: r.base_value === null ? { present: false } : { present: true, value: JSON.parse(r.base_value) },
    author: r.author,
    createdAt: r.created_at,
    revertedAt: r.reverted_at,
    closedAt: r.closed_at,
  };
}
