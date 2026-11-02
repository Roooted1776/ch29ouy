import { describe, expect, it } from 'vitest';
import { absorbMemory } from '../src/lib/absorb';
import { fileMemories } from '../src/lib/ai-memory';
import { tally } from '../src/lib/learn';
import { blankMem, mkEntry, type Entry, type Mem } from '../src/lib/memory';
import { session } from './fixtures';

function add(mem: Mem, key: string, note: string, seen = 1000, extra: Partial<Entry> = {}): Entry {
  const e = mkEntry(mem, { key, title: key.split(':').at(-1)!, type: 'concept', note, sources: [] }, seen);
  Object.assign(e, extra);
  mem.entries.push(e);
  return e;
}

describe('absorbing memory other agents saved', () => {
  it('adds new entries with fresh ids and keeps their links', () => {
    const mem = blankMem();
    add(mem, 'note:mine', 'My note.');
    const db = blankMem();
    const a = add(db, 'ai:concept:alpha', 'From another agent.');
    const b = add(db, 'ai:concept:beta', 'Also from another agent.');
    a.links = [b.id];
    const r = absorbMemory(mem, db);
    expect(r.added).toBe(2);
    expect(new Set(mem.entries.map(e => e.id)).size).toBe(3);
    const A = mem.entries.find(e => e.key === a.key)!,
      B = mem.entries.find(e => e.key === b.key)!;
    expect(A.links).toContain(B.id);
    expect(B.links).toContain(A.id);
  });
  it('newer copy wins, but Owner corrections and deleted keys are kept', () => {
    const mem = blankMem();
    add(mem, 'ai:concept:old', 'Old note.', 1000);
    add(mem, 'ai:concept:fixed', 'Owner fixed this.', 1000, { corrected: true });
    mem.blocked.push('ai:concept:gone');
    const db = blankMem();
    add(db, 'ai:concept:old', 'New note.', 2000, { strength: 5 });
    add(db, 'ai:concept:fixed', 'Agent text.', 2000);
    add(db, 'ai:concept:gone', 'Deleted by Owner.', 2000);
    absorbMemory(mem, db);
    const old = mem.entries.find(e => e.key === 'ai:concept:old')!;
    expect(old.note).toBe('New note.');
    expect(old.strength).toBe(5);
    expect(old.hist?.at(-1)?.note).toBe('Old note.');
    expect(mem.entries.find(e => e.key === 'ai:concept:fixed')!.note).toBe('Owner fixed this.');
    expect(mem.entries.some(e => e.key === 'ai:concept:gone')).toBe(false);
  });
  it('adds sessions once, even when ids collide, and running twice changes nothing', () => {
    const mem = blankMem();
    mem.sessions.push(session('s1', 1000));
    const db = blankMem();
    db.sessions.push(session('s1', 1000), { ...session('s1', 5000), q: 'Another device task' });
    const first = absorbMemory(mem, db);
    expect(first.sessions).toBe(1);
    expect(mem.sessions.map(s => s.id).sort()).toEqual(['s1', 's2']);
    const again = structuredClone(mem);
    expect(absorbMemory(mem, db)).toEqual({ added: 0, updated: 0, sessions: 0, projects: 0 });
    expect(mem).toEqual(again);
  });
  it('does not report sessions the local cap drops again', () => {
    const mem = blankMem();
    const db = blankMem();
    for (let i = 0; i < 40; i++) db.sessions.push({ ...session('s' + (i + 1), 1000 + i), q: 'task ' + i });
    absorbMemory(mem, db);
    expect(mem.sessions.length).toBeLessThan(40);
    expect(absorbMemory(mem, db)).toEqual({ added: 0, updated: 0, sessions: 0, projects: 0 });
  });
  it('never gives a renumbered entry an id another database row holds', () => {
    const mem = blankMem();
    add(mem, 'note:a', 'Local a.'); // e1
    const db = blankMem();
    add(db, 'ai:concept:x', 'Remote x.'); // e1, collides
    const y = add(db, 'ai:concept:y', 'Remote y.'); // e2, blocked here
    mem.blocked.push(y.key);
    absorbMemory(mem, db);
    const x = mem.entries.find(e => e.key === 'ai:concept:x')!;
    expect(x.id).not.toBe('e1');
    expect(x.id).not.toBe(y.id);
  });
  it('does not bring back project rows archived here', () => {
    const mem = blankMem();
    const db = blankMem();
    const row = add(db, 'source:alpha:empty', 'Alpha.', 1000, {
      project: 'Alpha',
      sources: [{ kind: 'tool', label: 'Read-only project sync', ref: 'file:///Alpha/x.md' }],
    });
    mem.archived.push(structuredClone(row));
    absorbMemory(mem, db);
    expect(mem.entries.some(e => e.key === row.key)).toBe(false);
  });
  it('absorbs read-only project rows through the project-sync rules', () => {
    const mem = blankMem();
    const db = blankMem();
    add(db, 'source:alpha:readme', 'Alpha status.', 1000, {
      project: 'Alpha',
      sources: [{ kind: 'tool', label: 'Read-only project sync', ref: 'file:///Alpha/README.md' }],
    });
    const r = absorbMemory(mem, db);
    expect(r.projects).toBe(1);
    expect(mem.entries.some(e => e.key === 'source:alpha:readme')).toBe(true);
    expect(mem.entries.some(e => e.key === 'project:alpha')).toBe(true);
  });
});

describe('Grok Bot files into memory all agents share', () => {
  it('saves its own memory and links same-titled Owner notes and project rows without changing them', () => {
    const mem = blankMem();
    const team = add(mem, 'note:concept:vault', 'Memory lives in the vault.');
    const ro = add(mem, 'source:alpha:release', 'Alpha release notes.');
    const s = session('s1', 1000);
    mem.sessions.push(s);
    const made = fileMemories(
      mem,
      [
        { type: 'concept', title: 'Vault', note: 'Encrypted before saving.' },
        { type: 'concept', title: 'Release', note: 'Blocked on audit.' },
      ],
      s,
      tally(),
      2000,
    );
    expect(made.map(e => e.key)).toEqual(['ai:concept:vault', 'ai:concept:release']);
    expect(team.note).toBe('Memory lives in the vault.');
    expect(ro.note).toBe('Alpha release notes.');
    expect(team.links).toContain(made[0].id);
    expect(ro.links).toContain(made[1].id);
  });
});
