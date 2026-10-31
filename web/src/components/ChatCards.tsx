// 聊天裡的卡片和呈現（規格 §5、interaction-design §16.1）：提議的每一版、草稿、候選、預約、改資料、想去、「再看一次」。
// 狀態都讀訊息裡存的 cards，按了走 ai.confirmCard、rejectCard、present、undoCard；用說的（decide_card）是同一條路。

import { useState } from 'react';
import { useStore } from 'zustand';
import { ai } from '../appAi.ts';
import { shared } from '../appShared.ts';
import { useData } from '../hooks.ts';
import { shortDayLabel } from '../lib/trip.ts';
import type { ChatToolUse } from '../ai/transcript.ts';
import { Icon } from './Icon.tsx';
import { PlaceTag, usePlaceName } from './ChatRich.tsx';

const run = async (r: Promise<{ ok: true } | { ok: false; error: string }>) => {
  const x = await r;
  if (!x.ok && x.error !== '取消了') shared.notifyError(x.error);
};

function present(id: string) {
  const r = ai.present(id);
  if (!r.ok) shared.notifyError(r.error);
}

function Actions({ id, confirm, testId }: { id: string; confirm: string; testId: string }) {
  return (
    <div className="ac-card-acts">
      <button type="button" className="button primary small" onClick={() => void run(ai.confirmCard(id))} data-testid={`${testId}-confirm`}>
        {confirm}
      </button>
      <button type="button" className="button small" onClick={() => void run(ai.rejectCard(id))} data-testid={`${testId}-reject`}>
        不要
      </button>
    </div>
  );
}

const DONE: Record<string, string> = { confirmed: '✓ 已完成', rejected: '不要了', undone: '已復原', closed: '沒有用上' };

/** 按過的卡：灰底，右邊寫狀態 */
function Done({ title, status, done }: { title: string; status: string; done?: string }) {
  return (
    <div className="ac-card dim" data-testid="chat-card-done" data-status={status}>
      <div className="ac-card-head">
        {title}
        <span className="ac-card-state">{done ?? DONE[status] ?? status}</span>
      </div>
    </div>
  );
}

