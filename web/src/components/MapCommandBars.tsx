// 地圖指令（T12）在地圖上方的說明列：AI 的標示和路線。
// 使用者看得出 AI 對地圖做了什麼，也能自己清掉（interaction-design §0「AI 用的條件要看得到」）。
// 「清掉」只看 AI 的 highlights、routes；時間軸點開的交通（legRoute）、選中的點不算（第七輪 §8.1）。

import { commands } from '../appCommands.ts';
import { useApp, useIsDesktop } from '../hooks.ts';
import { Icon } from './Icon.tsx';

/** AI 有標示或路線時，給一個清掉的按鈕 */
export function MarksBar() {
  const highlights = useApp((s) => s.highlights);
  const routes = useApp((s) => s.routes);
  const marked = Object.values(highlights).reduce((n, ids) => n + (ids?.length ?? 0), 0);
  if (marked === 0 && routes.length === 0) return null;
  return (
    <div className="command-bar marks-bar" data-testid="marks-bar">
      <span className="small">
        {marked > 0 && `標示 ${marked} 個點`}
        {marked > 0 && routes.length > 0 && '・'}
        {routes.length > 0 && `路線 ${routes.length} 條`}
      </span>
      <button type="button" className="link-button" onClick={() => commands.clearHighlights()} data-testid="map-command-clear">
        清掉 <Icon name="close" size={16} />
      </button>
    </div>
  );
}

/** 網頁版的地圖上；手機的在 mobile/MapAiBar.tsx */
export function MapCommandBars() {
  const desktop = useIsDesktop();
  if (!desktop) return null;
  return (
    <div className="command-bars">
      <MarksBar />
    </div>
  );
}
