// 手機版行程的「整趟」（T45b，interaction-design §19.1）：最上面是和單天標題（.m-dayhead）同一種樣子的一列（T49）：
// 左邊大字「整趟」，右邊「✦ 問 AI」「討論」（開始卡 T46 改成引導彈窗，入口在地圖上，shared/ui/GuideDialog.tsx）；
// 下面是和網頁同一份的直的骨架（shared/ui/TripSkeleton.tsx：數字那行「11 晚 · 區 8／11 …」和「只看還沒決定的」在標題列下面（T54）、
// 地區色帶、這天在哪一區、子地區、住哪區、住宿；骨架自己的「整趟」小標題不畫）。進某一天用日期列。
// 地圖畫整趟的路線和各區的晚數（appStore.day＝'all' 時 MapView 自己畫）。

import { Button } from '../shared/ui/Button.tsx';
import { DiscussButton } from '../shared/ui/DiscussButton.tsx';
import { TripSkeleton, type SkeletonActions } from '../shared/ui/TripSkeleton.tsx';
import { askNightLodging, askTrip } from './mobileAi.ts';
import { mobileStore } from './mobileStore.ts';
import { pickFeedArea, setFeedTheme } from './FeedFilters.tsx';

/** 「未選住宿」的捷徑（T54）：到探索分頁、選那區的「住」（T79，區段收合、捲到頂，同網頁）；問 AI 開半屏聊天 */
const MOBILE_SKELETON: SkeletonActions = {
  lodgingShelf: (area) => {
    pickFeedArea(area);
    setFeedTheme('lodging');
    mobileStore.getState().setTab('explore');
  },
  askLodging: askNightLodging,
};

export function TripOverview() {
  return (
    <>
      <div className="m-dayhead m-overview-head">
        <h2 className="m-dayhead-title" data-testid="m-overview-title">
          <span className="m-dayhead-date">整趟</span>
        </h2>
        <Button kind="secondary" size="sm" icon="spark" className="m-ask-day" aria-label="問 AI 整趟" onClick={askTrip} data-testid="trip-ask-ai">
          問 AI
        </Button>
        <DiscussButton variant="white" />
      </div>
      <div className="m-overview" data-testid="m-overview">
        <TripSkeleton head={false} actions={MOBILE_SKELETON} />
      </div>
    </>
  );
}
