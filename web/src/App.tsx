import { useEffect, useState } from 'react';
import { appStore } from './store.ts';
import { loadData } from './dataStore.ts';
import { useApp, useData, useIsDesktop } from './hooks.ts';
import { MapView } from './components/MapView.tsx';
import { TopBar } from './components/TopBar.tsx';
import { ExploreWall } from './components/ExploreWall.tsx';
import { BottomSheet } from './components/BottomSheet.tsx';
import { DetailPanel } from './components/DetailPanel.tsx';
import { ChatPanel, DayPanel } from './components/Panels.tsx';
import './styles.css';

/** 電腦版：聊天室在左；地圖在右，詳情面板疊在地圖右側，這一天在地圖下方（interaction-design §1） */
function DesktopLayout() {
  const mode = useApp((s) => s.mode);
  const detailId = useApp((s) => s.detailId);
  const byId = useData((s) => s.byId);
  const [dayOpen, setDayOpen] = useState(true);
  const place = detailId ? byId.get(detailId) : null;
  return (
    <div className="layout desktop">
      <aside className="chat-column">
        <ChatPanel />
      </aside>
      <main className="main-column">
        <TopBar />
        <div className={`stage mode-${mode}`}>
          {mode === 'explore' && <ExploreWall />}
          <MapView />
          {place && (
            <aside className="detail-side">
              <DetailPanel place={place} />
            </aside>
          )}
        </div>
        <section className={`day-dock ${dayOpen ? 'open' : ''}`}>
          <button type="button" className="day-dock-toggle" onClick={() => setDayOpen((o) => !o)} aria-expanded={dayOpen}>
            📅 這一天 {dayOpen ? '▾' : '▴'}
          </button>
          {dayOpen && <DayPanel />}
        </section>
      </main>
    </div>
  );
}

/** 手機：全螢幕地圖＋拉起的面板；探索模式時地圖縮成上方一小塊、下面是圖片牆 */
function MobileLayout() {
  const mode = useApp((s) => s.mode);
  return (
    <div className="layout mobile">
      <TopBar />
      <div className={`stage mode-${mode}`}>
        <MapView />
        {mode === 'explore' && <ExploreWall />}
        <BottomSheet />
      </div>
    </div>
  );
}

export default function App() {
  const status = useData((s) => s.status);
  const error = useData((s) => s.error);
  const desktop = useIsDesktop();

  useEffect(() => {
    void loadData();
  }, []);

  // Esc 關掉詳情、小卡片
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const s = appStore.getState();
      if (s.detailId) s.closeDetail();
      else s.openPreview(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (status === 'loading') return <div className="splash">載入中…</div>;
  if (status === 'error') return <div className="splash">資料載入失敗：{error}</div>;
  return desktop ? <DesktopLayout /> : <MobileLayout />;
}
