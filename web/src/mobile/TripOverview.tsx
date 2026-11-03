// 手機版行程的「整趟」（T45b，interaction-design §19.1）：開始卡（T46 改成彈窗前先留在這裡）、問 AI 整趟和討論，
// 下面是和網頁同一份的直的骨架（shared/ui/TripSkeleton.tsx：地區色帶、這天在哪一區、子地區、那晚的住宿），點一列跳到那天。
// 地圖畫整趟的路線和各區的晚數（appStore.day＝'all' 時 MapView 自己畫）。

import { Button } from '../shared/ui/Button.tsx';
import { DiscussButton } from '../shared/ui/DiscussButton.tsx';
import { StartCard } from '../shared/ui/StartCard.tsx';
import { TripSkeleton } from '../shared/ui/TripSkeleton.tsx';
import { mobileStore } from './mobileStore.ts';
import { useApp } from '../hooks.ts';
import { askStart, askTrip } from './mobileAi.ts';

export function TripOverview() {
  const proposal = useApp((s) => s.proposal);
  return (
    <>
      {!proposal && <StartCard onExplore={() => mobileStore.getState().setTab('explore')} onAsk={askStart} />}
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
