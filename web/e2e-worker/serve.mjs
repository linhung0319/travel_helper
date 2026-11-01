// T15 完成條件的環境：build 過的網站＋本機 Worker＋獨立的本機 D1（worker/.wrangler/e2e-<埠>，不動 npm run dev:worker 用的那份）。
// 每次都重建：套用 migrations、匯入真的資料、開 wrangler dev。Playwright 的 webServer 跑這支。
// 網站要先 build：npm run build:site（根目錄的 npm run e2e:worker 會先跑）。

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSql, loadSources, planImport, resolveScope } from '../../scripts/lib/import-plan.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WORKER = path.join(ROOT, 'worker');
const WRANGLER = path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js');
// 埠可以換（E2E_WORKER_PORT）：8799 被別的程序佔著時用；D1 的目錄跟著埠，互不影響
export const PORT = Number(process.env.E2E_WORKER_PORT ?? 8799);
export const PERSIST = `.wrangler/e2e-${PORT}`;

const ENV = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' };

function wrangler(args) {
  const r = spawnSync(process.execPath, [WRANGLER, ...args], { cwd: WORKER, encoding: 'utf8', env: ENV, maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`wrangler ${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

const d1 = (...args) => ['d1', ...args, '--local', '--persist-to', PERSIST];

/** 清掉使用者的資料（行程、留言…），預設資料留著；每個測試開始前跑 */
export function resetUserData() {
  const tables = ['comments', 'candidates', 'reservations', 'votes', 'snapshots', 'itinerary', 'place_edits', 'user_places', 'chat_messages', 'chat_conversations', 'ai_usage'];
  wrangler(d1('execute', 'travel-helper', '--yes', '--command', tables.map((t) => `DELETE FROM ${t};`).join(' ')));
}

/** 把這個人今天的 AI 花費設成某個金額（測每天的上限） */
export function setTodayCost(member, usd) {
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  wrangler(d1('execute', 'travel-helper', '--yes', '--command', `INSERT OR REPLACE INTO ai_usage (member_id, date, cost_micro_usd) VALUES ('${member}', '${today}', ${Math.round(usd * 1e6)});`));
}

/** 本機假的 Claude API（SSE 格式照官方）：Worker 用真的 SDK 打它，e2e 不花錢。第一次叫工具，工具結果回來才回答 */
function fakeClaude() {
  const line = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const start = line('message_start', { type: 'message_start', message: { id: 'msg', type: 'message', role: 'assistant', model: 'fake', content: [], stop_reason: null, stop_sequence: null, usage } });
  const end = (stop) => line('message_delta', { type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 20 } }) + line('message_stop', { type: 'message_stop' });
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const { messages } = JSON.parse(body);
      const last = messages.at(-1).content;
      const afterTool = Array.isArray(last) && last.some((b) => b.type === 'tool_result');
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      if (afterTool) {
        const text = '找到 [[place:toba-aquarium]]，適合全員。\n[[reply:排進 2/5 下午]][[reply:換一家]]';
        res.end(start + line('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }) + line('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }) + line('content_block_stop', { type: 'content_block_stop', index: 0 }) + end('end_turn'));
      } else {
        const input = JSON.stringify({ text: '水族館' });
        res.end(start + line('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: `toolu_${Date.now()}`, name: 'search_places', input: {} } }) + line('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: input } }) + line('content_block_stop', { type: 'content_block_stop', index: 0 }) + end('tool_use'));
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
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
  // E2E_REAL_CLAUDE=1：用 worker/.env 的 key 打真的 Claude API（real-claude.mjs 用，會花錢）
  const claudeVars = process.env.E2E_REAL_CLAUDE ? ['--var', `AI_MODEL:${process.env.AI_MODEL ?? 'claude-sonnet-5-5'}`] : ['--var', 'ANTHROPIC_API_KEY:fake', '--var', `ANTHROPIC_BASE_URL:http://127.0.0.1:${await fakeClaude()}`];
  const child = spawn(process.execPath, [WRANGLER, 'dev', '--port', String(PORT), '--persist-to', PERSIST, '--var', 'DEV_AUTH:1', ...claudeVars], { cwd: WORKER, env: ENV, stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 0));
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill());
}
