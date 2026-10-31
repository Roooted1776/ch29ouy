import { MAX_ENTRIES, cleanSources, keepHistory, mkEntry, type Entry, type Mem, type Source } from './memory';

export interface ProjectMirrorResult {
  applied: number;
  projects: number;
  latest: number;
}

const SOURCE_LABEL = 'Read-only project sync';
const isSource = (e: Entry) =>
  e.key.startsWith('source:') || e.sources.some(s => s.kind === 'tool' && s.label === SOURCE_LABEL);

/** Remove unused graph dots reversibly; their original records remain in the archive. */
export function archiveEmptyAndRetiredNodes(mem: Mem): number {
  const retired = new Set(['freebuff', 'archil', 'comet']);
  const moved = mem.entries.filter(e => {
    if (e.corrected || (isSource(e) && e.note.trim())) return false;
    const exactRetiredTool = e.type === 'entity' && retired.has(e.title.trim().toLowerCase());
    const placeholder = /^Undefined term\b/i.test(e.title.trim());
    const emptyUnassigned = !e.note.trim() && !e.key.startsWith('project:') && !e.project?.trim() && !isSource(e);
    return exactRetiredTool || placeholder || emptyUnassigned;
  });
  if (!moved.length) return 0;
  const removed = new Set(moved.map(e => e.id));
  mem.entries = mem.entries.filter(e => !removed.has(e.id));
  for (const entry of mem.entries) entry.links = entry.links.filter(id => !removed.has(id));
  mem.archived = [...mem.archived.filter(a => !moved.some(e => e.id === a.id && e.key === a.key)), ...moved];
  return moved.length;
}

const projectOf = (e: Entry, incoming: Mem): string =>
  e.project?.trim() ||
  incoming.entries.find(p => p.key.startsWith('project:') && e.links.includes(p.id))?.title.trim() ||
  'Brain';

function mergeSources(current: Source[], incoming: Source[]): Source[] {
  const sources: Source[] = [];
  for (const source of [...cleanSources(current), ...cleanSources(incoming)]) {
    const at = sources.findIndex(s => s.kind === source.kind && s.label === source.label && s.ref === source.ref);
    if (at !== -1) sources.splice(at, 1);
    sources.push(source);
  }
  return sources.slice(-6);
}

/**
 * Merge only the read-only project collector's rows into an unlocked admin's memory.
 * Auth/role checking and encrypted persistence belong to the caller. This helper
 * has no filesystem, database, provider or network access. A failed merge leaves
 * the original vault snapshot unchanged.
 */
export function mergeProjectMirror(mem: Mem, incoming: Mem): ProjectMirrorResult {
  const source = structuredClone(incoming);
  const rows = source.entries.filter(isSource);
  const projects = new Set(rows.map(e => projectOf(e, source)));
  const latest = Math.max(0, ...rows.map(e => e.seen));
  const out: ProjectMirrorResult = { applied: 0, projects: projects.size, latest };
  if (!rows.length) return out;

  for (const e of rows)
    if (
      typeof e.id !== 'string' ||
      typeof e.title !== 'string' ||
      !e.title.trim() ||
      typeof e.note !== 'string' ||
      e.note.length > 600 ||
      !Number.isFinite(e.seen) ||
      !Array.isArray(e.links) ||
      !Array.isArray(e.sources)
    )
      throw new Error('Project mirror contains an invalid source record. Memory was not changed.');

  const next = structuredClone(mem);
  const roomForEntry = () => {
    if (next.entries.length >= MAX_ENTRIES)
      throw new Error('Project sync would exceed the memory limit. Memory was not changed.');
  };
  const ids = new Set([...next.entries, ...next.archived].map(e => e.id));
  const advanceId = () => {
    while (ids.has('e' + next.nextId)) next.nextId++;
    if (next.nextId > 999_999_999) throw new Error('Brain memory has no available entry IDs.');
  };
  const allocate = () => {
    advanceId();
    const id = 'e' + next.nextId++;
    ids.add(id);
    return id;
  };
  const byKey = new Map(next.entries.map(e => [e.key, e]));
  const mapped = new Map<string, string>();
  const changed: { incoming: Entry; current: Entry; project: string }[] = [];

  for (const row of rows) {
    if (next.blocked.includes(row.key)) continue;
    const current = byKey.get(row.key);
    const project = projectOf(row, source);
    if (current) {
      mapped.set(row.id, current.id);
      if (current.corrected || row.seen <= current.seen) continue;
      if (current.project && current.project.toLowerCase() !== project.toLowerCase())
        throw new Error('A project source key belongs to a different project. Memory was not changed.');
      if (current.note !== row.note) keepHistory(current, 'tool', row.seen);
      current.title = row.title;
      current.note = row.note;
      current.type = row.type;
      current.seen = row.seen;
      current.status = row.status;
      current.project = project;
      current.kws = row.kws;
      current.sources = mergeSources(current.sources, row.sources);
      changed.push({ incoming: row, current, project });
    } else {
      roomForEntry();
      const entry: Entry = { ...row, id: allocate(), project, links: [], manual: true };
      next.entries.push(entry);
      byKey.set(entry.key, entry);
      mapped.set(row.id, entry.id);
      changed.push({ incoming: row, current: entry, project });
    }
  }
  if (!changed.length) return out;

  const projectNodes = new Map<string, Entry>();
  for (const { project, incoming: row } of changed) {
    const projectKey = `project:${project.toLowerCase()}`;
    let node = byKey.get(projectKey);
    if (!node) {
      roomForEntry();
      advanceId();
      node = mkEntry(
        next,
        {
          key: projectKey,
          title: project,
          type: 'workstream',
          project,
          note: `Project ${project}. Read-only source records synced into Brain.`,
          sources: row.sources,
        },
        row.seen,
      );
      ids.add(node.id);
      next.entries.push(node);
      byKey.set(projectKey, node);
    }
    projectNodes.set(project.toLowerCase(), node);
  }
  for (const entry of source.entries) {
    if (!entry.key.startsWith('project:')) continue;
    const node = projectNodes.get(entry.title.toLowerCase());
    if (node) mapped.set(entry.id, node.id);
  }
  for (const { incoming: row, current, project } of changed) {
    const node = projectNodes.get(project.toLowerCase())!;
    const links = row.links.map(id => mapped.get(id)).filter((id): id is string => !!id && id !== current.id);
    current.links = [...new Set([...current.links, ...links, node.id])].filter(id => id !== current.id);
    if (!node.links.includes(current.id)) node.links.push(current.id);
  }
  out.applied = changed.length;
  Object.assign(mem, next);
  return out;
}
