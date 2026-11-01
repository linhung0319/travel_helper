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
