import { defineConfig, devices } from '@playwright/test';

const PORT = 5190;
/** 手機版的 spec */
const MOBILE_SPECS = '**/mobile*.spec.ts';

// 主要流程（PLAN T11 完成條件，architecture §8）。第六輪起手機版、網頁版分開：手機版只跑 mobile*.spec.ts
// （390×844、360×800 兩種尺寸），網頁版跑其他的。
// 地圖圖磚從 OpenFreeMap 讀，要有網路。
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile', testMatch: MOBILE_SPECS, use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'mobile-small', testMatch: MOBILE_SPECS, use: { ...devices['Pixel 7'], viewport: { width: 360, height: 800 } } },
    { name: 'desktop', testIgnore: MOBILE_SPECS, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
