// 手機版的殼（第六輪 §3.1、§4）：寬度 < 900px 時 App.tsx 畫這個。上面是分頁內容，最下面是 5 個分頁（TabBar）。
// 地圖一直掛著（e2e 的 ready() 和行程頁都要它）：不在行程分頁時用 visibility: hidden 藏起來，不卸載；切回行程時重新算大小。
// 整頁的東西（詳情、討論、預約）蓋在最上面，一次只有一層。探索、想去、行程、AI 這時先放佔位，之後的任務補上。

import { useEffect } from 'react';
import { useApp, useData } from '../hooks.ts';
import { MapView, resizeMap } from '../components/MapView.tsx';
import { Dialogs, Toast } from '../components/Dialogs.tsx';
import { mobileStore, useMobile, type MobileTab } from './mobileStore.ts';
import { TabBar } from './TabBar.tsx';
import { MePage, MePageView } from './MePage.tsx';
import './mobile.css';

const PLACEHOLDER: Record<Exclude<MobileTab, 'me' | 'trip'>, string> = {
  explore: '探索（圖片牆）',
  wish: '想去',
  ai: 'AI 聊天',
};

/** 還沒做的分頁：只寫名字 */
function Placeholder({ tab }: { tab: keyof typeof PLACEHOLDER }) {
  return (
    <div className="m-placeholder" data-testid={`m-${tab}-placeholder`}>
      <p className="muted">{PLACEHOLDER[tab]}（製作中）</p>
    </div>
  );
}

/** 整頁詳情（佔位，之後換成 PlaceDetailPage）：左上「‹」或瀏覽器上一頁回到剛才的分頁 */
function DetailPlaceholder() {
  const detail = useMobile((s) => s.detail);
  const byId = useData((s) => s.byId);
  if (!detail) return null;
  const place = byId.get(detail.placeId);
  return (
    <section className="m-full" data-testid="m-detail" data-id={detail.placeId}>
      <header className="m-full-head">
        <button type="button" className="m-back" onClick={() => mobileStore.getState().closePlace()} aria-label="返回" data-testid="m-detail-back">
          ‹
        </button>
        <h2 className="m-h2 m-ellipsis">{place ? place.name.zh || place.name.ja : detail.placeId}</h2>
      </header>
    </section>
  );
}

/** 分頁的內容；行程分頁的地圖在外面一直掛著，這裡只放蓋在地圖上的東西 */
function TabContent({ tab }: { tab: MobileTab }) {
  if (tab === 'me') return <MePage />;
  if (tab === 'trip') return <div className="m-trip" data-testid="m-trip" />;
  return <Placeholder tab={tab} />;
}

export function MobileApp() {
  const tab = useMobile((s) => s.tab);
  const planning = useApp((s) => s.planning);

  // 切回行程：藏起來的時候版面可能變過（轉向、網址列），地圖重新算大小
  useEffect(() => {
    if (tab === 'trip') resizeMap();
  }, [tab]);

  return (
    <div className={`m-app ${planning ? 'editing' : ''}`} data-tab={tab}>
      <main className={`m-page m-page-${tab}`}>
        <TabContent tab={tab} />
      </main>
      <div className="m-map" hidden={tab !== 'trip'}>
        <MapView />
      </div>
      {/* 編輯中藏起來，免得不小心點到跑去別的分頁 */}
      {!planning && <TabBar />}
      <DetailPlaceholder />
      <MePageView />
      <Dialogs />
      <Toast />
    </div>
  );
}
