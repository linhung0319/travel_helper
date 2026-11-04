// 登入頁的插畫（T39；T62 照 wave.png 重調配色：金邊雲帶、更多水花和淺藍層次）：夕陽下的雲帶、小富士山、大浪，木版畫風格。用程式畫成 SVG，寫進 worker/src/loginArt.ts（Worker 直接內嵌在登入頁，不用多一個請求）。
// 用法：node scripts/login-art.mjs
// viewBox 1200×900，背景透明（天空的漸層、太陽是頁面的 CSS，手機、電腦的太陽位置不同）。
// 手機直式時只看得到中間約 420 寬（xMidYMax slice），所以浪頭和富士山都放在中間一帶。

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const P = {
  foam: '#fdf7e8',
  shade: '#cfe3ea',
  pale: '#a9d3e4',
  sky: '#5fa4cb',
  blue: '#2c74ab',
  deep: '#174f86',
  navy: '#0f2f5e',
  ink: '#0b2147',
};

// 固定的亂數：每次產生的圖都一樣
let seed = 20270202;
const rnd = (a = 0, b = 1) => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return a + (seed / 4294967296) * (b - a);
};
const n = (x) => Math.round(x * 10) / 10;

/** 三次貝茲上的點和切線 */
function bez([a, b, c, d], t) {
  const u = 1 - t;
  const x = u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0];
  const y = u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1];
  const dx = 3 * u * u * (b[0] - a[0]) + 6 * u * t * (c[0] - b[0]) + 3 * t * t * (d[0] - c[0]);
  const dy = 3 * u * u * (b[1] - a[1]) + 6 * u * t * (c[1] - b[1]) + 3 * t * t * (d[1] - c[1]);
  const len = Math.hypot(dx, dy) || 1;
  return { x, y, tx: dx / len, ty: dy / len };
}

const mix = (A, B, t) => A.map((p, i) => [p[0] + (B[i][0] - p[0]) * t, p[1] + (B[i][1] - p[1]) * t]);

/** 兩頭尖、中間寬的一筆（木版畫的刀痕）：沿曲線取點，兩邊各偏移一點；from～to 只畫曲線的一段 */
function leaf(seg, width, from = 0, to = 1, steps = 14) {
  const left = [];
  const right = [];
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    const p = bez(seg, from + (to - from) * k);
    const w = width * Math.sin(Math.PI * k) ** 0.75;
    left.push(`${n(p.x - p.ty * w)} ${n(p.y + p.tx * w)}`);
    right.unshift(`${n(p.x + p.ty * w)} ${n(p.y - p.tx * w)}`);
  }
  return `M${left.join('L')}L${right.join('L')}Z`;
}

/** 橫向的波紋 */
function swell(y, amp, len, phase, close = 930) {
  let d = `M-40 ${close}L-40 ${n(y)}`;
  for (let x = -40; x <= 1260; x += len / 2) {
    const up = Math.round((x + 40) / (len / 2) + phase) % 2 === 0;
    d += `Q${n(x + len / 4)} ${n(y + (up ? -amp : amp))} ${n(x + len / 2)} ${n(y)}`;
  }
  return `${d}L1260 ${close}Z`;
}

/** 泡沫團：沿曲線一串圓，先畫偏移的淡藍當影子 */
function foamChain(seg, count, rA, rB, fill = P.foam) {
  const circles = [];
  for (let i = 0; i < count; i++) {
    const p = bez(seg, (i + 0.5) / count);
    circles.push([p.x + rnd(-3, 3), p.y + rnd(-3, 3), rnd(rA, rB)]);
  }
  const shade = circles.map(([x, y, r]) => `<circle cx="${n(x + 2)}" cy="${n(y + r * 0.28)}" r="${n(r)}"/>`).join('');
  const top = circles.map(([x, y, r]) => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}"/>`).join('');
  return `<g fill="${P.sky}">${shade}</g><g fill="${fill}">${top}</g>`;
}

