// 地圖的 CSS 留在主程式、排在最前面：地圖動態載入後，樣式才不會蓋掉 styles.css 對地圖的設定（11 KB）
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { startAi } from './appAi.ts';
import { askStart, connectWebAi } from './components/webAi.ts';
import { commands } from './appCommands.ts';
import { showItinerary } from './components/Explore.tsx';
import { GuideButton, type GuideActions } from './shared/ui/GuideDialog.tsx';
import { appStore } from './store.ts';
import { loadData } from './dataStore.ts';
import { useData, useIsDesktop } from './hooks.ts';
import { resizeMap } from './components/mapRuntime.ts';
import { LazyMap } from './components/LazyMap.tsx';
import { watchKeyboard } from './lib/keyboard.ts';
import { ChatPanel } from './components/ChatPanel.tsx';
import { dropAiProps } from './components/askAi.ts';
import { DetailFloat, showList, SidePanel } from './components/SidePanel.tsx';
import { MapDays } from './components/MapDays.tsx';
import { MapPanel } from './components/MapPanel.tsx';
import { AddPlaceDialog } from './shared/ui/AddPlaceDialog.tsx';
import { TimetablePopup } from './components/TimetablePopup.tsx';
import { closeDiscussion, closeMapPanel, uiStore } from './uiStore.ts';
import { DiscussionPanel } from './shared/ui/DiscussionPanel.tsx';
import { Dialogs, Toast } from './components/Dialogs.tsx';
import { usePlanningIdle } from './components/Planning.tsx';
import { MobileApp } from './mobile/MobileApp.tsx';
import { toDesktop, toMobile } from './layoutSwitch.ts';
import { removeBootSkeleton } from './lib/bootSkeleton.ts';
import './styles.css';

/**
 * 電腦版三欄（參考 puma.taipei/heart-island）：左邊聊天室；中間只有地圖（和彈窗）；
 * 右邊是行程／探索／詳情共用的一欄，頂端有日期列和頭像選單。聊天室和右欄都頂到最上面。
 */
/** 引導彈窗的按鈕（T46）：① 右欄的探索 ② 右欄的行程、整趟 ③④ 左欄的聊天室 */
const WEB_GUIDE: GuideActions = {
  explore: () => showList('explore'),
  trip: () => {
    showItinerary();
    commands.selectDay('all');
  },
  ask: askStart,
};

function DesktopLayout({ ready }: { ready: boolean }) {
  useEffect(connectWebAi, []);
  // 載入順序（T39，👤）：聊天室一開始就在；資料到了才有右欄的探索；地圖最後（LazyMap）
  return (
    <div className="layout desktop">
      {/* 探索卡片、詳情標題可以拖到這裡問 AI（askAi.ts） */}
      <aside className="chat-column" {...dropAiProps()}>
        <ChatPanel />
      </aside>
      <main className="map-column">
        <LazyMap />
        {ready && (
          <>
            <MapDays />
            {/* 引導彈窗的入口（T46）：地圖右上，三個分頁都看得到；縮放鈕在右下 */}
            <GuideButton className="map-guide" />
            <DetailFloat />
            <MapPanel />
            <DiscussionPanel surface="desktop" />
            <TimetablePopup />
            <AddPlaceDialog surface="desktop" />
          </>
        )}
      </main>
      <aside className="side-column">
        {ready ? (
          <SidePanel />
        ) : (
          <div className="side-loading" data-testid="side-loading" aria-hidden>
            {Array.from({ length: 6 }, (_, i) => (
              <i key={i} />
            ))}
          </div>
        )}
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

  // 轉向跨過 DESKTOP_QUERY：開著的詳情、展開的卡、分頁帶到另一個版面（§1 平板）。
  // 到手機版用 layout effect：網頁版的 effect 清理（DayPanel 收起展開的卡）還沒跑，狀態還在；
  // 到網頁版用一般 effect：手機版的清理（MobileApp 把 openDetail 搶去開整頁的訂閱）已經跑完
  const wasDesktop = useRef(desktop);
  useLayoutEffect(() => {
    if (desktop || wasDesktop.current === desktop) return;
    wasDesktop.current = desktop;
    toMobile();
  }, [desktop]);
  useEffect(() => {
    if (!desktop || wasDesktop.current === desktop) return;
    wasDesktop.current = desktop;
    toDesktop();
  }, [desktop]);

  // Esc 依序關掉：討論／預約的視窗、詳情、小卡片。對話框、誰想去的小視窗、頭像選單、照片檢視、篩選面板開著時由它們自己關（捕獲階段先攔下）；
  // 正在輸入（留言框等、輸入法選字中）時不理，草稿不會跟著詳情一起不見
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing || isEditable(e.target)) return;
      const s = appStore.getState();
      const ui = uiStore.getState();
      if (ui.discussion && !ui.dialog) closeDiscussion();
      else if (ui.mapPanel && !ui.dialog) closeMapPanel();
      else if (s.detailId) s.closeDetail();
      else s.openPreview(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 螢幕鍵盤（§16.3）：版面讓出來，地圖重新算大小
  useEffect(() => watchKeyboard(resizeMap), []);

  // 資料好了才啟動 AI（T16m-b）：工具要讀資料點
  useEffect(() => {
    if (status === 'ready') void startAi();
  }, [status]);

  // 載入中是 index.html 的開機骨架（#boot）：手機等資料好了才拿掉；網頁的聊天室不用等資料，程式一到就換成真的版面
  useLayoutEffect(() => {
    if (status !== 'loading' || desktop) removeBootSkeleton();
  }, [status, desktop]);

  if (status === 'error') return <div className="splash">資料載入失敗：{error}</div>;
  if (status === 'loading' && !desktop) return null;
  // 只在最外層分一次（第六輪 §4）：手機版是 mobile/ 底下自己的一套，對話框、提示也由它畫
  if (!desktop) return <MobileApp />;
  return (
    <>
      <DesktopLayout ready={status === 'ready'} />
      {status === 'ready' && (
        <>
          <Dialogs guide={WEB_GUIDE} />
          <Toast />
        </>
      )}
    </>
  );
}
