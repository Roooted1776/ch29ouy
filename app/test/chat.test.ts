import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LIVE_TAG, blankMem, sanitizeMem } from '../src/lib/memory';
import { CHAT_SYSTEM, addressed, runChat } from '../src/lib/run-chat';
import { AGENTS } from '../src/data/team';
import { ProviderError, QUOTA_LABEL } from '../src/lib/providers';
import { SIDE_CHAT_PER_MESSAGE } from '../src/lib/banter';

describe('chat mode tags and sanitize', () => {
  it('accepts chat · provider tags as live sessions', () => {
    const tag = 'chat · OpenAI · gpt-4o-mini · unverified';
    expect(LIVE_TAG.test(tag)).toBe(true);
    const m = sanitizeMem({
      ...blankMem(),
      nextSession: 2,
      sessions: [
        {
          id: 's1',
          ts: Date.now(),
          q: 'hello',
          kind: 'chat',
          kws: [],
          accepted: [],
          uncovered: [],
          msgs: [
            { from: 'owner', tag: '', text: 'hello' },
            { from: 'chatgpt', tag, text: 'hi' },
          ],
        },
      ],
    });
    expect(m?.sessions).toHaveLength(1);
    expect(m?.sessions[0].kind).toBe('chat');
    expect(m?.sessions[0].msgs[1].tag).toBe(tag);
    expect(m?.inbox).toHaveLength(0);
  });
});

describe('runChat', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('saves a chat session without inbox or wiki entries, and keeps the user message if the provider fails', async () => {
    const mem = blankMem();
    mem.settings.brain = true;
    mem.settings.useMemory = false;
    let state: any = {
      role: 'admin',
      mem,
      keys: { openai: 'sk-test' },
      dead: {},
      live: { provider: 'openai', models: {}, callCap: 9, maxTokens: 400, web: false, on: true, banter: false },
      inactiveBots: [],
      limited: [],
      busy: false,
      dreaming: false,
      incognito: false,
      calls: 0,
      activeProject: 'Brain',
      chatThreadId: null,
      stopped: false,
    };
    const set = (p: any) => {
      const patch = typeof p === 'function' ? p(state) : p;
      state = { ...state, ...patch };
    };
    const get = () => state;
    const say = vi.fn();
    const commit = (fn: (m: typeof mem) => void) => {
      fn(state.mem);
      state = { ...state, mem: { ...state.mem, sessions: [...state.mem.sessions], inbox: [...state.mem.inbox] } };
    };
    state.commit = commit;

    const fetchImpl = vi.fn(async () => {
      throw new ProviderError('HTTP 500: boom', false);
    });
    vi.stubGlobal('fetch', fetchImpl);

    await runChat('remember coffee preference', {
      get,
      set,
      say,
      clean: t => t,
      addPulse: () => {},
      words: () => 1,
      speedFor: () => undefined,
      liveReady: () => true,
      admin: () => true,
      ctls: new Set(),
      ls: null,
    });

    expect(state.mem.sessions).toHaveLength(1);
    expect(state.mem.sessions[0].kind).toBe('chat');
    expect(state.mem.inbox).toHaveLength(0);
    expect(state.mem.entries).toHaveLength(0);
    expect(state.mem.sessions[0].msgs.some((m: { from: string }) => m.from === 'owner')).toBe(true);
    expect(state.chatThreadId).toBe(state.mem.sessions[0].id);
    expect(CHAT_SYSTEM).toMatch(/cannot run tools/i);
  });

  it('does not count as a team task and does not file memories on success', async () => {
    const mem = blankMem();
    mem.settings.useMemory = false;
    let state: any = {
      role: 'admin',
      mem,
      keys: { openai: 'sk-test' },
      dead: {},
      live: {
        provider: 'openai',
        models: { openai: 'gpt-4o-mini' },
        callCap: 9,
        maxTokens: 400,
        web: true,
        on: true,
        banter: true,
      },
      inactiveBots: [],
      limited: [],
      busy: false,
      dreaming: false,
      incognito: false,
      calls: 0,
      tasks: 0,
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
    const set = (p: any) => {
      const patch = typeof p === 'function' ? p(state) : p;
      Object.assign(state, patch);
    };
    // OpenAI Responses streaming shape used by callModel for openai
    const events = [
      { type: 'response.output_text.delta', delta: 'Noted.' },
      { type: 'response.completed', response: { usage: { input_tokens: 2, output_tokens: 1 } } },
    ];
    const body = events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })),
    );

    await runChat('hi', {
      get: () => state,
      set,
      say: () => {},
      clean: t => t,
      addPulse: () => {},
      words: () => 1,
      speedFor: () => undefined,
      liveReady: () => true,
      admin: () => true,
      ctls: new Set(),
      ls: null,
    });

    expect(state.tasks).toBe(0);
    expect(state.mem.inbox).toHaveLength(0);
    expect(state.mem.entries).toHaveLength(0);
    expect(state.mem.sessions[0].kind).toBe('chat');
    expect(state.mem.sessions[0].msgs.some((m: { tag: string }) => m.tag.startsWith('chat ·'))).toBe(true);
    // group chat: one lead reply on the task budget, then teammates chime in on the side-chat budget
    const bots = state.mem.sessions[0].msgs.filter((m: { from: string }) => m.from !== 'owner');
    expect(bots).toHaveLength(1 + SIDE_CHAT_PER_MESSAGE);
    expect(new Set(bots.map((m: { from: string }) => m.from)).size).toBe(bots.length);
    // every line is one call inside the page's call cap (AGENTS.md: the 9-call maximum stays)
    expect(state.calls).toBe(1 + SIDE_CHAT_PER_MESSAGE);
  });

  it('lets the bot Owner names answer first', async () => {
    const { state, deps } = room();
    stubReply();
    await runChat('Muse, what do you think?', deps);
    expect(state.mem.sessions[0].msgs[1].from).toBe('muse');
  });

  it('out of credit: no error message in the chat, just the short quota label and the bot marked', async () => {
    const { state, deps, say } = room();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new ProviderError(
          'HTTP 402: {"error":{"message":"You exceeded your current quota, a very long text"}}',
          false,
          true,
        );
      }),
    );
    await runChat('Claude Code, hello', deps);
    expect(say.mock.calls.filter(([m]) => m.cls === 'warn')).toHaveLength(0);
    expect(state.status).toBe(`Claude Code: ${QUOTA_LABEL}`);
    expect(state.limited).toContain('claude');
    expect(state.busy).toBe(false);
  });
});

