// 把食べログ「店舗情報」（scripts/chrome/tabelog-info.js 的 rows）轉成資料檔的欄位草稿。
// 只做機械式的轉換；轉不了或有疑問的放 warnings，由 Claude 判斷（例如備考寫「団体OK」）。
// T7e 的合併腳本曾把「沒有座敷」轉成 zashiki、把電話號碼當成天數，所以這裡只認食べログ固定的字樣，並附測試
// （scripts/test/tabelog-parse.test.ts）。

const num = (s) => (s == null ? null : Number(String(s).replace(/,/g, '')));
const PHONE = /0\d{1,4}-\d{1,4}-\d{3,4}/;

// 「有 （2人可、10～20人可、30人以上可）」→ 30；「20人～50人可」→ 50
function maxPeople(s) {
  const ns = [...(s ?? '').matchAll(/(\d+)\s*人/g)].map((m) => Number(m[1]));
  return ns.length ? Math.max(...ns) : null;
}

export function parseReservation(s) {
  if (!s) return { accepted: 'unknown', fullyReserved: false };
  if (/予約不可/.test(s)) return { accepted: 'no', fullyReserved: false };
  if (/完全予約制/.test(s)) return { accepted: 'yes', fullyReserved: true };
  if (/予約可/.test(s)) return { accepted: 'yes', fullyReserved: false };
  return { accepted: 'unknown', fullyReserved: false };
}

export function parseKids(s) {
  if (!s) return null;
  const kidsMenu = /お子様メニューあり/.test(s) ? true : null;
  if (/子供不可|お子様連れ不可/.test(s)) return { allowed: 'no', minAge: null, kidsMenu, note: `食べログ：${s}` };
  if (/子供可/.test(s)) {
    // 只寫「小学生可」、或寫「未就学児不可」：學齡前不行（這團小孩 6～10 歲，多半不受影響）
    const young = /乳児可|未就学児可/.test(s);
    const limited = /未就学児不可|乳児不可/.test(s) || (/小学生可/.test(s) && !young);
    return { allowed: limited ? 'age-limit' : 'yes', minAge: null, kidsMenu, note: `食べログ：${s}` };
  }
  return { allowed: 'unknown', minAge: null, kidsMenu, note: `食べログ：${s}` };
}

// 空間・設備：只認「〇〇あり」的字樣；沒寫的不推測（不會推出 table）
export function parseSeating(s) {
  if (!s) return [];
  const out = [];
  if (/座敷あり/.test(s)) out.push('zashiki');
  if (/掘りごたつあり/.test(s)) out.push('horigotatsu');
  if (/カウンター席あり/.test(s)) out.push('counter');
  if (/ソファー席あり/.test(s)) out.push('sofa');
  if (/テラス席あり/.test(s)) out.push('terrace');
  return out;
}

// fit15 的建議值：照 CONVENTIONS「團體（15 人）」只看容量和能不能訂位；邊界照 decisions-pending T8d 的前例：
//   不能預約 → unknown（就算席數多）；可預約＋最大予約／個室／包場 ≥15 → yes；可預約＋席數 ≥20 → split；席數 <15 → no
export function suggestFit15({ accepted, seats, maxReservation, privateRoomMax, buyoutAllowed, buyoutMax }) {
  if (seats != null && seats < 15) return { value: 'no', why: `席數 ${seats}，不到 15` };
  if (accepted === 'no') return { value: 'unknown', why: '不能預約（就算席數多也是 unknown）' };
  if (accepted === 'yes') {
    if (maxReservation >= 15) return { value: 'yes', why: `最大予約 ${maxReservation} 人` };
    if (privateRoomMax >= 15) return { value: 'yes', why: `個室最多 ${privateRoomMax} 人` };
    if (buyoutAllowed && buyoutMax >= 15) return { value: 'yes', why: `貸切最多 ${buyoutMax} 人` };
    if (seats >= 20) return { value: 'split', why: `可預約、席數 ${seats}，沒寫一次能接 15 人` };
  }
  return { value: 'unknown', why: '沒有足夠的容量或預約資訊' };
}

