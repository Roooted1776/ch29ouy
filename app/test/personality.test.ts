import { beforeEach, describe, expect, it } from 'vitest';
import {
  HALF_LIFE_MS,
  PERSONA,
  feelOf,
  moodOf,
  nudge,
  ownerEvent,
  personalityLine,
  resetFeel,
} from '../src/lib/personality';
import { huddleSystem, roomSystem } from '../src/data/team';

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe('chat personality', () => {
  beforeEach(() => {
    (globalThis as any).localStorage = fakeStorage();
    resetFeel(true);
  });

  it('rests at each bot baseline and reads the room', () => {
    expect(feelOf('muse').warmth).toBe(PERSONA.muse.warmth);
    expect(moodOf(feelOf('gemini'))).toBe('upbeat');
    expect(moodOf(feelOf('muse'))).toBe('steady');
  });

  it('kind words warm a bot, harsh words chill it, and the mood changes the prompt', () => {
    expect(ownerEvent('thanks, great job')).toBe('kind');
    expect(ownerEvent('that is wrong')).toBe('harsh');
    expect(ownerEvent('what time is it')).toBeNull();
    const calm = personalityLine('claude');
    for (let i = 0; i < 4; i++) nudge('claude', 'harsh');
    expect(moodOf(feelOf('claude'))).not.toBe(moodOf({ warmth: PERSONA.claude.warmth, energy: PERSONA.claude.energy }));
    expect(personalityLine('claude')).not.toBe(calm);
    expect(personalityLine('claude')).toContain(PERSONA.claude.trait);
  });

  it('talking tires a bot, running out of credit wears it down, and time restores it', () => {
    const t0 = 1_000_000;
    nudge('cursor', 'quota', t0);
    nudge('cursor', 'quota', t0);
    expect(moodOf(feelOf('cursor', t0))).toBe('weary');
    const later = feelOf('cursor', t0 + 6 * HALF_LIFE_MS);
    expect(Math.abs(later.energy - PERSONA.cursor.energy)).toBeLessThan(0.05);
  });

  it('is saved in this browser and survives a reload, and bad data is ignored', () => {
    nudge('grok', 'kind');
    const saved = feelOf('grok').warmth;
    resetFeel();
    expect(feelOf('grok').warmth).toBeCloseTo(saved, 1);
    (globalThis as any).localStorage.setItem('brain.personality.v1', '{"grok":{"warmth":"x","energy":99}}');
    resetFeel();
    expect(feelOf('grok').energy).toBeLessThanOrEqual(1);
    expect(feelOf('grok').warmth).toBe(PERSONA.grok.warmth);
  });

  it('chat and huddle prompts carry the personality line', () => {
    const line = personalityLine('gemini');
    expect(roomSystem('gemini', false, line)).toContain(line);
    expect(huddleSystem('gemini', 'respond', line)).toContain(line);
  });
});
