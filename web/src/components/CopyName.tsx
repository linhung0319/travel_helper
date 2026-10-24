import { shared } from '../appShared.ts';
import { copyText } from '../lib/labels.ts';
import type { Place } from '../data/types.ts';

/**
 * 名稱旁的小複製鍵：複製日文名稱（沒有就中文），貼到 Google Maps 或訂位網站搜尋用。
 * 常放在整張可點、可拖的卡片裡（巢狀 button 不合法），所以是 span role="button"；點了不開詳情、也不能拖。
 */
export function CopyName({ place }: { place: Place }) {
  const act = async (e: { stopPropagation(): void; preventDefault(): void }) => {
    e.stopPropagation();
    e.preventDefault();
    const text = copyText(place);
    try {
      if (!navigator.clipboard) throw new Error('no clipboard');
      await navigator.clipboard.writeText(text);
      shared.notify(`已複製：${text}`);
    } catch {
      shared.notifyError('這個瀏覽器不能複製');
    }
  };
  return (
    <span
      role="button"
      tabIndex={0}
      draggable={false}
      className="copy-name"
      aria-label="複製名稱"
      title="複製名稱"
      data-testid="copy-name"
      onClick={act}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && act(e)}
    >
      ⧉
    </span>
  );
}
