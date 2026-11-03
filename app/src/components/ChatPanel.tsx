import { splitLinks } from '../lib/search';
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { selectActivePulse } from '../store';
import { TYPE_COLOR, colorOf } from '../data/colors';
import { AGENT, isAgent, type AgentId } from '../data/team';
import { useStore } from '../store';
import { PROV, QUOTA_LABEL } from '../lib/providers';
import { isLegacyApprovalPhrase } from '../lib/approval';
import { type Cover, TYPE_LABEL } from '../lib/memory';
import { downloadFile } from '../lib/file-import';
import BotIcon from './BotIcon';
import Composer from './Composer';

/** A bot's name in its node colour; red while it is out of tokens. Click to see its profile. */
function BotName({ id, limited, onOpen }: { id: AgentId; limited: AgentId[]; onOpen(id: AgentId): void }) {
  const out = limited.includes(id);
  return (
    <button
      type="button"
      className={'link bot-name-btn' + (out ? ' limited' : '')}
      onClick={() => onOpen(id)}
      title={out ? `${AGENT[id].name}: ${QUOTA_LABEL}` : AGENT[id].name}
    >
      <b>{AGENT[id].name}</b>
    </button>
  );
}

const nameOf = (id: string) =>
  id.startsWith('mem:') ? 'Memory' : isAgent(id) ? AGENT[id].name : id === 'owner' ? 'You' : 'Brain';

/** Chat text with web links made clickable; they open the source in a new tab. [n] opens Brain source n. */
function Linked({ text, cite }: { text: string; cite?: (n: number) => void }) {
  return (
    <>
      {splitLinks(text).map((p, i) =>
        p.href ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed string
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer">
            {p.t}
          </a>
        ) : cite ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed string
          <Fragment key={i}>
            {p.t.split(/(\[\d{1,2}\])/).map((c, j) => {
              const n = /^\[(\d{1,2})\]$/.exec(c);
              return n ? (
                <button
                  // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed string
                  key={j}
                  type="button"
                  className="px-cite"
                  aria-label={`Source ${n[1]}`}
                  onClick={() => cite(+n[1])}
                >
                  {n[1]}
                </button>
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed string
                <span key={j}>{c}</span>
              );
            })}
          </Fragment>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed string
          <span key={i}>{p.t}</span>
        ),
      )}
    </>
  );
}
/** Ensures no raw code blocks (```) clutter the live chat, turning them into plain conversational text. */
export function cleanChatText(text: string): string {
  if (!text) return '';
  const closed = text.replace(/```(?:[a-zA-Z0-9_-]+)?\n?([\s\S]*?)```/g, (_m, code) => {
    const trimmed = code.trim().replace(/\s+/g, ' ');
    if (!trimmed) return '';
    return trimmed.length > 100 ? `[Action: ${trimmed.slice(0, 97)}…]` : `[Action: ${trimmed}]`;
  });
  return closed.replace(/```(?:[a-zA-Z0-9_-]+)?\n?([\s\S]*)$/g, (_m, code) => {
    const trimmed = code.trim().replace(/\s+/g, ' ');
    if (!trimmed) return '';
    return trimmed.length > 100 ? `[Action: ${trimmed.slice(0, 97)}…]` : `[Action: ${trimmed}]`;
  });
}

/** Subtle copy button for copying messages or answers to clipboard with instant confirmation. */
function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!text) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(text);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // safe fallback if clipboard unavailable
    }
  };
  return (
    <button
      type="button"
      className={'msg-copy-btn' + (copied ? ' copied' : '')}
      onClick={handleCopy}
      title={copied ? 'Copied' : label || 'Copy'}
      aria-label={label || 'Copy'}
    >
      {copied ? (
        '✓'
      ) : (
        <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true" shapeRendering="crispEdges">
          <rect x="5" y="5" width="8" height="8" fill="none" stroke="currentColor" />
          <path d="M4 10H3V3h7v1" fill="none" stroke="currentColor" />
        </svg>
      )}
    </button>
  );
}

/** Formats and downloads session transcript as a clean Markdown report. */
function exportSessionMarkdown(
  title: string,
  msgs: { from: string; text: string }[],
  sources: { title: string; note: string; type: string }[] = [],
) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const lines: string[] = [
    `# Brain Task Report: ${title || 'Session'}`,
    `> Generated: ${new Date().toLocaleString()}`,
    '',
  ];
  if (sources.length > 0) {
    lines.push('## Sources from Brain');
    for (let i = 0; i < sources.length; i++) {
      const s = sources[i];
      lines.push(`${i + 1}. **${s.title}** (${s.type}): ${s.note}`);
    }
    lines.push('');
  }
  const steps = msgs.filter(m => m.from !== 'owner');
  if (steps.length > 0) {
    lines.push('## Agent Contributions & Steps');
    for (const m of steps) {
      const name = isAgent(m.from) ? AGENT[m.from].name : m.from === 'grokbot' ? 'Grok Bot' : m.from;
      lines.push(`### ${name}`);
      lines.push(cleanChatText(m.text));
      lines.push('');
    }
  }
  const slug = (title || 'task')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 30);
  downloadFile(`brain-${slug}-${dateStr}.md`, lines.join('\n'), 'text/markdown');
}

