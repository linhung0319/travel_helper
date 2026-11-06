// 主題列「玩／吃／住」（T76，interaction-design §35.3、35.6）：三格，格子裡圓章（景、食、宿）＋大字＋小字「24 景點」。
// 選到的那格用那一類的淡底和外框色（景＝抹茶、食＝朱橘、宿＝紫）。概覽卡、地區頁、想去同一個元件；數字由呼叫的畫面給
// （lib/shelves.ts 的 themeCounts：目前地區或子地區那一類的總數，不看篩選）。概覽卡裡沒有選到的那格（value 給 null）。樣式在 ui.css（.tr-）。

import { THEMES, THEME_LABELS, type Theme } from '../../lib/shelves.ts';
import { TypeSeal } from './TypeLabel.tsx';

export function ThemeRow({ value, counts, onPick, testId = 'theme-row', className }: { value: Theme | null; counts: Record<Theme, number>; onPick: (theme: Theme) => void; testId?: string; className?: string }) {
  return (
    <div className={`tr${className ? ` ${className}` : ''}`} role="tablist" aria-label="玩、吃、住" data-testid={testId}>
      {THEMES.map((t) => {
        const on = value === t;
        const l = THEME_LABELS[t];
        return (
          <button key={t} type="button" role="tab" aria-selected={on} className={`tr-tab${on ? ' on' : ''}`} data-type={t} onClick={() => onPick(t)} data-testid={`theme-${t}`}>
            <TypeSeal type={t} />
            <span className="tr-label">
              <b className="tr-name">{l.tab}</b>
              <small className="tr-sub">
                <i className="tr-n" data-testid="theme-count">
                  {counts[t]}
                </i>{' '}
                {l.noun}
              </small>
            </span>
          </button>
        );
      })}
    </div>
  );
}
