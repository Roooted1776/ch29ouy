import { AGENT, LIVE_ORDER, stagePrompt, systemPrompt, type AgentId } from '../data/team';
import type { Msg } from './memory';
import { QUOTA_LABEL } from './providers';

// The live handoff chain. Each agent reviews the incoming handoff, does its text task and hands on.
// A failed stage is marked as failed; nothing is ever filled in with made-up text.

export type StageCall = (system: string, user: string) => Promise<{ text: string; why: string }>;
export interface ChainHooks {
  say(m: Msg & { cls?: 'warn' }): void;
  active(id: AgentId | null): void;
  handoff(from: string, to: string, payload?: string): void;
  blocked(): string | null; // a reason to stop before the next call, or null
  onCreditFailure?(id: AgentId, reason: string): void;
}
export interface ChainResult {
  msgs: Msg[];
  completed: number;
  failed: AgentId[];
  owner: AgentId | null;
}

export interface StageMilestone {
  id: AgentId;
  name: string;
  text: string;
  failed?: boolean;
}

/**
 * Constructs a structured summary of upstream milestone contributions
 * (Gemini context, Muse audit, Claude builder proposal, and preceding specialist notes)
 * so intermediate agents have full visibility into requirements and architecture.
 */
export function buildChainDigest(milestones: StageMilestone[]): string {
  if (milestones.length === 0) return '';
  return milestones
    .map(m => {
      let roleLabel = 'Specialist Note';
      if (m.id === 'gemini') roleLabel = 'Check 1 Context & Requirements';
      else if (m.id === 'muse') roleLabel = 'Check 2 Adversarial Audit & Risks';
      else if (m.id === 'claude') roleLabel = 'Check 3 Builder Architecture Proposal';
      else if (m.id === 'chatgpt') roleLabel = 'Check 3 Strategy & Execution Plan';
      else if (m.id === 'cursor') roleLabel = 'Check 3 Code & Repo Fit';
      else if (m.id === 'copilot') roleLabel = 'Check 3 Code Review & Refinements';
      else if (m.id === 'perplexity') roleLabel = 'Check 3 Citations & Fact Check';
      else if (m.id === 'grok') roleLabel = 'Check 3 Contrarian Challenges';
      else if (m.id === 'xcode') roleLabel = 'Check 3 Platform & Build Feasibility';

      const status = m.failed ? ' [INCOMPLETE/FAILED]' : '';
      return `[${m.name} - ${roleLabel}${status}]\n${m.text}`;
    })
    .join('\n\n');
}

/** Always in a task: Gemini reads context, Muse audits, Grok Bot gives the final PASS or FAIL. */
export const CORE: readonly AgentId[] = ['gemini', 'muse', 'grokbot'];

/** Task words that call for each specialist (Owner, Nov 3 2026: "agents work together based on skills"). */
const SKILL_RE: Partial<Record<AgentId, RegExp>> = {
  xcode: /\b(ios|iphone|ipad|ipados|macos|watchos|xcode|swift|swiftui|testflight|app store)\b/i,
  claude:
    /\b(code|coding|repo|repository|bug|bugs|fix|build|refactor|function|typescript|javascript|react|python|api|script|test|tests|write|draft|explain|design|essay|reason)\b/i,
  cursor:
    /\b(code|coding|repo|repository|bug|bugs|fix|refactor|integration|merge|branch|pr|pull request|commit|diff)\b/i,
  copilot:
    /\b(code|coding|repo|repository|bug|bugs|fix|refactor|function|review the code|code review|lint|typescript|javascript|python)\b/i,
  perplexity:
    /\b(source|sources|cite|citation|citations|research|fact|facts|fact-check|verify|evidence|link|links|news|latest|current|study|studies|compare)\b/i,
  grok: /\b(risk|risks|risky|strategy|threat|threats|security|assumption|assumptions|tradeoff|trade-off|option|options|should we|decide|decision)\b/i,
  chatgpt:
    /\b(plan|plans|roadmap|steps|schedule|organi[sz]e|synthesi[sz]e|summari[sz]e|summary|tool|tools|workflow)\b/i,
};

