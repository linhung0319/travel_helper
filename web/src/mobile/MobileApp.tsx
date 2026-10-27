// 手機版的殼（第六輪 §3.1、§4）：寬度 < 1100px 時 App.tsx 畫這個。上面是分頁內容，最下面是 5 個分頁（TabBar）。
// 地圖一直掛著（e2e 的 ready() 和行程頁都要它）：不在行程分頁時用 visibility: hidden 藏起來，不卸載；切回行程時重新算大小。
// 整頁的東西（詳情 PlaceDetailPage、討論、預約）蓋在最上面，一次只有一層；分頁本身不卸載，返回時捲動位置不變。共用元件用 appStore.openDetail 開的詳情，這裡改開整頁詳情。
// 探索（ExploreFeed）、想去（WishlistPage）、行程（TripPage：地圖上蓋一張可以拉的面板）、AI（ChatPage：佔位對話，T16m 接上）。
// 行程頁的半屏聊天打開時寫 data-chat：chat.css 讓地圖只畫在聊天上面那塊，開關時地圖重新算大小。
// 行程面板停的高度（tripSnap）寫在 data-snap：mobile.css 照它算面板高度和地圖露出的範圍（地圖只畫在面板上面那塊，飛過去的點才不會被蓋住）。

import { useEffect } from 'react';
import { useApp } from '../hooks.ts';
import { appStore } from '../store.ts';
import { MapView, resizeMap } from '../components/MapView.tsx';
import { Dialogs, Toast } from '../components/Dialogs.tsx';
import { mobileStore, setMobileActive, useMobile, type MobileTab } from './mobileStore.ts';
import { TabBar } from './TabBar.tsx';
import { MePage, MePageView } from './MePage.tsx';
import { ExploreFeed } from './ExploreFeed.tsx';
import { WishlistPage } from './WishlistPage.tsx';
import { PlaceDetailPage } from './PlaceDetailPage.tsx';
import { TripPage } from './TripPage.tsx';
import { ChatPage } from './ChatPage.tsx';
import './mobile.css';

/** 分頁的內容；行程分頁的地圖在外面一直掛著，這裡只放蓋在地圖上的東西 */
function TabContent({ tab }: { tab: MobileTab }) {
  if (tab === 'me') return <MePage />;
  if (tab === 'explore') return <ExploreFeed />;
  if (tab === 'wish') return <WishlistPage />;
  if (tab === 'trip') return <TripPage />;
  return <ChatPage />;
}

export function MobileApp() {
  const tab = useMobile((s) => s.tab);
  const planning = useApp((s) => s.planning);
  const snap = useMobile((s) => s.tripSnap);
  // 行程頁的半屏聊天開著（ChatSheet 一樣的條件：編輯中不出現）
  const chat = useMobile((s) => s.chatSheet && s.tab === 'trip') && !planning;

  // 手機版掛著：詳情的「問 AI」才切手機的分頁（mobileStore 的 chatDraft 監聽）
  useEffect(() => {
    setMobileActive(true);
    return () => setMobileActive(false);
  }, []);

  // 共用的元件（地圖觸控點第二下、預約列的名稱…）用 appStore.openDetail 開詳情：手機版改開整頁詳情（from＝現在的分頁）
  useEffect(
    () =>
      appStore.subscribe((s) => {
        if (!s.detailId) return;
        const { detailId: id, detailTab } = s;
        appStore.getState().closeDetail();
        mobileStore.getState().openPlace(id, mobileStore.getState().tab, detailTab ?? undefined);
      }),
    [],
  );

  // 切回行程：藏起來的時候版面可能變過（轉向、網址列），地圖重新算大小
  useEffect(() => {
    if (tab === 'trip') resizeMap();
  }, [tab]);

  // 半屏聊天開、關：地圖露出的範圍變了
  useEffect(() => {
    resizeMap();
  }, [chat]);

  return (
    <div className={`m-app ${planning ? 'editing' : ''}`} data-tab={tab} data-snap={snap} data-chat={chat || undefined}>
      {/* 每個分頁自己的捲動位置：換分頁時從最上面開始（不然會留著上一個分頁捲到的位置） */}
      <main key={tab} className={`m-page m-page-${tab}`}>
        <TabContent tab={tab} />
      </main>
      <div className="m-map" hidden={tab !== 'trip'}>
        <MapView />
      </div>
      {/* 編輯中藏起來，免得不小心點到跑去別的分頁 */}
      {!planning && <TabBar />}
      <PlaceDetailPage />
      <MePageView />
      <Dialogs />
      <Toast />
    </div>
  );
}
