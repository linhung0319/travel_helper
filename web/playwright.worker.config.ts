import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_WORKER_PORT ?? 8799);

// T15 的完成條件（PLAN）：build 過的網站、本機 Worker、本機 D1；「別人」是另一個登入的帳號（X-Dev-Member）。
// 既有的 e2e（playwright.config.ts）用 dev server 和假後端，不受影響。
// 跑法：根目錄 npm run e2e:worker（先 build:site）。環境見 e2e-worker/serve.mjs。
export default defineConfig({
  testDir: './e2e-worker',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: 'node --experimental-strip-types --disable-warning=ExperimentalWarning e2e-worker/serve.mjs',
    url: `http://localhost:${PORT}/api/sync`,
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
