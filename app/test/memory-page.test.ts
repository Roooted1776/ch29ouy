import { describe, expect, it } from 'vitest';
import { blankMem, noteParts, routeOf, sessionsFor, type Entry, type Session } from '../src/lib/memory';

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
});
