// 聊天室（T16）、這一天（T15）先放位置；T11 只放得到的內容（選取的點、假行程）。

import { appStore } from '../store.ts';
import { useApp, useData } from '../hooks.ts';
import { dayPlan } from '../lib/itinerary.ts';
import { dayLabel } from '../lib/trip.ts';
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
              <button key={id} type="button" className="chip" onClick={() => appStore.getState().removeFromSelection(id)} aria-label={`取消選取 ${p?.name.zh ?? id}`}>
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

export function DayPanel() {
  const day = useApp((s) => s.day);
  const itinerary = useData((s) => s.itinerary);
  const byId = useData((s) => s.byId);
  if (day === 'all') {
    return (
      <div className="day-panel placeholder" data-testid="day-panel">
        <p>選上方的一天，看那天的行程和建議。</p>
      </div>
    );
  }
  const plan = dayPlan(itinerary, day);
  return (
    <div className="day-panel" data-testid="day-panel">
      <h3>
        {dayLabel(day)}
        {itinerary && <span className="badge badge-warn">假行程</span>}
      </h3>
      {plan && plan.items.length > 0 ? (
        <ol className="timeline">
          {plan.items.map((it, i) => {
            const p = byId.get(it.place);
            return (
              <li key={i}>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    if (!p) return;
                    appStore.getState().moveCamera({ center: p.coords, zoom: 15 });
                    appStore.getState().openPreview(p.id);
                    appStore.getState().hover(p.id);
                  }}
                >
                  <span className="time">{it.arrive ?? '--:--'}</span> {p ? `${TYPE_ICONS[p.type]} ${p.name.zh || p.name.ja}` : it.place}
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="muted">這一天還沒有排東西。</p>
      )}
      <p className="muted small">時間軸、交通時間、大家的建議在 T15 接上。</p>
    </div>
  );
}
