-- T25：LINE 登入、群組檢查、白名單（architecture §5）

-- 機器人所在的 LINE 群組：被邀進群組時（webhook 的 join）記下來。
-- 誰都能加機器人好友、把它邀進自己的群組，所以要 👤 在管理頁核准，這個群組的成員才能登入。
CREATE TABLE line_groups (
  group_id    TEXT PRIMARY KEY,
  group_name  TEXT,                        -- 群組資訊 API（summary）拿的；拿不到是 NULL
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  joined_at   TEXT NOT NULL,
  left_at     TEXT,                        -- 機器人被移出群組（leave）：不再拿來檢查
  decided_by  TEXT,                        -- 核准或拒絕的管理員
  decided_at  TEXT
);

-- 登入時被擋下來的人（不在核准的群組裡、也不在白名單）：管理頁可以核准成白名單
CREATE TABLE login_requests (
  line_user_id   TEXT PRIMARY KEY,
  display_name   TEXT NOT NULL,
  picture_url    TEXT,
  first_at       TEXT NOT NULL,
  last_at        TEXT NOT NULL,
  attempts       INTEGER NOT NULL DEFAULT 1,
  dismissed_at   TEXT                      -- 管理員按「不核准」：不再列出，下次登入被擋時再列出
);

-- 停用的原因：left-group（退出群組，重新登入時再檢查）| admin（管理員停用，重新登入也不會恢復）
ALTER TABLE members ADD COLUMN disabled_reason TEXT;
