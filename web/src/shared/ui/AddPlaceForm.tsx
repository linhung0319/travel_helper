// 加地點的確認畫面表單本體（T31 spec §3）：來源標籤、名稱、類型膠囊、備註、錯誤、按鈕。
// 網頁放右欄、手機放整頁的下半（Task 7），表單一樣；位置（圖釘）在地圖上，不在這裡。
// 加完（或修改完）關掉表單，叫地圖看一下那個新點（commands.focus）。

import { addPlaceStore, useAddPlace } from '../../addPlaceStore.ts';
import { commands } from '../../appCommands.ts';
import { Button } from './Button.tsx';
import { Chip } from './Chip.tsx';
import type { AddedVia, UserPlaceType } from '../../backend/types.ts';

const TYPES: { id: UserPlaceType; label: string }[] = [
  { id: 'spot', label: '景點' },
  { id: 'restaurant', label: '餐廳' },
  { id: 'lodging', label: '住宿' },
];

/** 來源標籤：修改時不顯示；打名稱找不到的（search）也是在地圖上指位置 */
const VIA_LABEL: Partial<Record<AddedVia, string>> = {
  'google-link': '從 Google Maps 連結',
  address: '從地址',
  map: '在地圖上指的',
  search: '在地圖上指的',
};

export function AddPlaceForm({ surface }: { surface: 'mobile' | 'desktop' }) {
  const draft = useAddPlace((s) => s.draft);
  const saving = useAddPlace((s) => s.saving);
  const error = useAddPlace((s) => s.error);
  if (!draft) return null;
  const edit = draft.mode === 'edit';
  const via = edit ? null : VIA_LABEL[draft.via];
  const ready = !!draft.name.trim() && !!draft.type;
  const patch = addPlaceStore.getState().patch;

  const save = async () => {
    const r = await addPlaceStore.getState().save();
    if (r.ok) commands.focus(r.id);
  };

  return (
    <form
      className={`apf apf-${surface}`}
      data-testid="add-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) void save();
      }}
    >
      {via && <span className="apf-via" data-testid="add-via">{via}</span>}
      <label className="apf-field">
        <span className="apf-label">名稱</span>
        <input type="text" value={draft.name} onChange={(e) => patch({ name: e.target.value })} data-testid="add-name" autoComplete="off" />
      </label>
      <div className="apf-field" role="group" aria-label="類型">
        <span className="apf-label">類型</span>
        <div className="apf-types">
          {TYPES.map((t) => (
            <Chip key={t.id} on={draft.type === t.id} onClick={() => patch({ type: t.id })} testId={`add-type-${t.id}`}>
              {t.label}
            </Chip>
          ))}
        </div>
      </div>
      <label className="apf-field">
        <span className="apf-label">備註（選填）</span>
        <input type="text" value={draft.note} placeholder="例：朋友推薦，週三休" onChange={(e) => patch({ note: e.target.value })} data-testid="add-note" autoComplete="off" />
      </label>
      {error && (
        <p className="apf-error" role="alert" data-testid="add-error">
          {error}
        </p>
      )}
      <div className="apf-actions">
        <Button kind="primary" type="submit" disabled={!ready || saving} data-testid="add-save">
          {edit ? '儲存修改' : '加進來，大家都看得到'}
        </Button>
        <Button kind="secondary" onClick={() => addPlaceStore.getState().cancel()} data-testid="add-cancel">
          取消
        </Button>
      </div>
    </form>
  );
}
