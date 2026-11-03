import { afterEach, describe, expect, it, vi } from 'vitest';
import { huddleSystem, roomSystem, webLine } from '../src/data/team';
import { BANTER_MAX_LINES, SIDE_CHAT_PER_MESSAGE, runBanter, type BanterDeps } from '../src/lib/banter';
import { blankMem } from '../src/lib/memory';
import { canSearch } from '../src/lib/providers';
import { MAX_LINES_PER_BOT, pickSpeaker, runChat, webMode } from '../src/lib/run-chat';

// Open web (Owner, Nov 3 2026): chat and huddles search like tasks, default on, no prompts.
// A provider without a search tool says so. Free room: about 4 short side lines, picked by relevance and personality.

afterEach(() => vi.unstubAllGlobals());

const sse = (text: string) =>
  [
    { type: 'response.output_text.delta', delta: text },
    { type: 'response.completed', response: { usage: { input_tokens: 2, output_tokens: 1 } } },
  ]
    .map(e => 'data: ' + JSON.stringify(e) + '\n\n')
    .join('') + 'data: [DONE]\n\n';

function room(web: boolean, provider = 'openai', key = 'sk-test') {
  const mem = blankMem();
  mem.settings.useMemory = false;
  const state: any = {
    role: 'admin',
    mem,
    keys: { [provider]: key },
    dead: {},
    live: { provider, models: {}, callCap: 9, maxTokens: 400, web, on: true, banter: true },
    inactiveBots: [],
    limited: [],
    busy: false,
    dreaming: false,
    incognito: false,
    calls: 0,
    tin: 0,
    tout: 0,
    timing: {},
    flow: [],
    activeProject: 'Brain',
    chatThreadId: null,
    stopped: false,
    commit(fn: (m: typeof mem) => void) {
      fn(this.mem);
      this.mem = { ...this.mem, sessions: [...this.mem.sessions], inbox: [...this.mem.inbox] };
    },
  };
  const bodies: any[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_u: string, init: any) => {
      bodies.push(JSON.parse(init.body));
      return new Response(sse('A short line.'), { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }),
  );
  const deps = {
    get: () => state,
    set: (p: any) => Object.assign(state, typeof p === 'function' ? p(state) : p),
    say: vi.fn(),
    clean: (t: string) => t,
    addPulse: () => {},
    words: () => 1,
    speedFor: () => undefined,
    liveReady: () => true,
    admin: () => true,
    ctls: new Set<AbortController>(),
    ls: null,
  };
  return { state, deps, bodies };
}

const sys = (b: any): string => String(b.input?.[0]?.content ?? b.system ?? b.messages?.[0]?.content ?? '');

describe('chat web flags', () => {
  it('web on: the lead and every side line get the search tool and are told they can search', async () => {
    const { deps, bodies } = room(true);
    await runChat('hi team', deps);
    expect(bodies).toHaveLength(1 + SIDE_CHAT_PER_MESSAGE);
    for (const b of bodies) {
      expect(b.tools).toEqual([{ type: 'web_search' }]);
      expect(sys(b)).toMatch(/You can search the web/);
      expect(sys(b)).toMatch(/Never invent a link/);
    }
  });

  it('web off: no tool, and no bot claims to search', async () => {
    const { deps, bodies } = room(false);
    await runChat('hi team', deps);
    for (const b of bodies) {
      expect(b.tools).toBeUndefined();
      expect(sys(b)).toMatch(/never claim to have searched/);
    }
  });

  it('a provider with no search tool says so instead of pretending', async () => {
    const { deps, bodies } = room(true, 'openrouter', 'sk-or-test');
    await runChat('look this up', deps);
    expect(bodies.length).toBeGreaterThan(0);
    for (const b of bodies) {
      expect(b.tools).toBeUndefined();
      expect(sys(b)).toMatch(/no search tool/);
    }
  });

  it('webMode and canSearch follow what buildRequest really sends', () => {
    expect(webMode(false, 'openai', 'x')).toBe('off');
    expect(webMode(true, 'openai', 'x')).toBe('on');
    expect(webMode(true, 'openrouter', 'x')).toBe('none');
    expect(canSearch('groq', 'openai/gpt-oss-120b')).toBe(true);
    expect(canSearch('groq', 'llama-3.3-70b')).toBe(false);
    expect(webLine('none')).toMatch(/cannot search from this provider/);
    expect(roomSystem('muse', false, '', 'on')).toMatch(/You can search the web/);
    expect(roomSystem('muse', false)).not.toMatch(/You can search the web/);
    expect(huddleSystem('grokbot', 'open', '', 'on')).toMatch(/You can search the web/);
  });
});

