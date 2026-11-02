import { describe, expect, it } from 'vitest';
import {
  AGENTS,
  HANDOFF_RULE,
  LIVE_ORDER,
  TONE_LINE,
  huddlePrompt,
  huddleSystem,
  stagePrompt,
  systemPrompt,
  toneLine,
  toneOf,
} from '../src/data/team';

describe('agent tones (Owner: register assigned from personality, fixed per bot)', () => {
  it('every configured tool role has a tone on the scale', () => {
    expect(AGENTS).toHaveLength(10);
    expect(AGENTS.find(a => a.id === 'chatgpt')?.name).toBe('ChatGPT');
    expect(AGENTS.find(a => a.id === 'claude')?.name).toBe('Claude Code');
    expect(AGENTS.find(a => a.id === 'copilot')?.company).toBe('GitHub');
    for (const a of AGENTS) expect(['serious', 'balanced', 'casual']).toContain(toneOf(a.id));
  });

  it('the roster actually mixes registers: at least one serious and one casual bot', () => {
    const tones = new Set(AGENTS.map(a => toneOf(a.id)));
    expect(tones.has('serious')).toBe(true);
    expect(tones.has('balanced')).toBe(true);
    expect(tones.has('casual')).toBe(true);
  });

  it('assignments follow the voices: deadpan and no-fluff bots are serious, cheeky and upbeat ones casual', () => {
    expect(toneOf('muse')).toBe('serious'); // a blunt, deadpan auditor
    expect(toneOf('grokbot')).toBe('serious'); // a dry, decisive captain
    expect(toneOf('copilot')).toBe('balanced');
    expect(toneOf('cursor')).toBe('serious'); // no patience for fluff
    expect(toneOf('grok')).toBe('casual'); // a cheeky contrarian
    expect(toneOf('gemini')).toBe('casual'); // curious and upbeat
    expect(toneOf('claude')).toBe('balanced'); // thoughtful and warm
  });

  it('tone is a stable trait, not re-rolled: the same bot always maps to the same register line', () => {
    for (const a of AGENTS) {
      expect(toneOf(a.id)).toBe(toneOf(a.id));
      expect(toneLine(a.id)).toBe(TONE_LINE[toneOf(a.id)]);
    }
    expect(TONE_LINE.serious).not.toBe(TONE_LINE.casual);
  });

  it('huddle prompts differ by register: a serious bot and a casual bot get different instructions', () => {
    const serious = huddleSystem('muse', 'respond');
    const casual = huddleSystem('grok', 'respond');
    expect(serious).toContain('Your register is serious');
    expect(casual).toContain('Your register is casual');
    expect(serious).not.toContain('Your register is casual');
    expect(casual).not.toContain('Your register is serious');
    // the huddle job wording itself is untouched by tone
    expect(serious).toMatch(/answering in a team huddle led by Grok Bot/);
    expect(casual).toMatch(/answering in a team huddle led by Grok Bot/);
    // and Grok Bot leads in its own serious register, opening and closing
    expect(huddleSystem('grokbot', 'open')).toContain('Your register is serious');
    expect(huddleSystem('grokbot', 'close')).toContain('Your register is serious');
  });

  it('keeps the startup handoff rule in role, task and huddle prompts', () => {
    for (const agent of AGENTS) {
      expect(systemPrompt(agent.id)).toContain(HANDOFF_RULE);
      expect(huddleSystem(agent.id, 'respond')).toContain(HANDOFF_RULE);
      expect(huddlePrompt(agent.id, 'respond', { kind: 'checkin', text: 'Current status' }, [])).toContain(
        HANDOFF_RULE,
      );
      expect(stagePrompt(agent.id, 'Review', 'Owner', 'Latest handoff', null, '')).toContain(HANDOFF_RULE);
    }
    expect(LIVE_ORDER).toHaveLength(10);
    expect(LIVE_ORDER.at(-1)).toBe('grokbot');
  });

  it('labels roster prompts as model roles rather than installed app connections', () => {
    for (const agent of AGENTS) {
      expect(systemPrompt(agent.id)).toContain('not a connection to the named installed app');
      expect(systemPrompt(agent.id)).toContain('never claim to read files, make changes or run tests');
    }
  });

  it('task chat prompts carry the same register, in the system prompt and the stage prompt', () => {
    expect(systemPrompt('muse')).toContain(toneLine('muse'));
    expect(systemPrompt('gemini')).toContain(toneLine('gemini'));
    expect(systemPrompt('muse')).toContain('Your register is serious');
    expect(systemPrompt('gemini')).toContain('Your register is casual');
    const stage = stagePrompt('cursor', 'do the thing', 'Claude', 'the handoff', 'grokbot', '');
    expect(stage).toContain(toneLine('cursor'));
    expect(stage).toContain('Your register is serious');
    const warmStage = stagePrompt('claude', 'do the thing', 'Gemini', 'the handoff', 'cursor', '');
    expect(warmStage).toContain('Your register is balanced');
  });

  it('stage prompt enforces the 4-step collaborative reasoning protocol for specialist bots', () => {
    const prompt = stagePrompt(
      'cursor',
      'implement feature',
      'Claude',
      'HANDOFF FROM Claude Code:\nProposed changes in repo.',
      'copilot',
      '',
      '',
      '[Gemini - Check 1 Context & Requirements]\nRequirement details.',
    );
    expect(prompt).toContain('COLLABORATIVE REASONING PROTOCOL');
    expect(prompt).toContain("1. Critique & Acknowledge: Explicitly cite Claude's key claims or proposals");
    expect(prompt).toContain('2. Specialty Advance: Apply your domain specialty');
    expect(prompt).toContain(
      '3. Risk / Edge Case Audit: Surface new technical risks, edge cases, or missing verification checks.',
    );
    expect(prompt).toContain('4. Direct Handoff: Pass to COPILOT with a specific directive on what to inspect next.');
    expect(prompt).toContain('UPSTREAM CHAIN PROGRESS (MILESTONES & ARCHITECTURE):');
    expect(prompt).toContain('CRITICAL FORMAT RULE: NO CODE BLOCKS.');
  });

  it('stage prompt for Grok Bot enforces the Authoritative Three-Check Synthesis Schema', () => {
    const prompt = stagePrompt(
      'grokbot',
      'ship the feature',
      'Xcode',
      'HANDOFF FROM Gemini:\nScope\n\nHANDOFF FROM Muse:\nAudit\n\nHANDOFF FROM Xcode:\nBuild ready',
      null,
      'BRAIN CONTEXT: stored',
    );
    expect(prompt).toContain('AUTHORITATIVE THREE-CHECK SYNTHESIS PROTOCOL');
    expect(prompt).toContain(
      '1. Check 1 Audit (Gemini): Verify requirements completeness, boundary limits, and context fidelity.',
    );
    expect(prompt).toContain(
      '2. Check 2 Audit (Muse): Confirm resolution of adversarial audit risks, gaps, and contradictions.',
    );
    expect(prompt).toContain(
      '3. Check 3 Synthesis (Collective): Integrate technical contributions from ChatGPT, Claude, Cursor, Copilot, Perplexity, Grok, and Xcode into one coherent deliverable.',
    );
    expect(prompt).toContain(
      '4. Conflict Resolution & Blockers: Resolve any specialist disagreements; explicitly list missing or failed stages.',
    );
    expect(prompt).toContain(
      '5. Authoritative Final Decision: Deliver the OWNER (FINAL SITUATION REPORT) ending with an explicit verdict line:',
    );
    expect(prompt).toContain(
      '"DECISION: PASS" (if all 3 checks verify and deliverables pass) OR "DECISION: FAIL" (if any check fails or blockers remain).',
    );
    expect(prompt).toContain('CRITICAL FORMAT RULE: NO CODE BLOCKS.');
  });
});

