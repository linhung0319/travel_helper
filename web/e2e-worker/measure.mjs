// 載入的前後數字（T15）：條件同 T32：390×844、4 倍 CPU、1.6 Mbps。
// 前面放一個會 gzip 的小代理（wrangler dev 不壓縮，Cloudflare 會），下載量才接近正式環境。
//   node --experimental-strip-types web/e2e-worker/measure.mjs        要先跑 npm run build:site，並有 worktree 的 e2e 環境（serve.mjs）在跑
// 量兩次：第一次（沒有快取）、第二次（有快取，304、/assets/ 長快取）。

import http from 'node:http';
import zlib from 'node:zlib';
import { chromium } from '@playwright/test';

const ORIGIN = Number(process.env.E2E_WORKER_PORT ?? 8799);
const COMPRESSIBLE = /json|javascript|css|html|svg/;

const server = http.createServer((req, res) => {
  const headers = { ...req.headers, host: `localhost:${ORIGIN}`, 'x-dev-member': 'dev-measure' };
  delete headers['accept-encoding'];
  // Worker 會檢查 Origin 是不是自己的網站
  if (headers.origin) headers.origin = `http://localhost:${ORIGIN}`;
  const up = http.request({ port: ORIGIN, path: req.url, method: req.method, headers }, (r) => {
    const type = String(r.headers['content-type'] ?? '');
    const out = { ...r.headers };
    if (r.statusCode === 200 && COMPRESSIBLE.test(type) && /gzip/.test(String(req.headers['accept-encoding']))) {
      delete out['content-length'];
      out['content-encoding'] = 'gzip';
      res.writeHead(r.statusCode, out);
      r.pipe(zlib.createGzip({ level: 6 })).pipe(res);
    } else {
      res.writeHead(r.statusCode, out);
      r.pipe(res);
    }
  });
  req.pipe(up);
});
// 隨機的空埠
await new Promise((r) => server.listen(0, r));
const PROXY = server.address().port;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

async function run(label) {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const mbps = 1.6;
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (mbps * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });

  const size = new Map();
  const urls = new Map();
  cdp.on('Network.requestWillBeSent', (e) => urls.set(e.requestId, new URL(e.request.url)));
  cdp.on('Network.loadingFinished', (e) => size.set(e.requestId, e.encodedDataLength));
  // 不用 page.route：它會關掉 HTTP 快取，第二次就量不到快取的效果
  await cdp.send('Network.setBlockedURLs', { urls: ['*routing.openstreetmap.de*'] });

  const start = Date.now();
  await page.goto(`http://localhost:${PROXY}/`, { waitUntil: 'commit' });
  await page.waitForFunction(() => document.querySelector('[data-testid="m-tab-explore"]') && !document.querySelector('#boot'), undefined, { timeout: 120_000 });
  const interactive = Date.now() - start;
  const paint = await page.evaluate(() => performance.getEntriesByType('paint').find((e) => e.name === 'first-paint')?.startTime ?? null);
  // 等時刻表、詳情層都讀完（都下載好或回 304）
  const finished = (path) => [...urls].some(([id, u]) => u.pathname === path && size.has(id));
  const until = Date.now() + 60_000;
  while (Date.now() < until && !(finished('/api/places/details') && finished('/static/timetables/engine.json'))) await page.waitForTimeout(200);
  const allLoaded = Date.now() - start;

  const rows = [...urls].filter(([, u]) => u.port === String(PROXY));
  const kb = (test) => Math.round(rows.filter(([, u]) => test(u.pathname)).reduce((a, [id]) => a + (size.get(id) ?? 0), 0) / 1024);
  const count = (test) => rows.filter(([, u]) => test(u.pathname)).length;
  console.log(
    JSON.stringify({
      label,
      firstPaintMs: paint && Math.round(paint),
      interactiveMs: interactive,
      detailsAndEngineLoadedMs: allLoaded,
      workerRequests: count((p) => !p.startsWith('/assets/')),
      jsRequests: count((p) => p.endsWith('.js')),
      jsKB: kb((p) => p.endsWith('.js')),
      placesKB: kb((p) => p === '/api/places'),
      detailsKB: kb((p) => p === '/api/places/details'),
      bootstrapKB: kb((p) => p === '/api/bootstrap'),
      engineKB: kb((p) => p === '/static/timetables/engine.json'),
      totalSameOriginKB: kb(() => true),
    }),
  );
  await page.close();
}

await run('第一次（沒有快取）');
await run('第二次（有快取）');
await browser.close();
server.closeAllConnections();
server.close();
