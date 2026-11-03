// 手機版行程的「整趟」（T45b，interaction-design §19.1）：最上面是和單天標題（.m-dayhead）同一種樣子的一列（T49）：
// 左邊大字「整趟」加「11 晚 · 已決定 8 晚」，右邊「✦ 問 AI」「討論」（開始卡 T46 改成引導彈窗，入口在地圖上，shared/ui/GuideDialog.tsx）；
// 下面是和網頁同一份的直的骨架（shared/ui/TripSkeleton.tsx：地區色帶、這天在哪一區、子地區、那晚的住宿；骨架自己的「整趟」小標題不畫），點一列跳到那天。
// 地圖畫整趟的路線和各區的晚數（appStore.day＝'all' 時 MapView 自己畫）。

import { Button } from '../shared/ui/Button.tsx';
import { DiscussButton } from '../shared/ui/DiscussButton.tsx';
import { TripNightCount, TripSkeleton } from '../shared/ui/TripSkeleton.tsx';
import { askTrip } from './mobileAi.ts';

export function TripOverview() {
  return (
    <>
      <div className="m-dayhead m-overview-head">
        <h2 className="m-dayhead-title" data-testid="m-overview-title">
          <span className="m-dayhead-date">整趟</span>
          <TripNightCount className="m-overview-count" />
        </h2>
        <Button kind="secondary" size="sm" icon="spark" className="m-ask-day" aria-label="問 AI 整趟" onClick={askTrip} data-testid="trip-ask-ai">
          問 AI
        </Button>
        <DiscussButton variant="white" />
      </div>
      <div className="m-overview" data-testid="m-overview">
        <TripSkeleton head={false} />
      </div>
    </>
  );
}