describe('robust verdict extraction in approval', () => {
  it('correctly extracts structured decisions and ignores negated failure phrases', async () => {
    const { hasFailureVerdict, finalReviewFor, APPROVED_FOR_DIRECTOR_REVIEW } = await import('../src/lib/approval');

    // Negated failure statements should NOT trigger failure
    expect(hasFailureVerdict('All tests passed. Zero checks failed.')).toBe(false);
    expect(hasFailureVerdict('Completed successfully. No tests failed.')).toBe(false);
    expect(hasFailureVerdict('Pipeline verified without failure.')).toBe(false);
    expect(hasFailureVerdict('Clean run, 0 failed.')).toBe(false);
    expect(hasFailureVerdict('No blocking issues detected across all 10 stages.')).toBe(false);
    expect(finalReviewFor(false, 'No tests failed. Zero checks failed.')).toBe(APPROVED_FOR_DIRECTOR_REVIEW);

    // Explicit structured decisions
    expect(hasFailureVerdict('Summary complete.\nDECISION: PASS')).toBe(false);
    expect(hasFailureVerdict('Summary complete.\nVERDICT: PASS')).toBe(false);
    expect(hasFailureVerdict('Summary complete.\nDECISION: FAIL\nReason: missing checks')).toBe(true);
    expect(hasFailureVerdict('Summary complete.\nVERDICT: FAIL')).toBe(true);
    expect(hasFailureVerdict('Summary complete.\nRECOMMENDATION: BLOCKED')).toBe(true);
    expect(hasFailureVerdict('Summary complete.\nRECOMMENDATION: DECLINE')).toBe(true);
    expect(finalReviewFor(false, 'DECISION: PASS')).toBe(APPROVED_FOR_DIRECTOR_REVIEW);
    expect(finalReviewFor(false, 'DECISION: FAIL')).toMatch(/^DECLINED/);

    // Structured PASS with previous discussion of resolved failures
    expect(hasFailureVerdict('We audited prior failure scenarios and resolved them.\nDECISION: PASS')).toBe(false);
    expect(finalReviewFor(false, 'We audited prior failure scenarios and resolved them.\nDECISION: PASS')).toBe(
      APPROVED_FOR_DIRECTOR_REVIEW,
    );

    // Safety override: stage failures ALWAYS trigger decline, even if Grok Bot wrote DECISION: PASS
    expect(finalReviewFor(true, 'DECISION: PASS')).toMatch(/^DECLINED/);
    expect(finalReviewFor(true, 'Zero checks failed.')).toMatch(/^DECLINED/);

    // Genuine un-negated failures
    expect(hasFailureVerdict('Two checks failed during compilation.')).toBe(true);
    expect(hasFailureVerdict('The team rejects this design due to platform constraints.')).toBe(true);
    expect(finalReviewFor(false, 'Two checks failed.')).toMatch(/^DECLINED/);
  });
});
