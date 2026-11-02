# Handoff Report: Explorer Survey 3 (Specialty Guardrails & Test Explorer)

## 1. Observation

### 1.1 All 10 Bot Specialties, Role Prompts, and Boundary Constraints
All 10 bots, their review order, specialties, voices, and role prompts are defined in `/Users/claude/Projects/Brain/Nodes/app/src/data/team.ts`:

- **Execution Chain Order** (`app/src/data/team.ts:191-202`):
  ```typescript
  export const LIVE_ORDER: AgentId[] = [
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
  ];
  ```

- **Universal Startup & Boundary Invariants**:
  - `HANDOFF_RULE` (`app/src/data/team.ts:4-5`):
    > "On every opening or invocation, read the incoming and latest handoff before acting. Inspect the current state, respect your assigned lane and read-only source projects, finish the scoped task, verify the result, and leave a short handoff naming changes, files, checks and blockers. The next tool must review that handoff before acting. Never invent work or another tool approval. Grok Bot records the final team PASS or FAIL after actual verification. Follow the requested response schema exactly; add no extra handoff prose to JSON-only outputs."
  - Role Prompt Boundary (`app/src/data/team.ts:304`):
    > "This is a role prompt using the selected API provider, not a connection to the named installed app. You have no repo access here: never claim to read files, make changes or run tests. State blockers and uncertainty. Do not invent sources, results, keys or passwords."
  - Chat & Formatting Rule (`app/src/data/team.ts:303, 410`):
    > "CRITICAL FORMAT RULE: NO CODE BLOCKS. Never output markdown code fences (```). The live chat is for common interactions, team chatter, and passes between teammates. Explain your work and plans in natural conversational words."
  - Word Cap (`app/src/data/team.ts:8`, `app/src/lib/text.ts:58`): `WORD_CAP = 150` words maximum per message.

