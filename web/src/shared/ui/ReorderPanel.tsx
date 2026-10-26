// 「⋯ → 調整順序」的子畫面（第七輪 §6.4，網頁的 ⋯ 選單、手機的動作面板共用）：不拖也能換順序、合併成備選。
// 上一列寫「第 n 站（共 m 站）」；上移、下移可以連按（存好之前先不能按，免得兩下算成同一個位置）；
// 「和哪一張合併成備選…」打開清單（同一天、同一組裡同類型的卡），選了就合併、關掉（onDone）。
// 動作在 cardActionRun.ts（reorderStep、mergeItemAction），行程的位置照 lib/dropIntent.ts 的 reorderInfo。

import { useState } from 'react';
import { useData, useShared } from '../../hooks.ts';
import { mergeItemAction, reorderState, reorderStep } from '../../components/cardActionRun.ts';
import { Icon } from '../../components/Icon.tsx';

/** 調整順序：itemId 是哪張卡；onDone：合併好了（關選單、關面板） */
export function ReorderPanel({ itemId, onDone }: { itemId: string; onDone: () => void }) {
  const itinerary = useData((s) => s.itinerary);
  const saving = useShared((s) => s.saving);
  const [picking, setPicking] = useState(false);
  const r = reorderState(itinerary, itemId);
  if (!r) return null;
  const merge = async (target: string) => {
    await mergeItemAction(itemId, target);
    onDone();
  };
  return (
    <div className="reorder" data-testid="reorder-panel">
      <p className="reorder-pos muted small" data-testid="reorder-pos">
        第 {r.index + 1} 張（共 {r.count} 張）
      </p>
      <button type="button" className="reorder-btn" disabled={saving || r.up == null} onClick={() => void reorderStep(itemId, -1)} data-testid="reorder-up">
        <span className="reorder-icon up" aria-hidden>
          <Icon name="chevron" size={20} />
        </span>
        <span>上移</span>
      </button>
      <button type="button" className="reorder-btn" disabled={saving || r.down == null} onClick={() => void reorderStep(itemId, 1)} data-testid="reorder-down">
        <span className="reorder-icon down" aria-hidden>
          <Icon name="chevron" size={20} />
        </span>
        <span>下移</span>
      </button>
      <button type="button" className="reorder-btn" disabled={!r.merge.length} aria-expanded={picking} onClick={() => setPicking(!picking)} data-testid="reorder-merge">
        <Icon name="list" size={20} />
        <span>和哪一張合併成備選…</span>
      </button>
      {picking && (
        <ul className="reorder-targets" data-testid="reorder-targets">
          {r.merge.map((m) => (
            <li key={m.itemId}>
              <button type="button" className="reorder-btn reorder-target" disabled={saving} onClick={() => void merge(m.itemId)} data-testid="reorder-merge-target" data-item={m.itemId}>
                {m.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!r.merge.length && <p className="muted small">這天沒有同類型的卡可以合併。</p>}
    </div>
  );
}
