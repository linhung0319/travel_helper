// 測試用：用 node:sqlite 模擬 D1 的 API（prepare/bind/first/all/run、batch、exec）。
// 只做 Worker 和匯入腳本用到的部分；D1 本身就是 SQLite，SQL 的行為一樣。
// D1 預設開著外鍵檢查，這裡也開。

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const WORKER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

type Value = null | number | string | bigint | Uint8Array;

class Stmt {
  db: DatabaseSync;
  sql: string;
  args: Value[];
  constructor(db: DatabaseSync, sql: string, args: Value[] = []) {
    this.db = db;
    this.sql = sql;
    this.args = args;
  }
  bind(...args: unknown[]) {
    return new Stmt(
      this.db,
      this.sql,
      args.map((a) => (a === undefined ? null : typeof a === 'boolean' ? Number(a) : (a as Value))),
    );
  }
  private returnsRows() {
    return /^\s*(SELECT|WITH)\b/i.test(this.sql) || /\bRETURNING\b/i.test(this.sql);
  }
  async all<T>() {
    return this.allSync<T>();
  }
  allSync<T>() {
    const st = this.db.prepare(this.sql);
    if (this.returnsRows()) {
      const results = st.all(...this.args) as T[];
      return { results, success: true, meta: { changes: 0, last_row_id: 0, rows_read: results.length } };
    }
    const r = st.run(...this.args);
    return { results: [] as T[], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  async first<T>(col?: string): Promise<T | null> {
    const rows = this.allSync<Record<string, unknown>>().results;
    if (!rows.length) return null;
    return (col ? rows[0][col] : rows[0]) as T;
  }
  async run() {
    return this.allSync();
  }
}

export class FakeD1 {
  db: DatabaseSync;
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.db.exec('PRAGMA foreign_keys = ON');
  }
  prepare(sql: string) {
    return new Stmt(this.db, sql);
  }
  /** D1 的 batch 是一個交易：有一句失敗就全部還原 */
  async batch(stmts: Stmt[]) {
    this.db.exec('BEGIN');
    try {
      const out = stmts.map((s) => s.allSync());
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  async exec(sql: string) {
    this.db.exec(sql);
    return { count: 0, duration: 0 };
  }
}

/** 建一個套用過 migrations/ 的空資料庫 */
export function freshDb(): FakeD1 {
  const d1 = new FakeD1();
  const dir = path.join(WORKER_DIR, 'migrations');
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    d1.db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  }
  return d1;
}
