import { Component, StrictMode, lazy, Suspense, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { removeBootSkeleton } from './lib/bootSkeleton.ts';

// ?check：v0 的資料檢查頁（座標、ID、來源的問題、各區筆數），只有 dev server 有：
// 它會讀 data/ 底下所有 JSON（含研究筆記）和假資料，不能進正式 build（architecture §3.1）。兩邊的 CSS 各自載入
const isCheck = import.meta.env.DEV && new URLSearchParams(location.search).has('check');
const Root = isCheck ? lazy(() => import('./v0/index.tsx')) : lazy(() => import('./App.tsx'));

/**
 * 畫面的程式壞了、或 JS 檔載不到（部署新版後，舊頁面要的檔案已經不在）：
 * 不留白畫面或一直轉的骨架，讓使用者重新整理。
 */
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    removeBootSkeleton();
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', textAlign: 'center' }} data-testid="app-crashed">
        <p>畫面載入失敗，可能是網站剛更新。</p>
        <button type="button" style={{ padding: '10px 20px', fontSize: 16 }} onClick={() => location.reload()}>
          重新整理
        </button>
      </div>
    );
  }
}

// 載入中的畫面是 index.html 的 #boot，所以這裡的 fallback 是空的；App 有結果才拿掉 #boot（v0 沒有這一步，這裡直接拿掉）
if (isCheck) removeBootSkeleton();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Boundary>
      <Suspense fallback={null}>
        <Root />
      </Suspense>
    </Boundary>
  </StrictMode>,
);
