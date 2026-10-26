// 線條圖示的資料（24×24、給 stroke 用，設計 §2.4）；Icon 元件和地圖的 DOM 標記共用。
// 純資料、不含 JSX，測試才讀得到。

export const ICON_NAMES = [
  'search', 'heart', 'thumb-down', 'calendar', 'calendar-move', 'spark', 'user', 'chat', 'clipboard', 'download',
  'pen', 'history', 'more', 'tag', 'clock', 'pin', 'star', 'out', 'undo', 'trash',
  'warn', 'walk', 'car', 'train', 'bus', 'ferry', 'sliders', 'sort', 'grid', 'list',
  'back', 'close', 'check', 'grip', 'expand', 'send', 'chevron', 'plus', 'minus', 'copy',
  'map', 'fork', 'users', 'bed',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

/** 每個圖示的 path（可以多段用 M 接起來）；stroke 1.7、不填色 */
export const ICON_PATHS: Record<IconName, string> = {
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.3 15.3L20 20',
  heart: 'M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z',
  'thumb-down': 'M10 15V5H5.5l-1.2 8H10zM10 15l-1.2 4.2c-.2.9.4 1.8 1.4 1.8.7 0 1.3-.4 1.6-1L14 15h4.5V5H10',
  calendar: 'M4.5 6h15v14h-15zM4.5 10.5h15M8.5 3.5v4M15.5 3.5v4',
  'calendar-move': 'M4.5 6h15v14h-15zM4.5 10.5h15M8.5 3.5v4M15.5 3.5v4M8 15.5h7M12.5 13l2.5 2.5-2.5 2.5',
  spark: 'M12 3.5l1.9 5.6 5.6 1.9-5.6 1.9L12 18.5l-1.9-5.6L4.5 11l5.6-1.9zM19 16.5v4M17 18.5h4',
  user: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4.5 20c.6-3.8 3.6-6 7.5-6s6.9 2.2 7.5 6',
  chat: 'M4.5 5.5h15v10h-7l-4.5 4v-4h-3.5z',
  clipboard: 'M8 5H5.5v15.5h13V5H16M9 3.5h6v3H9zM8.5 11h7M8.5 15h5',
  download: 'M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14',
  pen: 'M5 19l.8-4L16.5 4.3a1.8 1.8 0 0 1 2.5 0l.7.7a1.8 1.8 0 0 1 0 2.5L9 18.2zM14.5 6.3l3.2 3.2',
  history: 'M4.5 12a7.5 7.5 0 1 0 2.4-5.5M4.5 4.5v4h4M12 8v4.5l3 1.8',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  tag: 'M4.5 4.5h7.8l7.2 7.2-7.8 7.8-7.2-7.2zM8.5 8.5h.01',
  clock: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 7.5V12l3 2',
  pin: 'M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11zM12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  star: 'M12 3.8l2.4 5 5.4.7-4 3.8 1 5.4-4.8-2.7-4.8 2.7 1-5.4-4-3.8 5.4-.7z',
  out: 'M10 5H5.5v14H10M14 8l4 4-4 4M18 12H9.5',
  undo: 'M9 6L4.5 10.5 9 15M4.5 10.5H14a5.5 5.5 0 0 1 0 11h-2.5',
  trash: 'M5 7h14M9.5 7V4.5h5V7M6.5 7l.8 12.5h9.4L17.5 7M10 10.5v6M14 10.5v6',
  warn: 'M12 4.5L21 19.5H3zM12 10v4.5M12 17h.01',
  walk: 'M13 4.3a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zM10.5 20l1.7-6.5-2.2-2 1-4 3 1.5 2.5.5M9.3 12.5L7 14M12.2 13.5l2.3 2.5.8 4',
  car: 'M5 16.5v-4l1.8-4.5h10.4l1.8 4.5v4zM5 12.5h14M5 16.5v2h2.5v-2M16.5 16.5v2H19v-2M7.8 14.5h.01M16.2 14.5h.01',
  train: 'M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v10a3 3 0 0 1-3 3h-7a3 3 0 0 1-3-3V5A1.5 1.5 0 0 1 7 3.5zM5.5 10.5h13M8.5 14.5h.01M15.5 14.5h.01M8 18.5L6.5 21M16 18.5l1.5 2.5',
  bus: 'M5.5 4h13v13h-13zM5.5 11h13M5.5 17v2.5h2.5V17M16 17v2.5h2.5V17M8.5 14h.01M15.5 14h.01',
  ferry: 'M12 3.5v6M6 9.5h12l1.5 5.5L12 18.5 4.5 15zM3.5 21c1.7 0 1.7-1.2 3.4-1.2s1.7 1.2 3.4 1.2 1.7-1.2 3.4-1.2 1.7 1.2 3.4 1.2 1.7-1.2 3.4-1.2',
  sliders: 'M4 7h9M17 7h3M13 4.5v5h4v-5zM4 17h3M11 17h9M7 14.5v5h4v-5z',
  sort: 'M8 5v14M4.5 15.5L8 19l3.5-3.5M16 19V5M12.5 8.5L16 5l3.5 3.5',
  grid: 'M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6zM13.5 13.5h6v6h-6z',
  list: 'M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01',
  back: 'M15 5l-7 7 7 7',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  expand: 'M14 4.5h5.5V10M10 19.5H4.5V14M19.5 4.5L13.5 10.5M4.5 19.5l6-6',
  send: 'M4 12L20 4.5 15 20l-3.5-6.5zM11.5 13.5L20 4.5',
  chevron: 'M9 5l7 7-7 7',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  copy: 'M9 9h10.5v10.5H9zM15 9V4.5H4.5V15H9',
  map: 'M4 6.5l5-2 6 2 5-2v13l-5 2-6-2-5 2zM9 4.5v13M15 6.5v13',
  fork: 'M7 3.5v6.5a2.5 2.5 0 0 0 5 0V3.5M9.5 3.5v17M17 20.5v-17c-2 1.2-3 3.7-3 7h3',
  users: 'M9 5a3.2 3.2 0 1 0 0 6.4A3.2 3.2 0 0 0 9 5zM3 19.5c.5-3.2 2.8-5 6-5s5.5 1.8 6 5M16 5.5a3 3 0 0 1 0 5.8M17.5 14.8c1.8.6 3 2.2 3.3 4.7',
  bed: 'M3.5 6v13M3.5 16h17v3M3.5 12.5h17V16M7 9.5h4a1.5 1.5 0 0 1 1.5 1.5v1.5H7zM12.5 12.5V10.5a2 2 0 0 1 2-2H18a2.5 2.5 0 0 1 2.5 2.5v1.5',
};

/** 行內 SVG 字串（給地圖的 DOM 標記用）；React 畫面請用 components/Icon.tsx */
export function iconSvg(name: IconName, size: 16 | 20 | 24 = 20, filled = false): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON_PATHS[name]}"/></svg>`;
}
