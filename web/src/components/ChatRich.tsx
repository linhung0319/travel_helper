// 回覆的文字（規格 §5）：地點標籤、粗體、條列、編號、連結；解析在 ai/transcript.ts 的 parseRich，這裡不放 HTML。
// 地點標籤（§4）：滑鼠移過去地圖上的點閃，點了開詳情彈窗。

import { createContext, Fragment, useContext } from 'react';
import { appStore } from '../store.ts';
import { useData } from '../hooks.ts';
import { cardTypeLetter } from '../lib/planView.ts';
import { typeSwatch } from '../lib/typeStyle.ts';
import { parseRich, type RichInline } from '../ai/transcript.ts';
import type { Place } from '../data/types.ts';

export function usePlaceName(id: string): string {
  const p = useData((s) => s.byId.get(id));
  return p ? p.name.zh || p.name.ja : id;
}

/** 類型圓章 */
export function TypeStamp({ type }: { type: Place['type'] | undefined }) {
  return type ? (
    <span className="ac-stamp" style={typeSwatch(type)} aria-hidden>
      {cardTypeLetter(type)}
    </span>
  ) : null;
}

/** 地點標籤按了做什麼：沒給是網頁的做法（開詳情彈窗）；手機見 mobile/ChatView */
export const PlaceTagAction = createContext<((id: string) => void) | null>(null);

export function PlaceTag({ id }: { id: string }) {
  const action = useContext(PlaceTagAction);
  const p = useData((s) => s.byId.get(id));
  const name = usePlaceName(id);
  // 模型寫錯 ID：不把 ID 露給使用者看
  if (!p) return null;
  return (
    <button
      type="button"
      className="ac-tag"
      data-testid="chat-place-tag"
      data-id={id}
      onMouseEnter={() => appStore.getState().hover(id)}
      onMouseLeave={() => appStore.getState().hover(null)}
      onClick={() => (action ? action(id) : appStore.getState().openDetail(id, 'map', undefined, 'map'))}
    >
      <TypeStamp type={p.type} />
      {name}
    </button>
  );
}

function Inline({ parts }: { parts: RichInline[] }) {
  return (
    <>
      {parts.map((x, i) => (
        <Fragment key={i}>
          {'place' in x ? (
            <PlaceTag id={x.place} />
          ) : 'href' in x ? (
            <a href={x.href} target="_blank" rel="noreferrer">
              {x.label}
            </a>
          ) : x.bold ? (
            <strong>{x.text}</strong>
          ) : (
            x.text
          )}
        </Fragment>
      ))}
    </>
  );
}

export function RichText({ text }: { text: string }) {
  const blocks = parseRich(text);
  return (
    <div className="ac-text">
      {blocks.map((b, i) =>
        b.kind === 'list' ? (
          b.ordered ? (
            <ol key={i}>
              {b.items.map((it, k) => (
                <li key={k}>
                  <Inline parts={it} />
                </li>
              ))}
            </ol>
          ) : (
            <ul key={i}>
              {b.items.map((it, k) => (
                <li key={k}>
                  <Inline parts={it} />
                </li>
              ))}
            </ul>
          )
        ) : (
          <p key={i}>
            <Inline parts={b.parts} />
          </p>
        ),
      )}
    </div>
  );
}
