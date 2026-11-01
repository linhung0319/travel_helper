// 骨架畫面（T32）：資料還沒到時先佔位，版面不跳。兩邊共用，樣式在 ui.css。

/** 時間軸還在算：幾張卡片的輪廓 */
export function TimelineSkeleton({ label = '計算時間軸中' }: { label?: string }) {
  return (
    <div className="sk-list" role="status" aria-label={label} data-testid="timeline-skeleton">
      {[0, 1, 2].map((i) => (
        <div key={i} className="sk-card">
          <span className="sk sk-thumb" />
          <span className="sk-lines">
            <span className="sk sk-line" />
            <span className="sk sk-line short" />
          </span>
        </div>
      ))}
    </div>
  );
}

/** 時刻表還在載入：幾列班次的輪廓 */
export function TimetableSkeleton({ label = '時刻表載入中' }: { label?: string }) {
  return (
    <div className="sk-list" role="status" aria-label={label} data-testid="timetable-skeleton">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="sk sk-line" />
      ))}
    </div>
  );
}

/** 詳情層還沒到（閒置時才讀）：內容的輪廓；讀不到時顯示重試 */
export function DetailPending({ error, onRetry }: { error: string | null; onRetry(): void }) {
  if (error) {
    return (
      <div className="sk-error" role="alert" data-testid="detail-error">
        <p>詳細資料讀不到，請檢查網路。</p>
        <button type="button" className="ui-btn" onClick={onRetry} data-testid="detail-retry">
          再試一次
        </button>
      </div>
    );
  }
  return (
    <div className="sk-list" role="status" aria-label="詳細資料載入中" data-testid="detail-skeleton">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={i === 4 ? 'sk sk-line short' : 'sk sk-line'} />
      ))}
    </div>
  );
}

/** 卡片裡的一句介紹還沒到 */
export function IntroPending() {
  return <span className="sk sk-line" role="status" aria-label="介紹載入中" data-testid="intro-skeleton" />;
}
