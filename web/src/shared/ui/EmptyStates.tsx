// 空白的地方說下一步（interaction-design §17.4），網頁、手機共用：想去頁沒有東西、某一天還沒排。按鈕做什麼由各平台給。

import { Icon } from '../../components/Icon.tsx';
import { useStarterInput } from '../useStarterInput.ts';
import { Button } from './Button.tsx';

/** 想去頁沒有東西：三格小圖說明 ♡ → 候選 → 行程 */
export function WishEmpty({ onExplore, onAsk }: { onExplore: () => void; onAsk: () => void }) {
  return (
    <div className="ui-wish-empty" data-testid="wish-empty">
      <h3>
        還沒有人按 <Icon name="heart" size={16} />
      </h3>
      <ol className="ui-flow" aria-label="想去、候選、行程">
        <li>
          <Icon name="heart" size={20} />
          <b>想去</b>
          <small>喜歡就按</small>
        </li>
        <li>
          <Icon name="calendar" size={20} />
          <b>候選</b>
          <small>加到某天</small>
        </li>
        <li>
          <Icon name="list" size={20} />
          <b>行程</b>
          <small>編輯時排進去</small>
        </li>
      </ol>
      <p>
        大家按的 <Icon name="heart" size={16} /> 都會出現在這裡，數字代表幾個人想去
      </p>
      <div className="ui-empty-actions">
        <Button kind="primary" size="sm" onClick={onExplore} data-testid="wish-empty-explore">
          去探索
        </Button>
        <Button kind="secondary" size="sm" icon="spark" onClick={onAsk} data-testid="wish-empty-ask">
          問 AI 推薦
        </Button>
      </div>
    </div>
  );
}

/** 某一天還沒排：虛線框，住宿附近大家想去的有幾個 */
export function DayEmpty({ date, onAsk, onWish, testId }: { date: string; onAsk: () => void; onWish: () => void; testId: string }) {
  const nearby = useStarterInput().days.find((d) => d.date === date)?.nearbyWishes ?? 0;
  return (
    <div className="ui-day-empty" data-testid={testId}>
      <b>這天還沒排</b>
      <p>{nearby > 0 ? `住宿附近大家想去的有 ${nearby} 個` : '問 AI，或從大家想去的點挑'}</p>
      <div className="ui-empty-actions">
        <Button kind="secondary" size="sm" icon="spark" onClick={onAsk} data-testid="day-empty-ask">
          問 AI
        </Button>
        <Button kind="secondary" size="sm" onClick={onWish} data-testid="day-go-wish">
          從想去挑
        </Button>
      </div>
    </div>
  );
}
