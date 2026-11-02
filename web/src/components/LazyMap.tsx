// 地圖最後才載（T39，👤 決定的順序：AI 助理 → 探索 → 地圖）：maplibre 有 1 MB，資料好了、畫面畫完才開始下載。

import { lazy, Suspense, useEffect, useState } from 'react';
import { useData } from '../hooks.ts';
import { whenIdle } from '../lib/idle.ts';

const MapView = lazy(() => import('./MapView.tsx').then((m) => ({ default: m.MapView })));

const Waiting = () => <div className="map-waiting" data-testid="map-waiting" />;

export function LazyMap() {
  const ready = useData((s) => s.status === 'ready');
  const [start, setStart] = useState(false);
  useEffect(() => {
    if (ready) return whenIdle(() => setStart(true));
  }, [ready]);
  if (!start) return <Waiting />;
  return (
    <Suspense fallback={<Waiting />}>
      <MapView />
    </Suspense>
  );
}
