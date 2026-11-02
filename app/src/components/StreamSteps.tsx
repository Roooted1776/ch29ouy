// Perplexity-style live view on top of the chat: numbered memory sources first, then each agent's step as it runs.
import type { CSSProperties } from 'react';
import { TYPE_COLOR, colorOf } from '../data/colors';
import { AGENT, LIVE_ORDER, type AgentId } from '../data/team';
import { TYPE_LABEL } from '../lib/memory';
import { useStore } from '../store';
import BotIcon from './BotIcon';

const MARK = { waiting: '○', working: '●', done: '✓', failed: '✗' } as const;

export default function StreamSteps() {
  const busy = useStore(s => s.busy),
    viewing = useStore(s => s.viewing),
    stages = useStore(s => s.stages),
    used = useStore(s => s.used),
    entries = useStore(s => s.mem.entries),
    select = useStore(s => s.select);
  if (viewing) return null;
  const steps = LIVE_ORDER.filter(id => stages[id] && stages[id] !== 'skipped') as AgentId[];
  if (!steps.length) return null;
  const sources = used.map(id => entries.find(e => e.id === id)).filter(e => !!e);
  const done = steps.filter(id => stages[id] === 'done').length;
  return (
    <section className="stream-steps" aria-label="Task steps and sources">
      {sources.length > 0 && (
        <div className="ss-sources">
          <span className="ss-head">Sources from Brain</span>
          <ol>
            {sources.map((e, i) => (
              <li key={e.id}>
                <button
                  type="button"
                  className="ss-src"
                  style={{ '--c': TYPE_COLOR[e.type] } as CSSProperties}
                  title={e.note}
                  onClick={() => select(e.id)}
                >
                  <b>{i + 1}</b> {e.title} <small>{TYPE_LABEL[e.type]}</small>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="ss-steps">
        <span className="ss-head">
          Steps {done}/{steps.length}
          {busy ? ' · working' : ''}
        </span>
        <ol>
          {steps.map(id => {
            const st = stages[id] as keyof typeof MARK;
            return (
              <li key={id} className={'ss-step ' + st} style={{ '--c': colorOf(id) } as CSSProperties}>
                <span className="ss-mark" aria-hidden="true">
                  {MARK[st] || '○'}
                </span>
                <BotIcon id={id} size={14} />
                <span>{AGENT[id].name}</span>
                <span className="sr">{st}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
