#!/usr/bin/env node
// 把 data/ 的資料點匯入 D1 的預設資料層（architecture §3.4）。預設是本機的 D1（wrangler --local），加 --remote 是正式環境（T25）。
//
// 1. 先比對、出報告（dry run，預設）：
//      npm run db:import -- --all                    全部區域（areas.json 列的）
//      npm run db:import -- --area ise,futami        指定區域（逗號分隔）
//      npm run db:import -- --all --resolve r.json   有衝突時：{ "<修改 ID>": "keep" | "use-base" }
//    報告寫到 data/cache/import/<時間>-<範圍>.md（給 👤 看）和 .json（計畫）。
// 2. 👤 看過報告、處理完衝突，正式匯入：
//      npm run db:import -- --apply data/cache/import/<時間>-<範圍>.json
//    會重新比對一次，和報告不一樣（資料或資料庫在這之間變了）就不匯入，請重新出報告。
//
// 正式環境：出報告和 --apply 都要加 --remote（報告記著是哪一邊，--apply 時對不上就不匯入）：
//      npm run db:import -- --all --remote
//      npm run db:import -- --apply data/cache/import/<時間>-all-remote.json --remote
//    正式環境不自動套用 migrations：先跑 npm run db:migrate:remote。
//
// 其他參數：--by <名字>（imported_by，預設 git 的 user.name）、--skip-validate（只給測試用）
//
// 第一步一定先跑 scripts/validate.mjs，不過就不匯入。本機會先套用 worker/migrations。

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildSql, loadSources, planImport, readDbState, readOldData, reportMarkdown, resolveScope } from './lib/import-plan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKER = path.join(ROOT, 'worker');
const DB_NAME = 'travel-helper';
const OUT_DIR = path.join(ROOT, 'data/cache/import');

function parseArgs(argv) {
  const o = { data: path.join(ROOT, 'data'), scope: null, apply: null, resolve: null, by: null, skipValidate: false, remote: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') o.scope = 'all';
    else if (a === '--area') o.scope = argv[++i];
    else if (a === '--apply') o.apply = argv[++i];
    else if (a === '--resolve') o.resolve = argv[++i];
    else if (a === '--by') o.by = argv[++i];
    else if (a === '--data') o.data = path.resolve(argv[++i]);
    else if (a === '--skip-validate') o.skipValidate = true;
    else if (a === '--remote') o.remote = true;
    else fail(`未知的參數：${a}`);
  }
  return o;
}

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

