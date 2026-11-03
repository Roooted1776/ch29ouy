import { describe, expect, it, vi } from 'vitest';

const sseFetch = () =>
  vi.fn(async (_u: string, init: any) => {
    const filing = /File what the team should remember/.test(init.body);
    const enc = new TextEncoder(),
      body = [
        'data: ' +
          JSON.stringify({
            type: 'response.output_text.delta',
            delta: filing ? '{"memories":[{"type":"concept","title":"Plan first",' : 'one two ',
          }) +
          '\n\n',
        'data: ' +
          JSON.stringify({
            type: 'response.output_text.delta',
            delta: filing ? '"note":"The team plans before building."}]}' : 'three',
          }) +
          '\n\n',
        'data: ' +
          JSON.stringify({ type: 'response.completed', response: { usage: { input_tokens: 5, output_tokens: 3 } } }) +
          '\n\n',
      ];
    return new Response(
      new ReadableStream({
        start(c) {
          body.forEach(b => c.enqueue(enc.encode(b)));
          c.close();
        },
      }),
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    );
  });

describe('a real task, streamed', () => {
  it('records what passed between bots, each reply time, and saves both with the session', async () => {
    const d = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (k: string) => d.get(k) ?? null,
      setItem: (k: string, v: string) => void d.set(k, v),
      removeItem: (k: string) => void d.delete(k),
    };
    const f = sseFetch();
    (globalThis as any).fetch = f;
    vi.resetModules();
    const { useStore } = await import('../src/store');
    useStore.setState({ role: 'admin', keys: { openai: 'sk-test' } });
    useStore.getState().setLive({ provider: 'openai' });
    useStore.setState({ keys: { openai: 'sk-test' } });
    await useStore.getState().send('task: write a plan');
    const s = useStore.getState();
    // skill routing: Gemini, Muse, ChatGPT (plan, owner), Claude Code (write), Grok Bot, then Grok Bot files memory
    expect(f).toHaveBeenCalledTimes(6);
    expect(s.stages.xcode).toBe('skipped');
    expect(s.notes.xcode).toBe('Not used');
    expect(JSON.parse((f.mock.calls[0] as any)[1].body).stream).toBe(true);
    expect(s.draft).toBeNull();
    expect(s.busy).toBe(false);
    expect(s.flow[0]).toEqual(['owner', 'gemini', 3]); // the owner's task, three words
    expect(s.flow).toContainEqual(['gemini', 'muse', 6]); // "HANDOFF FROM Gemini:" + the three streamed words
    expect(s.flow).toContainEqual(['grokbot', 'brain', 3]);
    expect(Object.keys(s.timing).length).toBe(5);
    expect(Object.keys(s.stageTokens || {}).length).toBe(5);
    expect(s.stageTokens?.gemini).toEqual({ in: 5, out: 3 });
    expect(Object.keys(s.transitLatencies || {}).length).toBe(5);
    expect(typeof s.transitLatencies?.gemini).toBe('number');
    expect(s.transitLatencies?.gemini).toBeGreaterThanOrEqual(0);
    const sess = s.mem.sessions.at(-1)!;
    expect(sess.flow).toEqual(s.flow);
    expect(sess.ms).toEqual(s.timing);
    expect(sess.stageTokens).toEqual(s.stageTokens);
    expect(sess.transitLatencies).toEqual(s.transitLatencies);
    expect(sess.project).toBe('Brain');
    expect(sess.owner).toBe('chatgpt');
    expect(s.log.filter(m => m.from === 'gemini')[0].text).toBe('one two three');
    expect(s.mem.entries.map(e => e.key)).toContain('project:brain');
    expect(s.mem.entries.map(e => e.key)).toContain('ai:concept:plan first');
    expect(s.log.at(-1)).toMatchObject({
      from: 'grokbot',
      text: 'Filed to memory:\nPlan first: The team plans before building.',
    });
    expect(s.log.some(m => m.from === 'brain')).toBe(false); // the chat holds only AI replies
    expect(s.status).toMatch(/Grok Bot filed 1 memory/);
    // memory goes home: the filed memory rides from Grok Bot to its own dot in the brain
    const home = s.mem.entries.find(e => e.key === 'ai:concept:plan first')!;
    expect(s.pulses).toContainEqual(
      expect.objectContaining({ from: 'grokbot', to: 'mem:' + home.id, dur: 2600, color: expect.any(String) }),
    );
    delete (globalThis as any).localStorage;
  });

  it('gracefully handles mid-chain stage failures during streaming task, continues chain, and records DECLINED review', async () => {
    const d = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (k: string) => d.get(k) ?? null,
      setItem: (k: string, v: string) => void d.set(k, v),
      removeItem: (k: string) => void d.delete(k),
    };

    let fetchCall = 0;
    const failingFetch = vi.fn(async (_u: string, init: any) => {
      fetchCall++;
      // Stage 2 is Muse: simulate a 429 rate limit failure
      if (fetchCall === 2) {
        return new Response(
          JSON.stringify({
            error: { message: '429 Rate limit exceeded. Please wait before retrying.' },
          }),
          { status: 429, headers: { 'content-type': 'application/json' } },
        );
      }
      const filing = /File what the team should remember/.test(init.body);
      const enc = new TextEncoder(),
        body = [
          'data: ' +
            JSON.stringify({
              type: 'response.output_text.delta',
              delta: filing ? '{"memories":[]}' : 'stage reply ',
            }) +
            '\n\n',
          'data: ' +
            JSON.stringify({
              type: 'response.output_text.delta',
              delta: filing ? '' : 'done',
            }) +
            '\n\n',
          'data: ' +
            JSON.stringify({ type: 'response.completed', response: { usage: { input_tokens: 4, output_tokens: 2 } } }) +
            '\n\n',
        ];
      return new Response(
        new ReadableStream({
          start(c) {
            body.forEach(b => c.enqueue(enc.encode(b)));
            c.close();
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      );
    });

    (globalThis as any).fetch = failingFetch;
    vi.resetModules();
    const { useStore } = await import('../src/store');
    useStore.setState({ role: 'admin', keys: { openai: 'sk-test' } });
    useStore.getState().setLive({ provider: 'openai' });
    useStore.setState({ keys: { openai: 'sk-test' } });

    // a task that needs every skill brings in the whole team
    await useStore.getState().send('task: plan the iOS code fix, cite sources and flag security risks');
    const s = useStore.getState();

    // The chain continued despite Muse failing: Gemini (1) + ChatGPT..Xcode..GrokBot (8 more) + Dream filing (1) = 11 calls
    expect(failingFetch).toHaveBeenCalledTimes(11);
    expect(s.busy).toBe(false);

    // Muse is marked failed with error note
    expect(s.stages.muse).toBe('failed');
    expect(s.notes.muse).toMatch(/429 Rate limit|did not finish/);

    // Subsequent bots completed
    expect(s.stages.chatgpt).toBe('done');
    expect(s.stages.claude).toBe('done');
    expect(s.stages.grokbot).toBe('done');

    // Final session saved
    const sess = s.mem.sessions.at(-1)!;
    expect(sess.cover?.muse).toBeDefined();
    expect(sess.cover?.muse.s).toBe('failed');
    expect(sess.cover?.muse.why).toMatch(/429 Rate limit|did not finish/);

    // Grok Bot final review must be DECLINED due to the stage failure
    expect(sess.grokFinalReview).toMatch(/^DECLINED/);

    delete (globalThis as any).localStorage;
  });

  it('historical session preserves failed stages and reasons for ChatPanel viewSession', async () => {
    const { fromSession } = await import('../src/components/Coverage');
    const { useStore } = await import('../src/store');

    const sessionWithFailures: any = {
      id: 's99',
      ts: Date.now(),
      q: 'Audit network security',
      kws: [],
      accepted: [],
      uncovered: [],
      msgs: [
        { from: 'owner', tag: '', text: 'task: Audit network security' },
        { from: 'gemini', tag: 'live', text: 'Checked requirements' },
        { from: 'grokbot', tag: 'live', text: 'Final summary: DECLINED' },
      ],
      cover: {
        gemini: { s: 'done' },
        muse: { s: 'failed', why: '429 Rate limit exceeded' },
        chatgpt: { s: 'done' },
        xcode: { s: 'skipped', why: 'Not reached: stopped, limit or key' },
      },
      grokFinalReview: 'DECLINED: Blocked based on team response.',
    };

    // Coverage.fromSession extracts both failed and done states accurately
    const cov = fromSession(sessionWithFailures);
    expect(cov.states.gemini).toBe('done');
    expect(cov.states.muse).toBe('failed');
    expect(cov.notes.muse).toBe('429 Rate limit exceeded');
    expect(cov.states.xcode).toBe('skipped');
    expect(cov.notes.xcode).toBe('Not reached: stopped, limit or key');

    // Setting viewing session in store
    const currentMem = useStore.getState().mem;
    useStore.setState({
      mem: {
        ...currentMem,
        sessions: [...currentMem.sessions, sessionWithFailures],
      },
    });
    useStore.getState().viewSession('s99');
    expect(useStore.getState().viewing).toEqual(sessionWithFailures);
    expect(useStore.getState().viewing?.cover?.muse.s).toBe('failed');
    expect(useStore.getState().viewing?.cover?.muse.why).toBe('429 Rate limit exceeded');
  });
});
