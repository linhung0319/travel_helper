// 聊天室（T16 接上）先放位置，只放得到的內容（選取的點）；這一天在 DayPanel.tsx。

import { commands } from '../appCommands.ts';
import { useApp, useData } from '../hooks.ts';
import { TYPE_ICONS } from '../lib/typeStyle.ts';

export function ChatPanel() {
  const selection = useApp((s) => s.selection);
  const byId = useData((s) => s.byId);
  return (
    <div className="chat-panel" data-testid="chat-panel">
      <div className="placeholder">
        <p>💬 AI 聊天（T16 接上）</p>
        <p className="muted small">之後可以在這裡用說的找地點、寫建議、排行程。</p>
      </div>
      {selection.length > 0 && (
        <div className="chips selection">
          {selection.map((id) => {
            const p = byId.get(id);
            return (
              <button key={id} type="button" className="chip" onClick={() => commands.unselect(id)} aria-label={`取消選取 ${p?.name.zh ?? id}`}>
                {p ? `${TYPE_ICONS[p.type]} ${p.name.zh || p.name.ja}` : id} ✕
              </button>
            );
          })}
        </div>
      )}
      <input className="chat-input" placeholder="（T16）問問看：鳥羽附近能坐 15 人的海鮮餐廳？" disabled />
    </div>
  );
}

// 這一天（T15m）
export { DayPanel } from './DayPanel.tsx';