- **Distinct Bot Specialties, Stages, Tasks, and Boundaries** (`app/src/data/team.ts:38-237`):
  1. **Gemini** (`id: 'gemini'`, Google, casual):
     - Specialty: "Reads a lot at once and cross-checks it, including images and long documents"
     - Stage Prompt: "FIRST CHECK. Read the request and any context. List the concrete requirements, limits and anything unclear that blocks the work."
     - Task Prompt: "Pull out requirements, given context and open questions. Deliver a context check."
     - Boundary: Multi-source long context analysis; does not claim repo edits.
  2. **Muse** (`id: 'muse'`, Independent, serious):
     - Specialty: "Audits everyone and finds what is wrong"
     - Stage Prompt: "SECOND CHECK. Audit the incoming context and handoff on your own. Name gaps, contradictions, risks and missing evidence."
     - Task Prompt: "Audit the incoming context and handoff for gaps, risks, contradictions and unsupported claims."
     - Boundary: Adversarial audit, checks claims honestly, names flaws/gaps.
  3. **ChatGPT** (`id: 'chatgpt'`, OpenAI, balanced):
     - Specialty: "Uses tools on code, then pulls the findings together"
     - Stage Prompt: "COLLECTIVE CHECK. Turn the reviewed handoff into a concrete step of attack, ordered plan, and deliverable."
     - Task Prompt: "Deploy the concrete step of attack and ordered plan from the reviewed handoff."
     - Boundary: Synthesizes findings into ordered tactical plan.
  4. **Claude Code** (`id: 'claude'`, Anthropic, balanced):
     - Specialty: "Careful reasoning, clear writing and code"
     - Stage Prompt: "BUILDER. Produce the reasoning, writing, design or code proposal as text. Do not claim to have edited files."
     - Task Prompt: "Write the requested reasoning, writing, design or code proposal."
     - Boundary: Text architecture and design builder; explicitly forbidden from claiming file edits.
  5. **Cursor** (`id: 'cursor'`, Anysphere, serious):
     - Specialty: "Reviews supplied code and repository integration risks"
     - Stage Prompt: "INTEGRATION REVIEW. Check the proposal for repo fit, integration risks and missing checks, using only what you were given. Do not claim to have opened files."
     - Task Prompt: "Check repo integration risks using only the material provided."
     - Boundary: Repo integration & diff check; explicitly forbidden from claiming to open files.
  6. **Copilot** (`id: 'copilot'`, GitHub, balanced):
     - Specialty: "Reviews supplied code and suggests focused improvements"
     - Stage Prompt: "CODE REVIEW. Explain supplied code and suggest focused improvements as text. Never claim to run tools or change a project."
     - Task Prompt: "Review supplied code and explain useful improvements without changing files."
     - Boundary: Code review and explanation; forbidden from claiming to run tools or edit files.
  7. **Perplexity** (`id: 'perplexity'`, Perplexity, balanced):
     - Specialty: "Searches sources and checks reasoning using the available context"
     - Stage Prompt: "SOURCE CHECK. Judge source quality and what needs a citation. When you can search the web, check the key claims and give links; otherwise use only supplied material. Never invent citations; mark unsupported claims."
     - Task Prompt: "Check the key claims and their sources. Search the web when you can and give links."
     - Boundary: Source verification; forbidden from inventing citations.
  8. **Grok** (`id: 'grok'`, xAI, casual):
     - Specialty: "Finds weak assumptions, risks and missed options"
     - Stage Prompt: "STRATEGY REVIEW. Challenge assumptions, name risks and one option the team missed."
     - Task Prompt: "Challenge assumptions and surface risks or alternatives."
     - Boundary: Contrarian review; challenges consensus.
  9. **Xcode** (`id: 'xcode'`, Apple, balanced):
     - Specialty: "Builds and tests iPhone apps"
     - Stage Prompt: "PLATFORM & BUILD CHECK. Review client platforms, device targets (iOS, macOS, web, mobile, desktop), build constraints, performance and deployment feasibility. Do not claim to run builds."
     - Task Prompt: "Review platform compatibility, device targets, build constraints, and deployment feasibility."
     - Boundary: Target platform & deployment feasibility; forbidden from claiming to execute builds.
  10. **Grok Bot** (`id: 'grokbot'`, xAI, serious):
      - Specialty: "Leads the team and makes the final call after the three checks"
      - Stage Prompt: "TEAM LEAD. Review the whole chain, settle conflicts, list missing or failed stages, and write the final report with a PASS or FAIL recommendation. You can decline based on the team's response. Owner controls repo changes, push and merge."
      - Task Prompt: "Review every handoff. Combine the work, list open issues and missing checks, and give the final team report and recommendation. You can decline based on the team's response."
      - Boundary: Final arbiter; issues team verdict; does NOT execute git push or merge.

---

### 1.2 Failure Handling, Rate Limits, and Degradation Mechanisms
Direct observations from `/Users/claude/Projects/Brain/Nodes/app/src/lib/`:

- **Rate Limit & Quota Detection** (`providers.ts:117-132`):
  - `isCreditOrQuotaError(msg, status)` flags status 402 or regex `/credit|quota|billing|balance|payment|insufficient|exhausted|unpaid/i`.
  - `isLimitError(e)` detects 429, rate limits, token limits, context lengths, or overloaded errors.
  - `QUOTA_LABEL` = `'Disabled · Reached Credit Quota, Wait Until Reset'`.
- **Chain Error Handling & Autonomous Next Worker Continuity** (`chain.ts:113-124`):
  ```typescript
  } catch (e: any) {
    const errStr = String(e?.message || e);
    const isCredits = e?.outOfCredits || /credit|quota|billing|payment|balance|402/i.test(errStr);
    const msg = isCredits
      ? `${AGENT[bot].name} did not finish: ${QUOTA_LABEL}. Nothing was made up in its place.`
      : `${AGENT[bot].name} did not finish: ${clean(errStr)}. Nothing was made up in its place.`;
    say({ from: 'brain', tag: 'page', cls: 'warn', text: msg });
    failed.push(bot);
    if (isCredits) hooks.onCreditFailure?.(bot, errStr);
    previous = `HANDOFF STATUS FOR ${AGENT[bot].name}:\n${msg}\n(Next worker: review the last available handoff above and continue autonomously.)`;
    handoffs.push(previous);
  }
  ```