/** 透過 wrangler 操作 D1（本機的和 wrangler dev 用同一份 worker/.wrangler/state） */
function wrangler(args) {
  const bin = path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js');
  const r = spawnSync(process.execPath, [bin, ...args], {
    cwd: WORKER,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' },
  });
  if (r.status !== 0) throw new Error(`wrangler ${args.slice(0, 3).join(' ')} 失敗：\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

export function d1Target(remote) {
  const where = remote ? '--remote' : '--local';
  return {
    label: remote ? '正式環境的 D1' : '本機 D1',
    async query(sql) {
      const out = JSON.parse(wrangler(['d1', 'execute', DB_NAME, where, '--json', '--command', sql]));
      return out.flatMap((r) => r.results ?? []);
    },
    async executeFile(file) {
      wrangler(['d1', 'execute', DB_NAME, where, '--yes', '--file', file]);
    },
    migrate() {
      // 正式環境不自動套用：要先跑 npm run db:migrate:remote
      if (!remote) wrangler(['d1', 'migrations', 'apply', DB_NAME, '--local']);
    },
  };
}

export const localDb = d1Target(false);

function git(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function gitCommit(dataDir) {
  const head = git(['rev-parse', '--short', 'HEAD']) || 'unknown';
  const dirty = git(['status', '--porcelain', '--', path.relative(ROOT, dataDir) || '.']);
  return dirty ? `${head}-dirty` : head;
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

async function main() {
  const o = parseArgs(process.argv.slice(2));
  let saved = null;
  if (o.apply) {
    saved = JSON.parse(fs.readFileSync(o.apply, 'utf8'));
    o.scope ??= saved.scopeSpec;
    o.resolve ??= saved.resolveFile;
    if (o.scope !== saved.scopeSpec) fail(`--apply 的計畫範圍是「${saved.scopeSpec}」，和這次指定的「${o.scope}」不同`);
    if (Boolean(saved.remote) !== o.remote) fail(`這份報告是${saved.remote ? '正式環境' : '本機'}的，--apply 時${saved.remote ? '要' : '不要'}加 --remote`);
  }
  if (!o.scope) fail('要指定 --all 或 --area <區域>');

  if (!o.skipValidate) {
    console.log('1/4 驗證 data/（scripts/validate.mjs）…');
    const v = spawnSync(process.execPath, [path.join(ROOT, 'scripts/validate.mjs'), '--data', o.data], { encoding: 'utf8' });
    if (v.status !== 0) {
      console.log(v.stdout);
      fail('驗證沒過，不匯入');
    }
  }

  const sources = loadSources(o.data);
  let scope;
  try {
    scope = resolveScope(o.scope, sources.areaIds);
  } catch (e) {
    fail(e.message);
  }
  const resolutions = o.resolve ? JSON.parse(fs.readFileSync(o.resolve, 'utf8')) : {};

  const db = d1Target(o.remote);
  console.log(o.remote ? `2/4 讀${db.label} 的狀態（migrations 要先跑 npm run db:migrate:remote）…` : `2/4 套用 migrations、讀${db.label} 的狀態…`);
  db.migrate();
  const state = await readDbState(db);
  const changed = [...sources.records.entries()]
    .filter(([id, s]) => scope.has(s.area) && state.places.some((p) => p.id === id && p.content_hash !== s.hash))
    .map(([id]) => id);
  const oldData = await readOldData(db, changed);

  console.log('3/4 比對…');
  const plan = planImport({ sources, scope, state, oldData, resolutions });
  const commit = gitCommit(o.data);
  const s = plan.summary;
  const line = `新增 ${s.add}、更新 ${s.update}、恢復 ${s.restore}、下架 ${s.retire}、沒變 ${s.unchanged}、區域換了 ${s.moved}；修改：保留 ${s.editsKept}、收掉 ${s.editsClosed}、衝突 ${s.conflicts}（沒處理 ${s.unresolved}）；轉址 ${s.redirects}`;

  if (!o.apply) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const base = path.join(OUT_DIR, `${stamp()}-${o.scope === 'all' ? 'all' : [...scope].join('_')}${o.remote ? '-remote' : ''}`);
    const generatedAt = new Date().toISOString();
    fs.writeFileSync(`${base}.json`, JSON.stringify({ scopeSpec: o.scope, resolveFile: o.resolve, remote: o.remote, gitCommit: commit, generatedAt, plan }, null, 2));
    fs.writeFileSync(`${base}.md`, reportMarkdown(plan, { sources, generatedAt, gitCommit: commit }));
    console.log(`4/4 報告（${db.label}；dry run，還沒有寫進資料庫）：\n  ${line}\n  ${path.relative(ROOT, base)}.md\n  ${path.relative(ROOT, base)}.json`);
    if (plan.unresolved.length) console.log(`\n⚠️  有 ${plan.unresolved.length} 個衝突沒處理：寫一個 --resolve 的 JSON 再出一次報告`);
    else console.log(`\n看過報告沒問題的話：npm run db:import -- --apply ${path.relative(ROOT, base)}.json${o.remote ? ' --remote' : ''}`);
    return;
  }

  if (plan.planHash !== saved.plan.planHash) {
    fail(`資料或資料庫在出報告之後變了（報告 ${saved.plan.planHash}、現在 ${plan.planHash}），請重新出報告給 👤 看`);
  }
  if (plan.unresolved.length) fail(`還有 ${plan.unresolved.length} 個衝突沒處理`);
  const sql = buildSql(plan, sources, { gitCommit: commit, importedBy: o.by ?? (git(['config', 'user.name']) || 'unknown'), now: new Date().toISOString() });
  // 絕對路徑：wrangler 在 worker/ 底下執行，相對路徑會找不到
  const sqlFile = path.resolve(o.apply.replace(/\.json$/, '') + '.sql');
  fs.writeFileSync(sqlFile, sql);
  console.log(`4/4 寫進${db.label}（${sql.split('\n').length - 1} 句）…`);
  console.log(`   ${path.relative(ROOT, sqlFile)}`);
  await db.executeFile(sqlFile);
  const [{ n }] = await db.query('SELECT COUNT(*) AS n FROM places_base WHERE retired_at IS NULL');
  console.log(`✅ 匯入 #${plan.importId} 完成：${line}\n   資料庫裡上架中的資料點 ${n} 筆`);
}

main().catch((e) => fail(e.stack ?? String(e)));
