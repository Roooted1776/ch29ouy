import { describe, expect, it } from 'vitest';
import { LIVE_ORDER, type AgentId } from '../src/data/team';
import { buildChainDigest, runChain, type ChainHooks, type StageMilestone } from '../src/lib/chain';
import { hasFailureVerdict, finalReviewFor, APPROVED_FOR_DIRECTOR_REVIEW } from '../src/lib/approval';
import { parseStageError } from '../src/lib/run-task';
import { cleanFlow, cleanMs, cleanStageTokens, cleanTransitLatencies } from '../src/lib/memory';
import { cleanChatText } from '../src/components/ChatPanel';
import { redact } from '../src/lib/redact';
import { pulseMs } from '../src/store';

describe('Tier 5 Adversarial Hardening: parseStageError', () => {
  it('correctly parses Pattern A ("<Agent> did not finish: <reason>")', () => {
    const res1 = parseStageError('Gemini did not finish: quota exhausted. Nothing was made up in its place.');
    expect(res1).toEqual({ id: 'gemini', reason: 'quota exhausted' });

    const res2 = parseStageError('Claude Code did not finish: model timeout.');
    expect(res2).toEqual({ id: 'claude', reason: 'model timeout.' });

    const res3 = parseStageError('Grok Bot did not finish: 503 service unavailable');
    expect(res3).toEqual({ id: 'grokbot', reason: '503 service unavailable' });
  });

  it('correctly parses Pattern B ("<Agent> failed/error/timed out: <reason>")', () => {
    const res1 = parseStageError('Cursor failed: syntax error in proposal');
    expect(res1).toEqual({ id: 'cursor', reason: 'syntax error in proposal' });

    const res2 = parseStageError('Copilot timed out: socket hang up');
    expect(res2).toEqual({ id: 'copilot', reason: 'socket hang up' });

    const res3 = parseStageError('Xcode error: signing certificate missing');
    expect(res3).toEqual({ id: 'xcode', reason: 'signing certificate missing' });
  });

  it('correctly parses Pattern C (Agent name prefix with failure indicators)', () => {
    const res1 = parseStageError('Perplexity: encountered an error: HTTP 429 rate limit exceeded');
    expect(res1?.id).toBe('perplexity');
    expect(res1?.reason).toContain('HTTP 429 rate limit exceeded');

    const res2 = parseStageError('Muse - stage failed: assertion error in audit');
    expect(res2?.id).toBe('muse');
    expect(res2?.reason).toContain('assertion error in audit');
  });

  it('correctly parses Pattern D ("Stage <Agent> failed: <reason>")', () => {
    const res = parseStageError('Stage ChatGPT failed: network reset by peer');
    expect(res).toEqual({ id: 'chatgpt', reason: 'network reset by peer' });
  });

  it('does NOT trigger false positives on benign conversational text', () => {
    expect(parseStageError('Claude Code wrote a clear proposal for the architecture.')).toBeNull();
    expect(parseStageError('Gemini reviewed the context and found 3 requirements.')).toBeNull();
    expect(parseStageError('Grok challenged the assumptions and praised the tests.')).toBeNull();
    expect(parseStageError('')).toBeNull();
    expect(parseStageError('   ')).toBeNull();
    // @ts-expect-error test invalid inputs
    expect(parseStageError(null)).toBeNull();
    // @ts-expect-error test invalid inputs
    expect(parseStageError(undefined)).toBeNull();
  });
});

describe('Tier 5 Adversarial Hardening: hasFailureVerdict and finalReviewFor', () => {
  it('identifies structured PASS verdicts even with past failure chatter', () => {
    expect(hasFailureVerdict('Earlier stage 1 had a failure, but our DECISION: PASS now.')).toBe(false);
    expect(hasFailureVerdict('VERDICT: PASS - all checks verified.')).toBe(false);
    expect(hasFailureVerdict('RECOMMENDATION: PASS.')).toBe(false);
  });

  it('identifies structured FAIL/DECLINE/BLOCKED verdicts with absolute authority', () => {
    expect(hasFailureVerdict('DECISION: FAIL - missing evidence in Check 2.')).toBe(true);
    expect(hasFailureVerdict('VERDICT: DECLINED')).toBe(true);
    expect(hasFailureVerdict('VERDICT: BLOCKED by security audit')).toBe(true);
    expect(hasFailureVerdict('RECOMMENDATION: FAIL')).toBe(true);
  });

  it('correctly handles negated failure phrasing without false triggers', () => {
    expect(hasFailureVerdict('All 10 checks passed; no tests failed.')).toBe(false);
    expect(hasFailureVerdict('Zero checks failed during verification.')).toBe(false);
    expect(hasFailureVerdict('The suite executed without failures.')).toBe(false);
    expect(hasFailureVerdict('Never failed a single unit test.')).toBe(false);
    expect(hasFailureVerdict('Zero blockers identified for deployment.')).toBe(false);
    expect(hasFailureVerdict('None of the checks failed today.')).toBe(false);
    expect(hasFailureVerdict('Clean run, not failed in any stage.')).toBe(false);
  });

  it('finalReviewFor enforces safety: hasFailures=true ALWAYS triggers DECLINED', () => {
    // Even if Grok Bot says DECISION: PASS, if hasFailures=true the final review MUST be DECLINED
    expect(finalReviewFor(true, 'DECISION: PASS - all good!')).toBe('DECLINED: Blocked based on team response.');
    expect(finalReviewFor(true, undefined)).toBe('DECLINED: Blocked based on team response.');
    expect(finalReviewFor(false, 'DECISION: PASS')).toBe(APPROVED_FOR_DIRECTOR_REVIEW);
    expect(finalReviewFor(false, 'DECISION: FAIL')).toBe('DECLINED: Blocked based on team response.');
  });
});

