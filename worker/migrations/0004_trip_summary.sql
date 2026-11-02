-- T34：行程摘要（LINE 機器人用）。時間軸只有瀏覽器算得出來（architecture §6），
-- 所以瀏覽器存完行程、算好時間軸後把摘要（engine 的 TripSummary，JSON）存進來；version 是它對應的行程版本。
-- 只有一列。version 和 itinerary 的不一樣時，表示摘要還沒跟上（例如存完就關掉頁面），下一個打開網站的人會補。
CREATE TABLE trip_summary (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  version    INTEGER NOT NULL,
  data       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
