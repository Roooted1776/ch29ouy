import { describe, expect, it } from 'vitest';
import { blankMem, mkEntry, sanitizeMem, type Entry, type Mem } from '../src/lib/memory';
import { addNote } from '../src/lib/learn';
import {
  archiveEmptyAndRetiredNodes,
  archiveRetiredToolNodes,
  hasRetiredToolNode,
  mergeProjectMirror,
} from '../src/lib/project-sync';

function add(mem: Mem, key: string, project: string, seen = 1000, extra: Partial<Entry> = {}): Entry {
  const e = mkEntry(
    mem,
    {
      key,
      title: key.split(':').at(-1)!,
      type: 'concept',
      project,
      note: `${project} source evidence.`,
      manual: true,
      sources: [{ kind: 'tool', label: 'Read-only project sync', ref: `file:///Projects/${project}/README.md` }],
      ...extra,
    },
    seen,
  );
  Object.assign(e, extra);
  mem.entries.push(e);
  return e;
}

describe('read-only project mirror reconciliation', () => {
  it('imports only collector rows into a nonempty vault and remaps colliding IDs and links', () => {
    const mem = blankMem();
    const owner = add(mem, 'note:owner', 'Brain', 2000, { sources: [], note: 'Owner note stays intact.' });
    const incoming = blankMem();
    const first = add(incoming, 'source:alpha:readme', 'Alpha');
    const second = add(incoming, 'source:alpha:handoff', 'Alpha');
    const unrelated = add(incoming, 'note:unrelated', 'Other', 1000, { sources: [] });
    first.links = [second.id, unrelated.id];
    second.links = [first.id];
    const result = mergeProjectMirror(mem, incoming);
    expect(result).toEqual({ applied: 2, projects: 1, latest: 1000 });
    expect(mem.entries.find(e => e.id === owner.id)).toEqual(owner);
    expect(mem.entries.some(e => e.key === unrelated.key)).toBe(false);
    const importedFirst = mem.entries.find(e => e.key === first.key)!;
    const importedSecond = mem.entries.find(e => e.key === second.key)!;
    expect(importedFirst.id).not.toBe(owner.id);
    expect(importedFirst.links).toContain(importedSecond.id);
    expect(importedSecond.links).toContain(importedFirst.id);
    expect(importedFirst.links).not.toContain(owner.id);
    expect(new Set(mem.entries.map(e => e.id)).size).toBe(mem.entries.length);
    expect(mem.entries.find(e => e.key === 'project:alpha')?.links).toContain(importedFirst.id);
    const reloaded = sanitizeMem(JSON.parse(JSON.stringify(mem)))!;
    expect(reloaded.entries.find(e => e.key === first.key)?.project).toBe('Alpha');
    expect(reloaded.entries.find(e => e.key === first.key)?.sources).toEqual(first.sources);
  });

  it('updates newer source evidence while keeping the existing ID and source history', () => {
    const mem = blankMem();
    const old = add(mem, 'source:alpha:status', 'Alpha', 1000);
    const incoming = blankMem();
    const fresh = add(incoming, old.key, 'Alpha', 2000, { note: 'A newer observed status.' });
    expect(mergeProjectMirror(mem, incoming).applied).toBe(1);
    const updated = mem.entries.find(e => e.key === old.key)!;
    expect(updated.id).toBe(old.id);
    expect(updated.note).toBe(fresh.note);
    expect(updated.hist?.[0].note).toBe(old.note);
    const snapshot = structuredClone(mem);
    expect(mergeProjectMirror(mem, incoming).applied).toBe(0);
    expect(mem).toEqual(snapshot);
  });

  it('does not replace corrected entries, blocked keys or newer vault observations', () => {
    const mem = blankMem();
    const corrected = add(mem, 'source:alpha:corrected', 'Alpha', 1000, { corrected: true });
    const newer = add(mem, 'source:alpha:newer', 'Alpha', 3000);
    mem.blocked.push('source:alpha:retired');
    const incoming = blankMem();
    add(incoming, corrected.key, 'Alpha', 2000, { note: 'Do not replace the correction.' });
    add(incoming, newer.key, 'Alpha', 2000, { note: 'This observation is older.' });
    add(incoming, 'source:alpha:retired', 'Alpha', 2000);
    const snapshot = structuredClone(mem);
    expect(mergeProjectMirror(mem, incoming)).toEqual({ applied: 0, projects: 1, latest: 2000 });
    expect(mem).toEqual(snapshot);
  });

  it('keeps identical source titles in different projects distinct', () => {
    const mem = blankMem();
    const incoming = blankMem();
    add(incoming, 'source:alpha:readme', 'Alpha');
    add(incoming, 'source:beta:readme', 'Beta');
    expect(mergeProjectMirror(mem, incoming).projects).toBe(2);
    const alpha = mem.entries.find(e => e.key === 'source:alpha:readme')!;
    const beta = mem.entries.find(e => e.key === 'source:beta:readme')!;
    expect(alpha.project).toBe('Alpha');
    expect(beta.project).toBe('Beta');
    expect(alpha.links).toContain(mem.entries.find(e => e.key === 'project:alpha')!.id);
    expect(alpha.links).not.toContain(mem.entries.find(e => e.key === 'project:beta')!.id);
  });

  it('accepts exact tool provenance on older collector keys but not a lookalike label', () => {
    const mem = blankMem();
    const incoming = blankMem();
    add(incoming, 'import:legacy', 'Alpha');
    add(incoming, 'import:untrusted', 'Alpha', 1000, {
      sources: [{ kind: 'file', label: 'Read-only project sync', ref: null }],
    });
    expect(mergeProjectMirror(mem, incoming).applied).toBe(1);
    expect(mem.entries.some(e => e.key === 'import:legacy')).toBe(true);
    expect(mem.entries.some(e => e.key === 'import:untrusted')).toBe(false);
  });

  it('is atomic when a source key unexpectedly crosses project boundaries', () => {
    const mem = blankMem();
    const previous = add(mem, 'source:alpha:status', 'Alpha');
    const incoming = blankMem();
    add(incoming, 'source:beta:new', 'Beta', 2000);
    add(incoming, previous.key, 'Beta', 2000);
    const snapshot = structuredClone(mem);
    expect(() => mergeProjectMirror(mem, incoming)).toThrow(/different project/);
    expect(mem).toEqual(snapshot);
  });

  it('leaves the current vault untouched if a source record is malformed', () => {
    const mem = blankMem();
    add(mem, 'note:owner', 'Brain', 1000, { sources: [] });
    const incoming = blankMem();
    add(incoming, 'source:alpha:bad', 'Alpha', 2000, { note: 'x'.repeat(601) });
    const snapshot = structuredClone(mem);
    expect(() => mergeProjectMirror(mem, incoming)).toThrow(/invalid source/);
    expect(mem).toEqual(snapshot);
  });
});