- **State Updates on Failure** (`run-task.ts:180-184, 243-250, 286-290`):
  - `onCreditFailure` marks bot inactive in `inactiveBots`.
  - `dead[provider] = true` if key was rejected (401/403/invalid).
  - `limited` stores bot ID if 429 / limit hit; cleared when bot succeeds (`run-task.ts:177`).
  - `say` interceptor parses `^(.+?) did not finish: (.*?)\.? Nothing was made up` and sets `stages[id] = 'failed'`, `notes[id] = f[2]`.
- **Final Approval & Decline Logic** (`run-task.ts:318-325`, `approval.ts:24-26`):
  - If `result.failed.length > 0` or any stage is `'failed'`, `finalReviewFor(hasFailures)` yields `'DECLINED: Blocked based on team response.'`.
- **UI Visibility of Incomplete & Failed Stages**:
  - `Coverage.tsx:47-71`: Chip turns red (`chip failed`), displays `✕` symbol and error note `<small>{c.notes[id]}</small>`. Head says `${sm.failed} failed`.
  - `Tasks.tsx:41-53`: Card displays `tone: 'bad'`, pill `${sm.done} of ${sm.inChain} · ${sm.failed} failed`, line `${who} did not finish: ...`.
  - `ChatPanel.tsx:400-414`: Live run displays `<div className="activity failed"><span className="px-mark">✗</span> ... {notes[id] || 'did not finish'}</div>`.

---

### 1.3 Automated Test Infrastructure Status
All 6 commands were executed directly in `app/`:
1. `npm run format`: `Checked 119 files in 18ms. No fixes applied.` (Exit code 0).
2. `npm run lint`: `Checked 120 files in 39ms. Found 40 warnings, 2 infos.` 0 errors. (Exit code 0).
3. `npm run typecheck`: `tsc --noEmit` exited with code 0.
4. `npm test`: `Test Files 42 passed | 1 skipped (43), Tests 268 passed | 3 skipped (271)`. Duration 3.71s. (Exit code 0).
5. `npm run build`: `dist/index.html 1,780.61 kB │ gzip: 525.96 kB ... wrote ../index.html 1739 KB; 1 script(s) pinned by hash`. (Exit code 0).
6. `npm run e2e`: `playwright test` ran 3 tests across 3 workers:
   - `e2e/keys.spec.ts`: passed (11.7s)
   - `e2e/brain.spec.ts`: passed (15.2s)
   - `e2e/smoke.spec.ts`: passed (34.4s)
   - Total: 3 passed (34.8s). (Exit code 0).

---

## 2. Logic Chain

1. **Premise 1 (Specialty Guardrails)**: Requirements state each bot must maintain its distinct specialty and boundary constraints without generic reviewer drift or fabricated tool claims.
   - *Direct Evidence*: `team.ts:38-237` establishes explicit `specialty`, `role`, `STAGE`, `TASK`, `VOICE`, `TONE`, and `systemPrompt` definitions. However, `team.test.ts` only asserts tones and universal `HANDOFF_RULE`, leaving individual bot boundary requirements unasserted in test suites.
2. **Premise 2 (Failure Degradation & Autonomous Recovery)**: Requirements mandate graceful degradation without premature crashes, and explicit visible markings of failed stages.
   - *Direct Evidence*: `chain.ts:113-124` wraps each stage in a try/catch, formatting an autonomous handoff notice `(Next worker: review the last available handoff above and continue autonomously.)` so subsequent stages continue.
   - *Defect/Gap Identified*: In `ChatPanel.tsx:220-224`, `stuck` is set to `[]` when viewing saved sessions (`currentSession`), and `m.from !== 'brain'` strips all failure messages from `currentSession.msgs`. Consequently, when reviewing past tasks in ChatPanel, failed stages are not visible in the message stream (only visible in Coverage chips and Tasks list).
3. **Premise 3 (Mid-Chain Provider Fallback)**: Requirements state providers should fall back gracefully.
   - *Direct Evidence*: `pickBotProvider` selects a provider before the call, but if a free provider returns a 429 rate limit or quota error during `callAs`, the call throws immediately instead of trying the fallback provider configured for that session.
