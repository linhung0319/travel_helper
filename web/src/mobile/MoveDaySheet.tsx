// 手機版動作面板裡的「📅 移到第幾天…」子畫面（第六輪 §2.5、§3.5）：網頁版的 4 欄 × 3 列格子（DayGrid）直接重用，只換外框；
// 每格 testid 是 m-move-日期，現在那天不能點、寫「現在」，週六日、國定假日紅字。
// 卡片（造訪、自由時間、分組）：放到那天的最後（moveItemToDay），留在這天、跳「已移到 2/4（四）」的提示（可以復原）；
// 自己加的候選：在那天加成候選、這天的拿掉（同網頁版的 MoveCandidateDialog）。移好了就關面板。

import { useState } from 'react';
import { moveItemToDay } from '@travel-helper/engine';
import { shared } from '../appShared.ts';
import { useData, useShared } from '../hooks.ts';
import { findItemRef } from '../lib/planView.ts';
import { dayLabel } from '../lib/trip.ts';
import { DayGrid } from '../components/DayGrid.tsx';

/** 卡片或候選移到別天；onDone：移好了（關面板） */
export function MoveDaySheet({ itemId, candidateId, label, onDone }: { itemId?: string; candidateId?: number; label: string; onDone: () => void }) {
  const itinerary = useData((s) => s.itinerary);
  const cand = useShared((s) => (candidateId != null ? s.candidates.find((c) => c.id === candidateId) : undefined));
  const [busy, setBusy] = useState(false);
  const ref = itemId ? findItemRef(itinerary, itemId) : null;
  const current = ref?.date ?? cand?.day;
  if (!current) return null;

  /** 移過去：卡片可以復原；候選先加到那天、成功了才拿掉這天的 */
  const move = async (date: string) => {
    setBusy(true);
    let ok = false;
    if (itemId) {
      const text = `已移到 ${dayLabel(date)}・${label}`;
      ok = (await shared.changeItinerary((it) => moveItemToDay(it, itemId, date), `${label} 移到 ${dayLabel(date)}`, { undo: { text } })).ok;
    } else if (cand) {
      const r = await shared.addCandidate(cand.placeId, date);
      if (r.ok) await shared.removeCandidate(cand.id, undefined, true);
      ok = r.ok;
    }
    setBusy(false);
    if (ok) onDone();
  };

  return (
    <div className="m-move-sheet" data-testid="m-move-sheet">
      <DayGrid current={current} disabled={busy} onPick={(d) => void move(d)} testId={(d) => `m-move-${d}`} />
      <p className="muted small">
        放在那天的最後，順序可以再調。
        {ref?.split ? `現在在${ref.split.groupName}，移過去會變成全員一起。` : ''}
      </p>
    </div>
  );
}
