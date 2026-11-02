import { describe, expect, it } from 'vitest';
import { buildChainDigest, chainFor, runChain } from '../src/lib/chain';
import { buildRequest, callModel, parseReply, ProviderError } from '../src/lib/providers';

const hooks = () => {
  const log: any[] = [],
    hand: string[] = [],
    act: (string | null)[] = [];
  return {
    log,
    hand,
    act,
    h: {
      say: (m: any) => log.push(m),
      active: (id: any) => act.push(id),
      handoff: (a: string, b: string) => hand.push(a + '>' + b),
      blocked: () => null,
    },
  };
};

describe('live chain', () => {
  it('runs all agents in review order then the lead', () => {
    expect(chainFor('write a plan')).toEqual([
      'gemini',
      'muse',
      'chatgpt',
      'claude',
      'cursor',
      'copilot',
      'perplexity',
      'grok',
      'xcode',
      'grokbot',
    ]);
    expect(chainFor('ship the iPhone app')).toContain('xcode');
  });
  it('each stage reviews the previous handoff and Grok Bot gets the whole chain', async () => {
    const prompts: string[] = [];
    const { h, hand, log } = hooks();
    const r = await runChain(
      'ship the iPhone app',
      'live · OpenAI · m',
      async (_s, u) => {
        prompts.push(u);
        return { text: 'REPLY ' + prompts.length, why: '' };
      },
      h,
      { brainContext: 'BRAIN CONTEXT: x', brainContextShort: 'BRAIN CONTEXT: short' },
    );
    expect(r.completed).toBe(10);
    expect(prompts[1]).toContain('HANDOFF FROM Gemini');
    expect(prompts[9]).toContain('HANDOFF FROM Gemini');
    expect(prompts[9]).toContain('HANDOFF FROM Xcode');
    expect(prompts[9]).toMatch(/FINAL SITUATION REPORT/);
    expect(prompts[0]).toContain('BRAIN CONTEXT');
    expect(prompts.every(p => p.includes('BRAIN CONTEXT'))).toBe(true); // every agent reads memory
    expect(prompts[1]).toContain('BRAIN CONTEXT: short');
    expect(prompts[9]).toContain('BRAIN CONTEXT');
    // Upstream milestone propagation to intermediate stages
    // Cursor (stage 4) receives Claude's proposal as incoming, plus Gemini and Muse in upstream progress
    expect(prompts[4]).toContain('HANDOFF FROM Claude Code');
    expect(prompts[4]).toContain('UPSTREAM CHAIN PROGRESS');
    expect(prompts[4]).toContain('Gemini - Check 1 Context & Requirements');
    expect(prompts[4]).toContain('Muse - Check 2 Adversarial Audit & Risks');
    expect(prompts[4]).toContain('Claude Code - Check 3 Builder Architecture Proposal');
    // Grok (stage 7) has full visibility into Claude's architecture and Gemini's scope
    expect(prompts[7]).toContain('Claude Code - Check 3 Builder Architecture Proposal');
    expect(prompts[7]).toContain('Gemini - Check 1 Context & Requirements');
    expect(hand[0]).toBe('owner>gemini');
    expect(hand).toContain('xcode>grokbot');
    expect(log.filter(m => m.tag === 'live · OpenAI · m').length).toBe(10);
  });
  it('a failed stage is marked failed and never filled with made-up text', async () => {
    const { h, log } = hooks();
    let n = 0;
    const r = await runChain(
      'plan',
      'live · OpenAI · m',
      async () => {
        if (++n === 2) throw new Error('HTTP 500');
        return { text: 'ok', why: '' };
      },
      h,
    );
    expect(r.failed).toEqual(['muse']);
    expect(log.some(m => m.from === 'muse')).toBe(false);
    expect(log.find(m => /Muse did not finish/.test(m.text)).text).toMatch(/Nothing was made up/);
  });
  it('stops at the per-task cap', async () => {
    const { h } = hooks();
    let n = 0;
    const r = await runChain(
      'plan',
      't',
      async () => {
        n++;
        return { text: 'ok', why: '' };
      },
      h,
      { perTaskCap: 3 },
    );
    expect(n).toBe(3);
    expect(r.completed).toBe(3);
  });
  it('buildChainDigest formats milestones with role labels and handles empty or failed states', () => {
    expect(buildChainDigest([])).toBe('');
    const digest = buildChainDigest([
      { id: 'gemini', name: 'Gemini', text: 'Requirements identified.' },
      { id: 'muse', name: 'Muse', text: 'Risks audited.' },
      { id: 'chatgpt', name: 'ChatGPT', text: 'Tool plan ready.', failed: true },
    ]);
    expect(digest).toContain('[Gemini - Check 1 Context & Requirements]\nRequirements identified.');
    expect(digest).toContain('[Muse - Check 2 Adversarial Audit & Risks]\nRisks audited.');
    expect(digest).toContain('[ChatGPT - Check 3 Strategy & Execution Plan [INCOMPLETE/FAILED]]\nTool plan ready.');
  });
});

describe('providers', () => {
  it('builds each provider request with the key only in its own header or URL', () => {
    const base = { key: 'TESTKEY123456', model: 'm', system: 'S', user: 'U', maxTokens: 120 };
    expect(buildRequest({ ...base, provider: 'anthropic' }).headers['x-api-key']).toBe('TESTKEY123456');
    const o = buildRequest({ ...base, provider: 'openai' });
    expect(o.headers.authorization).toBe('Bearer TESTKEY123456');
    expect((o.body as any).store).toBe(false);
    expect(buildRequest({ ...base, provider: 'google' }).url).toMatch(/key=TESTKEY123456$/);
    expect(buildRequest({ ...base, provider: 'xai' }).url).toBe('https://api.x.ai/v1/responses');
  });
  it('parses replies from every provider', () => {
    expect(
      parseReply('anthropic', { content: [{ type: 'text', text: 'a' }], usage: { input_tokens: 1, output_tokens: 2 } }),
    ).toMatchObject({ text: 'a', tin: 1, tout: 2 });
    expect(parseReply('google', { candidates: [{ content: { parts: [{ text: 'g' }] } }] }).text).toBe('g');
    expect(parseReply('openai', { output: [{ content: [{ type: 'output_text', text: 'o' }] }] }).text).toBe('o');
  });
  it('flags a rejected key and keeps the key out of the error', async () => {
    const fake = (async () =>
      new Response(JSON.stringify({ error: { message: 'bad key TESTKEY123456' } }), {
        status: 401,
      })) as unknown as typeof fetch;
    const err = await callModel({
      provider: 'openai',
      key: 'TESTKEY123456',
      model: 'm',
      system: 's',
      user: 'u',
      maxTokens: 10,
      fetchImpl: fake,
    }).catch(e => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.rejected).toBe(true);
    expect(err.message).not.toContain('TESTKEY123456');
  });
});