/** 泡沫手指：從曲線往外伸出去的尖頭，尖端一顆小圓；side：往切線的哪一邊 */
function fingers(seg, count, side, lenA, lenB, wA, wB, forward = 0.45) {
  let body = '';
  let tips = '';
  for (let i = 0; i < count; i++) {
    const p = bez(seg, (i + 0.5) / count);
    const ox = -p.ty * side + p.tx * forward;
    const oy = p.tx * side + p.ty * forward + 0.15;
    const l = Math.hypot(ox, oy);
    const dx = ox / l;
    const dy = oy / l;
    const len = rnd(lenA, lenB);
    const w = rnd(wA, wB);
    const curl = rnd(0.2, 0.5) * len;
    // 往前再往下彎的一筆
    const ctrl = [
      [p.x, p.y],
      [p.x + dx * len * 0.35, p.y + dy * len * 0.35],
      [p.x + dx * len * 0.75 + p.tx * curl * 0.5, p.y + dy * len * 0.75 + p.ty * curl * 0.5],
      [p.x + dx * len + p.tx * curl, p.y + dy * len + p.ty * curl + curl * 0.4],
    ];
    const taper = [];
    const back = [];
    for (let k = 0; k <= 8; k++) {
      const q = bez(ctrl, k / 8);
      const ww = w * (1 - k / 9);
      taper.push(`${n(q.x - q.ty * ww)} ${n(q.y + q.tx * ww)}`);
      back.unshift(`${n(q.x + q.ty * ww)} ${n(q.y - q.tx * ww)}`);
    }
    body += `M${taper.join('L')}L${back.join('L')}Z`;
    tips += `<circle cx="${n(ctrl[3][0])}" cy="${n(ctrl[3][1])}" r="${n(w * rnd(0.55, 0.95))}"/>`;
  }
  return `<path d="${body}" fill="${P.foam}" stroke="${P.deep}" stroke-width="1.2" stroke-linejoin="round"/><g fill="${P.foam}">${tips}</g>`;
}

/** 水花 */
function dots(seg, count, spread, rA, rB, fill = P.foam) {
  let out = '';
  for (let i = 0; i < count; i++) {
    const p = bez(seg, rnd());
    out += `<circle cx="${n(p.x + rnd(-spread, spread))}" cy="${n(p.y + rnd(-spread * 0.8, spread))}" r="${n(rnd(rA, rB))}"/>`;
  }
  return `<g fill="${fill}">${out}</g>`;
}

/** 霞（橫向的雲帶）：幾條圓頭的長條疊在一起 */
function kasumi(x, y, widths, h, fill, opacity = 1) {
  let d = '';
  widths.forEach(([dx, w], i) => {
    const yy = y + i * h;
    const r = h / 2;
    d += `M${x + dx + r} ${yy}h${w - h}a${r} ${r} 0 0 1 0 ${h}h${-(w - h)}a${r} ${r} 0 0 1 0 ${-h}Z`;
  });
  return `<path d="${d}" fill="${fill}" opacity="${opacity}"/>`;
}

/** 鑲金邊的雲帶：先畫往上偏一點的金色，再蓋上雲的顏色，上緣留下一道金 */
function goldKasumi(x, y, widths, h, fill, opacity = 1) {
  const edge = Math.max(2, h * 0.28);
  return `<g opacity="${opacity}">${kasumi(x - edge, y - edge, widths.map(([dx, w]) => [dx, w + edge * 2]), h, '#ffd46e')}${kasumi(x, y, widths, h, fill)}</g>`;
}

// ---- 大浪的骨架（順著浪的方向：左下 → 浪頭 → 勾回來）；整組最後縮小放到畫面裡 ----
const crest = [[500, 215], [610, 165], [760, 170], [846, 270]]; // 浪頂
const hook = [[846, 270], [872, 306], [868, 356], [826, 372]]; // 勾回來的尖
const hollowTop = [[826, 372], [760, 322], [692, 330], [640, 410]]; // 內凹的上緣
const silhouette =
  `M-300 930L-300 660C-120 650 300 330 500 215C610 165 760 170 846 270C872 306 868 356 826 372` +
  `C760 322 692 330 640 410C590 490 620 690 790 820L1000 930Z`;

// 內凹面：外緣（貼著浪頂）到內緣（貼著內凹）之間的刀痕
const faceOuter = [[520, 250], [640, 200], [770, 230], [812, 340]];
const faceBack = [[520, 930], [520, 620], [570, 440], [800, 362]];

function face() {
  const bands = [
    { t: 0.12, c: P.deep, w: 13 },
    { t: 0.26, c: P.blue, w: 10 },
    { t: 0.38, c: P.sky, w: 7 },
    { t: 0.47, c: P.pale, w: 4 },
    { t: 0.58, c: P.deep, w: 10 },
    { t: 0.7, c: P.blue, w: 8 },
    { t: 0.8, c: P.sky, w: 5 },
    { t: 0.9, c: P.deep, w: 6 },
  ];
  return bands.map((b) => `<path d="${leaf(mix(faceBack, faceOuter, b.t), b.w, 0.02, 1, 20)}" fill="${b.c}"/>`).join('');
}

