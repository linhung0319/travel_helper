// 第七輪樣式的防退步測試：圖示都有 path、三個 CSS 檔不寫死顏色、類型色是新的。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ICON_NAMES, ICON_PATHS, iconSvg, type IconName } from '../src/lib/icons.ts';
import { TYPE_COLORS } from '../src/lib/typeStyle.ts';

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');
}

/** 去掉註解和 :root { … } 區塊後，找寫死的顏色（#hex、rgb()/rgba()）的出現處 */
function hardcodedColors(css: string): string[] {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/:root\s*\{[^}]*\}/g, '');
  return body.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? [];
}

test('icons：設計 §2.4 列的每個名稱都有 path', () => {
  for (const n of ['search','heart','thumb-down','calendar','calendar-move','spark','user','chat','clipboard','download','pen','history','more','tag','clock','pin','star','out','undo','trash','warn','walk','car','train','bus','ferry','sliders','sort','grid','list','back','close','check','grip','expand','send','chevron','plus','minus','copy','map','fork','users','bed'])
    assert.ok(ICON_PATHS[n as IconName]?.startsWith('M'), n);
  assert.deepEqual([...ICON_NAMES].sort(), Object.keys(ICON_PATHS).sort());
});
test('iconSvg：線條圖示的行內 SVG', () => {
  const svg = iconSvg('heart', 20);
  assert.match(svg, /^<svg [^>]*viewBox="0 0 24 24"/);
  assert.match(svg, /width="20"/);
  assert.match(svg, /stroke="currentColor"/);
});
test('mobile.css、chat.css 沒有寫死的顏色（:root 以外）', () => {
  for (const f of ['src/mobile/mobile.css', 'src/mobile/chat.css']) assert.deepEqual(hardcodedColors(read(f)), [], f);
});
test('styles.css 只有 :root 裡寫死顏色', () => assert.deepEqual(hardcodedColors(read('src/styles.css')), []));
test('TYPE_COLORS 是新的類型色', () => assert.deepEqual(TYPE_COLORS, { spot: '#3f7a5a', restaurant: '#c46a3a', lodging: '#6e5ba8', station: '#3b6ea8' }));

/** 去掉註解後，畫面程式（components、mobile、shared、lib）裡 emoji 的出現處（檔名:行）；示範對話、dev-fixtures、v0 除外 */
function emojiInJsx(): string[] {
  const root = fileURLToPath(new URL('../src/', import.meta.url));
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      const rel = relative(root, p).split(sep).join('/');
      if (e.isDirectory()) { if (!rel.startsWith('dev-fixtures') && !rel.startsWith('v0')) walk(p); continue; }
      if (!/\.(ts|tsx)$/.test(e.name) || rel === 'mobile/chatDemo.ts') continue;
      if (!/^(components|mobile|shared|lib)\//.test(rel)) continue;
      const text = readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
      text.split('\n').forEach((line, i) => {
        const code = line.replace(/(^|[^:])\/\/.*$/, '$1');
        // © ® ™ 是版權、商標符號（資料出處的字），↗ 是「地圖 ↗」外部連結的文字箭頭（設計 §2.3），都不算圖示
        if (/(?![©®™↗])\p{Extended_Pictographic}/u.test(code)) out.push(`${rel}:${i + 1}`);
      });
    }
  };
  walk(root);
  return out;
}
test('畫面上沒有 emoji 當圖示', () => assert.deepEqual(emojiInJsx(), []));
