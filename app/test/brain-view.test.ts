import { describe, expect, it } from 'vitest';
import { brainEntries, brainTasks, isFeedItem } from '../src/lib/brain-view';
import type { Entry, Session } from '../src/lib/memory';
import { pickBotProvider, type ProviderId } from '../src/lib/providers';

const e = (o: Partial<Entry>): Entry =>
  ({
    id: o.title || 'x',
    key: '',
    type: 'concept',
    title: 'x',
    note: '',
    sources: [{ kind: 'session', label: 's', ref: null }],
    strength: 1,
    status: 'fresh',
    created: 0,
    seen: 0,
    links: [],
    corrected: false,
    skill: false,
    prog: null,
    corpusId: null,
    kws: null,
    manual: false,
    ...o,
  }) as Entry;
const s = (id: string, q: string, ts: number, kind?: 'task' | 'chat'): Session =>
  ({ id, q, ts, kind, kws: [], accepted: [], uncovered: [], msgs: [] }) as Session;

describe('brain view', () => {
  it('hides stale pages, GitHub feed items and repeated titles, but keeps a selected one', () => {
    const gh = [{ kind: 'github' as const, label: 'g', ref: null }];
    const list = [
      e({ id: 'a', title: 'Deploy rule', strength: 2 }),
      e({ id: 'b', title: 'deploy  rule!', strength: 1 }),
      e({ id: 'c', title: 'Old', status: 'stale' }),
      e({ id: 'd', title: 'Brain Commit abc1234: fix', type: 'workstream', sources: gh }),
      e({ id: 'f', title: 'Repo: Brain', sources: gh }),
    ];
    expect(isFeedItem(list[3])).toBe(true);
    expect(brainEntries(list).map(x => x.id)).toEqual(['a', 'f']);
    expect(brainEntries(list, 'c').map(x => x.id)).toEqual(['a', 'c', 'f']);
  });

  it('keeps real tasks only, newest first, without repeats', () => {
    const out = brainTasks([
      s('1', 'Fix login', 1),
      s('2', 'fix login.', 3),
      s('3', 'hi', 4, 'chat'),
      s('4', 'Ship', 2),
    ]);
    expect(out.map(x => x.id)).toEqual(['2', '4']);
  });

  it('prefers free keys, then the bot company, then the main provider', () => {
    const has =
      (keys: string[]) =>
      (p?: string): p is ProviderId =>
        !!p && keys.includes(p);
    expect(pickBotProvider('anthropic', 'groq', 'openai', has(['groq', 'anthropic']))).toBe('groq');
    expect(pickBotProvider('anthropic', 'groq', 'openai', has(['cerebras', 'anthropic']))).toBe('cerebras');
    expect(pickBotProvider('anthropic', 'groq', 'openai', has(['anthropic']))).toBe('anthropic');
    expect(pickBotProvider('anthropic', 'groq', 'openai', has([]))).toBe('openai');
  });
});

describe('one chat pane', () => {
  it('sends plain messages as chat and "task:" messages as team tasks', async () => {
    const { taskText } = await import('../src/store');
    expect(taskText('hey team, how is it going?')).toBeNull();
    expect(taskText('task: fix the login')).toBe('fix the login');
    expect(taskText('/task fix it')).toBe('fix it');
    expect(taskText('Task for Gemini: check the layout')).toBe('Task for Gemini: check the layout');
  });
});
