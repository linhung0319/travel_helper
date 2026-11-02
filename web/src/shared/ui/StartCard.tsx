// 整趟頁最上面的「開始排行程」卡（interaction-design §17.1），網頁、手機共用：三步、進度條。
// 看行程本身的狀態，家人什麼時候進來都看到同一份進度；前兩步做完收成一列；三步都完成收成一行，按 ✕ 或 3 天後不再出現（記在這台裝置）。

import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon.tsx';
import { useData } from '../../hooks.ts';
import { readJson, writeJson } from '../../lib/onceHint.ts';
import { EMPTY_START_MEMORY, nextStartMemory, startCardView, startProgress, type StartCardMemory } from '../../lib/tripStart.ts';
import { useStarterInput } from '../useStarterInput.ts';
import { Button } from './Button.tsx';

const MEMORY_KEY = 'th.startCard';

function Step({ n, done, title, note, action }: { n: number; done: boolean; title: React.ReactNode; note?: string; action: React.ReactNode }) {
  return (
    <li className={`ui-start-step ${done ? 'done' : ''}`} data-testid={`start-step-${n}`} data-done={done}>
      <span className="ui-start-mark" aria-hidden>
        {done ? <Icon name="check" size={16} /> : n}
      </span>
      <span className="ui-start-text">
        <b>{title}</b>
        {note && <small>{note}</small>}
      </span>
      {!done && action}
    </li>
  );
}

export function StartCard({ onExplore, onAsk }: { onExplore: () => void; onAsk: (step: 2 | 3) => void }) {
  const ready = useData((s) => !!s.itinerary);
  const input = useStarterInput();
  const progress = startProgress(input);
  const [memory, setMemory] = useState<StartCardMemory>(() => readJson(MEMORY_KEY, EMPTY_START_MEMORY));

  useEffect(() => {
    if (!ready) return;
    const next = nextStartMemory(progress, memory, new Date().toISOString());
    if (next === memory) return;
    setMemory(next);
    writeJson(MEMORY_KEY, next);
  }, [ready, progress.done]); // eslint-disable-line react-hooks/exhaustive-deps -- 進度變了才記

  if (!ready) return null;
  const view = startCardView(progress, memory, Date.now());
  if (view === 'hidden') return null;
  if (view === 'done') {
    return (
      <section className="ui-start ui-start-done" data-testid="start-card" data-view="done">
        <Icon name="check" size={16} />
        <span>每天都排了東西</span>
        <button
          type="button"
          className="ui-start-close"
          aria-label="收起"
          data-testid="start-card-close"
          onClick={() => {
            const next = { ...memory, dismissed: true };
            setMemory(next);
            writeJson(MEMORY_KEY, next);
          }}
        >
          <Icon name="close" size={16} />
        </button>
      </section>
    );
  }
  const ask = (step: 2 | 3) => (
    <Button kind="secondary" size="sm" icon="spark" onClick={() => onAsk(step)} data-testid="start-ask">
      問 AI
    </Button>
  );
  const bar = (
    <div className="ui-start-bar" aria-hidden>
      <i style={{ width: `${(progress.done / 3) * 100}%` }} />
    </div>
  );
  return (
    <section className="ui-start" data-testid="start-card" data-view={view}>
      {view === 'steps' && (
        <header className="ui-start-head">
          <h3>開始排行程</h3>
          <span data-testid="start-count">{progress.done} / 3</span>
        </header>
      )}
      {view === 'steps' && bar}
      <ol className="ui-start-steps" start={view === 'last' ? 3 : 1}>
        {view === 'steps' && (
          <>
            <Step
              n={1}
              done={progress.liked}
              title={
                <>
                  逛逛，喜歡的按 <Icon name="heart" size={16} />
                </>
              }
              action={
                <Button kind="secondary" size="sm" onClick={onExplore} data-testid="start-explore">
                  去探索
                </Button>
              }
            />
            <Step n={2} done={progress.lodging} title="決定每晚住哪" note="已經訂好的也可以先加進來" action={ask(2)} />
          </>
        )}
        <Step n={3} done={progress.stops} title="一天一天排景點、餐廳" action={ask(3)} />
      </ol>
      {view === 'last' && bar}
    </section>
  );
}
