import { describe, expect, it } from 'vitest';
import { blankMem, mkEntry, type Entry, type Mem } from '../src/lib/memory';
import { applyMemorySyncPull, formatMemorySyncStatus } from '../src/lib/memory-pull';

function add(mem: Mem, key: string, extra: Partial<Entry> = {}): Entry {
  const e = mkEntry(
    mem,
    {
      key,
      title: key.split(':').at(-1)!,
      type: 'concept',
      note: 'n',
      sources: [],
      ...extra,
    },
    1000,
  );
  Object.assign(e, extra);
  mem.entries.push(e);
  return e;
}

describe('memory sync pull status', () => {
  it('says cleaned up N nodes when the pull only archives removed tools', () => {
    expect(formatMemorySyncStatus({ added: 0, updated: 0, sessions: 0 }, 2)).toBe(
      'Memory sync: cleaned up 2 node(s) for removed tools; they stay in the archive.',
    );
  });

  it('keeps the absorb wording when anything was absorbed', () => {
    expect(formatMemorySyncStatus({ added: 1, updated: 0, sessions: 0 }, 1)).toBe(
      'Memory sync: absorbed 1 new, 0 updated, 0 session(s) from other agents.',
    );
  });
});

describe('applyMemorySyncPull (auth-store sync cleanup)', () => {
  it('archives a retired tool from the local copy and reports a clean-only status', () => {
    const cur = blankMem();
    const tool = add(cur, 'note:cerebras', {
      type: 'entity',
      title: 'Cerebras',
      note: 'Old key from another device.',
    });
    const kept = add(cur, 'note:kept', { title: 'Owner note', note: 'Stay.' });
    const back = blankMem();
    const r = applyMemorySyncPull(cur, back);
    expect(r.cleaned).toBe(1);
    expect(r.r).toMatchObject({ added: 0, updated: 0, sessions: 0 });
    expect(r.status).toBe('Memory sync: cleaned up 1 node(s) for removed tools; they stay in the archive.');
    expect(r.bumpIdsOnly).toBe(false);
    expect(r.next.entries.map(e => e.id)).toEqual([kept.id]);
    expect(r.next.archived.map(e => e.id)).toEqual([tool.id]);
    expect(cur.entries.map(e => e.id)).toEqual([tool.id, kept.id]); // caller commits
  });

  it('returns no status when there is nothing to absorb or clean', () => {
    const cur = blankMem();
    add(cur, 'note:kept', { title: 'Owner note', note: 'Stay.' });
    const r = applyMemorySyncPull(cur, blankMem());
    expect(r.status).toBeNull();
    expect(r.cleaned).toBe(0);
    expect(r.bumpIdsOnly).toBe(false);
  });

  it('absorbs a new row from another agent and keeps the absorb status even if a tool was also cleaned', () => {
    const cur = blankMem();
    add(cur, 'note:cerebras', { type: 'entity', title: 'Cerebras', note: 'Old.' });
    const back = blankMem();
    add(back, 'note:from-agent', { title: 'From agent', note: 'Hello.', seen: 2000, manual: true });
    const r = applyMemorySyncPull(cur, back);
    expect(r.r.added).toBe(1);
    expect(r.cleaned).toBe(1);
    expect(r.status).toBe('Memory sync: absorbed 1 new, 0 updated, 0 session(s) from other agents.');
    expect(r.next.entries.map(e => e.title).sort()).toEqual(['From agent']);
  });
});
