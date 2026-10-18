// 食べログ口コミ抽取（CONVENTIONS「口コミ、Google 評論」）：整個檔案貼進 Claude in Chrome 的 javascript_tool。
//
// 用法：在 browser_batch 裡，每個 navigate 後面接一次這個檔案：
//   {店家頁}dtlrvwlst/              最新 20 則＋頁尾店舗情報
//   {店家頁}dtlrvwlst/?sw=<關鍵字>   只列含這個詞的口コミ，摘要截在關鍵字附近
//
// 只讀目前頁面的 DOM，不點任何東西、不 fetch 其他頁面。
// 抓不到東西時回傳 warnings（不要當成沒有評論）：改用 get_page_text，並修正這裡的選擇器。
(() => {
  const text = (el) => el?.textContent.replace(/\s+/g, ' ').trim() || null;
  const warnings = [];

  if (/Just a moment|安全驗證|セキュリティ/.test(document.title) || !location.hostname.endsWith('tabelog.com')) {
    return { url: location.href, warnings: ['不是食べログ口コミ頁（可能是 Cloudflare 驗證畫面）：等 5 秒再跑；不會自己消失就停下來'] };
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

  // 頁尾的店舗情報（每個口コミ頁都有，第一頁讀一次就好）
  const info = {};
  for (const tr of document.querySelectorAll('.rstinfo-table tr')) {
    const key = text(tr.querySelector('th'));
    if (key && /席数|個室|貸切|予約可否|営業時間|定休日/.test(key)) info[key] = text(tr.querySelector('td'))?.slice(0, 200) ?? null;
  }
  if (!Object.keys(info).length) warnings.push('找不到 .rstinfo-table 的店舗情報：選擇器可能失效');

  return { url: location.href, keyword, count, reviews, info, warnings };
})();
