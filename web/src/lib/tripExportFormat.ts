// 下載行程（T35）的兩種排版：MD（給 AI、純文字）和列印用的 HTML（瀏覽器存成 PDF）。內容都來自 tripExport.ts 的 ExportDoc。
// HTML 第一頁是總覽（航班、每天去哪、住哪），之後一天一頁、字大，預約一覽在最後一頁（T73）；頁尾印版本和產生時間（PDF 不會跟著行程更新）。純函式。

import { formatDuration } from '@travel-helper/engine';
import type { ExportDay, ExportDoc, ExportGap, ExportLeg, ExportLodging, ExportMissed, ExportRide, ExportRow, ExportStop } from './tripExport.ts';

export const EXPORT_TITLE = '伊勢志摩・大阪 行程';

const MODE_ZH: Record<ExportRide['mode'], string> = { train: '電車', bus: '巴士', ferry: '船' };

/** 「15 人（長輩 5、小孩 4）」 */
export function partyText(p: ExportDoc['party']): string {
  const parts = [p.elders ? `長輩 ${p.elders}` : null, p.kids ? `小孩 ${p.kids}` : null].filter(Boolean);
  return `${p.size} 人${parts.length ? `（${parts.join('、')}）` : ''}`;
}

/** MD 最上面給 AI 看的說明（T73）：「這是 15 人家族旅行（長輩 5、小孩 4）2/2（二） ～ 2/13（六）的行程，以網站為準。時間是規劃的，不是預約好的。」 */
export function introText(doc: ExportDoc): string {
  return `這是 ${partyText(doc.party)}家族旅行${doc.range ? ` ${doc.range} ` : ''}的行程，以網站為準。時間是規劃的，不是預約好的。`;
}

/** 「第 12 版・1/20 21:05 王小明 更新・2026-11-02 14:05 產生」 */
export function versionText(doc: ExportDoc): string {
  return [`第 ${doc.version} 版`, doc.updated, `${doc.generatedAt} 產生（日本時間）`].filter(Boolean).join('・');
}

/** 錯過的話那一行；沒有可寫的回傳 null */
export function missedText(m: ExportMissed | null): string | null {
  if (!m) return null;
  switch (m.kind) {
    case 'headway':
      return m.text;
    case 'last':
      return '這是末班，錯過就沒有車';
    case 'next':
      return `錯過的話：${m.trains.map((t) => `${t.depart}${t.kind ? ` ${t.kind}` : ''}（${t.arrive} 到）`).join('、')}`;
    case 'later':
      return `錯過的話還有：${m.times.join(' ')}`;
    case 'all':
      return `當天班次：${m.times.join(' ')}`;
  }
}

/** 搭車那一行：「13:30 大阪難波 → 15:40 鳥羽　近鐵特急」；班距型沒有時間 */
export function rideText(r: ExportRide): string {
  const from = r.depart ? `${r.depart} ${r.from}` : r.from;
  const to = r.arrive ? `${r.arrive} ${r.to}` : r.to;
  return `${from} → ${to}　${r.name || MODE_ZH[r.mode]}`;
}

export const ticketText = (r: ExportRide) => (r.ticket ? `先買${r.ticket}` : null);

/** 交通的標題：「大眾運輸 45 分（12:20 → 13:05）」，接計程車的加哪一站 */
export function legHead(leg: ExportLeg): string {
  return `${leg.title}（${leg.depart} → ${leg.arrive}）${leg.taxi ? `・${leg.taxi}` : ''}`;
}

/** 空檔那一行：「13:39–18:00 空檔 4 小時 21 分」 */
export const gapText = (g: ExportGap) => `${g.from}–${g.to} 空檔 ${formatDuration(g.minutes)}`;

/** 一個點的標題：「11:55 抵達 關西機場（CI152）」「10:00–11:30 伊勢神宮 內宮」 */
export function stopHead(s: ExportStop): string {
  const name = s.place?.name ?? '';
  const title = s.label ? `${s.label}${name ? (s.label === '自由時間' ? `：${name}` : ` ${name}`) : ''}` : name;
  return `${s.time} ${title}${s.flightNo ? `（${s.flightNo}）` : ''}`.trim();
}

/** 一個點的補充：日文名、哪一餐、預約狀態 */
export function stopMeta(s: ExportStop): string[] {
  return [s.place?.ja ?? null, ...s.meals, s.reservation ? `預約：${s.reservation}` : null].filter((x): x is string => !!x);
}

export function lodgingMeta(l: ExportLodging): string[] {
  return [l.checkIn ? `入住 ${l.checkIn}` : null, l.meals, l.reservation ? `預約：${l.reservation}` : null].filter((x): x is string => !!x);
}