describe('Tier 5 Adversarial Hardening: Memory and Metric Sanitization', () => {
  it('cleanFlow sanitizes endpoints, negative numbers, floats, and clamps values', () => {
    expect(cleanFlow(null)).toBeUndefined();
    expect(cleanFlow('invalid')).toBeUndefined();

    const raw = [
      ['gemini', 'muse', 45.7], // float rounded
      ['unknown_bot', 'muse', 10], // invalid sender filtered
      ['gemini', 'unknown_receiver', 10], // invalid receiver filtered
      ['owner', 'gemini', -5], // negative words filtered
      ['claude', 'cursor', 500000], // extreme words clamped to 100,000
      ['brain', 'grokbot', 0], // zero words allowed
      ['memory', 'claude', 120], // memory endpoint allowed
    ];

    const cleaned = cleanFlow(raw);
    expect(cleaned).toEqual([
      ['gemini', 'muse', 46],
      ['claude', 'cursor', 100000],
      ['brain', 'grokbot', 0],
      ['memory', 'claude', 120],
    ]);
  });

  it('cleanMs and cleanTransitLatencies sanitize timing dictionaries', () => {
    expect(cleanMs(null)).toBeUndefined();
    expect(cleanTransitLatencies(null)).toBeUndefined();

    const rawMs = {
      gemini: 1500.4,
      muse: -20, // negative dropped
      fake_agent: 300, // unknown dropped
      claude: 999999, // clamped to 600,000
    };
    expect(cleanMs(rawMs)).toEqual({
      gemini: 1500,
      claude: 600000,
    });

    const rawTransit = {
      xcode: 2200.8,
      grokbot: -100,
      invalid_bot: 1200,
      copilot: 800000,
    };
    expect(cleanTransitLatencies(rawTransit)).toEqual({
      xcode: 2201,
      copilot: 600000,
    });
  });

  it('cleanStageTokens clamps input/output tokens and filters invalid entries', () => {
    expect(cleanStageTokens(null)).toBeUndefined();

    const raw = {
      gemini: { in: 120.3, out: 45.6 },
      invalid_bot: { in: 100, out: 100 },
      claude: { in: -10, out: 50 }, // negative 'in' dropped
      cursor: { in: 5000000, out: 2000000 }, // clamped to 1,000,000
    };

    expect(cleanStageTokens(raw)).toEqual({
      gemini: { in: 120, out: 46 },
      cursor: { in: 1000000, out: 1000000 },
    });
  });
});

describe('Tier 5 Adversarial Hardening: cleanChatText UI Protection', () => {
  it('converts multiline and tagged code fences into [Action: ...]', () => {
    const input = 'Here is the fix:\n```typescript\nfunction run() {\n  return true;\n}\n```\nAll done.';
    const output = cleanChatText(input);
    expect(output).toContain('[Action: function run() { return true; }]');
    expect(output).not.toContain('```');
  });

  it('handles unclosed code fences safely', () => {
    const input = 'Starting work:\n```sh\nnpm test';
    const output = cleanChatText(input);
    expect(output).toBe('Starting work:\n[Action: npm test]');
  });

  it('strips empty or whitespace-only code fences cleanly', () => {
    expect(cleanChatText('Hello ``` ``` world')).toBe('Hello  world');
    expect(cleanChatText('```\n\n   \n```')).toBe('');
  });

  it('truncates oversized code fences (>100 chars) with ellipsis', () => {
    const longCode =
      'const veryLongVariableName = "this is an extremely long code line designed to exceed the one hundred character limit for chat text actions";';
    const input = '```js\n' + longCode + '\n```';
    const output = cleanChatText(input);
    expect(output.startsWith('[Action: ')).toBe(true);
    expect(output.endsWith('…]')).toBe(true);
    // [Action: (9) + slice(0, 97) (97) + …] (2) = 108
    expect(output.length).toBe(108);
  });

  it('preserves inline backticks for command and file citations', () => {
    const input = 'Please run `npm test` and inspect `app/src/lib/chain.ts`.';
    expect(cleanChatText(input)).toBe(input);
  });
});