/** 提議的一版 */
function ProposalCard({ use, version }: { use: ChatToolUse; version: number }) {
  const active = useStore(ai.proposals.store, (s) => s.active?.cardId === use.block.id);
  const status = use.card?.status ?? 'pending';
  const id = use.block.id;
  const summary = String(use.block.input.summary ?? '');
  const lines = summary ? summary.split('；') : [];
  const title = `提議 · 第 ${version} 版`;
  const common = { 'data-testid': 'chat-proposal', 'data-status': status, 'data-card': id };
  // 被取代、不要了、已復原：收成一行，可以再打開
  if (status === 'superseded' || status === 'rejected' || status === 'undone') {
    const state = status === 'superseded' ? '已被新的取代' : status === 'rejected' ? '不要了' : '已復原';
    return (
      <div className="ac-present old" {...common}>
        <span className="ac-present-text">
          第 {version} 版：{summary || '提議'}
          <small>{state}</small>
        </span>
        <button type="button" className="button small" onClick={() => present(id)} data-testid="chat-see-version">
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
          <button type="button" className="button primary small" onClick={() => void ai.send('請重新提議')} data-testid="chat-repropose">
            請 AI 重新提議
          </button>
          <button type="button" className="button small" onClick={() => void run(ai.rejectCard(id))} data-testid="chat-stale-reject">
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
      <div className="ac-card-head">
        {title}
        {active && <span className="ac-card-state">顯示中，到右邊決定 ›</span>}
      </div>
      {lines.map((l) => (
        <div key={l}>{l}</div>
      ))}
      {!active && (
        <div className="ac-card-acts">
          <button type="button" className="button primary small" onClick={() => present(id)} data-testid="chat-see-version">
            看這版
          </button>
        </div>
      )}
    </div>
  );
}

function DraftCard({ use }: { use: ChatToolUse }) {
  const i = use.block.input;
  const status = use.card?.status ?? 'pending';
  const target = String(i.target ?? '');
  const name = usePlaceName(target);
  const where = target === 'trip' ? '整趟' : target.startsWith('day:') ? shortDayLabel(target.slice(4)) : name;
  const [text, setText] = useState(String(i.text ?? ''));
  if (status !== 'pending') return <Done title={`留言 · ${where}`} status={status} done={status === 'confirmed' ? '✓ 已送出' : undefined} />;
  return (
    <div className="ac-card" data-testid="chat-draft">
      <div className="ac-card-head">留言草稿 · {where}</div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={500} aria-label="留言草稿" data-testid="chat-draft-text" />
      <div className="ac-card-acts">
        <button type="button" className="button primary small" disabled={!text.trim()} onClick={() => void run(ai.confirmCard(use.block.id, { text }))} data-testid="chat-draft-confirm">
          送出
        </button>
        <button type="button" className="button small" onClick={() => void run(ai.rejectCard(use.block.id))} data-testid="chat-draft-reject">
          不要
        </button>
      </div>
    </div>
  );
}

/** 一行內容加確認、不要的卡（候選、預約、改資料） */
function SimpleCard({ use, title, body, confirm, testId }: { use: ChatToolUse; title: string; body?: React.ReactNode; confirm: string; testId: string }) {
  const status = use.card?.status ?? 'pending';
  if (status !== 'pending') return <Done title={title} status={status} />;
  return (
    <div className="ac-card" data-testid={testId}>
      <div className="ac-card-head">{title}</div>
      {body}
      <Actions id={use.block.id} confirm={confirm} testId={testId} />
    </div>
  );
}

function Names({ ids }: { ids: string[] }) {
  return (
    <div className="ac-card-places">
      {ids.map((id) => (
        <PlaceTag key={id} id={id} />
      ))}
    </div>
  );
}

const RES_LABEL: Record<string, string> = { pending: '未訂', booked: '已訂', skip: '不用訂' };

function VoteLine({ use }: { use: ChatToolUse }) {
  const i = use.block.input;
  const ids = (i.placeIds as string[]) ?? [];
  const name = usePlaceName(ids[0] ?? '');
  const undone = use.card?.status === 'undone';
  const what = i.value === 'like' ? '按了想去' : i.value === 'dislike' ? '按了不喜歡' : '收回了';
  return (
    <div className="ac-present" data-testid="chat-vote">
      <span className="ac-present-text">
        {what}：{ids.length > 1 ? `${ids.length} 家` : name}
        {undone && <small>已復原</small>}
      </span>
      {!undone && (
        <button type="button" className="button small" onClick={() => void run(ai.undoCard(use.block.id))} data-testid="chat-vote-undo">
          復原
        </button>
      )}
    </div>
  );
}

/** 呈現的一行：看結果（回覆期間動過畫面）或再看一次 */
function PresentLine({ use, title, sub }: { use: ChatToolUse; title: string; sub?: string }) {
  const deferred = use.card?.view === 'deferred';
  return (
    <div className="ac-present" data-testid="chat-present" data-tool={use.block.name}>
      <span className="ac-present-text">
        {title}
        {sub && <small>{sub}</small>}
      </span>
      <button type="button" className={`button small ${deferred ? 'primary' : ''}`} onClick={() => present(use.block.id)} data-testid={deferred ? 'chat-see-result' : 'chat-again'}>
        {deferred ? '看結果' : '再看一次'}
      </button>
    </div>
  );
}

function StageLine({ use }: { use: ChatToolUse }) {
  const byId = useData((s) => s.byId);
  const i = use.block.input;
  const nameOf = (v: unknown) => {
    if (typeof v !== 'string') return '地圖上的點';
    const p = byId.get(v);
    return p ? p.name.zh || p.name.ja : v;
  };
  switch (use.block.name) {
    case 'show_places': {
      const n = (use.result?.ids as string[] | undefined)?.length ?? 0;
      return <PresentLine use={use} title={String(i.title ?? 'AI 挑的')} sub={`${n} 家，列在右邊`} />;
    }
    case 'show_route':
      return <PresentLine use={use} title={`${nameOf(i.from)} → ${nameOf(i.to)}`} sub={i.minutes != null ? `${String(i.minutes)} 分` : undefined} />;
    case 'show_day':
      return <PresentLine use={use} title={i.date === 'all' ? '整趟行程' : shortDayLabel(String(i.date))} />;
    case 'open_place':
      return <PresentLine use={use} title={nameOf(i.id)} />;
    case 'move_map':
      return <PresentLine use={use} title="移了地圖" />;
    case 'set_filter':
      return <PresentLine use={use} title="套了探索的篩選" />;
    case 'show_screen':
      return <PresentLine use={use} title={{ explore: '探索', wish: '想去', trip: '行程', comments: '討論', reservations: '預約', snapshots: '快照' }[String(i.tab ?? i.panel)] ?? '畫面'} />;
    case 'propose_user_place':
      return <PresentLine use={use} title="加地點的確認畫面" sub="按「加進來」才會存" />;
    default:
      return null;
  }
}

/** 一個工具呼叫的卡片；這個工具失敗了就不畫 */
export function ChatCard({ use, version }: { use: ChatToolUse; version: number }) {
  const i = use.block.input;
  if (use.result && use.result.ok === false) return null;
  switch (use.block.name) {
    case 'propose_changes':
      return <ProposalCard use={use} version={version} />;
    case 'draft_comment':
      return <DraftCard use={use} />;
    case 'add_candidate': {
      const ids = (i.placeIds as string[]) ?? [];
      return <SimpleCard use={use} testId="chat-candidate" title={`加到 ${shortDayLabel(String(i.date))} 的候選`} body={<Names ids={ids} />} confirm={ids.length > 1 ? '全部加入' : '加入'} />;
    }
    case 'remove_candidate':
      return <SimpleCard use={use} testId="chat-candidate-remove" title={`從 ${shortDayLabel(String(i.date))} 的候選拿掉`} body={<><Names ids={[String(i.placeId)]} />{i.reason ? <p className="ac-card-note">理由會變成留言：{String(i.reason)}</p> : null}</>} confirm="拿掉" />;
    case 'move_candidate':
      return <SimpleCard use={use} testId="chat-candidate-move" title={`候選從 ${shortDayLabel(String(i.date))} 移到 ${shortDayLabel(String(i.to))}`} body={<Names ids={[String(i.placeId)]} />} confirm="移過去" />;
    case 'set_reservation':
      return <SimpleCard use={use} testId="chat-reservation" title={`預約：${shortDayLabel(String(i.date))} 標成${RES_LABEL[String(i.status)] ?? ''}`} body={<><Names ids={[String(i.placeId)]} />{i.note ? <p className="ac-card-note">備註：{String(i.note)}</p> : null}</>} confirm="確認" />;
    case 'propose_place_edit':
      return (
        <SimpleCard
          use={use}
          testId="chat-place-edit"
          title="改資料"
          body={
            <>
              <Names ids={[String(i.placeId)]} />
              <p className="ac-card-note">
                <s>{use.result?.before == null ? '（未填）' : JSON.stringify(use.result.before)}</s> → <b>{typeof i.value === 'string' ? i.value : JSON.stringify(i.value)}</b>
              </p>
            </>
          }
          confirm="確認"
        />
      );
    case 'vote':
      return <VoteLine use={use} />;
    default:
      return <StageLine use={use} />;
  }
}
