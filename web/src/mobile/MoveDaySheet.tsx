// 手機版動作面板裡的「移到第幾天…」子畫面（第六輪 §2.5、§3.5）：網頁版的 4 欄 × 3 列格子（DayGrid12，單選）直接重用，只換外框；
// 每格 testid 是 m-move-日期，現在那天不能點、寫「現在」，週六日、國定假日紅字。
// 移的動作和網頁版的 MoveDialog、MoveCandidateDialog 同一份（cardActionRun.ts）：
// 卡片（造訪、自由時間、分組）放到那天的最後（moveItemToDayAction），留在這天、跳「已移到 2/4（四）」的提示（可以復原）；
// 自己加的候選（moveCandidateToDay）：在那天加成候選、成功了才拿掉這天的。移好了就關面板。

import { useState } from 'react';
import { useData, useShared } from '../hooks.ts';
import { findItemRef } from '../lib/planView.ts';
import { DayGrid12 } from '../shared/ui/DayGrid12.tsx';
import { moveCandidateToDay, moveItemToDayAction } from '../components/cardActionRun.ts';

/** 卡片或候選移到別天；onDone：移好了（關面板） */
export function MoveDaySheet({ itemId, candidateId, onDone }: { itemId?: string; candidateId?: number; onDone: () => void }) {
  const itinerary = useData((s) => s.itinerary);
  const cand = useShared((s) => (candidateId != null ? s.candidates.find((c) => c.id === candidateId) : undefined));
  const [busy, setBusy] = useState(false);
  const ref = itemId ? findItemRef(itinerary, itemId) : null;
  const current = ref?.date ?? cand?.day;
  if (!current) return null;

  const move = async (date: string) => {
    setBusy(true);
    const ok = itemId ? await moveItemToDayAction(itemId, date) : cand ? await moveCandidateToDay(cand.id, date) : false;
    setBusy(false);
    if (ok) onDone();
  };

  return (
    <div className="m-move-sheet" data-testid="m-move-sheet">
      <DayGrid12 mode="single" picked={[]} current={current} disabled={busy} onChange={([d]) => void move(d)} testId={(d) => `m-move-${d}`} />
      <p className="muted small">
        放在那天的最後，順序可以再調。
        {ref?.split ? `現在在${ref.split.groupName}，移過去會變成全員一起。` : ''}
      </p>
    </div>
  );
}
