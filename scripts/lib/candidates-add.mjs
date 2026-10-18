// candidates.mjs add 的合併（T9c 新增）：新的候選加到最後；key 已存在時預設是衝突，replace 時原位置取代。
export function addCandidates(cands, adds, { replace = false } = {}) {
  const idx = new Map(cands.map((c, i) => [c.key, i]));
  const seen = new Set();
  const dupInAdds = adds.filter((c) => (seen.has(c.key) ? true : (seen.add(c.key), false))).map((c) => c.key);
  if (dupInAdds.length) throw new Error(`new.json 裡 key 重複：${dupInAdds.join(', ')}`);
  const conflicts = adds.filter((c) => idx.has(c.key)).map((c) => c.key);
  if (conflicts.length && !replace) return { result: cands, added: 0, replaced: 0, conflicts };
  const result = [...cands];
  let added = 0;
  let replaced = 0;
  for (const c of adds) {
    if (idx.has(c.key)) {
      result[idx.get(c.key)] = c;
      replaced++;
    } else {
      result.push(c);
      added++;
    }
  }
  return { result, added, replaced, conflicts: [] };
}
