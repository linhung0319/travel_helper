import { useEffect } from 'react';
import { appStore } from './store.ts';
import { loadData } from './dataStore.ts';
import { useData, useIsDesktop } from './hooks.ts';
import { MapView } from './components/MapView.tsx';
import { ChatPanel } from './components/Panels.tsx';
import { dropAiProps } from './components/askAi.ts';
import { DetailFloat, SidePanel } from './components/SidePanel.tsx';
import { MapPanel } from './components/MapPanel.tsx';
import { TimetablePopup } from './components/TimetablePopup.tsx';
import { closeMapPanel, uiStore } from './uiStore.ts';
import { Dialogs, Toast } from './components/Dialogs.tsx';
import { usePlanningIdle } from './components/Planning.tsx';
import { MobileApp } from './mobile/MobileApp.tsx';
import './styles.css';

/**
 * 電腦版三欄（參考 puma.taipei/heart-island）：左邊聊天室；中間只有地圖（和彈窗）；
 * 右邊是行程／探索／詳情共用的一欄，頂端有日期列和頭像選單。聊天室和右欄都頂到最上面。
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
        <DetailFloat />
        <MapPanel />
        <TimetablePopup />
      </main>
      <aside className="side-column">
        <SidePanel />
      </aside>
    </div>
  );
}

/** 焦點在輸入框、文字框、可編輯的區塊上 */
function isEditable(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit'].includes((t as HTMLInputElement).type)) || t.tagName === 'SELECT';
}

export default function App() {
  const status = useData((s) => s.status);
  const error = useData((s) => s.error);
  const desktop = useIsDesktop();
  usePlanningIdle();

  useEffect(() => {
    void loadData();
  }, []);

  // Esc 依序關掉：討論／預約的視窗、詳情、小卡片。對話框、誰想去的小視窗、頭像選單、照片檢視、篩選面板開著時由它們自己關（捕獲階段先攔下）；
  // 正在輸入（留言框等、輸入法選字中）時不理，草稿不會跟著詳情一起不見
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing || isEditable(e.target)) return;
      const s = appStore.getState();
      const ui = uiStore.getState();
      if (ui.mapPanel && !ui.dialog) closeMapPanel();
      else if (s.detailId) s.closeDetail();
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