const words = (t: string) => new Set(t.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) || []);

/** How well a task fits one bot: a hit on its task words counts 3, each of its skill or specialty words in the task counts 1. */
export function skillScore(task: string, id: AgentId): number {
  const t = task || '';
  const re = SKILL_RE[id];
  const hits = re ? 3 * (t.match(new RegExp(re.source, 'gi'))?.length || 0) : 0;
  const tw = words(t);
  const own = words([...AGENT[id].skills, AGENT[id].specialty].join(' '));
  let overlap = 0;
  for (const w of own) if (w.length > 3 && tw.has(w)) overlap++;
  return hits + overlap;
}

export interface Route {
  bots: AgentId[];
  /** The one bot that owns the task: the best fit among the specialists. */
  owner: AgentId | null;
}

/**
 * Skill-based routing. Gemini, Muse and Grok Bot always run; only specialists whose skills match the task join.
 * The best fit is named owner and always runs; with no match, Claude Code (reasoning, writing, build) owns it.
 * Order follows LIVE_ORDER, so Grok Bot stays last. Switched-off bots never run.
 */
export function routeTask(task?: string, inactiveBots?: ReadonlySet<AgentId> | AgentId[]): Route {
  const off = Array.isArray(inactiveBots) ? new Set(inactiveBots) : inactiveBots;
  const on = (id: AgentId) => !off?.has(id);
  const specialists = LIVE_ORDER.filter(id => !CORE.includes(id) && on(id));
  const scored = specialists.map(id => ({ id, n: skillScore(task || '', id) })).filter(x => x.n >= 3);
  const best = [...scored].sort((a, b) => b.n - a.n || LIVE_ORDER.indexOf(a.id) - LIVE_ORDER.indexOf(b.id))[0];
  const owner = best?.id ?? (on('claude') ? 'claude' : (specialists[0] ?? null));
  const pick = new Set<AgentId>([...CORE.filter(on), ...scored.map(x => x.id), ...(owner ? [owner] : [])]);
  return { bots: LIVE_ORDER.filter(id => pick.has(id)), owner };
}

export const chainFor = (task?: string, inactiveBots?: ReadonlySet<AgentId> | AgentId[]): AgentId[] =>
  routeTask(task, inactiveBots).bots;