export default function ChatPanel() {
  const log = useStore(s => s.log),
    busy = useStore(s => s.busy),
    role = useStore(s => s.role),
    viewing = useStore(s => s.viewing),
    stages = useStore(s => s.stages),
    notes = useStore(s => s.notes),
    limited = useStore(s => s.limited),
    ranOn = useStore(s => s.ranOn);
  /** "via Groq" when a free service stood in for the bot's own company. */
  const via = (id: AgentId) => {
    const p = ranOn[id];
    return p && p !== AGENT[id].provider ? (
      <small className="via">via {PROV[p].label.replace(' (free)', '')}</small>
    ) : null;
  };
  const inspectBot = useStore(s => s.inspectBot);
  const end = useRef<HTMLDivElement>(null),
    msgsRef = useRef<HTMLDivElement>(null),
    isProgrammaticScroll = useRef(false),
    [autoScroll, setAutoScroll] = useState(true),
    draft = useStore(s => s.draft),
    flow = useStore(s => s.flow),
    activePulse = useStore(selectActivePulse);

  const scrollToBottom = (smooth = false) => {
    const el = msgsRef.current;
    if (!el) return;
    isProgrammaticScroll.current = true;
    requestAnimationFrame(() => {
      const container = msgsRef.current;
      if (!container) {
        isProgrammaticScroll.current = false;
        return;
      }
      if (smooth && typeof container.scrollTo === 'function') {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      } else {
        container.scrollTop = container.scrollHeight;
      }
      requestAnimationFrame(() => {
        isProgrammaticScroll.current = false;
      });
    });
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: these values trigger the scroll into view
  useEffect(() => {
    if (!autoScroll && !busy) return;
    // Fast instant scroll keeps streaming viewports pinned to the latest message without stalling
    scrollToBottom(false);
  }, [log.length, viewing, draft?.text, draft?.from, flow.length, stages, autoScroll, busy]);

  const onScroll = () => {
    if (isProgrammaticScroll.current) return;
    const el = msgsRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    if (isNearBottom !== autoScroll) {
      setAutoScroll(isNearBottom);
    }
  };

  const mem = useStore(s => s.mem),
    used = useStore(s => s.used),
    select = useStore(s => s.select);
  const latestSession = !log.length && mem.sessions.length ? mem.sessions[mem.sessions.length - 1] : null;
  const currentSession = viewing || latestSession;
  // the chat shows only what the AI team wrote, plus who is doing what right now
  const msgs = (
    currentSession ? currentSession.msgs.map((m, i) => ({ ...m, id: i, cls: undefined as 'warn' | undefined })) : log
  ).filter(m => m.from !== 'brain' && !isLegacyApprovalPhrase(m.text));
  const doing = currentSession
    ? []
    : (Object.entries(stages) as [AgentId, string][]).filter(([id, v]) => v === 'working' && id !== draft?.from);
  const effectiveNotes = useMemo(() => {
    const res: Partial<Record<AgentId, string>> = { ...notes };
    if (currentSession?.cover) {
      for (const [id, c] of Object.entries(currentSession.cover)) {
        if (c?.why) res[id as AgentId] = c.why;
      }
    }
    return res;
  }, [currentSession, notes]);
  const stuck: [AgentId, string][] = useMemo(() => {
    if (currentSession) {
      if (currentSession.cover) {
        return (Object.entries(currentSession.cover) as [AgentId, { s: Cover; why?: string }][])
          .filter(([, v]) => v.s === 'failed' || (v.s !== 'done' && Boolean(v.why)))
          .map(([id]) => [id as AgentId, 'failed']);
      }
      if (Array.isArray(currentSession.uncovered) && currentSession.uncovered.length > 0) {
        return currentSession.uncovered.filter(id => isAgent(id)).map(id => [id as AgentId, 'failed']);
      }
      return [];
    }
    return (Object.entries(stages) as [AgentId, string][]).filter(([, v]) => v === 'failed');
  }, [currentSession, stages]);
  // Perplexity layout: each question opens a thread with its sources, the team's steps, then one answer.
  type M = (typeof msgs)[number];
  const threads: { q: M | null; steps: M[]; answer: M | null; task?: boolean; passes: M[] }[] = [];
  for (const m of msgs) {
    if (m.from === 'owner' || !threads.length)
      threads.push({ q: m.from === 'owner' ? m : null, steps: [], answer: null, passes: [] });
    // quick handoff confirms (Owner, Nov 3 2026) read as short chat lines, apart from the steps
    if (m.tag === 'handoff') threads[threads.length - 1].passes.push(m);
    else if (m.from !== 'owner') threads[threads.length - 1].steps.push(m);
  }
  const lastIndex = (list: M[], ok: (m: M) => boolean) => {
    for (let i = list.length - 1; i >= 0; i--) if (ok(list[i])) return i;
    return -1;
  };
  for (const t of threads) {
    // A chat turn or a search has one answer and no team chain: its last reply is the answer.
    const chatTurn =
      !!t.q?.text.startsWith('🔎') || t.steps.some(m => typeof m.tag === 'string' && m.tag.startsWith('chat ·'));
    const at = chatTurn
      ? lastIndex(t.steps, m => isAgent(m.from))
      : lastIndex(t.steps, m => m.from === 'grokbot' && typeof m.tag === 'string' && m.tag.startsWith('live'));
    if (at !== -1 && (chatTurn || at === t.steps.length - 1)) t.answer = t.steps.splice(at, 1)[0];
    // A team task's steps play out on the brain itself (Owner, Nov 2 2026): the chat keeps the question,
    // Grok Bot's review and anything that went wrong, never the step-by-step work.
    if (t.q && !chatTurn) {
      t.task = true;
      t.steps = t.steps.filter(m => !isAgent(m.from));
    }
  }
  const live = !currentSession;
  const sourceIds = currentSession ? currentSession.used || [] : used;
  const sources = sourceIds.map(id => mem.entries.find(e => e.id === id)).filter(e => !!e);
  const openSource = (n: number) => {
    const e = sources[n - 1];
    if (e) select(e.id);
  };
  const lastQ = threads.at(-1)?.q?.text || '';
  const draftIsAnswer = live && (draft?.from === 'grokbot' || (!!draft && lastQ.startsWith('🔎')));
  const stepMark = (id: string) =>
    live
      ? ({ done: '✓', failed: '✗', working: '●' } as Record<string, string>)[stages[id as AgentId] || ''] || '✓'
      : '✓';
  const agentCard = (m: M, cls = '', head = true) => {
    const a = isAgent(m.from) ? AGENT[m.from] : null;
    return (
      <article
        key={m.id}
        tabIndex={-1}
        data-scene-entry={a ? `agent:${a.id}` : undefined}
        className={`msg ${a ? 'bot ' + a.kind : m.from}${m.cls === 'warn' ? ' warn' : ''}${typeof m.tag === 'string' && m.tag.startsWith('chat ·') ? ' chat-turn' : ''} ${cls}`}
        style={a ? ({ '--c': colorOf(a.id) } as CSSProperties) : undefined}
      >
        {head && (
          <header>
            {a ? <BotIcon id={a.id} /> : null}
            {a ? <BotName limited={limited} onOpen={inspectBot} id={a.id} /> : <b>Brain</b>}
            {a && (
              <span className="doing">{typeof m.tag === 'string' && m.tag.startsWith('chat ·') ? 'chat' : a.role}</span>
            )}
            {a && !viewing && via(a.id)}
            <CopyButton text={cleanChatText(m.text)} />
          </header>
        )}
        <p>
          <Linked text={cleanChatText(m.text)} cite={sources.length ? openSource : undefined} />
        </p>
      </article>
    );
  };
  return (
    <section className="panel chat grok px" aria-label="Live chat">
      {currentSession && !log.length && (
        <div className="session-banner px-banner">
          <span>
            {viewing
              ? currentSession.kind === 'chat'
                ? 'Past chat'
                : 'Past task'
              : currentSession.kind === 'chat'
                ? 'Latest chat'
                : 'Latest task'}
          </span>
          <div className="session-actions">
            <button
              type="button"
              className="sm link export-btn"
              title="Export this session as Markdown"
              onClick={() =>
                exportSessionMarkdown(
                  currentSession.q,
                  currentSession.msgs,
                  sources.filter((s): s is NonNullable<typeof s> => !!s),
                )
              }
            >
              Export
            </button>
            {viewing ? (
              <button type="button" className="sm link" onClick={() => useStore.getState().viewSession(null)}>
                Close
              </button>
            ) : (
              <span className="px-done">Completed</span>
            )}
          </div>
        </div>
      )}
      <div className="msgs" ref={msgsRef} onScroll={onScroll} aria-live="off">
        {threads.map((t, ti) => {
          const last = ti === threads.length - 1;
          const showDraft = last && live && draft && isAgent(draft.from);
          const stepCount = t.task
            ? t.steps.length
            : t.steps.length + (last ? doing.length : 0) + (showDraft && !draftIsAnswer ? 1 : 0);
          return (
            <section key={t.q ? `q${t.q.id}` : `t${ti}`} className="px-thread">
              {(t.q || (ti === 0 && currentSession)) && <h3 className="px-q">{t.q ? t.q.text : currentSession?.q}</h3>}
              {t.passes.length > 0 && (
                <ol className="px-passes" aria-label="Handoffs in chat">
                  {t.passes.map(m => (
                    <li key={m.id} style={{ '--c': colorOf(m.from) } as CSSProperties}>
                      {isAgent(m.from) && <BotIcon id={m.from} size={12} />}
                      <b>{nameOf(m.from)}</b> <span>{m.text}</span>
                    </li>
                  ))}
                </ol>
              )}
              {last && sources.length > 0 && (
                <div className="px-sources">
                  <div className="px-head">Sources from Brain</div>
                  <ol>
                    {sources.map((e, i) => (
                      <li key={e.id}>
                        <button
                          type="button"
                          className="px-src"
                          style={{ '--c': TYPE_COLOR[e.type] } as CSSProperties}
                          title={e.note}
                          onClick={() => select(e.id)}
                        >
                          <b>{i + 1}</b>
                          <span>{e.title}</span>
                          <small>{TYPE_LABEL[e.type]}</small>
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {stepCount + (last ? stuck.length : 0) > 0 && (
                <div className="px-steps">
                  <div className="px-head">
                    {t.task ? 'Did not finish' : `Steps · ${t.steps.length}`}
                    {!t.task && last && live && busy ? ' · working' : ''}
                  </div>
                  {t.steps.map(m =>
                    isAgent(m.from) ? (
                      <details key={m.id} className="px-step" style={{ '--c': colorOf(m.from) } as CSSProperties}>
                        <summary>
                          <span className="px-mark" aria-hidden="true">
                            {stepMark(m.from)}
                          </span>
                          <BotIcon id={m.from} size={14} />
                          <BotName limited={limited} onOpen={inspectBot} id={m.from} />
                          <span className="doing">{AGENT[m.from].role}</span>
                          {!viewing && via(m.from)}
                        </summary>
                        {agentCard(m, '', false)}
                      </details>
                    ) : (
                      agentCard(m)
                    ),
                  )}
                  {last &&
                    !t.task &&
                    doing.map(([id]) => (
                      <div key={'doing-' + id} className="activity" style={{ '--c': colorOf(id) } as CSSProperties}>
                        <span className="px-mark working" aria-hidden="true">
                          ●
                        </span>
                        <BotIcon id={id} size={16} />
                        <BotName limited={limited} onOpen={inspectBot} id={id} />
                        <span className="doing">{AGENT[id].role.toLowerCase()}…</span>
                      </div>
                    ))}
                  {last &&
                    stuck.map(([id]) => (
                      <div
                        key={'stuck-' + id}
                        className="activity failed"
                        style={{ '--c': colorOf(id) } as CSSProperties}
                      >
                        <span className="px-mark" aria-hidden="true">
                          ✗
                        </span>
                        <BotIcon id={id} size={16} />
                        <BotName limited={limited} onOpen={inspectBot} id={id} />
                        <span className="doing">{effectiveNotes[id] || notes[id] || 'did not finish'}</span>
                      </div>
                    ))}
                  {showDraft && !draftIsAnswer && !t.task && (
                    <article
                      className={'msg bot streaming ' + AGENT[draft.from as AgentId].kind}
                      style={{ '--c': colorOf(draft.from) } as CSSProperties}
                      aria-busy="true"
                    >
                      <header>
                        <BotIcon id={draft.from as AgentId} />
                        <BotName limited={limited} onOpen={inspectBot} id={draft.from as AgentId} />
                        <span className="doing">{AGENT[draft.from as AgentId].role}</span>
                        {via(draft.from as AgentId)}
                      </header>
                      <p>
                        {cleanChatText(draft.text)}
                        <i className="caret" aria-hidden="true" />
                      </p>
                    </article>
                  )}
                  {last && live && busy && activePulse && (
                    <div className="chat-pass in-flight" role="status">
                      <span className="pass-pill pulse">handing to</span>
                      <span className="pass-end" style={{ color: colorOf(activePulse.from) }}>
                        {isAgent(activePulse.from) && <BotIcon id={activePulse.from as AgentId} size={14} />}
                        <b>{nameOf(activePulse.from)}</b>
                      </span>
                      <span className="pass-arrow" aria-hidden="true">
                        →
                      </span>
                      <span className="pass-end" style={{ color: colorOf(activePulse.to) }}>
                        {isAgent(activePulse.to) && <BotIcon id={activePulse.to as AgentId} size={14} />}
                        <b>{nameOf(activePulse.to)}</b>
                      </span>
                      {activePulse.words ? <small className="pass-words">{activePulse.words} words</small> : null}
                    </div>
                  )}
                </div>
              )}
              {(t.answer || (last && draftIsAnswer)) && (
                <div className="px-answer">
                  <div className="px-head">
                    <span>Answer</span>
                    {t.answer && (
                      <div className="px-answer-actions">
                        <CopyButton text={cleanChatText(t.answer.text)} label="Copy answer" />
                        <button
                          type="button"
                          className="sm link export-btn"
                          title="Export task report as Markdown"
                          onClick={() => {
                            const allMsgs = [...(t.q ? [t.q] : []), ...t.steps, t.answer!];
                            exportSessionMarkdown(
                              t.q?.text || 'Task Answer',
                              allMsgs,
                              sources.filter((s): s is NonNullable<typeof s> => !!s),
                            );
                          }}
                        >
                          Export
                        </button>
                      </div>
                    )}
                  </div>
                  {t.answer ? (
                    agentCard(t.answer, 'px-final')
                  ) : (
                    <article
                      className={'msg bot streaming px-final ' + AGENT[draft!.from as AgentId].kind}
                      style={{ '--c': colorOf(draft!.from) } as CSSProperties}
                      aria-busy="true"
                    >
                      <header>
                        <BotIcon id={draft!.from as AgentId} />
                        <BotName limited={limited} onOpen={inspectBot} id={draft!.from as AgentId} />
                        <span className="doing">{AGENT[draft!.from as AgentId].role}</span>
                        {via(draft!.from as AgentId)}
                      </header>
                      <p>
                        {cleanChatText(draft!.text)}
                        <i className="caret" aria-hidden="true" />
                      </p>
                    </article>
                  )}
                </div>
              )}
            </section>
          );
        })}
        {!autoScroll && (
          <button
            type="button"
            className="scroll-bottom-pill"
            aria-label="Scroll to the newest message"
            onClick={() => {
              setAutoScroll(true);
              scrollToBottom();
            }}
          >
            ↓
          </button>
        )}
        <div ref={end} />
      </div>
      {role === 'admin' && <BanterBar />}
      {role === 'admin' && <Composer />}
      {busy ? <span className="sr">The team is working.</span> : null}
    </section>
  );
}

/** Banter runs by itself (Owner, Nov 1 2026): no switch, just a quiet note while the team is huddling. */
function BanterBar() {
  const bantering = useStore(s => s.bantering);
  return bantering ? (
    <div className="banter-bar">
      <span className="doing">team is chatting…</span>
    </div>
  ) : null;
}
