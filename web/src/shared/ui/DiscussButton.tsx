// 討論按鈕（T33 設計 §2）：放在「問 AI、編輯」同一排，只有圖示和數字（還沒看過的留言數），樣式永遠跟著旁邊的問 AI。
// white：手機平常（白底細框）。quiet：網頁平常（文字按鈕）。bar：墨色編輯條上的白字。

import { Icon } from '../../components/Icon.tsx';
import { openDiscussion } from '../../uiStore.ts';
import { useDiscussionUnread } from '../discussionSeen.ts';
import { Button } from './Button.tsx';

export function DiscussButton({ variant }: { variant: 'white' | 'quiet' | 'bar' }) {
  const n = useDiscussionUnread();
  const label = n > 0 ? `討論，${n} 則新留言` : '討論';
  const count = n > 0 && (
    <span className="discuss-n" data-testid="discuss-count">
      {n}
    </span>
  );
  if (variant === 'white') {
    return (
      <Button kind="secondary" size="sm" icon="chat" className="discuss-btn" aria-label={label} title={label} onClick={() => openDiscussion()} data-testid="discuss-button">
        {count}
      </Button>
    );
  }
  return (
    <button type="button" className={`text-button discuss-btn ${variant === 'quiet' ? 'ask-ai-quiet' : 'discuss-on-bar'}`} aria-label={label} title={label} onClick={() => openDiscussion()} data-testid="discuss-button">
      <Icon name="chat" size={20} />
      {count}
    </button>
  );
}