export async function runChain(
  task: string,
  tag: string,
  call: StageCall,
  hooks: ChainHooks,
  opts: {
    brainContext?: string;
    /** A shorter copy of the memory context for the middle stages, to save tokens. */
    brainContextShort?: string;
    perTaskCap?: number;
    clean?: (t: string) => string;
    inactiveBots?: ReadonlySet<AgentId> | AgentId[];
    /** Bots may search the web. */
    web?: boolean;
    /** A fixed team instead of skill routing (still minus switched-off bots). */
    team?: AgentId[];
  } = {},
): Promise<ChainResult> {
  const routed = routeTask(task, opts.inactiveBots);
  const off = new Set(opts.inactiveBots || []);
  const bots = opts.team ? opts.team.filter(id => !off.has(id)) : routed.bots,
    route = { bots, owner: routed.owner && bots.includes(routed.owner) ? routed.owner : null },
    msgs: Msg[] = [],
    failed: AgentId[] = [];
  const clean = opts.clean || (t => t),
    cap = opts.perTaskCap ?? 10;
  const say = (m: Msg & { cls?: 'warn' }) => {
    msgs.push({ from: m.from, text: m.text, tag: m.tag });
    hooks.say(m);
  };
  say({ from: 'owner', text: task, tag: '' });
  const inactiveCount = opts.inactiveBots
    ? Array.isArray(opts.inactiveBots)
      ? opts.inactiveBots.length
      : opts.inactiveBots.size
    : 0;
  say({
    from: 'brain',
    tag: 'page',
    text:
      'Handoff chain: ' +
      bots.map(b => `${AGENT[b].name} (${AGENT[b].company})`).join(' → ') +
      '.' +
      (inactiveCount > 0 ? ` [${inactiveCount} inactive bot(s) filtered out]` : '') +
      (route.owner ? ` Owner of this task: ${AGENT[route.owner].name} (best skill fit).` : '') +
      ' One team of people and bots. Pipeline: Collect → Review → Edit → Review → Pass to next → Review. Text only; no files change.',
  });
  let previous = 'Owner task: ' + task,
    calls = 0,
    completed = 0;
  const handoffs: string[] = [];
  const milestones: StageMilestone[] = [];
  for (let i = 0; i < bots.length; i++) {
    const bot = bots[i],
      next = bots[i + 1] || null;
    const why = hooks.blocked() || (calls >= cap ? `The limit of ${cap} model calls for one task was reached.` : null);
    if (why) {
      say({ from: 'brain', tag: 'page', cls: 'warn', text: why + ' The rest of the team was not contacted.' });
      break;
    }
    if (i === 0) hooks.handoff('owner', bot, task);
    calls++;
    const incomingFrom = i === 0 ? 'Owner' : AGENT[bots[i - 1]].name;
    const incoming = bot === 'grokbot' ? handoffs.join('\n\n') || previous : previous;
    const chainDigest = bot === 'grokbot' ? '' : buildChainDigest(milestones);
    // Every agent reads Brain's memory, so the whole team works from what all agents learned before.
    const ctx =
      bot === bots[0] || bot === 'grokbot'
        ? opts.brainContext || ''
        : (opts.brainContextShort ?? opts.brainContext) || '';
    hooks.active(bot);
    try {
      let r: { text: string; why: string };
      try {
        // the last few replies, so bots can talk to each other and not only to the one before them
        const chatter = msgs
          .filter(x => x.tag === tag && x.from !== bots[i - 1])
          .slice(-3)
          .map(x => `${AGENT[x.from as AgentId]?.name || x.from}: ${x.text.slice(0, 300)}`)
          .join('\n');
        r = await call(
          systemPrompt(bot, !!opts.web),
          stagePrompt(bot, task, incomingFrom, incoming, next, ctx, chatter, chainDigest),
        );
      } finally {
        hooks.active(null);
      }
      const text = clean(r.text.replace(/\s+/g, ' ').trim());
      if (!text)
        throw new Error(r.why ? `the provider returned no text (${r.why})` : 'the provider returned an empty reply');
      say({ from: bot, text, tag });
      completed++;
      previous = `HANDOFF FROM ${AGENT[bot].name}:\n${text}`;
      handoffs.push(previous);
      milestones.push({ id: bot, name: AGENT[bot].name, text });
    } catch (e: unknown) {
      const err = e as { message?: string; outOfCredits?: boolean } | null;
      const errStr = String(err?.message || e);
      const isCredits = !!err?.outOfCredits || /credit|quota|billing|payment|balance|402/i.test(errStr);
      const msg = isCredits
        ? `${AGENT[bot].name} did not finish: ${QUOTA_LABEL}. Nothing was made up in its place.`
        : `${AGENT[bot].name} did not finish: ${clean(errStr)}. Nothing was made up in its place.`;
      say({ from: 'brain', tag: 'page', cls: 'warn', text: msg });
      failed.push(bot);
      if (isCredits) hooks.onCreditFailure?.(bot, errStr);
      previous = `HANDOFF STATUS FOR ${AGENT[bot].name}:\n${msg}\n(Next worker: review the last available handoff above and continue autonomously.)`;
      handoffs.push(previous);
      milestones.push({ id: bot, name: AGENT[bot].name, text: msg, failed: true });
    }
    if (next) hooks.handoff(bot, next, previous);
  }
  if (completed)
    say({
      from: 'brain',
      tag: 'page',
      text: `${completed} stage(s) done. Model text is unverified. Brain changed no files.${opts.web ? ' Bots could search the web; check their links.' : ''}`,
    });
  return { msgs, completed, failed, owner: route.owner };
}
