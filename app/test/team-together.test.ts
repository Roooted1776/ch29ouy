import { beforeEach, describe, expect, it } from 'vitest';
import { AGENTS } from '../src/data/team';
import { gatherInbox } from '../src/lib/dream';
import { blankMem } from '../src/lib/memory';
import { PERSONA, feelOf, handoffLines, randomizeMoods, resetFeel, setMoodShuffle } from '../src/lib/personality';

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe('team together (Owner, Nov 3 2026)', () => {
  beforeEach(() => {
    setMoodShuffle(false);
    (globalThis as any).localStorage = fakeStorage();
    resetFeel(true);
  });

  it('every sign-in starts each bot in a random mood, but keeps its personality', () => {
    const now = 1_000_000;
    let i = 0;
    const seq = [0.02, 0.98, 0.5, 0.1, 0.9, 0.3];
    randomizeMoods(() => seq[i++ % seq.length], now);
    const moved = AGENTS.filter(a => {
      const f = feelOf(a.id, now);
      return f.warmth !== PERSONA[a.id].warmth || f.energy !== PERSONA[a.id].energy;
    });
    expect(moved.length).toBe(AGENTS.length);
    for (const a of AGENTS) {
      const f = feelOf(a.id, now);
      expect(Math.abs(f.warmth)).toBeLessThanOrEqual(1);
      expect(Math.abs(f.energy)).toBeLessThanOrEqual(1);
    }
    expect(PERSONA.muse.trait).toMatch(/deadpan/);
  });

  it('a handoff gives two short chat lines: who hands off and who takes over', () => {
    const l = handoffLines('cursor', 'gemini', { from: 'Cursor', to: 'Gemini' }, () => 0);
    expect(l.give).toMatch(/Gemini/);
    expect(l.give.length).toBeLessThan(60);
    expect(l.take.length).toBeGreaterThan(0);
    expect(l.take).not.toMatch(/\{(to|from)\}/);
  });

  it('Dream reads chat and huddle sessions, so the bots learn from each other', () => {
    const m = blankMem();
    m.sessions.push({
      id: 's1',
      ts: Date.now(),
      q: 'Team huddle: deploy window',
      kind: 'chat',
      kws: [],
      accepted: [],
      uncovered: [],
      msgs: [
        { from: 'grokbot', tag: 'live · OpenAI · gpt · unverified', text: 'Deploys only on Fridays?' },
        { from: 'muse', tag: 'chat · OpenAI · gpt · unverified', text: 'Yes, after the backup check.' },
        { from: 'cursor', tag: 'handoff', text: 'Done. Passing to Gemini.' },
      ],
    });
    m.inbox.push({ kind: 'session', ref: 's1' });
    const [c] = gatherInbox(m);
    expect(c.text).toMatch(/Deploys only on Fridays/);
    expect(c.text).toMatch(/after the backup check/);
    expect(c.text).not.toMatch(/Passing to Gemini/); // handoff confirms are chatter, not facts
  });
});
