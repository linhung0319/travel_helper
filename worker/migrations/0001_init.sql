-- T24：D1 的資料表（architecture.md §3.3）。
-- 時間欄位（*_at）是 UTC 的 ISO 字串（new Date().toISOString()），只用來記錄誰、何時改的；
-- 行程裡的時間另外照 §3.8 存日本時間的字串，不放在這些欄位。
-- JSON 欄位存 JSON 文字。

-- 匯入紀錄：一次匯入一列（scripts/db-import.mjs）
CREATE TABLE imports (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  area         TEXT NOT NULL,              -- 匯入的區域，逗號分隔（全部：areas.json 的全部區域）
  git_commit   TEXT,                       -- 匯入時的 git commit（有沒 commit 的修改時加上 -dirty）
  imported_at  TEXT NOT NULL,
  imported_by  TEXT NOT NULL,
  summary      TEXT NOT NULL               -- JSON：各類筆數、處理的衝突
);

-- 預設資料層：只有匯入能寫
CREATE TABLE places_base (
  id                TEXT PRIMARY KEY,
  type              TEXT NOT NULL,         -- station | spot | lodging | restaurant
  area              TEXT,                  -- 不寫死區域：areas.json 的 ID
  data              TEXT NOT NULL,         -- 資料點的 JSON（和 data/ 裡的一樣）
  content_hash      TEXT NOT NULL,         -- data 的 sha256（鍵排序後），用來判斷內容變了沒
  import_id         INTEGER NOT NULL REFERENCES imports(id),   -- 最後一次改到這一列的匯入
  first_import_id   INTEGER NOT NULL REFERENCES imports(id),
  retired_at        TEXT,                  -- 下架：這次匯入的來源裡沒有這個 ID（不刪除）
  retired_import_id INTEGER REFERENCES imports(id)
);
CREATE INDEX places_base_area ON places_base(area);

-- 修改層：一個點的一個欄位一列。合併規則見 worker/src/lib/merge.ts
CREATE TABLE place_edits (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id         TEXT NOT NULL,          -- places_base 或 user_places 的 ID
  field_path       TEXT NOT NULL,          -- 最上層欄位，或往下一層（group.maxSeats）
  value            TEXT NOT NULL,          -- JSON：整個取代那個位置的值
  base_value       TEXT,                   -- JSON：修改時的預設值；NULL＝預設資料沒有這個欄位
  note             TEXT,                   -- 修改的理由（選填）
  author           TEXT NOT NULL REFERENCES members(line_user_id),
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,          -- 建立、復原、匯入收掉時更新；GET /api/edits?since= 用
  reverted_at      TEXT,                   -- 復原：只有改的人自己能按
  reverted_by      TEXT,
  closed_at        TEXT,                   -- 匯入時收掉：新的預設值和使用者改的一樣，或衝突時選了「用新的預設值」
  closed_import_id INTEGER REFERENCES imports(id),
  closed_reason    TEXT                    -- same-as-new-base | conflict-use-base
);
CREATE INDEX place_edits_place ON place_edits(place_id);
CREATE INDEX place_edits_updated ON place_edits(updated_at);

-- 自己加的點
CREATE TABLE user_places (
  id         TEXT PRIMARY KEY,             -- user-<隨機>，和匯入的 ID 不會撞（validate 禁止 user- 開頭）
  type       TEXT NOT NULL,                -- spot | lodging | restaurant
  data       TEXT NOT NULL,
  author     TEXT NOT NULL REFERENCES members(line_user_id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  deleted_at TEXT                          -- 軟刪除：只有本人能刪
);
CREATE INDEX user_places_updated ON user_places(updated_at);

-- 轉址：合併重複點時（data/redirects.json，匯入時寫進來）
CREATE TABLE redirects (
  old_id    TEXT PRIMARY KEY,
  new_id    TEXT NOT NULL,
  reason    TEXT,
  import_id INTEGER NOT NULL REFERENCES imports(id)
);

-- 成員（T25 的 LINE 登入寫入；T24 用開發用的固定身分，source = 'dev'）
CREATE TABLE members (
  line_user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  picture_url  TEXT,
  source       TEXT NOT NULL,              -- group | allowlist | dev
  checked_at   TEXT,
  disabled_at  TEXT
);

-- 確定的行程：只有一列（id = 1）。格式由 T14 定
CREATE TABLE itinerary (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  data       TEXT NOT NULL,
  version    INTEGER NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 快照：每次改行程前自動存一份
CREATE TABLE snapshots (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  data       TEXT NOT NULL,
  version    INTEGER NOT NULL,             -- 這份快照是行程的第幾版
  reason     TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 建議：一則一列
CREATE TABLE suggestions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  day              TEXT NOT NULL,          -- 'YYYY-MM-DD' 或 'trip'（整趟）
  place_ids        TEXT NOT NULL DEFAULT '[]',
  text             TEXT NOT NULL,
  author           TEXT NOT NULL REFERENCES members(line_user_id),
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'adopted', 'declined')),
  status_note      TEXT,
  status_by        TEXT,
  status_at        TEXT,
  adopted_item_ids TEXT,
  deleted_at       TEXT
);
CREATE INDEX suggestions_updated ON suggestions(updated_at);

-- 投票：一人對一個點一筆。收回是軟刪除（deleted_at），同步時只要看 MAX(updated_at)
CREATE TABLE votes (
  place_id   TEXT NOT NULL,
  member_id  TEXT NOT NULL REFERENCES members(line_user_id),
  value      TEXT NOT NULL CHECK (value IN ('like', 'dislike')),
  note       TEXT,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (place_id, member_id)
);
CREATE INDEX votes_updated ON votes(updated_at);

-- 聊天紀錄：只有自己看得到
CREATE TABLE chat_messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id       TEXT NOT NULL REFERENCES members(line_user_id),
  conversation_id TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,           -- JSON：Claude API 的 content
  created_at      TEXT NOT NULL
);
CREATE INDEX chat_messages_member ON chat_messages(member_id, conversation_id, id);

-- AI 用量（T16）
CREATE TABLE ai_usage (
  member_id     TEXT NOT NULL,
  date          TEXT NOT NULL,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (member_id, date)
);
