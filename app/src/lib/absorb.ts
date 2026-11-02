// Absorb memory other agents and devices saved to Brain's database copy.
// Pure merge: no network, no files, no model calls. The caller loads the rows and saves the result.
import { MAX_ENTRIES, keepHistory, keepSessions, type Entry, type Mem, type Source } from './memory';
import { mergeProjectMirror, mergeSources } from './project-sync';

export interface AbsorbResult {
  added: number;
  updated: number;
  sessions: number;
  projects: number;
}

const sessionSig = (s: { ts: number; q: string }) => `${s.ts}|${s.q}`;

/**
 * Merge the database copy into this tab's memory. The key is an entry's identity.
 * - A key Owner deleted or archived is never brought back.
 * - A note Owner corrected here is never overwritten.
 * - Otherwise the copy seen most recently wins; strength keeps the higher value.
 * - Sessions are matched by time and task, so the same session is never added twice.
 * - Read-only project rows (`source:` keys) go through the project-sync rules.
 * Changes `mem` only when everything merged cleanly.
 */
export function absorbMemory(mem: Mem, incoming: Mem): AbsorbResult {
  const next = structuredClone(mem);
  const out: AbsorbResult = { added: 0, updated: 0, sessions: 0, projects: 0 };

  // 1. Sessions first, so entries can point at the right local session id.
  const sigs = new Map(next.sessions.map(x => [sessionSig(x), x.id]));
  const sessionIds = new Set(next.sessions.map(x => x.id));
  const sessionMap = new Map<string, string>();
  const addedSessions: string[] = [];
  // Ids already taken here or in the database copy.
  const taken = new Set([...sessionIds, ...incoming.sessions.map(x => x.id)]);
  const fresh = () => {
    for (const id of taken) {
      const k = Number(/^s(\d+)$/.exec(id)?.[1]);
      if (Number.isFinite(k) && k >= next.nextSession) next.nextSession = k + 1;
    }
    const id = 's' + next.nextSession++;
    taken.add(id);
    return id;
  };
  // Each device numbers its own sessions, so two devices can both make "s5" for different tasks.
  // The database copy keeps its id; this tab's own session moves to a new id, so the next push
  // saves it as a new row instead of overwriting the other device's task.
  const localRename = new Map<string, string>();
  const incomingSigs = new Set(incoming.sessions.map(sessionSig));
  for (const s of incoming.sessions) {
    if (sigs.has(sessionSig(s))) continue;
    const mine = next.sessions.find(x => x.id === s.id);
    // Only when the database does not also hold this tab's session under that id.
    if (!mine || incomingSigs.has(sessionSig(mine))) continue;
    const id = fresh();
    localRename.set(mine.id, id);
    mine.id = id;
    sigs.set(sessionSig(mine), id);
  }
  if (localRename.size) {
    const swap = (ref: string) => localRename.get(ref) || ref;
    for (const e of next.entries)
      e.sources = e.sources.map(x => (x.kind === 'session' && x.ref ? { ...x, ref: swap(x.ref) } : x));
    next.inbox = next.inbox.map(x => (x.kind === 'session' ? { ...x, ref: swap(x.ref) } : x));
    sessionIds.clear();
    for (const x of next.sessions) sessionIds.add(x.id);
  }
  for (const s of incoming.sessions) {
    const sig = sessionSig(s);
    const known = sigs.get(sig);
    if (known) {
      sessionMap.set(s.id, known);
      continue;
    }
    const id = sessionIds.has(s.id) ? fresh() : s.id;
    sessionIds.add(id);
    taken.add(id);
    sigs.set(sig, id);
    sessionMap.set(s.id, id);
    next.sessions.push({ ...structuredClone(s), id });
    addedSessions.push(id);
  }
  for (const id of taken) {
    const k = Number(/^s(\d+)$/.exec(id)?.[1]);
    if (Number.isFinite(k) && k >= next.nextSession) next.nextSession = k + 1;
  }
  const fixRefs = (src: Source[]) =>
    src.map(x => (x.kind === 'session' && x.ref && sessionMap.has(x.ref) ? { ...x, ref: sessionMap.get(x.ref)! } : x));

  // 2. Agent and team memories (everything but read-only project rows).
  const gone = new Set([...next.blocked, ...next.archived.map(e => e.key)]);
  const byKey = new Map(next.entries.map(e => [e.key, e]));
  const localIds = new Set([...next.entries, ...next.archived].map(e => e.id));
  // Reserve the database's ids too, so a renumbered entry never takes an id another key holds there.
  const ids = new Set([...localIds, ...incoming.entries.map(e => e.id)]);
  const idMap = new Map<string, string>();
  const touched: { row: Entry; local: Entry }[] = [];
  for (const row of incoming.entries) {
    if (row.key.startsWith('source:') || gone.has(row.key)) continue;
    const local = byKey.get(row.key);
    if (local) {
      idMap.set(row.id, local.id);
      if (row.seen <= local.seen) continue;
      local.strength = Math.max(local.strength, row.strength);
      local.seen = row.seen;
      local.status = row.status;
      local.sources = mergeSources(local.sources, fixRefs(row.sources));
      if (row.kws) local.kws = [...new Set([...row.kws, ...(local.kws || [])])].slice(0, 12);
      if (!local.corrected && row.note && row.note !== local.note) {
        keepHistory(local, row.sources[0]?.kind || 'session', row.seen);
        local.note = row.note;
        local.title = row.title;
        local.type = row.type;
        if (row.project) local.project = row.project;
      }
      touched.push({ row, local });
      out.updated++;
    } else {
      if (next.entries.length >= MAX_ENTRIES) break;
      let id = row.id;
      if (localIds.has(id)) {
        while (ids.has('e' + next.nextId)) next.nextId++;
        id = 'e' + next.nextId++;
      }
      ids.add(id);
      localIds.add(id);
      const entry: Entry = { ...structuredClone(row), id, links: [], sources: fixRefs(row.sources) };
      next.entries.push(entry);
      byKey.set(entry.key, entry);
      idMap.set(row.id, id);
      touched.push({ row, local: entry });
      out.added++;
    }
  }
  for (const id of ids) {
    const k = Number(/^e(\d+)$/.exec(id)?.[1]);
    if (Number.isFinite(k) && k >= next.nextId) next.nextId = k + 1;
  }
  // Links travel with the copy, mapped onto this tab's ids, both ways.
  const local = new Map(next.entries.map(e => [e.id, e]));
  for (const { row, local: e } of touched)
    for (const rid of row.links) {
      const other = local.get(idMap.get(rid) || '');
      if (!other || other === e) continue;
      if (!e.links.includes(other.id)) e.links.push(other.id);
      if (!other.links.includes(e.id)) other.links.push(e.id);
    }

  // 3. Read-only project rows saved by the project collector.
  const sources = incoming.entries.filter(e => e.key.startsWith('source:') && !gone.has(e.key));
  if (sources.length) {
    const r = mergeProjectMirror(next, { ...incoming, entries: sources });
    out.updated += r.applied;
    out.projects = r.projects;
  }
  next.sessions = keepSessions(next.sessions, next.entries);
  // Count only sessions that survive the local cap; the database keeps older ones this copy already dropped.
  const kept = new Set(next.sessions.map(x => x.id));
  out.sessions = addedSessions.filter(id => kept.has(id)).length;
  out.sessions += localRename.size;
  if (out.added || out.updated || out.sessions) Object.assign(mem, next);
  else {
    // Still move the counters past the database's ids, so the next new session or entry never reuses one.
    mem.nextSession = Math.max(mem.nextSession, next.nextSession);
    mem.nextId = Math.max(mem.nextId, next.nextId);
  }
  return out;
}