describe('reversible empty and retired node cleanup', () => {
  it('archives exact retired tool entities while preserving notes that merely mention them', () => {
    const mem = blankMem();
    for (const title of ['Freebuff', 'Archil', 'Comet', 'Cerebras'])
      add(mem, `note:${title}`, '', 1000, { type: 'entity', title, sources: [], note: `Former tool: ${title}.` });
    const history = add(mem, 'note:migration', '', 1000, {
      title: 'Freebuff migration history',
      sources: [],
      note: 'Replaced Freebuff with the current tools.',
    });
    const original = structuredClone(mem.entries.slice(0, 4));
    expect(archiveEmptyAndRetiredNodes(mem)).toBe(4);
    expect(mem.entries).toEqual([history]);
    expect(mem.archived).toEqual(original);
    expect(mem.blocked).toEqual([]);
    const snapshot = structuredClone(mem);
    expect(archiveEmptyAndRetiredNodes(mem)).toBe(0);
    expect(mem).toEqual(snapshot);
  });

  it('removes placeholders and unassigned empty notes, then removes active links to archived IDs', () => {
    const mem = blankMem();
    const placeholder = add(mem, 'note:placeholder', '', 1000, {
      title: 'Undefined term: obsolete seed',
      sources: [],
    });
    const empty = add(mem, 'note:empty', '', 1000, { sources: [], note: '   ' });
    const kept = add(mem, 'note:kept', 'Alpha', 1000, { sources: [], note: 'Meaningful project evidence.' });
    kept.links = [placeholder.id, empty.id];
    const originalPlaceholder = structuredClone(placeholder);
    expect(archiveEmptyAndRetiredNodes(mem)).toBe(2);
    expect(mem.entries).toEqual([{ ...kept, links: [] }]);
    expect(mem.archived.find(e => e.id === placeholder.id)).toEqual(originalPlaceholder);
    expect(mem.blocked).toEqual([]);
  });

  it('preserves corrections, project identity and source status even when records look empty or retired', () => {
    const mem = blankMem();
    add(mem, 'note:corrected', '', 1000, { title: 'Freebuff', type: 'entity', corrected: true, sources: [] });
    add(mem, 'note:corrected-placeholder', '', 1000, {
      title: 'Undefined term: Owner correction',
      corrected: true,
      sources: [],
    });
    add(mem, 'project:alpha', 'Alpha', 1000, { type: 'workstream', sources: [], note: '' });
    add(mem, 'note:project-evidence', 'Alpha', 1000, { sources: [], note: '' });
    add(mem, 'source:alpha:status', 'Alpha', 1000, { note: '' });
    add(mem, 'source:tools:freebuff-history', 'Tools', 1000, { type: 'entity', title: 'Freebuff' });
    add(mem, 'source:alpha:placeholder-history', 'Alpha', 1000, { title: 'Undefined term: documented source finding' });
    const snapshot = structuredClone(mem);
    expect(archiveEmptyAndRetiredNodes(mem)).toBe(0);
    expect(mem).toEqual(snapshot);
  });
});

