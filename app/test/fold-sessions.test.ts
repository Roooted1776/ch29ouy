import { describe, expect, it } from 'vitest';
import { foldSessions, type Session } from '../src/lib/memory';

const mk = (id: string, ts: number, kind?: Session['kind']): Session => ({
  id,
  ts,
  q: id,
  kws: [],
  accepted: [],
  uncovered: [],
  msgs: [],
  ...(kind ? { kind } : {}),
});

describe('foldSessions (consolidated task dots)', () => {
  it('keeps the three newest tasks and folds older tasks and every chat', () => {
    const list = [mk('t1', 1), mk('c1', 2, 'chat'), mk('t2', 3), mk('t3', 4, 'task'), mk('t4', 5), mk('c2', 6, 'chat')];
    const { shown, folded } = foldSessions(list);
    expect(shown.map(s => s.id)).toEqual(['t2', 't3', 't4']);
    expect(folded.map(s => s.id)).toEqual(['c2', 'c1', 't1']);
  });
  it('folds nothing when there are only a few tasks', () => {
    const { shown, folded } = foldSessions([mk('a', 1), mk('b', 2)]);
    expect(shown.map(s => s.id)).toEqual(['a', 'b']);
    expect(folded).toEqual([]);
  });
});
