// What the 3D brain shows (Owner, Nov 1 2026: "too many blue dots, remove the repetitive tasks").
// The full memory and every task stay in the Memory list and the chat; the brain only draws
// the pages and tasks worth seeing at a glance.
import type { Entry, Session } from './memory';

/** GitHub feed items that pile up on every sync: single commits, issues, pull requests and releases. */
const FEED = /\b(commit [0-9a-f]{7}|pr #\d+|issue #\d+|release \S+)/i;

const norm = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** True when a memory page is only a repeat GitHub feed item (it stays in the Memory list). */
export function isFeedItem(e: Entry): boolean {
  return e.sources.length > 0 && e.sources.every(s => s.kind === 'github') && FEED.test(e.title);
}

/**
 * The memory pages drawn on the brain: no stale pages, no GitHub feed items, and one dot per title.
 * A selected page always shows, even when it would be hidden.
 */
export function brainEntries(entries: Entry[], selected?: string | null): Entry[] {
  const seen = new Set<string>();
  const out: Entry[] = [];
  // strongest first, so the kept copy of a repeated title is the best one
  for (const e of [...entries].sort((a, b) => b.strength - a.strength)) {
    if (e.id !== selected && (e.status === 'stale' || isFeedItem(e))) continue;
    const k = e.type + ':' + norm(e.title);
    if (seen.has(k) && e.id !== selected) continue;
    seen.add(k);
    out.push(e);
  }
  const keep = new Set(out.map(e => e.id));
  return entries.filter(e => keep.has(e.id));
}

/** Real tasks only (no casual chats), newest first, with repeats of the same question dropped. */
export function brainTasks(sessions: Session[]): Session[] {
  const seen = new Set<string>();
  const out: Session[] = [];
  for (const s of [...sessions].sort((a, b) => b.ts - a.ts)) {
    if (s.kind === 'chat') continue;
    const k = norm(s.q).slice(0, 80);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

export type LegState = 'done' | 'working' | 'failed' | 'waiting';
/**
 * The path the current task's data takes, leg by leg: Owner → each agent in chain order → Brain.
 * A leg takes the state of the agent it arrives at; the last leg into Brain is done once Grok Bot is.
 */
export function taskPath(
  order: readonly string[],
  stages: Partial<Record<string, string>>,
): { from: string; to: string; state: LegState }[] {
  const bots = order.filter(id => stages[id] && stages[id] !== 'skipped');
  if (!bots.length) return [];
  const legState = (id: string): LegState => {
    const s = stages[id];
    return s === 'done' || s === 'working' || s === 'failed' ? s : 'waiting';
  };
  const ends = ['owner', ...bots, 'brain'];
  return ends.slice(1).map((to, i) => ({
    from: ends[i],
    to,
    state: to === 'brain' ? (legState(bots[bots.length - 1]) === 'done' ? 'done' : 'waiting') : legState(to),
  }));
}
