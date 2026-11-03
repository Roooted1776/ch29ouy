import { describe, expect, it } from 'vitest';
import { buildChainDigest, chainFor, routeTask, runChain as routedRunChain, skillScore } from '../src/lib/chain';
import { LIVE_ORDER } from '../src/data/team';
import { buildRequest, callModel, parseReply, ProviderError, QUOTA_LABEL } from '../src/lib/providers';
import { finalReviewFor } from '../src/lib/approval';
import { parseStageError } from '../src/lib/run-task';

// These tests check the chain's mechanics with the whole team on board; skill routing has its own tests.
const runChain: typeof routedRunChain = (task, tag, call, hooks, opts = {}) =>
  routedRunChain(task, tag, call, hooks, { team: LIVE_ORDER, ...opts });

const hooks = () => {
  const log: any[] = [],
    hand: string[] = [],
    act: (string | null)[] = [],
    creditFails: { bot: string; err: string }[] = [];
  return {
    log,
    hand,
    act,
    creditFails,
    h: {
      say: (m: any) => log.push(m),
      active: (id: any) => act.push(id),
      handoff: (a: string, b: string) => hand.push(a + '>' + b),
      blocked: () => null,
      onCreditFailure: (bot: any, err: any) => creditFails.push({ bot, err }),
    },
  };
};

