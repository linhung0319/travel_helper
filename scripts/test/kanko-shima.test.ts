// scripts/kanko-shima.mjs 的測試。執行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseList, parseDetail } from '../kanko-shima.mjs';

// 2026-10-18 實際列表頁的卡片（縮短 img）
const LIST = `
				<li>
					<!-- サムネイル -->
					<a href="https://www.kanko-shima.com/purpose/965/" class="post_links">
						<div class="arh_img"><img src="x.webp" alt="横山展望台" /></div>
					</a>
					<div class="tag_flex">
						<a href="https://www.kanko-shima.com/purpose_cate/see/?s_area[]=40&s_keywords=">阿児エリア</a>						<a href="https://www.kanko-shima.com/purpose_cate/see/?s_tag[]=94&s_keywords=">展望台</a><a href="https://www.kanko-shima.com/purpose_cate/see/?s_tag[]=89&s_keywords=">桜</a>					</div>
					<a href="https://www.kanko-shima.com/purpose/965/">
						<p>横山展望台</p>
					</a>
				</li>
				<li>
					<!-- サムネイル -->
					<a href="https://www.kanko-shima.com/purpose/1237/" class="post_links"></a>
					<div class="tag_flex">
						<a href="https://www.kanko-shima.com/purpose_cate/see/?s_area[]=119&s_keywords=">他エリア</a>					</div>
					<a href="https://www.kanko-shima.com/purpose/1237/">
						<p>伊勢志摩スカイライン</p>
					</a>
				</li>`;

test('列表卡片：id、名稱、エリア、タグ', () => {
  assert.deepEqual(parseList(LIST), [
    { id: 965, name: '横山展望台', areas: ['阿児エリア'], tags: ['展望台', '桜'] },
    { id: 1237, name: '伊勢志摩スカイライン', areas: ['他エリア'], tags: [] },
  ]);
});

test('詳細頁 Information：只留白名單欄位，郵遞區號拿掉，<br> 換成 /', () => {
  const html = `<dl>
					<dt>住所</dt>
					<dd>〒517-0501　志摩市阿児町鵜方875-20</dd>
				</dl>
				<dl>
					<dt>FAX</dt>
					<dd>0599-46-0701</dd>
				</dl>
				<dl>
					<dt>Webサイト</dt>
					<dd><a href="http://chubu.env.go.jp/nature/yokoyama/" target="_blank">
						http://chubu.env.go.jp/nature/yokoyama/</a>
					</dd>
				</dl>
				<dl>
					<dt>アクセス</dt>
					<dd>【公共交通機関】<br />
・近鉄鵜方駅からタクシーで約8分<br />
</dd>
				</dl>`;
  assert.deepEqual(parseDetail(html), {
    住所: '志摩市阿児町鵜方875-20',
    Webサイト: 'http://chubu.env.go.jp/nature/yokoyama/',
    アクセス: '【公共交通機関】 / ・近鉄鵜方駅からタクシーで約8分',
  });
});
