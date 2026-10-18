// 旅程期間的營業判斷（restaurant-gaps.mjs、lodging-dinner-access.mjs 共用；T8e 從 restaurant-gaps.mjs 拆出來）。
//   tripDays：旅程每天的日期、星期、是不是國定假日。
//   tripCount：旅程中某個時段有營業的天數、不明的天數（hours 為 null 時回傳 null）。國定假日用 hours.holiday（沒有就用星期幾）。
//   isLunch／isDinner：CONVENTIONS「判斷細則」的午餐店（11:30～13:30）、晚餐店（18:00～19:00，hours 不明的不算）。

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function tripDays(from, to, holidays) {
  const hol = new Set(holidays);
  const out = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    out.push({ iso, dow: DAYS[d.getUTCDay()], holiday: hol.has(iso) });
  }
  return out;
}

export const mins = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
export const overlaps = (slots, a, b) => slots.some(([s, e]) => mins(s) < mins(b) && mins(e) > mins(a));

export function slotsOn(r, d) {
  return d.holiday && r.hours.holiday !== undefined && r.hours.holiday !== null ? r.hours.holiday : r.hours[d.dow];
}

export function tripCount(r, a, b, days) {
  if (!r.hours) return null;
  let open = 0;
  let unknown = 0;
  for (const d of days) {
    const slots = slotsOn(r, d);
    if (slots == null) unknown++;
    else if (overlaps(slots, a, b)) open++;
  }
  return { open, unknown };
}

export const isLunch = (r, days) => {
  if (!(r.contexts ?? []).includes('lunch')) return false;
  if (r.hours == null) return true;
  const c = tripCount(r, '11:30', '13:30', days);
  return c.open + c.unknown > 0;
};
export const isDinner = (r, days) => (r.contexts ?? []).includes('dinner') && r.hours != null && tripCount(r, '18:00', '19:00', days).open > 0;
