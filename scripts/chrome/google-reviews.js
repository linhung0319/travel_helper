// Google 評論操作與抽取（CONVENTIONS「口コミ、Google 評論」）：整個檔案貼進 Claude in Chrome 的 javascript_tool，
// 只改最後一行的步驟名稱。頁面用 {links.googleMaps}&hl=ja 開（aria-label 是日文）；?cid= 網址可以用（2026-10-18 實測）。
//
// 步驟（同一個 browser_batch 裡依序做，中間不換頁）：
//   'open'    點「クチコミ」分頁，等評論和排序、搜尋按鈕出現
//   'lowest'  排序改成「評価の低い順」，展開並抽前 10 則（'newest' 改成「新しい順」）
//   'search'  打開評論搜尋框、取得焦點並全選舊字 → 接著用 computer 的 type 打關鍵字、key Return
//   'extract' 等搜尋結果換掉（或出現「〇〇に言及しているクチコミはありません」），展開「もっと見る」並抽前 10 則
//
// open／lowest／search 失敗時會 throw，讓 browser_batch 停下來：
// 不然後面的 type 會打進地圖上方的地點搜尋框，整頁跳到別的搜尋結果（實測發生過）。
// extract 抓不到東西時回傳 warnings（不要當成沒有評論）：改用截圖＋get_page_text，並修正這裡的選擇器。
// 只點分頁、排序、搜尋框、「もっと見る」，不點其他按鈕（按讚、送出、クチコミを書く）；不 fetch 其他頁面。
await (async (step) => {
  const LIMIT = 10;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, ms = 8000) => {
    for (let t = 0; t < ms; t += 250) {
      const v = fn();
      if (v) return v;
      await sleep(250);
    }
    return null;
  };
  const text = (el) => el?.textContent.trim() || null;
  const fail = (msg) => {
    throw new Error(`google-reviews ${step}：${msg}`);
  };

  const reviewTab = () =>
    [...document.querySelectorAll('button[role="tab"]')].find((b) => b.textContent.includes('クチコミ'));
  const sortButton = () => document.querySelector('button[aria-label="クチコミの並べ替え"]');
  const searchButton = () => document.querySelector('button[aria-label="クチコミを検索"]');
  // 評論搜尋框收起來時寬度是 0（但 offsetParent 不是 null），所以要看寬度
  const searchInput = () =>
    [...document.querySelectorAll('[role="main"] input')].find((x) => x.getBoundingClientRect().width > 0);
  const reviewEls = () => {
    const seen = new Set();
    return [...document.querySelectorAll('div[data-review-id][aria-label]')].filter(
      (d) => !seen.has(d.dataset.reviewId) && seen.add(d.dataset.reviewId),
    );
  };
  const firstId = () => reviewEls()[0]?.dataset.reviewId ?? null;
  const noResult = () => /に言及しているクチコミはありません/.test(document.body.innerText);
  const loading = () => /読み込んでいます/.test(document.body.innerText);
  // 換排序或搜尋後，等清單換掉：第一則不一樣了、或出現「沒有結果」；第一則剛好一樣時等到逾時（8 秒）再抽
  const waitForNewList = async (before) => {
    await waitFor(() => !loading() && (noResult() || (firstId() && firstId() !== before)));
    await sleep(500);
  };

  const extract = async () => {
    // 「もっと見る」全部展開（只點評論裡面的）
    for (const b of document.querySelectorAll('div[data-review-id] button[aria-expanded="false"]')) {
      if (b.textContent.includes('もっと見る')) b.click();
    }
    await sleep(800);
    const reviews = reviewEls()
      .slice(0, LIMIT)
      .map((d) => {
        const star = d.querySelector('[role="img"][aria-label*="つ星"]');
        const buttons = [...d.querySelectorAll('button')].map((b) => b.textContent.trim());
        return {
          stars: star?.getAttribute('aria-label') ?? null,
          date: text(star?.nextElementSibling),
          // 外文評論：預設是原文，旁邊有「翻訳を見る」；顯示的是翻譯時會有「原文を表示」
          lang: buttons.some((s) => s.includes('原文を表示'))
            ? 'translated'
            : buttons.some((s) => s.includes('翻訳を見る'))
              ? 'original-foreign'
              : 'ja-or-unknown',
          text: text(d.querySelector('.wiI7pd'))?.slice(0, 600) ?? null,
        };
      });
    const warnings = [];
    const none = noResult();
    if (!reviews.length && !none) warnings.push('找不到 div[data-review-id]，也沒有「言及しているクチコミはありません」：選擇器可能失效或還沒載入完');
    if (reviews.length && reviews.every((r) => !r.stars)) warnings.push('每則都抓不到「N つ星」：選擇器可能失效');
    if (reviews.length && reviews.every((r) => !r.text)) warnings.push('每則都抓不到內文 .wiI7pd（混淆過的 class，可能改了）');
    return { step, keyword: searchInput()?.value || null, noResult: none, count: none ? 0 : reviews.length, reviews: none ? [] : reviews, warnings };
  };

  if (step === 'open') {
    const tab = await waitFor(reviewTab);
    if (!tab) fail('找不到「クチコミ」分頁：確認是用 hl=ja 開的店家頁');
    tab.click();
    if (!(await waitFor(() => reviewEls().length && sortButton() && searchButton()))) {
      fail('點了クチコミ分頁，但評論或排序、搜尋按鈕沒出現');
    }
    return { step, ok: true, loaded: reviewEls().length };
  }

  if (step === 'lowest' || step === 'newest') {
    const btn = await waitFor(sortButton);
    if (!btn) fail('找不到「クチコミの並べ替え」：先跑 open');
    btn.click();
    const label = step === 'lowest' ? '評価の低い順' : '新しい順';
    const item = await waitFor(() =>
      [...document.querySelectorAll('[role="menuitemradio"]')].find((e) => e.textContent.includes(label)),
    );
    if (!item) fail(`排序選單裡找不到「${label}」`);
    const before = firstId();
    item.click();
    await waitForNewList(before);
    return extract();
  }

  if (step === 'search') {
    let input = searchInput();
    if (!input) {
      const btn = await waitFor(searchButton);
      if (!btn) fail('找不到「クチコミを検索」：先跑 open');
      btn.click();
      input = await waitFor(searchInput);
    }
    if (!input) fail('點了搜尋，但輸入框沒打開');
    input.focus();
    input.select();
    if (document.activeElement !== input) fail('輸入框拿不到焦點');
    window.__googleReviewsBefore = firstId(); // 給 extract 判斷清單換掉了沒
    return { step, ok: true, previous: input.value || null };
  }

  if (step === 'extract') {
    await waitForNewList(window.__googleReviewsBefore ?? null);
    return extract();
  }

  fail(`不認得的步驟（open／lowest／newest／search／extract）`);
})('open'); // 開頭的 await 不能拿掉：javascript_tool 不會自己等 Promise，沒有 await 會回傳 {}