export function parseTabelog(info) {
  const r = info?.rows ?? {};
  // 「予算（口コミ集計）」是口コミ的集計，不是店家寫的預算：startsWith 會把它當成「予算」（T8e 實測：沒有「予算」的店）
  const row = (k) => Object.entries(r).find(([th]) => th.startsWith(k) && !th.includes("口コミ集計"))?.[1] ?? null;
  const warnings = [];

  const resText = row('予約可否');
  const { accepted, fullyReserved } = parseReservation(resText);
  const seatsText = row('席数');
  const seats = num(seatsText?.match(/(\d[\d,]*)\s*席/)?.[1]);
  const maxText = row('最大予約可能人数');
  const maxReservation = num(maxText?.match(/着席[^\d]*(\d+)/)?.[1] ?? maxText?.match(/(\d+)\s*人/)?.[1]);
  const roomText = row('個室');
  const privateRoom = roomText == null ? null : /^(有|可)/.test(roomText) ? true : /^(無|不可)/.test(roomText) ? false : null;
  const privateRoomMax = privateRoom ? maxPeople(roomText) : null;
  const buyText = row('貸切');
  const buyoutAllowed = buyText == null ? null : /^可/.test(buyText) ? true : /^不可/.test(buyText) ? false : null;
  const buyoutMax = buyoutAllowed ? maxPeople(buyText) : null;
  const space = row('空間・設備');
  const remarks = row('備考');
  const kidsText = row('お子様連れ');
  const kids = parseKids(kidsText);
  const official = row('公式アカウント') ?? '';
  const ig = official.match(/instagram\.com\/([A-Za-z0-9._]+)/)?.[1] ?? null;

  if (seatsText && seats == null) warnings.push(`席数看不懂：「${seatsText}」`);
  if (maxText && maxReservation == null) warnings.push(`最大予約可能人数看不懂：「${maxText}」`);
  if (remarks && /団体|宴会|貸切|個室/.test(remarks)) warnings.push(`備考提到團體、宴會：「${remarks.slice(0, 120)}」（明寫接團體的話 fit15 可以是 yes）`);
  if (kids?.allowed === 'no') warnings.push('不接小孩：不影響 fit15（只看容量），記在 kids.allowed，notes 寫明全員不能去');
  if (resText && accepted === 'unknown') warnings.push(`予約可否看不懂：「${resText}」`);

  const fit15 = suggestFit15({ accepted, seats, maxReservation, privateRoomMax, buyoutAllowed, buyoutMax });
  const parts = [
    seatsText ? `席数 ${seatsText}` : '席數沒寫',
    maxText ? `最大予約 ${maxText}` : null,
    roomText ? `個室 ${roomText}` : null,
    buyText ? `貸切 ${buyText}` : null,
    resText ?? null,
  ].filter(Boolean);

  return {
    score: info?.score ?? null,
    reviews: info?.reviews ?? null,
    owner: info?.owner ?? null,
    status: info?.status ?? null,
    genre: row('ジャンル'),
    phone: (row('予約・お問い合わせ') ?? row('お問い合わせ') ?? row('電話番号') ?? '').match(PHONE)?.[0] ?? null,
    address: row('住所'),
    hoursText: row('営業時間'),
    closedText: row('定休日'),
    budget: row('予算'),
    parking: row('駐車場'),
    homepage: row('ホームページ')?.match(/https?:\/\/\S+/)?.[0] ?? null,
    instagram: ig ? `@${ig}` : null,
    remarks,
    group: {
      seats,
      maxReservation,
      privateRoom,
      privateRoomMax,
      buyout: buyText ? (buyoutAllowed === false ? '不可' : buyText) : null,
      fit15: fit15.value,
      source: `食べログ：${parts.join('、')} → ${fit15.value}（${fit15.why}）`,
    },
    reservation: { accepted, fullyReserved, text: resText },
    seating: parseSeating(space),
    kids,
    barrierFree: space?.match(/車椅子で入店可|バリアフリー/)?.[0] ?? null,
    smoking: row('禁煙・喫煙')?.split(/\s/)[0] ?? null,
    tabs: info?.tabs ?? [],
    warnings,
  };
}
