import { useEffect } from 'react';
import { appStore } from './store.ts';
import { loadData } from './dataStore.ts';
import { useData, useIsDesktop } from './hooks.ts';
import { MapView } from './components/MapView.tsx';
import { MapTopBar } from './components/TopBar.tsx';
import { ChatPanel } from './components/Panels.tsx';
import { dropAiProps } from './components/askAi.ts';
import { SidePanel } from './components/SidePanel.tsx';
import { MapPanel } from './components/MapPanel.tsx';
import { TimetablePopup } from './components/TimetablePopup.tsx';
import { Dialogs, Toast } from './components/Dialogs.tsx';
import { usePlanningIdle } from './components/Planning.tsx';
import { MobileApp } from './mobile/MobileApp.tsx';
import './styles.css';

/**
 * 電腦版三欄（參考 puma.taipei/heart-island）：左邊聊天室；中間地圖，日期、我浮在地圖上方；
 * 右邊是行程／探索／詳情共用的一欄。聊天室和右欄都頂到最上面。
 */
function DesktopLayout() {
  return (
    <div className="layout desktop">
      {/* 探索卡片、詳情標題可以拖到這裡問 AI（askAi.ts） */}
      <aside className="chat-column" {...dropAiProps()}>
        <ChatPanel />
      </aside>
      <main className="map-column">
        <MapView />
        <MapTopBar />
        <MapPanel />
        <TimetablePopup />
      </main>
      <aside className="side-column">
        <SidePanel />
      </aside>
    </div>
  );
}

export default function App() {
  const status = useData((s) => s.status);
  const error = useData((s) => s.error);
  const desktop = useIsDesktop();
  usePlanningIdle();

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
  // 只在最外層分一次（第六輪 §4）：手機版是 mobile/ 底下自己的一套，對話框、提示也由它畫
  if (!desktop) return <MobileApp />;
  return (
    <>
      <DesktopLayout />
      <Dialogs />
      <Toast />
    </>
  );
}
