// 食べログ口コミ抽取（CONVENTIONS「口コミ、Google 評論」）：整個檔案貼進 Claude in Chrome 的 javascript_tool。
//
// 用法：在 browser_batch 裡，每個 navigate 後面接一次這個檔案：
//   {店家頁}dtlrvwlst/              最新 20 則＋頁尾店舗情報
//   {店家頁}dtlrvwlst/?sw=<關鍵字>   只列含這個詞的口コミ，摘要截在關鍵字附近
//
// 只讀目前頁面的 DOM，不點任何東西、不 fetch 其他頁面。
// 抓不到東西時回傳 warnings（不要當成沒有評論）：改用 get_page_text，並修正這裡的選擇器。
// path 只回傳店家 ID 之後的部分：完整網址會被 Claude in Chrome 當成 Base64 擋下（T8e 實測）。
// Cloudflare 的「請稍候…」畫面程式自己等最多 10 秒（T8e 實測）；開頭的 await 不能拿掉。
await (async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const challenge = () => /Just a moment|請稍候|请稍候|しばらくお待ち|安全驗證|セキュリティ/.test(document.title) || !document.querySelector(".rstinfo-table, .rvw-item, .c-page-count");
  for (let t = 0; t < 10000 && challenge(); t += 250) await sleep(250);
  const path = location.pathname.replace(/^\/[a-z]+\/A\d+\/A\d+\/(A\d+\/)?/, "");
  const text = (el) => el?.textContent.replace(/\s+/g, ' ').trim() || null;
  const warnings = [];

  if (challenge() || !location.hostname.endsWith('tabelog.com')) {
    return { path, warnings: ['不是食べログ口コミ頁（Cloudflare 驗證畫面等了 10 秒還在，或頁面不對）：停下來，不要繞過'] };
  }

  const keyword = new URLSearchParams(location.search).get('sw');
  const count = text(document.querySelector('.c-page-count'));
  const items = [...document.querySelectorAll('.rvw-item')];

  const reviews = items.map((r) => ({
    visit: text(r.querySelector('.rvw-item__date')),
    score: text(r.querySelector('.c-rating-v3__val')),
    reviewerCount: text(r.querySelector('.rvw-item__rvwr-num')),
    title: text(r.querySelector('.rvw-item__title')),
    comment: text(r.querySelector('.rvw-item__rvw-comment'))?.slice(0, 300) ?? null,
  }));

  // 0 筆時是「0 件を表示 ／ 全 0 件」「ご指定の条件に該当する口コミは見つかりませんでした。」
  if (!items.length && !/全 ?0 ?件/.test(count ?? '') && !/該当する口コミは見つかりません/.test(document.body.innerText)) {
    warnings.push('找不到 .rvw-item，也沒有「0 件」的字樣：選擇器可能失效或頁面還沒載入完');
  }
  if (reviews.length && reviews.every((r) => !r.comment)) warnings.push('每則都抓不到 .rvw-item__rvw-comment：選擇器可能失效');
  if (reviews.length && reviews.every((r) => !r.visit)) warnings.push('每則都抓不到 .rvw-item__date：選擇器可能失效');

  // 頁尾的店舗情報（每個口コミ頁都有，第一頁讀一次就好）。欄位和 tabelog-info.js 的白名單相同，
  // 重點店可以只開口コミ頁、不另外開店家首頁（頁尾是不是完整的表，第一次用時確認；不完整就照舊開店家頁）
  const KEEP = /^(店名|ジャンル|予約可否|予約・お問い合わせ|お問い合わせ|電話番号|住所|営業時間|定休日|予算|席数|最大予約可能人数|個室|貸切|禁煙・喫煙|駐車場|空間・設備|お子様連れ|公式アカウント|備考)/;
  const info = {};
  // ?sw= 的頁面不重複回傳（T8e：省 token）
  for (const tr of keyword ? [] : document.querySelectorAll('.rstinfo-table tr')) {
    const key = tr.querySelector('th')?.textContent.replace(/\s+/g, '');
    if (key && KEEP.test(key)) info[key] = text(tr.querySelector('td'))?.replace(/(https?:\/\/[^\s?#]+)[?#]\S*/g, '$1').slice(0, 250) ?? null;
  }
  if (!keyword && !Object.keys(info).length) warnings.push('找不到 .rstinfo-table 的店舗情報：選擇器可能失效');

  return { path, keyword, count, reviews, info, warnings };
})();
