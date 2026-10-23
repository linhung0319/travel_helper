// 修改紀錄（architecture §3.2）：改過的欄位標「已修改（誰、何時）」，點了看紀錄、原本的值；自己的修改可以復原。
// 修改本身由 T16 的 AI 做（使用者說「這家週三公休」，AI 提議、使用者確認）。

import { shared } from '../appShared.ts';
import { useData, useShared } from '../hooks.ts';
import { closeDialog, openDialog } from '../uiStore.ts';
import { editedUnder } from '../data/merge.ts';
import type { FieldEdit, Place } from '../data/types.ts';
import type { PlaceEdit } from '../backend/types.ts';
import { Dialog, MemberName, stamp } from './common.tsx';

/** 欄位的顯示名稱（沒列的直接顯示路徑） */
const FIELD_LABELS: Record<string, string> = {
  hours: '營業時間',
  closedNote: '公休',
  febNote: '2 月的注意事項',
  closures: '休業期間',
  group: '團體',
  'group.fit15': '全員 15 人',
  'group.fitSubgroup': '分組 4～6 人',
  'group.seats': '席數',
  'group.maxReservation': '最多預約',
  reservation: '預約',
  'reservation.accepted': '預約',
  'reservation.phone': '電話',
  accessibility: '長輩',
  kids: '小孩',
  price: '價格',
  prices: '價格',
  summary: '介紹',
};

export const fieldLabel = (path: string) => FIELD_LABELS[path] ?? path;

function show(v: unknown): string {
  if (v === null || v === undefined) return '（空）';
  if (typeof v === 'string') return v;
  const s = JSON.stringify(v);
  return s.length > 160 ? `${s.slice(0, 160)}…` : s;
}

/** 「已修改（誰、何時）」：點了開修改紀錄 */
export function EditedMark({ placeId, info, fields }: { placeId: string; info: FieldEdit; fields?: string[] }) {
  return (
    <button
      type="button"
      className="edited"
      title="看修改紀錄"
      data-testid="edited-mark"
      onClick={() => openDialog({ kind: 'history', placeId, field: fields?.join(',') })}
    >
      已修改（<MemberName id={info.author} />・{stamp(info.at)}）
    </button>
  );
}

/** 給 Section、Row 用：這幾個欄位裡最新的修改 */
export function editedOf(place: Place, ...fields: string[]): { placeId: string; info: FieldEdit; fields: string[] } | null {
  const info = editedUnder(place, ...fields);
  return info ? { placeId: place.id, info, fields } : null;
}

function matches(e: PlaceEdit, fields: string[] | null) {
  if (!fields) return true;
  return fields.some((f) => e.fieldPath === f || e.fieldPath.startsWith(`${f}.`) || f.startsWith(`${e.fieldPath}.`));
}

export function HistoryDialog({ placeId, field }: { placeId: string; field?: string }) {
  const p = useData((s) => s.byId.get(placeId));
  const edits = useShared((s) => s.edits);
  const me = useShared((s) => s.me?.id);
  const fields = field ? field.split(',') : null;
  const list = edits.filter((e) => e.placeId === placeId && matches(e, fields)).sort((a, b) => b.id - a.id);
  // 每個欄位最新、還有效的那一筆才是現在的值
  const current = new Set<number>();
  const seen = new Set<string>();
  for (const e of list) {
    if (e.revertedAt || e.closedAt || seen.has(e.fieldPath)) continue;
    seen.add(e.fieldPath);
    current.add(e.id);
  }
  return (
    <Dialog title={`修改紀錄：${p ? p.name.zh || p.name.ja : placeId}`} onClose={closeDialog} testId="history-dialog">
      {list.length === 0 && <p className="muted">沒有修改紀錄。</p>}
      <ol className="history-list">
        {list.map((e) => (
          <li key={e.id} className={`history ${e.revertedAt ? 'reverted' : ''}`} data-testid="history-item">
            <div className="history-head">
              <strong>{fieldLabel(e.fieldPath)}</strong>
              <span className="muted small">
                <MemberName id={e.author} />・{stamp(e.createdAt)}
              </span>
              {current.has(e.id) && <span className="badge badge-good">現在的值</span>}
              {e.revertedAt && (
                <span className="badge">
                  已復原（<MemberName id={e.revertedBy} />）
                </span>
              )}
            </div>
            <div className="history-values small">
              <div>
                <span className="muted">改成</span> {show(e.value)}
              </div>
              <div>
                <span className="muted">原本</span> {e.baseMissing ? '（原本沒有這個欄位）' : show(e.baseValue)}
              </div>
              {e.note && (
                <div>
                  <span className="muted">理由</span> {e.note}
                </div>
              )}
            </div>
            {e.author === me && !e.revertedAt && !e.closedAt && (
              <button type="button" className="text-button" onClick={() => void shared.revertEdit(e.id)} data-testid="history-revert">
                ↩︎ 復原我的這筆修改
              </button>
            )}
          </li>
        ))}
      </ol>
      <p className="muted small">修改透過 AI 做（例如跟 AI 說「這家週三公休」）；改錯了就再改一次，或由改的人自己復原。</p>
    </Dialog>
  );
}
