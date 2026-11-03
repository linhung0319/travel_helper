// 手機版行程的「整趟」（T45b，interaction-design §19.1）：問 AI 整趟和討論（開始卡 T46 改成引導彈窗，入口在地圖上，shared/ui/GuideDialog.tsx），
// 下面是和網頁同一份的直的骨架（shared/ui/TripSkeleton.tsx：地區色帶、這天在哪一區、子地區、那晚的住宿），點一列跳到那天。
// 地圖畫整趟的路線和各區的晚數（appStore.day＝'all' 時 MapView 自己畫）。

import { Button } from '../shared/ui/Button.tsx';
import { DiscussButton } from '../shared/ui/DiscussButton.tsx';
import { TripSkeleton } from '../shared/ui/TripSkeleton.tsx';
import { askTrip } from './mobileAi.ts';

export function TripOverview() {
  return (
    <>
      <div className="m-overview-ask">
        <Button kind="secondary" size="sm" icon="spark" onClick={askTrip} data-testid="trip-ask-ai">
          問 AI 整趟
        </Button>
        <DiscussButton variant="white" />
      </div>
      <div className="m-overview" data-testid="m-overview">
        <TripSkeleton />
      </div>
    </>
  );
}
