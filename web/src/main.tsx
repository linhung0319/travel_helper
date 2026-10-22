import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';

// ?check：v0 的資料檢查頁（座標、ID、來源的問題、各區筆數），正式介面不顯示。兩邊的 CSS 各自載入
const isCheck = new URLSearchParams(location.search).has('check');
const Root = isCheck ? lazy(() => import('./v0/index.tsx')) : lazy(() => import('./App.tsx'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div style={{ padding: 24 }}>載入中…</div>}>
      <Root />
    </Suspense>
  </StrictMode>,
);
