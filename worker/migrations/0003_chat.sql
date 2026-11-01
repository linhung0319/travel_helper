-- T16：聊天紀錄、AI 用量。還沒部署過，舊的 chat_messages 沒有要保留的資料。

DROP TABLE chat_messages;

-- 一段對話：只有本人看得到。對話 ID 是伺服器產生的，查詢一律帶 member_id
CREATE TABLE chat_conversations (
  id         TEXT PRIMARY KEY,
  member_id  TEXT NOT NULL REFERENCES members(line_user_id),
  title      TEXT NOT NULL,
  usage      TEXT NOT NULL DEFAULT 'ok' CHECK (usage IN ('ok', 'near', 'full')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX chat_conversations_member ON chat_conversations(member_id, updated_at);

-- 一則訊息。data 是整則 ChatMessage 的 JSON（content 照 Claude API，還有 cards、contexts、turnContext），Worker 不解讀
CREATE TABLE chat_messages (
  seq             INTEGER PRIMARY KEY AUTOINCREMENT,  -- 訊息的順序
  id              TEXT NOT NULL,                      -- 瀏覽器產生的訊息 ID
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  turn            TEXT NOT NULL,                      -- 一輪回覆的 ID：重試時整輪拿掉
  data            TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  UNIQUE (conversation_id, id)
);
CREATE INDEX chat_messages_turn ON chat_messages(conversation_id, turn);

-- 用量：分開記快取，費用用百萬分之一美元的整數加總，不累積小數誤差
ALTER TABLE ai_usage ADD COLUMN cache_read_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_usage ADD COLUMN cache_write_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_usage ADD COLUMN cost_micro_usd INTEGER NOT NULL DEFAULT 0;
CREATE INDEX ai_usage_date ON ai_usage(date);
