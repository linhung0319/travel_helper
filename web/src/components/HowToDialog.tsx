// 「怎麼用」（interaction-design §17.5）：給只看、按 ♡、留言的家人，四點各一張小圖；排行程的步驟由開始卡負責。手機「我」分頁、網頁頭像選單打開。

import type { ReactNode } from 'react';
import { closeDialog } from '../uiStore.ts';
import { Dialog } from './common.tsx';
import { Icon } from './Icon.tsx';

const POINTS: { pic: ReactNode; text: ReactNode }[] = [
  {
    pic: (
      <span className="howto-pic love">
        <Icon name="heart" size={24} filled />
      </span>
    ),
    text: (
      <>
        喜歡就按 <Icon name="heart" size={16} />
      </>
    ),
  },
  {
    pic: (
      <span className="howto-pic dates" aria-hidden>
        <i>2/4</i>
        <i className="on">2/5</i>
        <i>2/6</i>
      </span>
    ),
    text: '點上面的日期看每天的行程',
  },
  {
    pic: (
      <span className="howto-pic">
        <Icon name="chat" size={24} />
      </span>
    ),
    text: (
      <>
        有意見按 <Icon name="chat" size={16} /> 留言
      </>
    ),
  },
  {
    pic: (
      <span className="howto-pic ai">
        <Icon name="spark" size={24} />
      </span>
    ),
    text: '不知道從哪開始就問 AI，AI 頁第一張藍色的卡就是現在最該決定的事',
  },
];

export function HowToDialog() {
  return (
    <Dialog title="怎麼用" onClose={closeDialog} testId="howto-dialog">
      <ol className="howto">
        {POINTS.map((p, i) => (
          <li key={i}>
            {p.pic}
            <span>{p.text}</span>
          </li>
        ))}
      </ol>
    </Dialog>
  );
}
