// Google Maps 地點抽取（餐廳、景點、住宿共用）：整個檔案貼進 Claude in Chrome 的 javascript_tool。
//
// 用法：用 scripts/chrome-actions.mjs --google "<店名 地名>" 產生 browser_batch 的動作
// （navigate 到 https://www.google.com/maps/search/<查詢>?hl=ja，再接這個檔案）。
// 回傳的 JSON 一筆一行存進工作目錄的 google.jsonl（前面加 "key"）。
//
// 搜尋結果是列表時（同名分店、本館／別館），回傳 list（前 5 筆的名稱），不會自己點：
// 用 find 點對的那筆、或加分店名、地址重搜，再跑一次。
// 只讀目前頁面的 DOM，不點任何東西、不 fetch 其他頁面；網址只回傳解析後的值（完整網址會被 Claude in Chrome 擋下）。
await (async () => {
  // <closedStatus> 營業狀態只看地點面板開頭（「概要」分頁之前：店名、星數、類別、狀態那幾行）。
  // T9d 第 3 批：整個面板都比對時，店家貼文「臨時休業のご案内」、訪問者的「臨時休業でした」都會中（5 家誤判 4 家）
  const closedStatus = (mainText) => {
    const head = mainText.split(/\n\s*概要\s*\n/)[0];
    if (/閉業/.test(head)) return 'permanently-closed';
    if (/^\s*臨時休業\s*$/m.test(head)) return 'temporarily-closed';
    return null;
  };
  // </closedStatus>
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // 網址要從 /search/ 變成 /place/ 才有 !1s（cid）和 !3d!4d（座標）；列表頁一直是 /search/
  for (let t = 0; t < 10000 && !location.href.includes('/place/') && !document.querySelector('div[role="feed"]'); t += 250) await sleep(250);
  await sleep(800);

  const u = location.href;
  const text = (el) => el?.innerText.trim() || null;
  const warnings = [];

  if (!u.includes('/place/')) {
    const list = [...document.querySelectorAll('div[role="feed"] a.hfpxzc')].slice(0, 5).map((a) => a.getAttribute('aria-label'));
    if (!list.length) warnings.push('不是地點頁、也找不到列表 a.hfpxzc：選擇器可能失效或查無結果');
    return { list, warnings };
  }

  let cid = null;
  const hex = u.match(/!1s0x[0-9a-f]+:(0x[0-9a-f]+)/i)?.[1];
  // cid 每 4 位加空格：純數字的長字串有時會被 Claude in Chrome 當成 Base64 擋下（T8e 實測，3 家中 1 家）；讀的程式要去掉空格
  // cid 每 4 位加空格：純數字的長字串有時會被 Claude in Chrome 當成 Base64 擋下（T8e 實測，3 家中 1 家）；
  // build-restaurants.mjs 讀的時候會去掉空格
  if (hex) cid = BigInt(hex).toString().replace(/(\d{4})(?=\d)/g, '$1 ');
  const lat = Number(u.match(/!3d(-?[\d.]+)/)?.[1]) || null;
  const lng = Number(u.match(/!4d(-?[\d.]+)/)?.[1]) || null;

  // 星數、評論數：div.F7nice 是混淆過的 class；抓不到時退到 aria-label「N つ星」和「N 件のクチコミ」
  let rating = null;
  let reviews = null;
  const f7 = text(document.querySelector('div.F7nice'));
  if (f7) {
    rating = Number(f7.match(/^(\d\.\d)/)?.[1]) || null;
    reviews = Number(f7.match(/\(([\d,]+)\)/)?.[1]?.replace(/,/g, '')) || null;
  }
  if (rating === null) {
    const star = document.querySelector('[role="main"] [role="img"][aria-label*="つ星"]');
    rating = Number(star?.getAttribute('aria-label').match(/([\d.]+)/)?.[1]) || null;
  }
  if (reviews === null) {
    const rv = [...document.querySelectorAll('[role="main"] [aria-label*="件のクチコミ"]')][0];
    reviews = Number(rv?.getAttribute('aria-label').match(/([\d,]+)/)?.[1]?.replace(/,/g, '')) || null;
  }

  const web = document.querySelector('a[data-item-id="authority"]')?.href ?? null;
  const img = document.querySelector('button[aria-label^="写真"] img')?.src ?? null;
  const out = {
    // 從列表點進去時，第一個 h1 是列表的「スポンサー」標題（T8e 實測）：先用地點面板 [role="main"] 的 aria-label
    name: document.querySelector('[role="main"][aria-label]')?.getAttribute('aria-label') || text(document.querySelector('h1')),
    rating,
    reviews,
    cid,
    lat,
    lng,
    address: text(document.querySelector('button[data-item-id="address"]'))?.replace(/^\W+/, '') ?? null,
    // 「+81 596-…」的國碼換回 0（T8e 實測：瀏覽器地區不是日本時這樣顯示，開頭的 + 被 \W 拿掉）
    phone: text(document.querySelector('button[data-item-id^="phone"]'))?.replace(/^\W+/, '').replace(/^81\s?/, '0') ?? null,
    website: web ? new URL(web).hostname + new URL(web).pathname : null,
    // 主圖：尾端的尺寸參數改成寬 800
    img: img && img.includes('=w') ? img.split('=w')[0] + '=w800' : img,
    closed: closedStatus(document.querySelector('[role="main"]')?.innerText ?? ''),
    warnings,
  };
  if (!cid) warnings.push('網址裡沒有 !1s0x…:0x…，算不出 cid');
  if (lat === null) warnings.push('網址裡沒有 !3d!4d，沒有座標');
  if (rating === null) warnings.push('抓不到星數（新地點可能真的沒有評分；否則是選擇器失效）');
  return out;
})();
