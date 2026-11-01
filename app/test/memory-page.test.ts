import { describe, expect, it } from 'vitest';
import {
  MAX_SESSIONS,
  blankMem,
  clipNote,
  keepSessions,
  noteParts,
  plainNote,
  routeOf,
  sanitizeMem,
  sessionsFor,
  type Entry,
  type Session,
} from '../src/lib/memory';

const mk = (id: string, ts: number, extra: Partial<Session> = {}): Session => ({
  id,
  ts,
  q: id,
  kws: [],
  accepted: [],
  uncovered: [],
  msgs: [],
  ...extra,
});

describe('memory page helpers', () => {
  it('finds the tasks behind a page, newest first', () => {
    const m = blankMem();
    m.entries.push({ id: 'e1', sources: [{ kind: 'session', label: 'Session 3', ref: 's3' }] } as unknown as Entry);
    m.sessions.push(
      mk('s1', 1, { projectId: 'e1' }),
      mk('s2', 2, { used: ['e1'] }),
      mk('s3', 3),
      mk('s4', 4, { projectId: 'other' }),
    );
    expect(sessionsFor(m, 'e1').map(x => x.id)).toEqual(['s3', 's2', 's1']);
  });

  it('reads the route a task took from its real handoffs only', () => {
    const s = mk('s', 1, {
      flow: [
        ['memory', 'gemini', 40],
        ['gemini', 'muse', 120],
        ['muse', 'grokbot', 80],
        ['gemini', 'grokbot', 120],
      ],
    });
    expect(routeOf(s)).toEqual(['gemini', 'muse', 'grokbot']);
    expect(routeOf(mk('t', 1))).toEqual([]);
  });

  it('splits [[Title]] wiki links out of a note', () => {
    expect(noteParts('Uses [[RedMed]] and [[NFC band]].')).toEqual([
      { text: 'Uses ' },
      { text: 'RedMed', link: true },
      { text: ' and ' },
      { text: 'NFC band', link: true },
      { text: '.' },
    ]);
  });

  it('reads [cite:ref] marks as evidence and strips both kinds of marks for plain text', () => {
    expect(noteParts('Picked it [cite:s4].')).toEqual([{ text: 'Picked it' }, { text: '', cite: 's4' }, { text: '.' }]);
    expect(plainNote('Uses [[RedMed]] daily [cite:s4].')).toBe('Uses RedMed daily.');
  });

  it('never drops a task a memory page cites, even past the normal limit', () => {
    const many = Array.from({ length: MAX_SESSIONS + 10 }, (_, i) => mk('s' + (i + 1), i + 1));
    const page = { id: 'e1', sources: [{ kind: 'session', label: 'first', ref: 's1' }] } as unknown as Entry;
    const kept = keepSessions(many, [page]);
    expect(kept.map(x => x.id)).toContain('s1');
    expect(kept.filter(x => x.id !== 's1')).toHaveLength(MAX_SESSIONS);
    expect(kept.at(-1)?.id).toBe('s' + (MAX_SESSIONS + 10));
    expect(keepSessions(many, []).map(x => x.id)).not.toContain('s1');
  });

  it('keeps a cited task across a save and reload', () => {
    const m = blankMem();
    m.entries.push({
      id: 'e1',
      key: 'ai:concept:ship small',
      type: 'concept',
      title: 'Ship small',
      note: 'Small steps [cite:s1].',
      sources: [{ kind: 'session', label: 'Task: plan the launch', ref: 's1' }],
      strength: 1,
      status: 'fresh',
      created: 1,
      seen: 1,
      links: [],
      corrected: false,
      skill: false,
      prog: null,
      corpusId: null,
      kws: null,
      manual: false,
    });
    for (let i = 1; i <= MAX_SESSIONS + 5; i++)
      m.sessions.push(
        mk('s' + i, i, { msgs: [{ from: 'gemini', tag: 'live · OpenAI · gpt · unverified', text: 'hi' }] }),
      );
    const back = sanitizeMem(JSON.parse(JSON.stringify(m)))!;
    expect(back.sessions.some(x => x.id === 's1')).toBe(true);
    expect(back.entries[0].note).toBe('Small steps [cite:s1].');
  });

  it('cuts a note without leaving half a mark at the end', () => {
    const n = 'a'.repeat(590) + ' end [cite:s12345]';
    expect(clipNote(n)).toBe('a'.repeat(590) + ' end');
    expect(clipNote('b'.repeat(595) + ' [[Long title]]')).toBe('b'.repeat(595));
    expect(clipNote('short [cite:s1]')).toBe('short [cite:s1]');
  });
});