// 背面（浪肩）：順著稜線的藍色刀痕和泡沫
function shoulder() {
  const a = [[-300, 700], [0, 640], [300, 400], [520, 262]];
  const b = [[-300, 930], [100, 900], [360, 680], [560, 440]];
  let out = '';
  const rows = [0.12, 0.26, 0.4, 0.52, 0.66, 0.8, 0.92];
  rows.forEach((t, i) => {
    const seg = mix(a, b, t);
    for (let k = 0; k < 3; k++) {
      const from = 0.1 + k * 0.28 + rnd(-0.03, 0.03);
      const to = from + rnd(0.2, 0.3);
      out += `<path d="${leaf(seg, rnd(7, 15), from, Math.min(to, 0.99), 12)}" fill="${[P.pale, P.sky, P.blue][(i + k) % 3]}"/>`;
    }
  });
  // 淺藍的層次（T62）：每兩排刀痕中間再一道細的淡藍
  [0.19, 0.33, 0.46, 0.59, 0.73, 0.86].forEach((t, i) => {
    const seg = mix(a, b, t);
    for (let k = 0; k < 2; k++) {
      const from = 0.18 + k * 0.36 + rnd(-0.04, 0.04);
      out += `<path d="${leaf(seg, rnd(3, 6), from, Math.min(from + rnd(0.16, 0.24), 0.99), 10)}" fill="${i % 2 ? P.shade : P.pale}"/>`;
    }
  });
  out += dots(mix(a, b, 0.3), 26, 26, 1.4, 4.2) + dots(mix(a, b, 0.7), 22, 26, 1.4, 3.6, P.shade);
  return out;
}

