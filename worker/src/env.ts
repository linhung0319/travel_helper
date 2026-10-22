// Worker 的 binding 和設定（wrangler.jsonc）

export interface Env {
  DB: D1Database;
  /** 開發用的固定身分（T24）："1" 才啟用。T25 換成 LINE 登入，正式環境不能設 */
  DEV_AUTH?: string;
  DEV_MEMBER_ID?: string;
  DEV_MEMBER_NAME?: string;
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
