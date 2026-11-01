// 行程地圖左上角（interaction-design §16.2）：「‹ 回 AI」、結果集的晶片、路線。地圖上有 AI 的呈現或是從聊天跳過來時才出現；半屏開著（聊天就在下面，晶片留著）、班次表開著時不放回 AI。

import { commands } from '../appCommands.ts';
import { useApp, useUi } from '../hooks.ts';
import { Icon } from '../components/Icon.tsx';
import { MarksBar } from '../components/MapCommandBars.tsx';
import { mobileStore, useMobile } from './mobileStore.ts';

export function MapAiBar() {
  const proposal = useApp((s) => !!s.proposal);
  const result = useApp((s) => s.aiResult);
  const routes = useApp((s) => s.routes.length);
  const fromChat = useMobile((s) => s.fromChat);
  const sheet = useMobile((s) => s.chatSheet);
  const timetable = useUi((s) => s.timetable);
  const back = () => mobileStore.getState().returnToChat();
  const showBack = !sheet && !timetable && (proposal || !!result || routes > 0 || fromChat);
  if (!showBack && !result && !routes) return null;
  return (
    <div className="m-map-ai" data-testid="m-map-ai">
      {showBack && (
        <button type="button" className="ai-back" onClick={back} data-testid="ai-back">
          ‹ 回 AI
        </button>
      )}
      {result && (
        <span className="ai-pill" data-testid="ai-result-pill">
          <button type="button" className="ai-pill-body" onClick={back} data-testid="ai-result-open">
            ✦ AI 挑的 · {result.ids.length} 家
          </button>
          <button type="button" className="ai-pill-x" aria-label="清掉 AI 挑的" onClick={() => commands.clearResult()} data-testid="ai-result-chip">
            <Icon name="close" size={16} />
          </button>
        </span>
      )}
      <MarksBar />
    </div>
  );
}
