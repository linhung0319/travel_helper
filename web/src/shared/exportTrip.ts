// 下載行程（T35）：網頁右上的頭像選單、手機版「我」共用。
// PDF：列印用的 HTML 放進看不見的 iframe 叫出列印視窗，使用者選「另存為 PDF」（不用把字型塞進網站）。MD：直接下載。
// 地址、電話、入住時間在詳情層，先讀詳情層；讀不到就照清單層的資料產生（少了地址、電話）。

import { jstNow } from '@travel-helper/engine';
import { dataStore, ensureDetails, fullPlace } from '../dataStore.ts';
import { departuresOf, planStore } from '../planStore.ts';
import { sharedStore } from '../appShared.ts';
import { buildTripExport, type ExportDoc } from '../lib/tripExport.ts';
import { exportHtml, exportMarkdown } from '../lib/tripExportFormat.ts';
import { shortDayLabel } from '../lib/trip.ts';

const stamp = (ms: number) => {
  const n = jstNow(ms);
  return `${n.date} ${n.time}`;
};

/** 現在的行程和時間軸整理成 ExportDoc；行程或時間軸還沒好時回傳 null */
export async function currentTripExport(): Promise<ExportDoc | null> {
  await ensureDetails().catch(() => {});
  const d = dataStore.getState();
  const plan = planStore.getState().plan;
  if (!d.itinerary || !plan) return null;
  const sh = sharedStore.getState();
  let updated: string | null = null;
  if (sh.updatedAt) {
    const n = jstNow(Date.parse(sh.updatedAt));
    const who = sh.members.find((m) => m.id === sh.updatedBy)?.displayName;
    updated = `${shortDayLabel(n.date)} ${n.time}${who ? ` ${who}` : ''} 更新`;
  }
  return buildTripExport({
    itinerary: d.itinerary,
    plan,
    byId: d.byId,
    fullOf: (id) => fullPlace(d, id),
    areas: d.areas,
    reservations: sh.reservations,
    departures: departuresOf,
    version: sh.version,
    updated,
    generatedAt: stamp(Date.now()),
  });
}

/** 下載 MD */
export async function downloadTripMarkdown() {
  const doc = await currentTripExport();
  if (!doc) return;
  const url = URL.createObjectURL(new Blob([exportMarkdown(doc)], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `行程-v${doc.version}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

let frame: HTMLIFrameElement | null = null;

/** 叫出列印視窗（存成 PDF）：列印用的 HTML 放進看不見的 iframe */
export async function printTripPdf() {
  const doc = await currentTripExport();
  if (!doc) return;
  frame?.remove();
  const f = document.createElement('iframe');
  frame = f;
  f.setAttribute('aria-hidden', 'true');
  f.tabIndex = -1;
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  f.dataset.testid = 'trip-print-frame';
  f.onload = () => {
    const w = f.contentWindow;
    if (!w) return;
    w.focus();
    w.print();
  };
  f.srcdoc = exportHtml(doc);
  document.body.appendChild(f);
}
