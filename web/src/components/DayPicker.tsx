// 「📅 加到某天」（interaction-design §12）：卡片底部的實心主色按鈕，點了展開 2/2～2/13 的小月曆（星期一開頭，一列七天）。
// 已經是候選的日期打勾，已排進行程的日期標 ✓；點日期就加入或取消候選。探索的卡片也有，加進候選時自己還沒按 ❤️ 就順手按。
// 另外 DayStatusTag 是卡片照片左上角（或名稱後面）的「📅 候選 2/5、2/8」「✓ 已排 2/5」。

import { useState } from 'react';
import { shared } from '../appShared.ts';
import { useApp, useData, useShared } from '../hooks.ts';
import { placeDayStatus } from '../lib/wishlist.ts';
import { shortDayLabel, tripDates, weekdayZh } from '../lib/trip.ts';
import { openDialog } from '../uiStore.ts';
import { castVote } from './Votes.tsx';

const WEEK = ['一', '二', '三', '四', '五', '六', '日'];
const DATES = tripDates();

/** 日期在星期一開頭的那一列是第幾格（0～6） */
const column = (date: string) => WEEK.indexOf(weekdayZh(date));

/** 月曆的格子：前面補空格讓第一天落在對的星期，後面補到整列 */
function cells(): (string | null)[] {
  const out: (string | null)[] = [...Array<null>(column(DATES[0])).fill(null), ...DATES];
  while (out.length % 7) out.push(null);
  return out;
}

/** 小月曆：candidate 打勾、已排標 ✓（不能點）；點日期加入或取消候選。onClose 是「完成」 */
export function DayPicker({ placeId, onClose }: { placeId: string; onClose: () => void }) {
  const candidates = useShared((s) => s.candidates);
  const me = useShared((s) => s.me?.id);
  const itinerary = useData((s) => s.itinerary);
  const planning = useApp((s) => s.planning);
  const status = placeDayStatus(placeId, candidates, itinerary);
  const [busy, setBusy] = useState(false);
  // 這個點這天的候選：自己和別人都加過時用自己的（不在編輯也能撤回）
  const candidateOn = (date: string) => {
    const list = candidates.filter((x) => x.placeId === placeId && x.day === date && !x.deletedAt);
    return list.find((x) => x.addedBy === me) ?? list[0];
  };
  const click = async (date: string) => {
    const c = candidateOn(date);
    setBusy(true);
    if (!c) {
      const r = await shared.addCandidate(placeId, date);
      // 加進候選＝想去：自己還沒按 ❤️ 就按（每人對每個點只有一個狀態，原本是 👎 的會換成 ❤️）
      if (r.ok && !shared.store.getState().votes.some((v) => v.placeId === placeId && v.memberId === me && v.value === 'like' && !v.deletedAt)) await castVote(placeId, 'like');
    } else if (c.addedBy === me) await shared.removeCandidate(c.id);
    else {
      // 別人加的：編輯時才能拿掉，要寫理由
      openDialog({ kind: 'reject', candidateId: c.id });
      onClose();
    }
    setBusy(false);
  };
  return (
    <div className="day-picker" role="group" aria-label="加到哪天的候選" data-testid="day-picker" onClick={(e) => e.stopPropagation()}>
      <div className="day-picker-grid">
        {WEEK.map((w) => (
          <span key={w} className="day-picker-week muted small">
            {w}
          </span>
        ))}
        {cells().map((d, i) => {
          if (!d) return <span key={`blank-${i}`} />;
          const scheduled = status.scheduled.includes(d);
          const cand = status.candidate.includes(d);
          const others = cand && !planning && candidateOn(d)?.addedBy !== me;
          return (
            <button
              key={d}
              type="button"
              className={`day-picker-day ${cand ? 'cand' : ''} ${scheduled ? 'scheduled' : ''}`}
              aria-pressed={cand}
              disabled={busy || scheduled || others}
              title={others ? '別人加的候選，編輯時才能拿掉' : scheduled ? `${shortDayLabel(d)} 已排進行程` : cand ? `${shortDayLabel(d)} 的候選（再點取消）` : `加到 ${shortDayLabel(d)} 的候選`}
              data-testid={`day-picker-${d}`}
              onClick={() => void click(d)}
            >
              <span>{Number(d.slice(8))}</span>
              {(cand || scheduled) && <span className="day-picker-mark">{scheduled ? '✓' : '☑'}</span>}
            </button>
          );
        })}
      </div>
      <button type="button" className="text-button small" onClick={onClose}>
        完成
      </button>
    </div>
  );
}

/** 卡片底部的「📅 加到某天」按鈕，點了在下面展開小月曆 */
export function AddToDay({ placeId }: { placeId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="add-to-day">
      <button type="button" className="button small primary" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="add-to-day">
        📅 加到某天
      </button>
      {open && <DayPicker placeId={placeId} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** 行程狀態的 tag：`📅 候選 2/5、2/8`、`✓ 已排 2/5`；都沒有就不畫 */
export function DayStatusTag({ placeId }: { placeId: string }) {
  const candidates = useShared((s) => s.candidates);
  const itinerary = useData((s) => s.itinerary);
  const { candidate, scheduled } = placeDayStatus(placeId, candidates, itinerary);
  if (!candidate.length && !scheduled.length) return null;
  const days = (list: string[]) => list.map(shortDayLabel).join('、');
  return (
    <span className="day-status-tags" data-testid="card-status-tag">
      {candidate.length > 0 && <span className="day-status cand">📅 候選 {days(candidate)}</span>}
      {scheduled.length > 0 && <span className="day-status scheduled">✓ 已排 {days(scheduled)}</span>}
    </span>
  );
}
