// 手機聊天裡的卡片（interaction-design §16.2）：手機的主要呈現區就是訊息，所以結果集是輪播、提議卡有「採用」「不要」。
// 草稿、候選、預約、改資料、想去和網頁共用 components/ChatCards.tsx，字和按鈕大小由 chat.css 放大。

import { useMemo } from 'react';
import { useStore } from 'zustand';
import { ai } from '../appAi.ts';
import { shared } from '../appShared.ts';
import { useApp, useData } from '../hooks.ts';
import type { ChatToolUse } from '../ai/transcript.ts';
import type { Op } from '../ai/ops.ts';
import type { Place } from '../data/types.ts';
import { ChatCard, present } from '../components/ChatCards.tsx';
import { castVote } from '../components/Votes.tsx';
import { Icon } from '../components/Icon.tsx';
import { placeAreaLabel, useVoteIndex } from './ExploreFeed.tsx';
import { Thumb } from './Thumb.tsx';
import { seeFilter, seeInExplore, seeOnMap, seeOnTrip, tapPlace } from './mobileAi.ts';
import { mobileStore } from './mobileStore.ts';

const run = async (r: Promise<{ ok: true } | { ok: false; error: string }>) => {
  const x = await r;
  // 取消是使用者自己按的；存不了 changeItinerary 已經跳提示
  if (!x.ok && x.error !== '取消了' && x.error !== '沒有存成功') shared.notifyError(x.error);
};

/** 輪播的一張卡：點卡片照「點地點」的規則，「詳情」永遠直接開 */
function PlaceCard({ place, note, letter }: { place: Place; note?: string; letter?: string }) {
  const areas = useData((s) => s.areas);
  const voteOf = useVoteIndex();
  const like = voteOf(place.id);
  const selected = useApp((s) => s.selectedId === place.id);
  const on = like.mine === 'like';
  const name = place.name.zh || place.name.ja;
  return (
    <div className={`m-rc ${selected ? 'on' : ''}`} data-testid="m-result-card" data-id={place.id} onClick={() => tapPlace(place.id)}>
      <span className="m-rc-photo">
        <Thumb place={place} size="fill" />
        {letter && (
          <span className="m-rc-letter" data-testid="ai-letter">
            {letter}
          </span>
        )}
      </span>
      <span className="m-rc-body">
        <b className="m-ellipsis">{name}</b>
        <small className="m-ellipsis">{placeAreaLabel(place, areas)}</small>
        {note && (
          <span className="m-rc-note" data-testid="ai-note">
            ✦ {note}
          </span>
        )}
      </span>
      <span className="m-rc-acts">
        <button
          type="button"
          className={`m-rc-like ${on ? 'on' : ''}`}
          aria-pressed={on}
          aria-label={on ? `收回想去 ${name}` : `按想去 ${name}`}
          onClick={(e) => {
            e.stopPropagation();
            void castVote(place.id, on ? null : 'like');
          }}
          data-testid="m-result-like"
        >
          <Icon name="heart" size={20} filled={on} />
          {like.like > 0 && <span>{like.like}</span>}
        </button>
        <button
          type="button"
          className="m-rc-detail"
          onClick={(e) => {
            e.stopPropagation();
            const m = mobileStore.getState();
            m.openPlace(place.id, m.tab);
          }}
          data-testid="m-result-detail"
        >
          詳情
        </button>
      </span>
    </div>
  );
}

/** 結果集：輪播、在地圖上看、在探索看。內容一直在訊息裡，所以沒有「看結果」（§16.2） */
function ResultCard({ use }: { use: ChatToolUse }) {
  const byId = useData((s) => s.byId);
  const i = use.block.input;
  const ids = (use.result?.ids as string[] | undefined) ?? (i.ids as string[] | undefined) ?? [];
  const notes = (i.notes as Record<string, string> | undefined) ?? {};
  const places = ids.map((id) => byId.get(id)).filter((p): p is Place => !!p);
  return (
    <div className="m-result" data-testid="chat-present" data-tool="show_places">
      <div className="m-rc-list" data-testid="m-carousel">
        {places.map((p) => (
          <PlaceCard key={p.id} place={p} note={notes[p.id]} letter={i.lettered ? String.fromCharCode(65 + ids.indexOf(p.id)) : undefined} />
        ))}
      </div>
      <div className="m-result-acts">
        <button type="button" className="button" onClick={() => seeOnMap(use.block.id)} data-testid="m-see-map">
          <Icon name="map" size={16} /> 在地圖上看
        </button>
        <button type="button" className="button" onClick={() => seeInExplore(use.block.id)} data-testid="m-see-explore">
          在探索看
        </button>
      </div>
    </div>
  );
}

