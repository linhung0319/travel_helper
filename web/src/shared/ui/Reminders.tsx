// 提醒的清單和數字（T74b，interaction-design §34.3；網頁、手機共用）：
// 清單一條一行——要處理的（act）紅字前面 ⚠，留意的（note）墨色小字前面「·」；有名字的寫「喫茶 Mori：不接受預約…」。
// 數字——有要處理的「⚠ N」（N 只數要處理）、只有留意的「· N」；紅色只給要處理。

import type { EngineWarning } from '@travel-helper/engine';
import { Icon } from '../../components/Icon.tsx';
import { reminderCounts } from '../../lib/planView.ts';

export type ReminderItem = Pick<EngineWarning, 'level' | 'message'> & { name?: string | null };

/** 鈕的等級：有要處理的是 act（紅框），只有留意的是 note（淡框） */
export const reminderLevel = (list: readonly Pick<EngineWarning, 'level'>[] | undefined): EngineWarning['level'] => (reminderCounts(list).act > 0 ? 'act' : 'note');

/** 點開後的清單 */
export function ReminderList({ list, className = '', testId = 'reminders' }: { list: readonly ReminderItem[] | undefined; className?: string; testId?: string }) {
  if (!list?.length) return null;
  return (
    <ul className={`tl-warnings ${className}`} data-testid={testId}>
      {list.map((w, i) => {
        const text = w.name ? `${w.name}：${w.message}` : w.message;
        return (
          <li key={i} className={`warning-${w.level}`} data-level={w.level} title={text}>
            {w.level === 'act' ? (
              <Icon name="warn" size={16} />
            ) : (
              <span className="warning-dot" aria-hidden>
                ·
              </span>
            )}
            <span className="warning-text">{text}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** 鈕上的字：「⚠ N」或「· N」；一條都沒有是 null */
export function ReminderCount({ list }: { list: readonly Pick<EngineWarning, 'level'>[] | undefined }) {
  const c = reminderCounts(list);
  if (c.act > 0)
    return (
      <>
        <Icon name="warn" size={16} /> {c.act}
      </>
    );
  if (c.note > 0)
    return (
      <>
        <span className="warning-dot" aria-hidden>
          ·
        </span>{' '}
        {c.note}
      </>
    );
  return null;
}
