// T15 完成條件的環境：build 過的網站＋本機 Worker＋獨立的本機 D1（worker/.wrangler/e2e，不動 npm run dev:worker 用的那份）。
// 每次都重建：套用 migrations、匯入真的資料、開 wrangler dev。Playwright 的 webServer 跑這支。
// 網站要先 build：npm run build:site（根目錄的 npm run e2e:worker 會先跑）。

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSql, loadSources, planImport, resolveScope } from '../../scripts/lib/import-plan.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WORKER = path.join(ROOT, 'worker');
const WRANGLER = path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js');
export const PERSIST = '.wrangler/e2e';
export const PORT = 8799;

const ENV = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' };

function wrangler(args) {
  const r = spawnSync(process.execPath, [WRANGLER, ...args], { cwd: WORKER, encoding: 'utf8', env: ENV, maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`wrangler ${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

const d1 = (...args) => ['d1', ...args, '--local', '--persist-to', PERSIST];

/** 清掉使用者的資料（行程、留言…），預設資料留著；每個測試開始前跑 */
export function resetUserData() {
  const tables = ['comments', 'candidates', 'reservations', 'votes', 'snapshots', 'itinerary', 'place_edits', 'user_places', 'chat_messages'];
  wrangler(d1('execute', 'travel-helper', '--yes', '--command', tables.map((t) => `DELETE FROM ${t};`).join(' ')));
}

async function prepare() {
  fs.rmSync(path.join(WORKER, PERSIST), { recursive: true, force: true });
  wrangler(d1('migrations', 'apply', 'travel-helper'));
  const sources = loadSources(path.join(ROOT, 'data'));
  const scope = resolveScope('all', sources.areaIds);
  const plan = planImport({ sources, scope, state: { places: [], edits: [], redirects: [], lastImportId: 0 } });
  const sql = buildSql(plan, sources, { gitCommit: 'e2e', importedBy: 'e2e', now: new Date().toISOString() });
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'th-e2e-')), 'import.sql');
  fs.writeFileSync(file, sql);
  wrangler(d1('execute', 'travel-helper', '--yes', '--file', file));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepare();
  const child = spawn(process.execPath, [WRANGLER, 'dev', '--port', String(PORT), '--persist-to', PERSIST, '--var', 'DEV_AUTH:1'], { cwd: WORKER, env: ENV, stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 0));
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill());
}
