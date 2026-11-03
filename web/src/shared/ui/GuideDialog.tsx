// 引導彈窗（interaction-design §17.1，T46）：取代原本整趟最上面的開始卡。網頁、手機共用。
// 入口是地圖右上的「排行程 1/4」（進度圈加字，GuideButton）；全部完成後只剩 ✓，不消失。手機另外在面板拉到最高時放在日期列的「整趟」旁邊。
// 彈窗四步，每一步的按鈕帶到那一層：① 去探索 ② 去整趟（選區）③ 問 AI 住宿 ④ 問 AI 第一個還沒排的天。
// 看行程本身的狀態（lib/tripStart.ts 的 guideProgress），家人什麼時候進來都看到同一份進度；不自己跳出來（§17 不做開場導覽）。

import type { ReactNode } from 'react';
import { Dialog } from '../../components/common.tsx';
import { Icon } from '../../components/Icon.tsx';
import { useData } from '../../hooks.ts';
import { GUIDE_STEPS, guideCurrent, guideProgress, type GuideAsk } from '../../lib/tripStart.ts';
import { closeDialog, openDialog } from '../../uiStore.ts';
import { useStarterInput } from '../useStarterInput.ts';
import { Button } from './Button.tsx';

/** 每一步的按鈕要做的事（網頁、手機各自給：分頁、聊天室的位置不一樣） */
export interface GuideActions {
  explore(): void;
  trip(): void;
  ask(step: GuideAsk): void;
}

function useGuide() {
  const ready = useData((s) => !!s.itinerary);
  const progress = guideProgress(useStarterInput());
  return { ready, progress };
}

const RING_R = 9;
const RING_C = 2 * Math.PI * RING_R;

/** 進度圈：灰底一圈，抹茶色畫完成的比例；全部完成是抹茶色實心加 ✓ */
function Ring({ done }: { done: number }) {
  if (done >= GUIDE_STEPS) {
    return (
      <span className="ui-guide-ring all" aria-hidden>
        <Icon name="check" size={16} />
      </span>
    );
  }
  return (
    <svg className="ui-guide-ring" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r={RING_R} className="track" />
      <circle cx="12" cy="12" r={RING_R} className="fill" strokeDasharray={`${(done / GUIDE_STEPS) * RING_C} ${RING_C}`} transform="rotate(-90 12 12)" />
    </svg>
  );
}

/** 地圖右上的入口（網頁、手機都是） */
export function GuideButton({ className = '', testId = 'guide-button' }: { className?: string; testId?: string }) {
  const { ready, progress } = useGuide();
  if (!ready) return null;
  const all = progress.done >= GUIDE_STEPS;
  const count = `${progress.done}/${GUIDE_STEPS}`;
  return (
    <button
      type="button"
      className={`ui-guide-btn ${all ? 'all' : ''} ${className}`}
      aria-label={all ? '排行程：四步都完成了' : `排行程 ${count}`}
      aria-haspopup="dialog"
      onClick={() => openDialog({ kind: 'guide' })}
      data-testid={testId}
      data-done={progress.done}
    >
      <Ring done={progress.done} />
      {!all && <span>{`排行程 ${count}`}</span>}
    </button>
  );
}

function Step({ n, done, current, title, note, action }: { n: number; done: boolean; current: boolean; title: ReactNode; note?: string; action: (kind: 'primary' | 'secondary') => ReactNode }) {
  return (
    <li className={`ui-guide-step ${done ? 'done' : ''}`} data-testid={`guide-step-${n}`} data-done={done}>
      <span className="ui-guide-mark" aria-hidden>
        {done ? <Icon name="check" size={16} /> : n}
      </span>
      <span className="ui-guide-text">
        <b>{title}</b>
        {note && <small>{note}</small>}
      </span>
      {!done && action(current ? 'primary' : 'secondary')}
    </li>
  );
}

export function GuideDialog({ actions }: { actions: GuideActions }) {
  const { ready, progress } = useGuide();
  if (!ready) return null;
  const current = guideCurrent(progress);
  /** 先關彈窗再帶過去 */
  const go = (fn: () => void) => () => {
    closeDialog();
    fn();
  };
  const ask = (step: GuideAsk) => (kind: 'primary' | 'secondary') => (
    <Button kind={kind} size="sm" icon="spark" onClick={go(() => actions.ask(step))} data-testid={`guide-ask-${step}`}>
      問 AI
    </Button>
  );
  return (
    <Dialog title="排行程" onClose={closeDialog} testId="guide-dialog">
      <div className="ui-guide-progress">
        <div className="ui-guide-bar" aria-hidden>
          <i style={{ width: `${(progress.done / GUIDE_STEPS) * 100}%` }} />
        </div>
        <span data-testid="guide-count">
          {progress.done} / {GUIDE_STEPS}
        </span>
      </div>
      <ol className="ui-guide-steps">
        <Step
          n={1}
          done={progress.liked}
          current={current === 1}
          title={
            <>
              逛逛各區，喜歡的按 <Icon name="heart" size={16} />
            </>
          }
          note="從探索的概覽開始"
          action={(kind) => (
            <Button kind={kind} size="sm" onClick={go(actions.explore)} data-testid="guide-explore">
              去探索
            </Button>
          )}
        />
        <Step
          n={2}
          done={progress.areas}
          current={current === 2}
          title="決定每晚住哪一區"
          note="在整趟；不用一次全部設完"
          action={(kind) => (
            <Button kind={kind} size="sm" onClick={go(actions.trip)} data-testid="guide-trip">
              去整趟
            </Button>
          )}
        />
        <Step n={3} done={progress.lodging} current={current === 3} title="選住宿" note="已經訂好的也可以先加進來" action={ask('lodging')} />
        <Step n={4} done={progress.stops} current={current === 4} title="一天一天排景點、餐廳" action={ask('day')} />
      </ol>
      {current === null && (
        <p className="ui-guide-all" data-testid="guide-all-done">
          <Icon name="check" size={16} /> 每天都排了東西，接下來可以問 AI 整趟檢查一次。
        </p>
      )}
    </Dialog>
  );
}
