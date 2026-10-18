// 食べログ店家頁的「店舗情報」抽取（CONVENTIONS「餐廳詳細」）：整個檔案貼進 Claude in Chrome 的 javascript_tool。
//
// 用法：用 scripts/chrome-actions.mjs 產生 browser_batch 的動作（每個店家頁 navigate 後接一次這個檔案），
// 回傳的 JSON 一家一行存進工作目錄的 tabelog.jsonl（前面加 "key"），再用 scripts/build-restaurants.mjs draft 轉成欄位。
// 也可以用在 {店家頁}party/（コース頁）：rows 會是空的，course 有コース頁的文字。
//
// 只讀目前頁面的 DOM，不點任何東西、不 fetch 其他頁面。
// 網址只回傳 host＋path（帶 query string 的網址會被 Claude in Chrome 擋下，T8d 實測）。
(() => {
  const text = (el) => el?.innerText.replace(/\s+/g, ' ').trim() || null;
  const stripQuery = (s) => s.replace(/(https?:\/\/[^\s?#]+)[?#]\S*/g, '$1');
  const warnings = [];

  if (/Just a moment|安全驗證|セキュリティ/.test(document.title) || !location.hostname.endsWith('tabelog.com')) {
    return { path: location.pathname, warnings: ['不是食べログ店家頁（可能是 Cloudflare 驗證畫面）：等 5 秒再跑；不會自己消失就停下來'] };
  }

  // 白名單：一次 5 家不會被截斷（T8d 第 3 批實測；黑名單版第 5 家會被截斷）
  const KEEP = ['店名', 'ジャンル', '予約可否', '予約・お問い合わせ', 'お問い合わせ', '電話番号', '住所', '交通手段', '営業時間', '定休日', '予算', '席数', '最大予約可能人数', '個室', '貸切', '禁煙・喫煙', '駐車場', '空間・設備', 'お子様連れ', 'ホームページ', '公式アカウント', '備考'];
  // 這些字之後是說明或連結，切掉
  const CUT = ['営業時間・定休日は変更', '大きな地図', '周辺のお店', '※料金'];
  const rows = {};
  for (const tr of document.querySelectorAll('.rstinfo-table tr')) {
    const th = tr.querySelector('th')?.innerText.replace(/\s+/g, '');
    const td = tr.querySelector('td');
    if (!th || !td || !KEEP.some((k) => th.startsWith(k))) continue;
    let t = stripQuery(text(td) ?? '');
    for (const c of CUT) {
      const i = t.indexOf(c);
      if (i > 0) t = t.slice(0, i).trim();
    }
    rows[th] = t.slice(0, 300);
  }

  const tabs = [...new Set(
    [...document.querySelectorAll('a[href]')]
      .map((a) => a.getAttribute('href'))
      .filter((h) => /\/(dtlmenu|party)\//.test(h) && !h.includes('photo'))
      .map((h) => h.replace(/^.*\/\d+\//, '').replace(/[?#].*$/, '')),
  )].slice(0, 6);

  const header = document.querySelector('.rdheader-rstname-wrap');
  const out = {
    path: location.pathname,
    rstId: location.pathname.match(/\/(\d{6,})\//)?.[1] ?? null,
    name: text(document.querySelector('.display-name')),
    score: Number(text(document.querySelector('.rdheader-rating__score-val-dtl'))) || null,
    reviews: Number(text(document.querySelector('.rdheader-rating__review-target em, .rdheader-rating__review-target .num'))?.replace(/,/g, '')) || null,
    owner: document.body.innerText.includes('食べログ店舗会員等に登録しているため'),
    status: (text(header) ?? '').match(/閉店|移転|休業/)?.[0] ?? null,
    tabs,
    rows,
    warnings,
  };

  if (location.pathname.includes('/party/')) {
    // コース頁：主欄的文字切到「[PR]」前（T8d 第 5 批）
    out.course = (text(document.querySelector('#column-main')) ?? '').split('[PR]')[0].slice(0, 2500);
    return out;
  }
  if (!Object.keys(rows).length) warnings.push('找不到 .rstinfo-table 的店舗情報：選擇器可能失效，改用 get_page_text 並修正這裡');
  if (out.score === null) warnings.push('抓不到分數 .rdheader-rating__score-val-dtl（新店可能真的沒有分數；否則是選擇器失效）');
  return out;
})();
