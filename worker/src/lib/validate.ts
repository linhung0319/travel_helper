// 用 schema/ 驗證資料點（ajv standalone 產生的程式，見 scripts/build-validators.mjs）

import * as validators from '../generated/place-validators.js';
import type { PlaceValidator } from '../generated/place-validators.js';

const BY_TYPE: Record<string, PlaceValidator> = {
  station: validators.station,
  spot: validators.spot,
  lodging: validators.lodging,
  restaurant: validators.restaurant,
};

export interface PlaceError {
  path: string;
  message: string;
}

/** 回傳錯誤清單；空的就是通過。anyOf 的每個分支都會報錯，只留最具體的（同 scripts/validate.mjs） */
export function validatePlace(type: string, data: unknown): PlaceError[] {
  const v = BY_TYPE[type];
  if (!v) return [{ path: '/type', message: `不認得的類別「${type}」` }];
  if (v(data)) return [];
  const errs = v.errors ?? [];
  return errs
    .filter((e) => {
      if (e.keyword === 'anyOf') return false;
      if (e.keyword === 'type' && e.params.type === 'null') {
        return !errs.some((o) => o !== e && o.keyword !== 'anyOf' && o.instancePath.startsWith(e.instancePath));
      }
      return true;
    })
    .map((e) => ({
      path: e.instancePath || '/',
      message:
        e.keyword === 'additionalProperties' || e.keyword === 'unevaluatedProperties'
          ? `有 schema 沒定義的欄位「${String(e.params.additionalProperty ?? e.params.unevaluatedProperty)}」`
          : (e.message ?? e.keyword),
    }));
}
