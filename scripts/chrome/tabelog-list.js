// 食べログ列表頁（rstLst，含町名、個室、貸切篩選）的抽取（CONVENTIONS §4 步驟 7「餐廳候選」，T9c 新增）：整個檔案貼進 Claude in Chrome 的 javascript_tool。
//
// 用法：node scripts/chrome-actions.mjs --tab <tabId> --script tabelog-list <列表網址>...（一次 4～5 頁）
// browser_batch 每個動作的回傳只留約 1,000 字（T9c 實測），所以回傳的是壓縮的文字行（一店一行，欄位用 | 分隔，見 toLine），
// 全文存在 window.__thTabelogList，這支回傳第 1 段（約 900 字），chrome-actions.mjs 的 --parts N 會接著讀第 2～N 段。
// 每段原樣接起來（不加換行）存進工作目錄的 lists/<頁的代號>.txt，再用 scripts/lib/tabelog-list.mjs 的 parseLines 讀回。
//
// 只讀目前頁面的 DOM，不點任何東西、不 fetch 其他頁面。換頁一律用 navigate（看的頁數和人工瀏覽一樣）。
// - 「条件を変えると、もっと多くのお店が見つかります」（.list-alleviate）之後的店**不是篩選結果**（T8c），不回傳，只回傳數量 skipped。
// - 店家網址只回傳 ID（area 是 A2403-A240303 這種代碼）：完整的 /mie/A2403/… 路徑會被當成 Base64 擋下（T8e）。
// - 結果字串的「&」換成「＆」：含 & 的結果會被當成 query string 擋下（T9b）。
// - 第一次載入常是 Cloudflare 的「請稍候…」畫面，程式自己等最多 10 秒。
// 開頭的 await 不能拿掉：javascript_tool 不會自己等 Promise。
await (async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const challenge = () => /Just a moment|請稍候|请稍候|しばらくお待ち|安全驗證|セキュリティ/.test(document.title) || !document.querySelector('.c-page-count, .list-rst, .rstlst-noresult, #column-main');
  for (let t = 0; t < 10000 && challenge(); t += 250) await sleep(250);
  if (challenge() || !location.hostname.endsWith('tabelog.com')) {
    window.__thTabelogList = '';
    return '#WARN 不是食べログ列表頁（Cloudflare 驗證畫面等了 10 秒還在，或頁面不對）：停下來，不要繞過';
  }
  const text = (el) => el?.innerText.replace(/\s+/g, ' ').trim() || null;

  // <parseCount> 「1～20 件を表示 ／ 全 549 件」→ { from, to, total }
  function parseCount(s) {
    const m = (s ?? '').replace(/,/g, '').match(/(\d+)\s*～\s*(\d+)\s*件を表示[^\d]*全\s*(\d+)\s*件/);
    if (m) return { from: Number(m[1]), to: Number(m[2]), total: Number(m[3]) };
    const z = (s ?? '').match(/全\s*0\s*件/);
    return z ? { from: 0, to: 0, total: 0 } : null;
  }
  // </parseCount>

  // <parseCard> 一張店卡的原始字串 → 欄位（純函式，scripts/test/tabelog-list.test.ts 有測試）
  function parseCard(raw) {
    const num = (s) => {
      const n = Number(String(s ?? '').replace(/[,人件]/g, '').trim());
      return Number.isFinite(n) && String(s ?? '').trim() !== '' && n > 0 ? n : null;
    };
    const m = (raw.href ?? '').match(/\/(A\d+)\/(A\d+)\/(?:(A\d+)\/)?(\d{6,})\//);
    const budget = (s) => (!s || /^[-－ー]$/.test(s.trim()) ? null : s.trim());
    const [areaPart, ...genre] = (raw.areaGenre ?? '').split(/\s*\/\s*/);
    const hol = (raw.holiday ?? '').trim();
    return {
      rank: num(raw.rank),
      id: m ? m[4] : null,
      area: m ? [m[1], m[2], m[3]].filter(Boolean).join('-') : null,
      name: raw.name?.trim() || null,
      areaText: areaPart?.trim() || null,
      genre: genre.join('、').trim() || null,
      score: num(raw.score),
      reviews: num(raw.reviews),
      dinner: budget(raw.dinner),
      lunch: budget(raw.lunch),
      holiday: !hol || /^[-－ー]$/.test(hol) ? null : hol,
      address: raw.address?.replace(/^三重県/, '').trim() || null,
      room: raw.room?.trim() || null,
      pr: raw.pr?.trim().slice(0, 80) || null,
      status: (raw.status ?? '').match(/閉店|移転|休業|掲載保留/)?.[0] ?? null,
    };
  }
  // </parseCard>

  // <toLine> 一店一行：id|店名|類別|分數|口コミ|定休|夜|昼|住所|個室|狀態|area|PR（空欄是空字串；| 換成 ｜）
  // 預算「￥3,000～￥3,999」→「3000～3999」，住所拿掉「○○県○○市」
  function toLine(s) {
    const b = (v) => (v ? v.replace(/[￥,]/g, '') : '');
    const clean = (v) => (v == null ? '' : String(v).replace(/\|/g, '｜').replace(/\n/g, ' '));
    const addr = (s.address ?? '').replace(/^.{2,4}?[都道府県]/, '').replace(/^.{1,6}?市/, '').slice(0, 30);
    return [s.id, s.name, s.genre, s.score, s.reviews, s.holiday, b(s.dinner), b(s.lunch), addr, s.room, s.status, s.area, (s.pr ?? '').slice(0, 30)].map(clean).join('|');
  }
  // </toLine>

  const alleviate = document.querySelector('.list-alleviate, .list-alleviate-keyword');
  const cards = [...document.querySelectorAll('.list-rst')];
  // 「条件を変えると」之後的店卡（DOM 順序在它後面）不是結果
  const isResult = (c) => !alleviate || !!(alleviate.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_PRECEDING);
  const results = cards.filter(isResult);
  const shops = results.map((c) => {
    const time = (cls) => text(c.querySelector(`.c-rating-v3__time--${cls}`)?.closest('.list-rst__info-item, li, span, div')?.querySelector('.c-rating-v3__val'));
    return parseCard({
      href: c.querySelector('a.list-rst__rst-name-target')?.getAttribute('href'),
      rank: text(c.querySelector('.list-rst__rank-badge-contents, .list-rst__rank-no')),
      name: text(c.querySelector('a.list-rst__rst-name-target')),
      areaGenre: text(c.querySelector('.list-rst__area-genre')),
      score: text(c.querySelector('.list-rst__rating-val')),
      reviews: text(c.querySelector('.list-rst__rvw-count-num')),
      dinner: time('dinner'),
      lunch: time('lunch'),
      holiday: text(c.querySelector('.list-rst__holiday-text')),
      address: text(c.querySelector('.list-rst__address')),
      room: [...c.querySelectorAll('.list-rst__private-room-info')].map((e) => text(e)).filter(Boolean).join(' ') || null,
      pr: text(c.querySelector('.list-rst__pr-title')),
      status: text(c.querySelector('.list-rst__rst-name-wrap, .list-rst__rst-name')),
    });
  });
  const count = parseCount(text(document.querySelector('.c-page-count')));
  const lines = [`#P|${document.title.replace(/\s*\|\s*食べログ.*$/, '').replace(/のおすすめのグルメ情報 ランキング/, '')}|${count ? `${count.from}-${count.to}/${count.total}` : ''}|${cards.length - results.length}`];
  if (!count && shops.length) lines.push('#WARN 抓不到 .c-page-count 的件數：選擇器可能失效');
  if (shops.some((s) => !s.id)) lines.push('#WARN 有店抓不到店家 ID（href 格式變了？）');
  for (const s of shops) lines.push(toLine(s));
  const all = lines.join('\n').replace(/&/g, '＆') + '\n#END\n';
  window.__thTabelogList = all;
  const SIZE = 900;
  const parts = Math.ceil(all.length / SIZE);
  return `[1/${parts}]` + all.slice(0, SIZE);
})();