describe('sign-in and sync cleanup', () => {
  it('archives removed tool nodes but keeps a title-only note the owner just added', () => {
    const mem = blankMem();
    const tool = add(mem, 'note:cerebras', '', 1000, {
      type: 'entity',
      title: 'Cerebras',
      sources: [],
      note: 'Old key.',
    });
    addNote(mem, { type: 'concept', title: 'Call dentist', note: '' }, 1000);
    expect(hasRetiredToolNode(mem)).toBe(true);
    expect(archiveRetiredToolNodes(mem)).toBe(1);
    expect(mem.entries.map(e => e.title)).toEqual(['Call dentist']);
    expect(mem.archived.map(e => e.id)).toEqual([tool.id]);
    expect(hasRetiredToolNode(mem)).toBe(false);
    expect(archiveRetiredToolNodes(mem)).toBe(0);
  });

  it('drops an older archived copy by id only, so mem.archived never holds duplicate ids', () => {
    const mem = blankMem();
    const tool = add(mem, 'note:cerebras', '', 1000, {
      type: 'entity',
      title: 'Cerebras',
      sources: [],
      note: 'Current key.',
    });
    mem.archived.push({
      ...structuredClone(tool),
      key: 'note:cerebras-old',
      title: 'Cerebras',
      note: 'Stale archived copy with the same id.',
    });
    expect(archiveRetiredToolNodes(mem)).toBe(1);
    expect(mem.archived.filter(e => e.id === tool.id)).toHaveLength(1);
    expect(mem.archived.find(e => e.id === tool.id)).toMatchObject({
      key: 'note:cerebras',
      note: 'Current key.',
    });
  });

  it('hasRetiredToolNode is false for a title-only owner note and for non-exact titles', () => {
    const mem = blankMem();
    addNote(mem, { type: 'concept', title: 'Call dentist', note: '' }, 1000);
    add(mem, 'note:cerebras-cloud', '', 1000, {
      type: 'entity',
      title: 'Cerebras Cloud',
      sources: [],
      note: 'Not an exact match.',
    });
    add(mem, 'note:cerebras-concept', '', 1000, {
      type: 'concept',
      title: 'Cerebras',
      sources: [],
      note: 'Wrong type.',
    });
    expect(hasRetiredToolNode(mem)).toBe(false);
  });
});
