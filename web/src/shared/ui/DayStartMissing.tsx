// 這天還沒有起點（前一晚還沒排住宿，T39）：行程照樣算得出來，但第一站前面沒有交通、時間是假設的，要講清楚。

export function DayStartMissing() {
  return (
    <li className="tc-start-missing" data-testid="start-missing">
      <span className="tc-start-no" aria-hidden>
        起
      </span>
      <span>前一晚還沒排住宿，所以第一站前面的交通還沒算，時間先從 09:30 開始。</span>
    </li>
  );
}
