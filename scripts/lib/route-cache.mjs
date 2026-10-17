// web/src/lib/geo/route.ts 的 RouteCache 介面，存到 data/cache/routes/<key>.json（Node 端用）

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROUTES_CACHE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/cache/routes');

export function fileRouteCache(dir = ROUTES_CACHE_DIR) {
  const file = (key) => {
    if (!/^[A-Za-z0-9_.-]+$/.test(key)) throw new Error(`不合法的快取 key：${key}`);
    return path.join(dir, `${key}.json`);
  };
  return {
    dir,
    get(key) {
      try {
        return JSON.parse(fs.readFileSync(file(key), 'utf8'));
      } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw e;
      }
    },
    set(key, value) {
      fs.mkdirSync(dir, { recursive: true });
      // 座標 [經度, 緯度] 寫在同一行，路線檔才不會太長
      const json = JSON.stringify(value, null, 2).replace(/\[\s+(-?[\d.e+-]+),\s+(-?[\d.e+-]+)\s+\]/g, '[$1, $2]');
      fs.writeFileSync(file(key), json + '\n');
    },
  };
}
