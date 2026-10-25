// 下載目前的行程 JSON（網頁版右上角的 ⬇、手機版「我」的 ⬇ 下載）。

import { dataStore } from '../dataStore.ts';
import { sharedStore } from '../appShared.ts';
import { exportFileName } from '../lib/planView.ts';

/** 下載目前的行程 JSON；還沒載入行程時不做事 */
export function exportJson() {
  const itinerary = dataStore.getState().itinerary;
  if (!itinerary) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(itinerary, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFileName(sharedStore.getState().version);
  a.click();
  URL.revokeObjectURL(url);
}