describe('Tier 5 Adversarial Hardening: buildChainDigest', () => {
  it('constructs structured upstream digests for all roles', () => {
    const milestones: StageMilestone[] = [
      { id: 'gemini', name: 'Gemini', text: 'Req: full chain flow.' },
      { id: 'muse', name: 'Muse', text: 'Audit: verified zero leaks.', failed: false },
      { id: 'cursor', name: 'Cursor', text: 'Rate limit 429 encountered.', failed: true },
    ];

    const digest = buildChainDigest(milestones);
    expect(digest).toContain('[Gemini - Check 1 Context & Requirements]\nReq: full chain flow.');
    expect(digest).toContain('[Muse - Check 2 Adversarial Audit & Risks]\nAudit: verified zero leaks.');
    expect(digest).toContain('[Cursor - Check 3 Code & Repo Fit [INCOMPLETE/FAILED]]\nRate limit 429 encountered.');
  });
});

describe('Tier 5 Adversarial Hardening: runChain Execution Loops & Error Paths', () => {
  it('autonomous continuation on mid-chain failure with onCreditFailure trigger', async () => {
    const creditFailures: { id: AgentId; reason: string }[] = [];
    const msgs: any[] = [];
    const activeStates: (AgentId | null)[] = [];

    const hooks: ChainHooks = {
      say: m => msgs.push(m),
      active: id => activeStates.push(id),
      handoff: () => {},
      blocked: () => null,
      onCreditFailure: (id, reason) => creditFailures.push({ id, reason }),
    };

    // Stage call where Cursor encounters a 402 Payment Required credit error
    const call = async (system: string, _user: string) => {
      if (system.includes('Cursor')) {
        const err = new Error('HTTP 402: Payment Required / Credit balance exhausted');
        (err as any).outOfCredits = true;
        throw err;
      }
      return { text: 'Stage analysis completed cleanly.', why: 'stop' };
    };

    const res = await runChain('Task test', 'live-tag', call, hooks);

    // 10 agents total, Cursor failed -> 9 completed, 1 failed
    expect(res.completed).toBe(9);
    expect(res.failed).toEqual(['cursor']);

    // onCreditFailure triggered for cursor
    expect(creditFailures.length).toBe(1);
    expect(creditFailures[0].id).toBe('cursor');

    // Warning message recorded for cursor without making up text
    const cursorWarn = msgs.find(m => m.from === 'brain' && m.cls === 'warn' && m.text.includes('Cursor'));
    expect(cursorWarn).toBeDefined();
    expect(cursorWarn.text).toContain('Disabled · Reached Credit Quota');

    // Active state properly reverted to null after cursor failure
    expect(activeStates.filter(s => s === null).length).toBe(10);
  });

  it('perTaskCap halts calls synchronously and notifies cleanly', async () => {
    const msgs: any[] = [];
    const hooks: ChainHooks = {
      say: m => msgs.push(m),
      active: () => {},
      handoff: () => {},
      blocked: () => null,
    };

    let callCount = 0;
    const call = async () => {
      callCount++;
      return { text: 'Done', why: 'stop' };
    };

    // Cap at 3 calls
    const res = await runChain('Task test', 'live-tag', call, hooks, { perTaskCap: 3 });

    expect(callCount).toBe(3);
    expect(res.completed).toBe(3);
    const limitMsg = msgs.find(m => m.text.includes('The limit of 3 model calls for one task was reached.'));
    expect(limitMsg).toBeDefined();
  });
});

describe('Tier 5 Adversarial Hardening: Redaction & Security Boundaries', () => {
  it('redacts multiple known key formats and custom keys simultaneously', () => {
    const raw = 'Keys: sk-ant-api03-abcdef1234567890, sk-proj-1234567890abcdef, and my_custom_secret_key.';
    const customKeys = ['my_custom_secret_key'];
    const res = redact(raw, customKeys);

    expect(res.text).not.toContain('sk-ant-');
    expect(res.text).not.toContain('sk-proj-');
    expect(res.text).not.toContain('my_custom_secret_key');
    expect(res.n).toBeGreaterThanOrEqual(3);
  });

  it('pulseMs adheres to physical 1100ms..3400ms bounds across all agent pairs', () => {
    for (let i = 0; i < LIVE_ORDER.length - 1; i++) {
      const a = LIVE_ORDER[i];
      const b = LIVE_ORDER[i + 1];
      const latency = pulseMs({ from: a, to: b });
      expect(latency).toBeGreaterThanOrEqual(1100);
      expect(latency).toBeLessThanOrEqual(3400);
    }
  });
});
