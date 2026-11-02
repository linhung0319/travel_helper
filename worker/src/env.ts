// Worker 的 binding 和設定（wrangler.jsonc；secret 見 architecture §4「設定值和 secret」）

export interface Env {
  DB: D1Database;
  /** 網站的靜態檔案（wrangler.jsonc 的 assets）；測試時沒有 */
  ASSETS?: Fetcher;
  /** 開發用的固定身分（T24）："1" 才啟用，而且只認 localhost 的請求。只由 `npm run dev:worker` 傳進來，wrangler.jsonc 不設 */
  DEV_AUTH?: string;
  DEV_MEMBER_ID?: string;
  DEV_MEMBER_NAME?: string;
  /** LINE Login channel（T25） */
  LINE_LOGIN_CHANNEL_ID?: string;
  LINE_LOGIN_CHANNEL_SECRET?: string;
  /** Messaging API channel：驗證 webhook 簽章、查群組成員 */
  LINE_MESSAGING_CHANNEL_SECRET?: string;
  LINE_MESSAGING_ACCESS_TOKEN?: string;
  /** 簽登入憑證（cookie）；至少 32 個字元 */
  SESSION_SECRET?: string;
  /** 網站對外的網址（本機是 ngrok 的網址），組 LINE 的 redirect_uri；不從 request 猜 */
  PUBLIC_BASE_URL?: string;
  /** 管理員的 LINE userId，逗號分隔：只有他們能開管理頁 */
  ADMIN_LINE_USER_IDS?: string;
  /** Claude API（T16，只放在 secret，不給瀏覽器）；ANTHROPIC_BASE_URL 只有測試用 */
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  /** AI 的模型、effort、每人每天和全部人每月的美元上限；沒設定時用 api/claude.ts 的預設值 */
  AI_MODEL?: string;
  AI_EFFORT?: string;
  AI_DAILY_USD?: string;
  AI_MONTHLY_USD?: string;
  /** LINE 機器人（T34）分類問法用的模型、每天的美元上限；沒設定時用 bot.ts 的預設值（Haiku、1） */
  AI_BOT_MODEL?: string;
  AI_BOT_DAILY_USD?: string;
}

/** 登入的成員（members 的一列） */
export interface Member {
  id: string;
  displayName: string;
  pictureUrl: string | null;
  source: string;
}

/** 每個 API 處理函式拿到的東西 */
export interface Ctx {
  req: Request;
  url: URL;
  env: Env;
  db: D1Database;
  member: Member;
}