/** 提議的一版：目前這版完整顯示，舊版收成一行 */
function ProposalCard({ use, version }: { use: ChatToolUse; version: number }) {
  const active = useStore(ai.proposals.store, (s) => s.active?.cardId === use.block.id);
  const itinerary = useData((s) => s.itinerary);
  const status = use.card?.status ?? 'pending';
  const id = use.block.id;
  const summary = String(use.block.input.summary ?? '');
  const lines = summary ? summary.split('；') : [];
  const ops = use.block.input.ops as Op[];
  // 新的警告：行程變了跟著重算；只有等決定的那張要算
  const warnings = useMemo(() => (status === 'pending' ? ai.newWarnings(ops) : []), [status, ops, itinerary]); // eslint-disable-line react-hooks/exhaustive-deps
  const common = { 'data-testid': 'chat-proposal', 'data-status': status, 'data-card': id };
  const title = `提議 · 第 ${version} 版`;
  if (status === 'superseded' || status === 'rejected' || status === 'undone') {
    const state = status === 'superseded' ? '已被新的取代' : status === 'rejected' ? '不要了' : '已復原';
    return (
      <div className="ac-present old" {...common}>
        <span className="ac-present-text">
          第 {version} 版：{summary || '提議'}
          <small>{state}</small>
        </span>
        <button type="button" className="button" onClick={() => present(id)} data-testid="chat-see-version">
          看這版
        </button>
      </div>
    );
  }
  if (status === 'stale') {
    return (
      <div className="ac-card dim" {...common}>
        <div className="ac-card-head">
          {title}
          <span className="ac-card-state warn">
            <Icon name="warn" size={16} /> 過期了
          </span>
        </div>
        {lines.map((l) => (
          <div key={l}>{l}</div>
        ))}
        <p className="ac-card-note">行程變了，這個提議套不上。</p>
        <div className="ac-card-acts">
          <button type="button" className="button primary" onClick={() => void ai.send('請重新提議')} data-testid="chat-repropose">
            請 AI 重新提議
          </button>
          <button type="button" className="button" onClick={() => void run(ai.rejectCard(id))} data-testid="chat-stale-reject">
            不要
          </button>
        </div>
      </div>
    );
  }
  if (status !== 'pending') {
    return (
      <div className="ac-card dim" {...common}>
        <div className="ac-card-head">
          {title}
          <span className="ac-card-state">{status === 'confirmed' ? '✓ 已採用' : '沒有用上（別版採用了）'}</span>
        </div>
        {status === 'confirmed' && lines.map((l) => <div key={l}>{l}</div>)}
      </div>
    );
  }
  return (
    <div className="ac-card proposal" {...common}>
      <div className="ac-card-head">{title}</div>
      {lines.map((l) => (
        <div key={l}>{l}</div>
      ))}
      {warnings.map((w) => (
        <div key={w} className="m-proposal-warn" data-testid="chat-proposal-warn">
          <Icon name="warn" size={16} /> {w}
        </div>
      ))}
      {ai.bookedWarnings(ops).map((w) => (
        <div key={w} className="proposal-booked" data-testid="chat-proposal-booked">
          <Icon name="warn" size={16} /> {w}
        </div>
      ))}
      {/* 沒在顯示（重新整理後）：要用最新的行程重新檢查才能採用（規格 §3.3、S23） */}
      {active ? (
        <div className="m-proposal-acts">
          <button type="button" className="button primary" onClick={() => void run(ai.confirmCard(id))} data-testid="chat-adopt">
            採用
          </button>
          <button type="button" className="button" onClick={() => void run(ai.rejectCard(id))} data-testid="chat-reject">
            不要
          </button>
          <button type="button" className="button wide" onClick={() => seeOnTrip(id)} data-testid="chat-see-trip">
            <Icon name="map" size={16} /> 在行程上看
          </button>
        </div>
      ) : (
        <div className="m-proposal-acts">
          <button type="button" className="button primary wide" onClick={() => seeOnTrip(id)} data-testid="chat-see-trip">
            <Icon name="map" size={16} /> 在行程上看
          </button>
          <button type="button" className="button wide" onClick={() => void run(ai.rejectCard(id))} data-testid="chat-reject">
            不要
          </button>
        </div>
      )}
    </div>
  );
}

/** 一行的呈現，按鈕的字和動作是手機自己的 */
function Line({ use, title, sub, label, onPress }: { use: ChatToolUse; title: string; sub?: string; label: string; onPress: () => void }) {
  const deferred = use.card?.view === 'deferred';
  return (
    <div className="ac-present" data-testid="chat-present" data-tool={use.block.name}>
      <span className="ac-present-text">
        {title}
        {sub && <small>{sub}</small>}
      </span>
      <button type="button" className={`button ${deferred ? 'primary' : ''}`} onClick={onPress} data-testid="m-see-map">
        {label}
      </button>
    </div>
  );
}

function RouteLine({ use }: { use: ChatToolUse }) {
  const byId = useData((s) => s.byId);
  const i = use.block.input;
  const nameOf = (v: unknown) => {
    if (typeof v !== 'string') return '地圖上的點';
    const p = byId.get(v);
    return p ? p.name.zh || p.name.ja : v;
  };
  return <Line use={use} title={`${nameOf(i.from)} → ${nameOf(i.to)}`} sub={i.minutes != null ? `${String(i.minutes)} 分` : undefined} label="在地圖上看" onPress={() => seeOnMap(use.block.id)} />;
}

/** 一個工具呼叫的卡片；這個工具失敗了就不畫 */
export function ChatCardMobile({ use, version }: { use: ChatToolUse; version: number }) {
  if (use.result && use.result.ok === false) return null;
  switch (use.block.name) {
    case 'propose_changes':
      return <ProposalCard use={use} version={version} />;
    case 'show_places':
      return <ResultCard use={use} />;
    case 'show_route':
      return <RouteLine use={use} />;
    case 'move_map':
      return <Line use={use} title="移了地圖" label="在地圖上看" onPress={() => seeOnMap(use.block.id)} />;
    case 'set_filter':
      return <Line use={use} title="套了探索的篩選" label="看探索" onPress={() => seeFilter(use.block.id)} />;
    default:
      return <ChatCard use={use} version={version} />;
  }
}
