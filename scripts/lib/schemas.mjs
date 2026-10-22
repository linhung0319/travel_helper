// 讀 schema/ 的 JSON Schema，給 validate、Worker 的驗證程式（build-validators）共用。
//
// 區域不寫死（T24）：common.schema.json 的 areaId 目前是五個區域的 enum。新增區域（例如大阪）
// 時不該改 schema，所以這裡把 areaId 換成一般的 ID 格式；「區域在不在 areas.json」由 validate 另外檢查。
// schema 改好之後（docs/requests.md「[T24] areaId 不寫死」）這段就不會再做任何事。

import fs from 'node:fs';
import path from 'node:path';

/** 讀 schemaDir 下所有 *.schema.json，回傳 [{ file, schema }]（已放寬 areaId） */
export function loadSchemaDocs(schemaDir) {
  return fs
    .readdirSync(schemaDir)
    .filter((f) => f.endsWith('.schema.json'))
    .sort()
    .map((file) => {
      const schema = JSON.parse(fs.readFileSync(path.join(schemaDir, file), 'utf8'));
      return { file, schema: relaxAreaId(schema) };
    });
}

/** areaId 是 enum 的話，改成 common 的 id 格式（kebab-case） */
export function relaxAreaId(schema) {
  const def = schema?.$defs?.areaId;
  if (!def || !Array.isArray(def.enum)) return schema;
  return {
    ...schema,
    $defs: {
      ...schema.$defs,
      areaId: { description: '區域 ID：要在 data/areas.json 裡（由 validate 檢查）', $ref: '#/$defs/id' },
    },
  };
}
