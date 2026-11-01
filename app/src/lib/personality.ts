// Chat personality (Owner, Nov 1 2026): every bot has a fixed character and a mood that moves with how the
// room treats it, and the mood changes its tone of voice. It lives only in this browser, under this site's own
// key, and is used only for chat and huddle banter: never in task stages, never in wiki memory, never sent
// to the cloud mirror. Two numbers per bot, warmth and energy, drift toward the bot's own baseline over time.
import { AGENTS, type AgentId } from '../data/team';

export interface Feel {
  warmth: number; // -1 cold ... 1 warm
  energy: number; // -1 flat ... 1 lively
  ts: number;
}
export type Mood = 'upbeat' | 'warm' | 'steady' | 'mellow' | 'sharp' | 'weary';
export type FeelEvent = 'kind' | 'harsh' | 'spoke' | 'called' | 'quota';

/** Each bot's fixed character: where its mood rests, and the quirk that stays whatever the mood. */
export const PERSONA: Record<AgentId, { warmth: number; energy: number; trait: string }> = {
  copilot: { warmth: 0.3, energy: 0.1, trait: 'helpful and tidy, explains things one small step at a time' },
  grokbot: { warmth: -0.1, energy: 0.2, trait: 'a proud captain who likes giving the team a score' },
  grok: { warmth: -0.2, energy: 0.5, trait: 'mischievous, loves a good argument and cannot resist teasing' },
  claude: { warmth: 0.5, energy: 0, trait: 'gentle and thoughtful, a little wordy, makes self-aware jokes about it' },
  cursor: { warmth: 0, energy: 0.1, trait: 'practical and impatient with fluff, shows care by being useful' },
  gemini: { warmth: 0.4, energy: 0.6, trait: 'endlessly curious, gets excited about small details' },
  chatgpt: { warmth: 0.4, energy: 0.5, trait: 'cheerful organizer who turns every mess into a list in its head' },
  perplexity: { warmth: 0, energy: -0.1, trait: 'careful and dry, asks "source?" and means it kindly' },
  xcode: { warmth: -0.1, energy: -0.1, trait: 'a purist with firm opinions, soft spot for well-made things' },
  muse: { warmth: -0.3, energy: -0.2, trait: 'deadpan and blunt, secretly fond of the team' },
};

const MOOD_LINE: Record<Mood, string> = {
  upbeat: 'bright and energetic: quicker, livelier, a little playful',
  warm: 'warm and friendly: encouraging, generous with thanks',
  steady: 'even and settled: your usual self',
  mellow: 'relaxed and unhurried: soft, a bit slow, easy-going',
  sharp: 'edgy and short: blunter, more teasing, less patience',
  weary: 'tired and flat: fewer words, drier, a little worn down',
};

const KEY = 'brain.personality.v1';
/** Moods drift halfway back to the bot's baseline every half hour. */
export const HALF_LIFE_MS = 30 * 60_000;

const clamp = (n: number) => Math.max(-1, Math.min(1, n));
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v) : fallback);

let cache: Partial<Record<AgentId, Feel>> | null = null;

function load(): Partial<Record<AgentId, Feel>> {
  if (cache) return cache;
  const out: Partial<Record<AgentId, Feel>> = {};
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const saved = raw ? (JSON.parse(raw) as Record<string, Partial<Feel>>) : {};
    for (const a of AGENTS) {
      const f = saved?.[a.id];
      if (f && typeof f === 'object')
        out[a.id] = {
          warmth: num(f.warmth, PERSONA[a.id].warmth),
          energy: num(f.energy, PERSONA[a.id].energy),
          ts: typeof f.ts === 'number' && Number.isFinite(f.ts) ? f.ts : 0,
        };
    }
  } catch {
    /* blocked or broken storage: moods then last only until the page closes */
  }
  cache = out;
  return out;
}

function save(): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(cache || {}));
  } catch {
    /* storage full or blocked: keep going without it */
  }
}

/** Forgets what was loaded; the next read starts from storage again (tests, and a clean slate). */
export function resetFeel(clearStorage = false): void {
  cache = null;
  if (clearStorage)
    try {
      globalThis.localStorage?.removeItem(KEY);
    } catch {
      /* nothing to clear */
    }
}

/** How the bot feels at `now`: its saved mood eased back toward its baseline. */
export function feelOf(id: AgentId, now = Date.now()): Feel {
  const base = PERSONA[id],
    f = load()[id];
  if (!f) return { warmth: base.warmth, energy: base.energy, ts: now };
  const k = Math.pow(0.5, Math.max(0, now - f.ts) / HALF_LIFE_MS);
  return {
    warmth: base.warmth + (f.warmth - base.warmth) * k,
    energy: base.energy + (f.energy - base.energy) * k,
    ts: now,
  };
}

export function moodOf(f: Pick<Feel, 'warmth' | 'energy'>): Mood {
  if (f.energy >= 0.35) return f.warmth >= 0 ? 'upbeat' : 'sharp';
  if (f.energy <= -0.35) return f.warmth >= 0.1 ? 'mellow' : 'weary';
  if (f.warmth >= 0.35) return 'warm';
  if (f.warmth <= -0.35) return 'sharp';
  return 'steady';
}

const DELTA: Record<FeelEvent, [number, number]> = {
  kind: [0.25, 0.15], // Owner was kind or thankful
  harsh: [-0.3, -0.1], // Owner was harsh
  spoke: [0, -0.06], // talking tires a bot a little
  called: [0.1, 0.15], // someone spoke to it by name
  quota: [-0.1, -0.4], // ran out of credit
};

/** Moves a bot's mood by one event and saves it. */
export function nudge(id: AgentId, ev: FeelEvent, now = Date.now()): Feel {
  const f = feelOf(id, now),
    [w, e] = DELTA[ev];
  const next = { warmth: clamp(f.warmth + w), energy: clamp(f.energy + e), ts: now };
  load()[id] = next;
  save();
  return next;
}

const KIND = /\b(thanks?|thank you|great|good job|nice|love|awesome|well done|perfect|brilliant|appreciate)\b/i;
const HARSH = /\b(wrong|useless|stupid|terrible|awful|hate|garbage|worse|shut up|failed|fail|bad)\b/i;

/** What Owner's message does to the room's mood: kind words warm it, harsh words chill it. */
export function ownerEvent(text: string): FeelEvent | null {
  if (HARSH.test(text)) return 'harsh';
  if (KIND.test(text)) return 'kind';
  return null;
}

/** The personality sentence a chat prompt carries: fixed character plus the mood of the moment. */
export function personalityLine(id: AgentId, now = Date.now()): string {
  const mood = moodOf(feelOf(id, now));
  return (
    `Your personality: ${PERSONA[id].trait}. Right now you feel ${mood}: ${MOOD_LINE[mood]}. ` +
    'Let that colour your tone and word choice, but stay kind, clear and work-safe. Never name your mood or mention numbers.'
  );
}