/** 總覽的「去哪裡」：那天的點用「、」串；沒有寫「還沒排」 */
export const placesText = (d: ExportDay) => (d.places.length ? d.places.join('、') : '還沒排');

// --- MD ---------------------------------------------------------------------

const mdEsc = (s: string) => s.replace(/([\\`*_[\]|])/g, '\\$1');
const mdLink = (text: string, url: string | null) => (url ? `[${mdEsc(text)}](${url})` : mdEsc(text));

function mdRows(rows: ExportRow[], indent: string): string[] {
  const out: string[] = [];
  const sub = `${indent}  `;
  for (const row of rows) {
    if (row.kind === 'leg') {
      const l = row.leg;
      out.push(`${indent}- ↓ ${mdEsc(legHead(l))}`);
      if (l.rides.length && l.walkBefore) out.push(`${sub}- 步行 ${l.walkBefore} 分到上車的地方`);
      for (const r of l.rides) {
        const ticket = ticketText(r);
        out.push(`${sub}- ${mdEsc(rideText(r))}${ticket ? `　**${ticket}**` : ''}`);
        const missed = missedText(r.missed);
        if (missed) out.push(`${sub}  - ${mdEsc(missed)}`);
      }
      if (l.rides.length && l.walkAfter) out.push(`${sub}- 下車步行 ${l.walkAfter} 分`);
      if (l.note) out.push(`${sub}- 備註：${mdEsc(l.note)}`);
    } else if (row.kind === 'gap') {
      out.push(`${indent}- ${mdEsc(gapText(row.gap))}`);
    } else {
      const s = row.stop;
      const meta = stopMeta(s);
      const map = s.place?.mapsUrl && s.kind !== 'start' && s.kind !== 'lodging' ? `　${mdLink('地圖', s.place.mapsUrl)}` : '';
      out.push(`${indent}- **${mdEsc(stopHead(s))}**${meta.length ? `　${mdEsc(meta.join('・'))}` : ''}${map}`);
      for (const a of s.alternatives) out.push(`${sub}- 備案：${mdEsc(a.name)}${a.mapsUrl ? `　${mdLink('地圖', a.mapsUrl)}` : ''}`);
      if (s.note) out.push(`${sub}- 備註：${mdEsc(s.note)}`);
    }
  }
  return out;
}

/** 預約一覽最上面的說明（§17.6） */
export const RESERVATION_NOTE = '這是家人的筆記，網站不會幫忙訂。「待訂」的要自己打電話或上網訂；訂好後到網站把狀態改成「已訂」。';
const reservationTime = (doc: ExportDoc) => `${doc.generatedAt} 下載（日本時間），之後狀態可能會變。`;

export function exportMarkdown(doc: ExportDoc): string {
  const out: string[] = [`# ${EXPORT_TITLE}`, '', `> ${mdEsc(introText(doc))}`, '', `${versionText(doc)}。`, '', '## 總覽', ''];
  out.push('| 日期 | 地區 | 去哪裡 | 住宿 |', '| --- | --- | --- | --- |');
  for (const d of doc.days) out.push(`| ${d.heading} | ${mdEsc(d.area ?? '')} | ${mdEsc(placesText(d))} | ${mdEsc(stayText(d))} |`);
  if (doc.flights.length) {
    out.push('', '**航班**', '');
    for (const f of doc.flights) out.push(`- ${mdEsc(flightText(doc, f))}`);
  }
  for (const d of doc.days) {
    out.push('', `## ${d.heading}${d.area ? ` ${mdEsc(d.area)}` : ''}`, '');
    if (d.note) out.push(`> ${mdEsc(d.note)}`, '');
    if (!d.rows.length) out.push('還沒排');
    else out.push(...mdRows(d.rows, ''));
    if (d.lodging) {
      const l = d.lodging;
      out.push('', `**住宿**：${mdLink(l.place.name, l.place.mapsUrl)}${l.place.ja ? `（${mdEsc(l.place.ja)}）` : ''}`);
      const meta = lodgingMeta(l);
      if (meta.length) out.push(`- ${mdEsc(meta.join('・'))}`);
      if (l.address) out.push(`- 地址：${mdEsc(l.address)}`);
      if (l.phone) out.push(`- 電話：${mdEsc(l.phone)}`);
    } else if (d.stayArea) out.push('', `**住宿**：${mdEsc(d.stayArea)}（還沒選住宿）`);
  }
  if (doc.reservations.length) {
    out.push('', '## 預約一覽', '', `> ${RESERVATION_NOTE}`, '', reservationTime(doc), '', '| 哪天 | 哪裡 | 狀態 |', '| --- | --- | --- |');
    for (const r of doc.reservations) out.push(`| ${r.when} | ${mdEsc(r.name)} | ${r.status} |`);
  }
  return `${out.join('\n')}\n`;
}

function flightText(doc: ExportDoc, f: ExportDoc['flights'][number]): string {
  const day = doc.days.find((d) => d.date === f.date)?.heading ?? f.date;
  const verb = f.direction === 'arrive' ? '抵達' : '起飛';
  return `${day} ${verb} ${f.airport}：${f.flightNo ? `${f.flightNo} ` : ''}${f.depart} → ${f.arrive}${f.people ? `（${f.people} 人）` : ''}`;
}

// --- 列印用 HTML ------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const link = (text: string, url: string | null) => (url ? `<a href="${esc(url)}">${esc(text)}</a>` : esc(text));

const CSS = `
@page { size: A4; margin: 14mm 12mm 16mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; padding: 16px; color: #1f2328; background: #fff; font: 16px/1.55 "Noto Sans TC", "Microsoft JhengHei", "PingFang TC", "Hiragino Sans", sans-serif; }
a { color: #1d4ed8; }
h1 { font-size: 26px; margin: 0 0 4px; }
h2 { font-size: 24px; margin: 0 0 10px; padding-bottom: 6px; border-bottom: 2px solid #1f2328; }
h2 .area { font-weight: 400; color: #57606a; margin-left: 8px; }
h3 { font-size: 17px; margin: 18px 0 6px; }
.sub { color: #57606a; margin: 0 0 4px; }
.page { break-after: page; page-break-after: always; }
.page:last-of-type { break-after: auto; page-break-after: auto; }
table.overview { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 15px; }
table.overview th, table.overview td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #d0d7de; vertical-align: top; }
table.overview th { background: #f6f8fa; }
table.overview td.places { font-size: 14px; }
ul.flights { padding-left: 20px; margin: 4px 0; }
.note { background: #fff8c5; border-left: 4px solid #d4a72c; padding: 6px 10px; margin: 0 0 10px; }
.stop { display: grid; grid-template-columns: 7.2em 1fr; gap: 0 10px; padding: 6px 0; break-inside: avoid; }
.stop .t { font-weight: 700; font-variant-numeric: tabular-nums; }
.stop .n { font-weight: 700; font-size: 17px; }
.stop .m { color: #57606a; font-size: 14px; }
.r-pending { color: #b42318; font-weight: 700; }
.stop.minor .n { font-size: 15px; }
.gap { margin: 2px 0 2px 8.2em; padding: 2px 10px; color: #57606a; font-size: 14px; font-variant-numeric: tabular-nums; }
.leg { margin: 0 0 0 8.2em; padding: 4px 10px; border-left: 3px solid #8c959f; color: #3d444d; font-size: 14px; break-inside: avoid; }
.leg .h { font-weight: 700; }
.leg ul { margin: 2px 0 0; padding-left: 18px; }
.leg li { margin: 2px 0; }
.ticket { display: inline-block; background: #b42318; color: #fff; border-radius: 4px; padding: 0 6px; font-weight: 700; font-size: 13px; margin-left: 6px; }
.missed { color: #57606a; font-size: 13px; }
.lodging { margin-top: 14px; padding: 10px 12px; background: #f6f8fa; border-radius: 8px; break-inside: avoid; }
.lodging .n { font-weight: 700; font-size: 17px; }
.empty { color: #57606a; }
footer { margin-top: 18px; color: #8c959f; font-size: 12px; }
@media screen { body { max-width: 820px; margin: 0 auto; } .page { margin-bottom: 40px; } }
`;

/** 補充資訊排成 HTML：還沒訂的紅字 */
const metaHtml = (meta: string[]) => meta.map((m) => (m === '預約：待訂' ? `<span class="r-pending">${esc(m)}</span>` : esc(m))).join('・');

function htmlStop(s: ExportStop): string {
  const meta = stopMeta(s);
  const minor = s.kind === 'start' || s.kind === 'lodging';
  const map = s.place?.mapsUrl && !minor ? `　${link('地圖', s.place.mapsUrl)}` : '';
  const [time, ...rest] = stopHead(s).split(' ');
  const title = rest.join(' ');
  const alternatives = s.alternatives.map((a) => `<div class="m">備案：${esc(a.name)}${a.mapsUrl ? `　${link('地圖', a.mapsUrl)}` : ''}</div>`).join('');
  return `<div class="stop${minor ? ' minor' : ''}"><div class="t">${esc(time)}</div><div><div class="n">${esc(title)}${map}</div>${
    meta.length ? `<div class="m">${metaHtml(meta)}</div>` : ''
  }${alternatives}${s.note ? `<div class="m">備註：${esc(s.note)}</div>` : ''}</div></div>`;
}

function htmlLeg(l: ExportLeg): string {
  const items: string[] = [];
  if (l.rides.length && l.walkBefore) items.push(`<li>步行 ${l.walkBefore} 分到上車的地方</li>`);
  for (const r of l.rides) {
    const ticket = ticketText(r);
    const missed = missedText(r.missed);
    items.push(`<li>${esc(rideText(r))}${ticket ? `<span class="ticket">${esc(ticket)}</span>` : ''}${missed ? `<div class="missed">${esc(missed)}</div>` : ''}</li>`);
  }
  if (l.rides.length && l.walkAfter) items.push(`<li>下車步行 ${l.walkAfter} 分</li>`);
  if (l.note) items.push(`<li>備註：${esc(l.note)}</li>`);
  return `<div class="leg"><div class="h">↓ ${esc(legHead(l))}</div>${items.length ? `<ul>${items.join('')}</ul>` : ''}</div>`;
}

function htmlRows(rows: ExportRow[]): string {
  return rows
    .map((row) => (row.kind === 'leg' ? htmlLeg(row.leg) : row.kind === 'gap' ? `<div class="gap">${esc(gapText(row.gap))}</div>` : htmlStop(row.stop)))
    .join('\n');
}

/** 總覽的住宿那格：住宿名稱，只定了區寫「志摩（還沒選住宿）」 */
const stayText = (d: ExportDay) => d.lodging?.place.name ?? (d.stayArea ? `${d.stayArea}（還沒選住宿）` : '');

function htmlLodging(l: ExportLodging): string {
  const meta = lodgingMeta(l);
  return `<div class="lodging"><div>今晚住</div><div class="n">${link(l.place.name, l.place.mapsUrl)}${l.place.ja ? `（${esc(l.place.ja)}）` : ''}</div>${
    meta.length ? `<div>${metaHtml(meta)}</div>` : ''
  }${l.address ? `<div>地址：${esc(l.address)}</div>` : ''}${l.phone ? `<div>電話：${esc(l.phone)}</div>` : ''}</div>`;
}

export function exportHtml(doc: ExportDoc): string {
  const footer = `<footer>${esc(versionText(doc))}。PDF 不會跟著行程更新，以網站為準。</footer>`;
  const overview = `<section class="page">
<h1>${esc(EXPORT_TITLE)}</h1>
<p class="sub">${esc(doc.range)}・${esc(partyText(doc.party))}</p>
${doc.flights.length ? `<h3>航班</h3><ul class="flights">${doc.flights.map((f) => `<li>${esc(flightText(doc, f))}</li>`).join('')}</ul>` : ''}
<h3>每天</h3>
<table class="overview"><thead><tr><th>日期</th><th>地區</th><th>去哪裡</th><th>住宿</th></tr></thead><tbody>
${doc.days.map((d) => `<tr><td>${esc(d.heading)}</td><td>${esc(d.area ?? '')}</td><td class="places${d.places.length ? '' : ' empty'}">${esc(placesText(d))}</td><td>${esc(stayText(d))}</td></tr>`).join('\n')}
</tbody></table>
${footer}
</section>`;
  const reservations = doc.reservations.length
    ? `<section class="page">
<h2>預約一覽</h2>
<div class="note">${esc(RESERVATION_NOTE)}</div>
<p class="sub">${esc(reservationTime(doc))}</p>
<table class="overview"><thead><tr><th>哪天</th><th>哪裡</th><th>狀態</th></tr></thead><tbody>
${doc.reservations.map((r) => `<tr><td>${esc(r.when)}</td><td>${esc(r.name)}</td><td>${r.status === '待訂' ? `<span class="r-pending">${esc(r.status)}</span>` : esc(r.status)}</td></tr>`).join('\n')}
</tbody></table>
${footer}
</section>`
    : '';
  const days = doc.days.map(
    (d) => `<section class="page">
<h2>${esc(d.heading)}${d.area ? `<span class="area">${esc(d.area)}</span>` : ''}</h2>
${d.note ? `<div class="note">${esc(d.note)}</div>` : ''}
${d.rows.length ? htmlRows(d.rows) : '<p class="empty">還沒排</p>'}
${d.lodging ? htmlLodging(d.lodging) : d.stayArea ? `<div class="lodging"><div>今晚住</div><div class="n">${esc(d.stayArea)}（還沒選住宿）</div></div>` : ''}
${footer}
</section>`,
  );
  return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(`${EXPORT_TITLE}（第 ${doc.version} 版）`)}</title>
<style>${CSS}</style></head>
<body>
${overview}
${days.join('\n')}
${reservations}</body></html>`;
}
