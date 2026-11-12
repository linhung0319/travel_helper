// scripts/chrome-receiver.mjs 的測試（T86c）。執行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { safeName, upsertLine, handle } from '../chrome-receiver.mjs';

test('safeName：只收工作目錄底下的 .jsonl、.txt、.json，可有一層 lists/、notes/、facts/', () => {
  assert.equal(safeName('/tabelog.jsonl'), 'tabelog.jsonl');
  assert.equal(safeName('/lists/gion-rt-1.txt'), 'lists/gion-rt-1.txt');
  assert.equal(safeName('/facts/kyoto-izuu.json'), 'facts/kyoto-izuu.json');
  assert.equal(safeName('/%6Cists/a.txt'), 'lists/a.txt');
  assert.equal(safeName('/../secret.json'), null);
  assert.equal(safeName('/lists/../../x.json'), null);
  assert.equal(safeName('/other/a.json'), null);
  assert.equal(safeName('/a/b/c.json'), null);
  assert.equal(safeName('/run.mjs'), null);
  assert.equal(safeName('/.hidden.json'), null);
  assert.equal(safeName('/%E0%A4%A.json'), null); // 解碼失敗
});

test('upsertLine：同一個 key＋step＋path 換掉舊行，其他的加在最後', () => {
  const a = JSON.stringify({ key: 'k1', path: '1/', v: 1 });
  const b = JSON.stringify({ key: 'k1', path: '1/party/', v: 2 });
  let t = upsertLine('', a);
  t = upsertLine(t, b);
  assert.deepEqual(t.trim().split('\n'), [a, b]); // path 不同：店家頁和コース頁各留一行
  const a2 = JSON.stringify({ key: 'k1', path: '1/', v: 3 });
  t = upsertLine(t, a2);
  assert.deepEqual(t.trim().split('\n'), [a2, b]);
  const s1 = JSON.stringify({ key: 'k1', step: 'google-lowest', n: 1 });
  t = upsertLine(t, s1);
  assert.equal(t.trim().split('\n').length, 3); // step 不同也是另一行
  const noKey = JSON.stringify({ v: 9 });
  t = upsertLine(upsertLine(t, noKey), noKey);
  assert.equal(t.trim().split('\n').length, 5); // 沒有 key 的一律加在最後
  assert.ok(t.endsWith('\n'));
});

test('handle：jsonl 在前面加 key、step；.txt 整個覆寫；body 不是 JSON 時丟錯', () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'receiver-'));
  try {
    assert.match(handle(work, 'reviews.jsonl', 'kyoto-a', JSON.stringify({ reviews: [1] }), 'google-lowest'), /^saved reviews\.jsonl kyoto-a google-lowest/);
    handle(work, 'reviews.jsonl', 'kyoto-a', JSON.stringify({ reviews: [1, 2] }), 'google-lowest');
    handle(work, 'reviews.jsonl', 'kyoto-a', JSON.stringify({ reviews: [] }), 'tabelog-latest');
    const lines = fs.readFileSync(path.join(work, 'reviews.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(lines, [
      { key: 'kyoto-a', step: 'google-lowest', reviews: [1, 2] },
      { key: 'kyoto-a', step: 'tabelog-latest', reviews: [] },
    ]);
    assert.deepEqual(Object.keys(lines[0]), ['key', 'step', 'reviews']);

    handle(work, 'lists/p1.txt', null, 'first');
    handle(work, 'lists/p1.txt', null, 'second');
    assert.equal(fs.readFileSync(path.join(work, 'lists/p1.txt'), 'utf8'), 'second');

    handle(work, 'x.jsonl', 'k', JSON.stringify([1, 2])); // 陣列不加 key
    assert.equal(fs.readFileSync(path.join(work, 'x.jsonl'), 'utf8'), '[1,2]\n');
    assert.throws(() => handle(work, 'x.jsonl', 'k', 'not json'), /JSON/);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});