4. **Premise 4 (Test Infrastructure Coverage)**: All 6 automated check commands in `app/package.json` are functional and passing, but unit and integration test coverage has identifiable gaps relative to R1, R2, and R3.

---

## 3. Caveats

1. The test run in `vitest` skipped `test/local-supabase.test.ts` (3 tests skipped) because it requires a running Docker container for Supabase. This is consistent with project documentation in `AGENTS.md`.
2. Browser E2E tests run in software WebGL mode (`--use-angle=swiftshader`) to accommodate headless CI environments.
3. Live AI calls to external APIs were tested using mocked and fake backends (`fake-backend.ts` and `sseFetch`), which is strictly required by repo rules prohibiting real API keys or external calls in tests.

---

## 4. Conclusion

1. **Specialty Guardrails**: The architecture in `data/team.ts` provides robust, distinct role prompts and boundaries for all 10 bots (`LIVE_ORDER`). However, test coverage currently verifies only universal rules (`HANDOFF_RULE`) rather than bot-specific constraints.
2. **Failure Handling**: Degradation is resilient—failed stages do not abort the chain, quota errors disable affected bots safely, and Grok Bot receives failure notifications. The primary gap is UI visibility in `ChatPanel.tsx` for completed sessions, and lack of mid-call provider fallback retries.
3. **Test Infrastructure**: The 6 verification checks (`npm run format`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run e2e`) are fully functional and pass with 0 errors.

### Proposed Concrete Changes for R3 Implementation:
1. **ChatPanel Historical Incomplete Stage Visibility** (`app/src/components/ChatPanel.tsx`):
   - Modify `ChatPanel.tsx` so that when viewing a session with failed stages (`currentSession?.cover`), failed stages and their `why` reasons are explicitly displayed under `px-steps` rather than evaluating `stuck` to `[]`.
2. **Robust Stage Error Extraction** (`app/src/lib/run-task.ts`):
   - Replace the fragile regex `^(.+?) did not finish: (.*?)\.? Nothing was made up` with a structured parser or fallback error extractor to ensure any stage error format is captured into `stages` and `notes`.
3. **Unit Test Expansion for Specialty Boundaries** (`app/test/team.test.ts`):
   - Add unit tests verifying that all 10 bots have distinct specialties, non-overlapping roles, and explicit negative constraints (no file modification, no build claims, no citation invention).
4. **Integration Test for Rate Limit & Quota Degradation** (`app/test/chain.test.ts`):
   - Add test cases covering quota errors (`QUOTA_LABEL`), `onCreditFailure` invocation, subsequent bot autonomous execution after an intermediate failure, and Grok Bot's final DECLINED verdict when failures exist.

---

## 5. Verification Method

Independently verify all findings and checks using the following commands in `/Users/claude/Projects/Brain/Nodes/app`:

```bash
# 1. Format check
npx biome format .

# 2. Lint check
npm run lint

# 3. TypeScript check
npm run typecheck

# 4. Unit & integration test suite
npm test

# 5. Build bundle with script hash CSP
npm run build

# 6. Playwright E2E browser test
npm run e2e
```

**Files to Inspect**:
- `/Users/claude/Projects/Brain/Nodes/app/src/data/team.ts` (Lines 38-237, 294-306, 388-413)
- `/Users/claude/Projects/Brain/Nodes/app/src/lib/chain.ts` (Lines 113-124)
- `/Users/claude/Projects/Brain/Nodes/app/src/lib/run-task.ts` (Lines 180-184, 242-250, 318-325)
- `/Users/claude/Projects/Brain/Nodes/app/src/components/Coverage.tsx` (Lines 47-71)
- `/Users/claude/Projects/Brain/Nodes/app/src/components/ChatPanel.tsx` (Lines 220-224, 400-414)
- `/Users/claude/Projects/Brain/Nodes/app/test/chain.test.ts` (Lines 64-79)

**Invalidation Conditions**:
- Any of the 6 commands fails with non-zero exit code.
- Any bot prompt in `data/team.ts` lacks negative constraint boundaries or tone specifications.
- A failed stage aborts subsequent stages or fabricates intermediate text.
