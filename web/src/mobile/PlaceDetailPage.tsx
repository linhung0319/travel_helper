// 手機版的資料點詳情（第六輪 §3.3，第七輪 §7）：像點進 IG 的帳號，整頁蓋在分頁上面（原本的分頁不卸載，返回時捲動位置不變）。
// 內容（照片輪播、名稱、動作列、簡介／交通／評論／留言四個分頁）是兩邊共用的 shared/ui/PlaceDetail；這裡只管：整頁的外框、返回（瀏覽器上一頁也一樣，見 mobileStore）、
// 位置分頁的小地圖（另開的一張不能互動的 MapLibre，標記是選中的數字水滴的樣子）：點了「在地圖上看」切到行程（第七輪 §8.3）——
// 排在某天＝選那天、選中那張卡；沒排＝整趟、選中這個點。附近的點換成那個點的詳情。
// 捲過照片後出現白色頂端列（‹、名稱、❤），分頁列接在它下面。

import { useEffect, useRef } from 'react';
import { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { useApp, useData } from '../hooks.ts';
import { commands } from '../appCommands.ts';
import type { Place } from '../data/types.ts';
import { appStore, type DetailTabId } from '../store.ts';
import { Icon } from '../components/Icon.tsx';
import { STYLE_URL, selectedDropHtml } from '../components/MapView.tsx';
import { dayPlanOf, planStore } from '../planStore.ts';
import { tripDates } from '../lib/trip.ts';
import { PlaceDetail } from '../shared/ui/PlaceDetail.tsx';
// askAi.ts 載入時才把「放進選取」接給 uiStore.askAboutPlace（問 AI 要帶地點），手機版這裡一定要載入
import '../components/askAi.ts';
import { focusKeyForPlace, mobileStore, useMobile, type MobileTab } from './mobileStore.ts';

/** 「在地圖上看」：切到行程。排在某天（現在選的那天優先）＝選那天、選中那張卡（展開）；沒排＝整趟、選中這個點 */
export function showOnTripMap(placeId: string) {
  const plan = planStore.getState().plan;
  const current = appStore.getState().day;
  const keyOn = (date: string) => focusKeyForPlace(dayPlanOf(plan, date), placeId);
  const date = current !== 'all' && keyOn(current) ? current : tripDates().find((d) => keyOn(d));
  const m = mobileStore.getState();
  m.setTab('trip');
  if (date) {
    commands.selectDay(date);
    const key = keyOn(date)!;
    m.focusItem(key);
    if (mobileStore.getState().expanded !== key) m.expandItem(key);
    return;
  }
  commands.selectDay('all');
  appStore.getState().select(placeId);
  commands.focus(placeId);
}

/** 位置分頁的小地圖：不能拖、不能縮放，標記是數字水滴的樣子（類型圖示）；點了到行程分頁的地圖（showOnTripMap） */
function MiniMap({ place }: { place: Place }) {
  const ref = useRef<HTMLDivElement>(null);
  const [lon, lat] = place.coords;
  useEffect(() => {
    const map = new MapLibreMap({ container: ref.current!, style: STYLE_URL, center: [lon, lat], zoom: 14, interactive: false, attributionControl: { compact: true } });
    const el = document.createElement('div');
    el.className = 'map-selected mini';
    el.innerHTML = selectedDropHtml(place, '');
    new Marker({ element: el, anchor: 'bottom', offset: [0, 2] }).setLngLat([lon, lat]).addTo(map);
    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只看位置、類型、名稱（資料重載換了物件不重建小地圖）
  }, [lon, lat, place.type, place.name.zh, place.name.ja]);
  const toTrip = () => showOnTripMap(place.id);
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