describe('free group chat', () => {
  it('about four short side lines after the lead, inside the call cap', async () => {
    expect(SIDE_CHAT_PER_MESSAGE).toBeGreaterThanOrEqual(4);
    const { state, deps } = room(false);
    await runChat('hi team', deps);
    const lines = state.mem.sessions[0].msgs.filter((m: { from: string }) => m.from !== 'owner');
    expect(lines).toHaveLength(1 + SIDE_CHAT_PER_MESSAGE);
    expect(state.calls).toBe(1 + SIDE_CHAT_PER_MESSAGE);
    // bots answer each other, never the same bot twice in a row, nobody more than MAX_LINES_PER_BOT
    for (let i = 1; i < lines.length; i++) expect(lines[i].from).not.toBe(lines[i - 1].from);
    const count = new Map<string, number>();
    for (const l of lines) count.set(l.from, (count.get(l.from) || 0) + 1);
    for (const n of count.values()) expect(n).toBeLessThanOrEqual(MAX_LINES_PER_BOT);
    // chat is queued for Dream (Owner, Nov 3 2026) but never files wiki pages directly
    expect(state.mem.entries).toHaveLength(0);
    expect(state.mem.inbox).toHaveLength(1);
  });

  it('Stop ends the side chat: no more lines are asked for', async () => {
    const { state, deps, bodies } = room(false);
    const say = deps.say;
    deps.say = vi.fn((m: any) => {
      say(m);
      if (m.from !== 'owner') state.stopped = true;
    });
    await runChat('hi team', deps);
    expect(bodies).toHaveLength(1);
  });

  it('picks speakers by relevance and personality, never the last speaker', () => {
    const all = [
      'grokbot',
      'grok',
      'claude',
      'xcode',
      'gemini',
      'cursor',
      'copilot',
      'chatgpt',
      'perplexity',
      'muse',
    ] as const;
    const none = () => 0;
    expect(pickSpeaker([...all], 'ship the iPhone app with SwiftUI', null, new Map(), none)).toBe('xcode');
    expect(pickSpeaker([...all], 'find sources and cite them', null, new Map(), none)).toBe('perplexity');
    expect(pickSpeaker([...all], 'ship the iPhone app', 'xcode', new Map(), none)).not.toBe('xcode');
    // nothing relevant: the chattiest register (casual) leads on a tie
    expect(['grok', 'gemini']).toContain(pickSpeaker([...all], 'hello', null, new Map(), none));
    expect(pickSpeaker(['muse'], 'x', 'muse', new Map(), none)).toBeUndefined();
    expect(pickSpeaker(['muse'], 'x', null, new Map([['muse', MAX_LINES_PER_BOT]]), none)).toBeUndefined();
  });
});

describe('huddles use the open web on every line', () => {
  it('the opener, the answers and the close all get the search tool when web is on', async () => {
    const state: any = {
      live: { banter: true, web: true, provider: 'openai', models: { openai: 'gpt-4o-mini' }, maxTokens: 220 },
      keys: { openai: 'sk-test' },
      dead: {},
      stopped: false,
      busy: false,
      dreaming: false,
      incognito: false,
      viewing: null,
      bantering: false,
      banterSessions: 0,
      lastBanterAt: 0,
      inactiveBots: [],
      limited: [],
      tin: 0,
      tout: 0,
      draft: null,
      calls: 0,
      mem: { entries: [], sessions: [], inbox: [] },
    };
    const bodies: any[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: string, init: any) => {
        bodies.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ output_text: 'ok', usage: { input_tokens: 1, output_tokens: 1 } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );
    const deps: BanterDeps = {
      get: () => state,
      set: p => Object.assign(state, typeof p === 'function' ? p(state) : p),
      say: () => {},
      clean: t => t,
      admin: () => true,
      ctls: new Set(),
    };
    const n = await runBanter(deps, {
      firstDelayMs: 0,
      gapMs: 0,
      sessionGapMs: 0,
      rand: () => 0,
      lines: BANTER_MAX_LINES,
    });
    expect(n).toBe(BANTER_MAX_LINES);
    expect(bodies).toHaveLength(BANTER_MAX_LINES);
    for (const b of bodies) expect(b.tools).toEqual([{ type: 'web_search' }]);
  });
});