function art() {
  const defs = `<defs><clipPath id="lg-wave"><path d="${silhouette}"/></clipPath></defs>`;

  // 雲（T62，參考 wave.png）：一條一條的暗橘、紅、紫紅雲帶，上緣鑲金邊；高處是淡金的細雲
  const clouds =
    goldKasumi(110, 96, [[0, 280], [70, 340], [20, 200]], 9, '#ffe2ae', 0.75) +
    goldKasumi(860, 70, [[0, 260], [-50, 300], [40, 180]], 8, '#ffe2ae', 0.7) +
    goldKasumi(560, 196, [[0, 330], [60, 420]], 9, '#f59a5a', 0.9) +
    goldKasumi(620, 268, [[0, 440], [70, 540], [-30, 360]], 12, '#ec7244') +
    goldKasumi(40, 318, [[0, 320], [60, 380], [-20, 260]], 13, '#e2546a', 0.95) +
    goldKasumi(700, 352, [[0, 320], [80, 420], [10, 280]], 11, '#da4a5f') +
    goldKasumi(780, 430, [[0, 440], [-80, 520], [30, 420]], 13, '#b9426b') +
    goldKasumi(300, 470, [[0, 360], [70, 300]], 11, '#c4456a', 0.95) +
    goldKasumi(560, 540, [[0, 300], [120, 520]], 8, '#9c3d6a', 0.9);

  const fuji =
    `<path d="M678 604L772 512Q786 498 800 512L902 604Z" fill="${P.deep}"/>` +
    `<path d="M748 536L772 512Q786 498 800 512L824 536L808 530L798 546L786 528L774 546L764 530Z" fill="${P.foam}"/>`;

  const sea =
    `<rect x="-40" y="598" width="1280" height="340" fill="#b8456f"/>` +
    `<path d="${swell(604, 4, 150, 0)}" fill="${P.ink}"/>` +
    `<path d="${swell(626, 7, 210, 1)}" fill="${P.navy}"/>` +
    `<path d="${swell(660, 10, 260, 0)}" fill="${P.deep}"/>` +
    `<path d="${swell(700, 13, 300, 1)}" fill="${P.blue}"/>` +
    leaf([[720, 648], [820, 640], [960, 644], [1160, 640]], 3, 0, 1) +
    `<g fill="${P.pale}">` +
    `<path d="${leaf([[700, 650], [820, 640], [960, 648], [1200, 640]], 3)}"/>` +
    `<path d="${leaf([[760, 686], [880, 676], [1000, 692], [1220, 680]], 4)}"/>` +
    `<path d="${leaf([[-40, 690], [90, 682], [210, 694], [340, 684]], 4)}"/>` +
    `</g>` +
    // 淺藍的層次和海面的白點（T62）
    `<g fill="${P.shade}" opacity=".85">` +
    `<path d="${leaf([[640, 616], [760, 610], [900, 618], [1060, 612]], 2)}"/>` +
    `<path d="${leaf([[820, 664], [940, 656], [1080, 668], [1220, 660]], 3)}"/>` +
    `<path d="${leaf([[600, 720], [760, 708], [940, 724], [1180, 712]], 4)}"/>` +
    `</g>` +
    `<path d="${leaf([[700, 742], [860, 732], [1020, 748], [1220, 736]], 5)}" fill="${P.sky}"/>` +
    dots([[620, 640], [800, 630], [1000, 650], [1220, 640]], 30, 22, 1, 2.6) +
    dots([[620, 700], [820, 690], [1020, 712], [1220, 700]], 26, 26, 1.2, 3, P.shade);

  const wave =
    `<g transform="translate(70 232) scale(.72)">` +
    `<path d="${silhouette}" fill="${P.foam}"/>` +
    `<g clip-path="url(#lg-wave)">${shoulder()}` +
    `<path d="M520 240C650 170 770 190 830 290C850 330 846 356 826 372C760 322 692 330 640 410C590 490 620 690 790 820L700 930L440 930C450 720 440 430 520 240Z" fill="${P.navy}"/>` +
    face() +
    // 內凹裡的白點（T62，wave.png 那種滿天的水花）
    dots(mix(faceBack, faceOuter, 0.2), 34, 26, 1.4, 4.4) +
    dots(mix(faceBack, faceOuter, 0.62), 30, 24, 1.2, 3.6) +
    dots(mix(faceBack, faceOuter, 0.85), 18, 16, 1, 3, P.pale) +
    `</g>` +
    // 浪頂的泡沫：背面一路到浪尖
    fingers(hollowTop, 13, -1, 34, 74, 8, 13, 0.15) +
    fingers([[640, 410], [622, 450], [612, 500], [618, 560]], 6, -1, 18, 40, 6, 9, 0.2) +
    foamChain([[380, 292], [480, 225], [560, 195], [640, 178]], 12, 12, 24) +
    foamChain(crest, 16, 16, 30) +
    foamChain(hook, 6, 14, 22) +
    foamChain([[826, 372], [780, 346], [720, 340], [670, 372]], 10, 7, 13) +
    dots(crest, 26, 34, 1.6, 5) +
    dots([[860, 340], [930, 430], [900, 560], [800, 640]], 44, 28, 1.6, 7) +
    dots(hollowTop, 30, 38, 1.6, 6) +
    // 浪尖往前噴出去的水花（T62）
    dots([[870, 260], [960, 300], [1010, 380], [1040, 470]], 46, 34, 1.2, 4.6) +
    dots([[500, 200], [620, 140], [760, 140], [880, 220]], 30, 40, 1, 3.4) +
    `</g>`;

  // 前景：左下一道小浪，右下一道長浪
  const front =
    `<path d="M-40 930L-40 800C60 790 120 780 180 752C260 716 330 730 400 790C440 826 480 870 540 930Z" fill="${P.foam}"/>` +
    `<path d="M-40 930L-40 850C70 840 170 800 250 772C310 756 370 810 430 930Z" fill="${P.blue}"/>` +
    `<path d="${leaf([[-40, 880], [80, 870], [200, 820], [300, 800]], 7)}" fill="${P.pale}"/>` +
    `<path d="M-40 930L-40 892C80 880 180 850 250 830C310 816 350 870 370 930Z" fill="${P.navy}"/>` +
    foamChain([[120, 776], [190, 738], [280, 724], [370, 762]], 12, 8, 15) +
    `<path d="M520 930C660 852 880 780 1240 720L1240 930Z" fill="${P.foam}"/>` +
    `<path d="M620 930C760 872 930 812 1240 760L1240 930Z" fill="${P.sky}"/>` +
    `<path d="${leaf([[700, 920], [860, 860], [1020, 820], [1230, 790]], 7)}" fill="${P.pale}"/>` +
    `<path d="M720 930C830 892 990 850 1240 810L1240 930Z" fill="${P.blue}"/>` +
    `<path d="M830 930C920 908 1050 880 1240 856L1240 930Z" fill="${P.navy}"/>` +
    foamChain([[540, 918], [720, 830], [960, 770], [1240, 720]], 34, 7, 14) +
    dots([[560, 900], [740, 806], [980, 748], [1240, 700]], 40, 24, 1.2, 4) +
    dots([[-40, 800], [80, 770], [200, 730], [380, 740]], 30, 22, 1.2, 3.6) +
    dots([[760, 900], [920, 850], [1080, 816], [1240, 790]], 28, 16, 1, 3, P.shade);

  return `<svg class="lg-art" viewBox="0 0 1200 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${defs}${clouds}${fuji}${sea}${wave}${front}</svg>`;
}

const out = fileURLToPath(new URL('../worker/src/loginArt.ts', import.meta.url));
const svg = art();
writeFileSync(out, `// 由 scripts/login-art.mjs 產生，不要手改。\nexport const LOGIN_ART = ${JSON.stringify(svg)};\n`);
console.log(`worker/src/loginArt.ts：${Math.round(svg.length / 1024)} KB`);