describe('live chain', () => {
  it('routes by skill: Gemini, Muse and Grok Bot always, plus only the matching specialists', () => {
    expect(chainFor('write a plan')).toEqual(['gemini', 'muse', 'chatgpt', 'claude', 'grokbot']);
    expect(chainFor('ship the iPhone app')).toEqual(['gemini', 'muse', 'xcode', 'grokbot']);
    expect(chainFor('fix the bug in the repo')).toEqual(['gemini', 'muse', 'claude', 'cursor', 'copilot', 'grokbot']);
    expect(chainFor('find sources and cite them')).toEqual(['gemini', 'muse', 'perplexity', 'grokbot']);
    expect(chainFor('what are the risks of this strategy?')).toEqual(['gemini', 'muse', 'grok', 'grokbot']);
    expect(chainFor('plan the iOS code fix, cite sources and flag security risks')).toEqual([
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
  });
  it('names one owner: the best skill fit, or Claude Code when nothing matches', () => {
    expect(routeTask('ship the iPhone app').owner).toBe('xcode');
    expect(routeTask('find sources and cite them').owner).toBe('perplexity');
    expect(routeTask('hello there').owner).toBe('claude');
    expect(routeTask('hello there').bots).toEqual(['gemini', 'muse', 'claude', 'grokbot']);
    // the owner is switched off: the next best fit owns it, and an off bot never runs
    const r = routeTask('fix the bug in the repo', ['claude']);
    expect(r.owner).toBe('cursor');
    expect(r.bots).not.toContain('claude');
    expect(skillScore('ship the iPhone app', 'xcode')).toBeGreaterThan(skillScore('ship the iPhone app', 'claude'));
  });
  it('names the owner in the chain header and the result', async () => {
    const { h, log } = hooks();
    const r = await routedRunChain(
      'ship the iPhone app',
      'live · OpenAI · m',
      async () => ({ text: 'ok', why: '' }),
      h,
    );
    expect(r.owner).toBe('xcode');
    expect(r.completed).toBe(4);
    expect(log.find((m: any) => m.text.startsWith('Handoff chain:')).text).toContain('Owner of this task: Xcode');
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

  it('handles quota and credit failures with QUOTA_LABEL, triggers onCreditFailure, and continues autonomously', async () => {
    const { h, log, creditFails } = hooks();
    let step = 0;
    const prompts: string[] = [];
    const r = await runChain(
      'Audit dependencies',
      'live · OpenAI · m',
      async (_s, u) => {
        step++;
        prompts.push(u);
        if (step === 2) {
          throw new Error('402 Payment Required: monthly quota reached');
        }
        return { text: `Output from stage ${step}`, why: '' };
      },
      h,
    );
    expect(r.failed).toEqual(['muse']);
    expect(r.completed).toBe(9);
    expect(creditFails).toHaveLength(1);
    expect(creditFails[0].bot).toBe('muse');
    expect(creditFails[0].err).toContain('quota reached');

    const warningMsg = log.find(m => m.from === 'brain' && m.cls === 'warn');
    expect(warningMsg).toBeDefined();
    expect(warningMsg.text).toContain(`Muse did not finish: ${QUOTA_LABEL}`);
    expect(warningMsg.text).toContain('Nothing was made up in its place');

    // Stage 3 (ChatGPT) receives autonomous continuation notice
    expect(prompts[2]).toContain('HANDOFF STATUS FOR Muse:');
    expect(prompts[2]).toContain('Next worker: review the last available handoff above and continue autonomously.');
  });

  it('Grok Bot synthesizes upstream failures and produces final DECLINED review verdict', async () => {
    const { h } = hooks();
    let step = 0;
    let lastGrokBotPrompt = '';
    const r = await runChain(
      'Verify build',
      'live · OpenAI · m',
      async (_s, u) => {
        step++;
        if (step === 9) {
          // Xcode fails with 500 internal error
          throw new Error('Build daemon crashed: code 500');
        }
        if (step === 10) {
          lastGrokBotPrompt = u;
          return { text: 'Summary of results.\nDECISION: PASS', why: '' };
        }
        return { text: `OK ${step}`, why: '' };
      },
      h,
    );
    expect(r.failed).toEqual(['xcode']);
    expect(r.completed).toBe(9);
    // Grok Bot was called with Xcode's failure status in handoffs
    expect(lastGrokBotPrompt).toContain('HANDOFF STATUS FOR Xcode:');
    expect(lastGrokBotPrompt).toContain('Build daemon crashed');

    // Safety override in approval: any stage failure results in DECLINED verdict
    const review = finalReviewFor(r.failed.length > 0, 'DECISION: PASS');
    expect(review).toBe('DECLINED: Blocked based on team response.');
  });

  it('robust stage error parser extracts bot and reasons across all error formats', () => {
    // Standard format with Nothing was made up
    expect(
      parseStageError(
        'Gemini did not finish: Disabled · Reached Credit Quota, Wait Until Reset. Nothing was made up in its place.',
      ),
    ).toEqual({ id: 'gemini', reason: 'Disabled · Reached Credit Quota, Wait Until Reset' });

    // Rate limit without trailer
    expect(parseStageError('Muse did not finish: 429 Too Many Requests')).toEqual({
      id: 'muse',
      reason: '429 Too Many Requests',
    });

    // Timeout
    expect(parseStageError('Claude Code timed out: connection closed after 30s')).toEqual({
      id: 'claude',
      reason: 'connection closed after 30s',
    });

    // Provider error
    expect(parseStageError('Cursor failed: Git repository error 500')).toEqual({
      id: 'cursor',
      reason: 'Git repository error 500',
    });

    // Stage failure prefix
    expect(parseStageError('Stage Xcode failed: Provisioning profile invalid')).toEqual({
      id: 'xcode',
      reason: 'Provisioning profile invalid',
    });

    // Non-agent message
    expect(parseStageError('The limit of 9 model calls for one task was reached.')).toBeNull();
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
  it('asks once more without the web tool when Groq rejects a made-up tool call', async () => {
    const bodies: any[] = [];
    const fake = (async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      if (bodies.length === 1)
        return new Response(
          JSON.stringify({
            error: {
              message: "tool call validation failed: attempted to call tool 'JSON' which was not in request.tools",
            },
          }),
          { status: 400 },
        );
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await callModel({
      provider: 'groq',
      key: 'k',
      model: 'openai/gpt-oss-120b',
      system: 's',
      user: 'u',
      maxTokens: 10,
      web: true,
      fetchImpl: fake,
    });
    expect(r.text).toBe('ok');
    expect(bodies).toHaveLength(2);
    expect(bodies[0].tools).toBeDefined();
    expect(bodies[1].tools).toBeUndefined();
  });
});