describe('group chat fixes from the review', () => {
  it('a bot is called only by starting with its name or by @id', () => {
    expect(addressed('Cursor, check the merge', 'cursor')).toBe(true);
    expect(addressed('move the cursor left', 'cursor')).toBe(false);
    expect(addressed('what do you think @muse', 'muse')).toBe(true);
    expect(addressed('Claude Code: plan it', 'claude')).toBe(true);
  });

  it('with every bot off, nothing is sent', async () => {
    const { state, deps } = room();
    state.inactiveBots = AGENTS.map(a => a.id);
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await runChat('hello', deps);
    expect(f).not.toHaveBeenCalled();
    expect(state.status).toMatch(/No bot is on/);
  });

  it('teammate lines stay inside the call cap', async () => {
    const { state, deps } = room();
    state.live.banter = true;
    state.calls = state.live.callCap - 1;
    stubReply();
    await runChat('hi', deps);
    expect(state.calls).toBe(state.live.callCap);
    expect(state.mem.sessions[0].msgs.filter((m: { from: string }) => m.from !== 'owner')).toHaveLength(1);
  });

  it('when the lead is out of credit, a teammate answers instead', async () => {
    const { state, deps } = room();
    let n = 0;
    const events = [
      { type: 'response.output_text.delta', delta: 'I can take this one.' },
      { type: 'response.completed', response: { usage: { input_tokens: 2, output_tokens: 1 } } },
    ];
    const body = events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (n++ === 0) throw new ProviderError('HTTP 402: quota', false, true);
        return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
      }),
    );
    await runChat('Muse, hello', deps);
    const msgs = state.mem.sessions[0].msgs;
    expect(state.limited).toContain('muse');
    expect(msgs.at(-1).from).not.toBe('muse');
    expect(msgs.at(-1).text).toBe('I can take this one.');
    expect(msgs.at(-1).tag).toMatch(/^chat · /);
  });
});

function room() {
  const mem = blankMem();
  mem.settings.useMemory = false;
  const state: any = {
    role: 'admin',
    mem,
    keys: { openai: 'sk-test' },
    dead: {},
    live: { provider: 'openai', models: {}, callCap: 9, maxTokens: 400, web: false, on: true, banter: false },
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
  const say = vi.fn();
  const deps = {
    get: () => state,
    set: (p: any) => Object.assign(state, typeof p === 'function' ? p(state) : p),
    say,
    clean: (t: string) => t,
    addPulse: () => {},
    words: () => 1,
    speedFor: () => undefined,
    liveReady: () => true,
    admin: () => true,
    ctls: new Set<AbortController>(),
    ls: null,
  };
  return { state, deps, say };
}

function stubReply() {
  const events = [
    { type: 'response.output_text.delta', delta: 'Noted.' },
    { type: 'response.completed', response: { usage: { input_tokens: 2, output_tokens: 1 } } },
  ];
  const body = events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n';
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })),
  );
}
