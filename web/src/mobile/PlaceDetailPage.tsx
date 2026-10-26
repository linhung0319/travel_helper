// 手機版的資料點詳情（第六輪 §3.3，第七輪 §7）：像點進 IG 的帳號，整頁蓋在分頁上面（原本的分頁不卸載，返回時捲動位置不變）。
// 內容（照片輪播、名稱、動作列、簡介／交通／評論／留言四個分頁）是兩邊共用的 shared/ui/PlaceDetail；這裡只管：整頁的外框、返回（瀏覽器上一頁也一樣，見 mobileStore）、
// 交通分頁的小地圖（另開的一張不能互動的 MapLibre；點了切到行程分頁的地圖、框住這個點）、附近的點換成那個點的詳情。
// 捲過照片後出現白色頂端列（‹、名稱、❤），分頁列接在它下面。

import { useEffect, useRef } from 'react';
import { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { useApp, useData } from '../hooks.ts';
import { commands } from '../appCommands.ts';
import { TYPE_COLORS } from '../lib/typeStyle.ts';
import type { Place } from '../data/types.ts';
import type { DetailTabId } from '../store.ts';
import { Icon } from '../components/Icon.tsx';
import { STYLE_URL } from '../components/MapView.tsx';
import { PlaceDetail } from '../shared/ui/PlaceDetail.tsx';
// askAi.ts 載入時才把「放進選取」接給 uiStore.askAboutPlace（問 AI 要帶地點），手機版這裡一定要載入
import '../components/askAi.ts';
import { mobileStore, useMobile, type MobileTab } from './mobileStore.ts';

/** 交通分頁的小地圖：不能拖、不能縮放；點了到行程分頁的地圖、框住這個點 */
function MiniMap({ place }: { place: Place }) {
  const ref = useRef<HTMLDivElement>(null);
  const [lon, lat] = place.coords;
  useEffect(() => {
    const map = new MapLibreMap({ container: ref.current!, style: STYLE_URL, center: [lon, lat], zoom: 14, interactive: false, attributionControl: { compact: true } });
    new Marker({ color: TYPE_COLORS[place.type] }).setLngLat([lon, lat]).addTo(map);
    return () => map.remove();
  }, [lon, lat, place.type]);
  const toTrip = () => {
    mobileStore.getState().setTab('trip');
    commands.focus(place.id);
  };
  return (
    <div className="m-minimap">
      <div ref={ref} className="m-minimap-map" aria-hidden />
      <button type="button" className="m-minimap-hit" onClick={toTrip} data-testid="m-detail-minimap" aria-label="在行程的地圖上看">
        <span className="m-minimap-label ic-text">
          <Icon name="map" size={16} /> 在行程的地圖上看 <Icon name="chevron" size={16} />
        </span>
      </button>
    </div>
  );
}

/** 一個點的整頁內容（換點時整個重來：分頁回到簡介、捲回最上面） */
function DetailContent({ place, from, tab }: { place: Place; from: MobileTab; tab?: DetailTabId }) {
  // 編輯中行程頁的半屏聊天藏起來（ChatSheet），從行程打開的詳情按問 AI 會沒有反應：先不畫問 AI
  const askAiHidden = useApp((s) => s.planning) && from === 'trip';
  // 排在哪天：選那天、切到行程分頁
  const onDay = (date: string) => {
    commands.selectDay(date);
    mobileStore.getState().setTab('trip');
  };
  return (
    <PlaceDetail
      place={place}
      surface="mobile"
      from={from}
      initialTab={tab}
      onDay={onDay}
      askAi={!askAiHidden}
      onPickNearby={(id) => mobileStore.getState().openPlace(id, from)}
      locator={<MiniMap place={place} />}
      onBack={() => mobileStore.getState().closePlace()}
    />
  );
}

/** 整頁詳情：mobileStore.detail 有值時蓋在分頁上面 */
export function PlaceDetailPage() {
  const detail = useMobile((s) => s.detail);
  const place = useData((s) => (detail ? s.byId.get(detail.placeId) : undefined));
  if (!detail) return null;
  const name = place ? place.name.zh || place.name.ja : detail.placeId;
  return (
    <section className="m-full m-detail" data-testid="m-detail" data-id={detail.placeId} aria-label={`${name} 的詳情`}>
      {place ? (
        <DetailContent key={place.id} place={place} from={detail.from} tab={detail.tab} />
      ) : (
        <>
          <button type="button" className="m-back" onClick={() => mobileStore.getState().closePlace()} aria-label="返回" data-testid="m-detail-back">
            <Icon name="back" size={24} />
          </button>
          <p className="muted m-empty">找不到這個地點。</p>
        </>
      )}
    </section>
  );
}
