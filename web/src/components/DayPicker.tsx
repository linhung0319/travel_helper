// 「加到某天」（interaction-design §12）：卡片底部的主要按鈕，點了開一個彈窗（網頁）或底部面板（手機，Dialog 在手機就是底部面板），
// 裡面是 12 天的日期格（shared/ui/DayGrid12，多選）：已經是候選的日期選好，已排進行程的日期寫「已排」（不能點）。選好了按「好」才存：
// 新選的日期加成候選，取消的拿掉（自己加的）。探索的卡片也有，加進候選時自己還沒按想去就順手按。
// 另外 DayStatusTag 是卡片照片左上角（或名稱後面）的「候選 2/5、2/8」「已排 2/5」。

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { shared } from '../appShared.ts';
import { useData, useShared } from '../hooks.ts';
import { placeDayStatus } from '../lib/wishlist.ts';
import { shortDayLabel } from '../lib/trip.ts';
import { castVote } from './Votes.tsx';
import { Dialog } from './common.tsx';
import { Icon } from './Icon.tsx';
import { Button } from '../shared/ui/Button.tsx';
import { DayGrid12 } from '../shared/ui/DayGrid12.tsx';

/** 日期格彈窗：candidate 預先選好、已排的寫「已排」（不能點）；別人加的候選鎖住；按「好」才存。onClose 是關掉；testId 預設 day-picker（想去列的日曆鈕用 wish-add-pop） */
export function DayPicker({ placeId, onClose, testId = 'day-picker' }: { placeId: string; onClose: () => void; testId?: string }) {
  const candidates = useShared((s) => s.candidates);
  const me = useShared((s) => s.me?.id);
  const itinerary = useData((s) => s.itinerary);
  const status = placeDayStatus(placeId, candidates, itinerary);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<string[]>(status.candidate);
  // 這個點這天的候選：自己和別人都加過時用自己的（不在編輯也能撤回）
  const candidateOn = (date: string) => {
    const list = candidates.filter((x) => x.placeId === placeId && x.day === date && !x.deletedAt);
    return list.find((x) => x.addedBy === me) ?? list[0];
  };
  // 別人加的候選：在格子裡一律鎖住，只能從候選卡的「拿掉」（要寫理由）處理
  const locked = status.candidate.filter((d) => candidateOn(d)?.addedBy !== me);
  const change = (next: string[]) => setDraft(next);
  const save = async () => {
    setBusy(true);
    const add = draft.filter((d) => !status.candidate.includes(d) && !status.scheduled.includes(d));
    const remove = status.candidate.filter((d) => !draft.includes(d));
    let added = 0;
    for (const d of add) if ((await shared.addCandidate(placeId, d)).ok) added++;
    // 加進候選＝想去：自己還沒按想去就按（每人對每個點只有一個狀態，原本是不想去的會換成想去）
    if (added > 0 && !shared.store.getState().votes.some((v) => v.placeId === placeId && v.memberId === me && v.value === 'like' && !v.deletedAt)) await castVote(placeId, 'like');
    for (const d of remove) {
      const c = candidateOn(d);
      if (c?.addedBy === me) await shared.removeCandidate(c.id);
    }
    setBusy(false);
    onClose();
  };
  return (
    <Dialog
      title="加到某天"
      onClose={onClose}
      testId={testId}
      footer={
        <>
          <span className="muted day-picker-count" data-testid="day-picker-count">
            已選 {draft.length} 天
          </span>
          <Button kind="primary" disabled={busy} onClick={() => void save()} data-testid="day-picker-done">
            好
          </Button>
        </>
      }
    >
      <DayGrid12 mode="multi" picked={draft} scheduled={status.scheduled} locked={locked} onChange={change} disabled={busy} testId={(d) => `day-picker-${d}`} />
    </Dialog>
  );
}

/** 卡片底部的「加到某天」按鈕，點了開日期格 */
export function AddToDay({ placeId }: { placeId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="add-to-day">
      <Button kind="primary" size="sm" icon="calendar" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="add-to-day">
        加到某天
      </Button>
      {open && createPortal(<DayPicker placeId={placeId} onClose={() => setOpen(false)} />, document.body)}
    </div>
  );
}

/** 行程狀態的 tag：`候選 2/5、2/8`、`已排 2/5`；都沒有就不畫 */
export function DayStatusTag({ placeId }: { placeId: string }) {
  const candidates = useShared((s) => s.candidates);
  const itinerary = useData((s) => s.itinerary);
  const { candidate, scheduled } = placeDayStatus(placeId, candidates, itinerary);
  if (!candidate.length && !scheduled.length) return null;
  const days = (list: string[]) => list.map(shortDayLabel).join('、');
  return (
    <span className="day-status-tags" data-testid="card-status-tag">
      {candidate.length > 0 && <span className="day-status cand ic-text">
          <Icon name="calendar" size={16} /> 候選 {days(candidate)}
        </span>}
      {scheduled.length > 0 && <span className="day-status scheduled ic-text">
          <Icon name="check" size={16} /> 已排 {days(scheduled)}
        </span>}
    </span>
  );
}
