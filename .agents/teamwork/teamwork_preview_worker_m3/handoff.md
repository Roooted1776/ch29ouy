# Handoff Report: Milestone 3 — Specialty Guardrails & Robust Failure Handling

## 1. Observation

### 1.1 Historical Incomplete Stage Visibility in ChatPanel
- **Location**: `app/src/components/ChatPanel.tsx:232-260, 440-450`
- **Before**: When viewing past saved sessions (`currentSession`), `const stuck = currentSession ? [] : ...` was hardcoded to `[]`. Consequently, any stages that failed or remained incomplete during past tasks were completely invisible under `px-steps` (despite being preserved in `currentSession.cover` and `currentSession.uncovered`).
- **After**: `effectiveNotes` and `stuck` are dynamically derived from `currentSession.cover` and `currentSession.uncovered`. Any failed stages or incomplete stages with documented reasons appear directly under `px-steps` with their specific failure reasons (`effectiveNotes[id] || notes[id] || 'did not finish'`), identical to live runs.
- **Coverage**: `app/src/components/Coverage.tsx:20-35` was also strengthened in `fromSession(s)` to ensure any IDs present in `s.uncovered` are mapped into `states` as `'failed'` with `'uncovered'` notes if missing from `cover`.

### 1.2 Robust Stage Error Parser & Interceptor in run-task
- **Location**: `app/src/lib/run-task.ts:42-125, 340-365`
- **Before**: `say` interceptor relied on a brittle regex (`/^(.+?) did not finish: (.*?)\.? Nothing was made up/.exec(m.text)`). Any message lacking the exact phrase "Nothing was made up" or using alternative error wording (e.g. 429 rate limit, 402 quota exceeded, timeout, 500 internal server error) failed to parse, leaving `stages[id]` unset and `notes[id]` missing.
- **After**: Implemented and exported `parseStageError(text: string): { id: AgentId; reason: string } | null` with multi-pattern extraction:
  1. Standard finish pattern: `/^(.+?)\s+did not finish:\s*(.*?)(?:\.?\s*Nothing was made up.*)?$/i`
  2. Failure verbs: `/^(.+?)\s+(?:failed|error|timed out|timeout):\s*(.*?)(?:\.?\s*Nothing was made up.*)?$/i`
  3. Prefix scanning across all agent names/aliases (resolving longer names like "Grok Bot" and "Claude Code" before "Grok" and "Claude") matching error keywords (rate limit, quota, credit, 429, 402, 500, timeout).
  4. Stage failure prefix: `/(?:stage|worker)\s+<Name>\s+(?:failed|error|did not finish)[:\s]*(.*)/i`
- In `run-task.ts`, the `say` callback immediately invokes `parseStageError(m.text)`:
  - If a stage failure is found, it updates `stages[err.id] = 'failed'` and `notes[err.id] = clip(err.reason, 110)`.
  - For `m.from === 'brain'`, error notifications update state without polluting the live chat log (non-agent notices update `status`).

### 1.3 Specialty Guardrails & Negative Constraints
- **Location**: `app/src/data/team.ts:205-245`
- **Before**: Universal negative constraints existed in `systemPrompt`, but several individual bot entries in `STAGE` and `TASK` (Gemini, Muse, ChatGPT, Grok) lacked explicit domain boundary constraints against file modification, test execution, or tool fabrication.
- **After**: All 10 bots in `LIVE_ORDER` now enforce explicit, non-overlapping specialty prompts and domain negative constraints:
  1. **Gemini**: Context and requirements check; `"Never claim to modify files or execute tools."`
  2. **Muse**: Independent adversarial audit; `"Never fabricate verification evidence or claim to run tests."`
  3. **ChatGPT**: Tactical attack plan and deliverable; `"Never claim to execute tools or edit the repo."`
  4. **Claude Code**: Builder reasoning proposal; `"Do not claim to have edited files."`
  5. **Cursor**: Repo integration and diff risks; `"Do not claim to have opened files."`
  6. **Copilot**: Code review and focused improvements; `"Never claim to run tools or change a project."`
  7. **Perplexity**: Source verification; `"Never invent citations; mark unsupported claims."`
  8. **Grok**: Contrarian strategy review; `"Text review only; never claim to run code or modify files."`
  9. **Xcode**: Platform and build constraints; `"Do not claim to run builds."`
  10. **Grok Bot**: Team lead synthesis and PASS/FAIL recommendation; `"Owner controls repo changes, push and merge."`

### 1.4 Comprehensive Unit & Integration Test Suites
- **Location**: `app/test/team.test.ts`, `app/test/chain.test.ts`, `app/test/task-flow.test.ts`
- Added 3 unit tests in `team.test.ts` verifying all 10 bots in `LIVE_ORDER` have unique specialties, enforce universal negative constraints, and enforce their individual boundary rules.
- Added 3 integration tests in `chain.test.ts` asserting:
  - Quota errors trigger `QUOTA_LABEL`, call `hooks.onCreditFailure`, format autonomous handoff notice, and downstream stages continue.
  - Grok Bot synthesizes upstream failures and issues a `DECLINED` final review verdict override.
  - `parseStageError` extracts IDs and error reasons across standard, rate limit, timeout, provider error, and stage prefix formats.
- Added 2 integration tests in `task-flow.test.ts` asserting:
  - Live streaming task gracefully survives a mid-chain 429 rate limit error, completes subsequent stages, marks the failed stage, and records `DECLINED` in `sess.grokFinalReview`.
  - Historical session viewing preserves failed stages and reasons for `ChatPanel` and `Coverage.fromSession`.

---

## 2. Logic Chain

1. **Step 1 — Incomplete Stage Visibility**:
   - *Observation*: Past session reviews stripped brain error messages (`m.from !== 'brain'`), and `stuck` in `ChatPanel.tsx` was set to `[]` whenever `currentSession` was truthy.
   - *Inference*: Users examining completed or historical tasks had no in-chat visibility into which stages had failed or why.
   - *Resolution*: By reading `currentSession.cover` and `currentSession.uncovered`, `stuck` now populates `[id, 'failed']` tuples and looks up the exact failure note from `effectiveNotes` (`cover[id]?.why`). This re-enables `<div className="activity failed">` rendering inside `<div className="px-steps">` with `✗` icon and reason.

2. **Step 2 — Resilient Stage Error Parsing**:
   - *Observation*: In `run-task.ts`, only messages strictly matching `^(.+?) did not finish: (.*?)\.? Nothing was made up` were captured.
   - *Inference*: Any provider outage, rate limit, or timeout formatted without that exact phrasing caused the stage state to remain `'waiting'` or `'working'`, which corrupted coverage accounting and skipped recording failure notes.
   - *Resolution*: `parseStageError` applies regex matching for standard phrases, failure verbs, and name-prefix keyword searches, normalizing reasons and ensuring any stage error reliably sets `stages[id] = 'failed'` and populates `notes[id]`.

3. **Step 3 — Specialty Role Enforcement**:
   - *Observation*: Requirements dictate preserving strict bot specialties and preventing generic reviewer drift or fabricated tool claims.
   - *Inference*: Each bot's prompt must contain unambiguous negative constraints matching its assigned lane.
   - *Resolution*: Added explicit negative constraints across `STAGE` and `TASK` for all 10 bots, and added unit tests in `team.test.ts` that assert every bot's specific constraints.

4. **Step 4 — Automated Verification**:
   - *Observation*: All 6 commands in `app/` (`npm run format`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run e2e`) must pass with zero errors.
   - *Resolution*: Ran all 6 commands sequentially; all passed with 0 errors.

---

## 3. Caveats

- `test/local-supabase.test.ts` (3 tests) is skipped by design in Vitest because local Docker is not started in this development environment (per `AGENTS.md` and repository design).
- In `run-task.ts`, `parseStageError` intentionally returns `null` for page-level limit warnings (such as `"The limit of 9 model calls for one task was reached."`) because those are whole-page budget caps rather than individual agent stage failures.

---

## 4. Conclusion

Milestone 3 is complete and fully verified.
- Historical failed stages and reasons are visible in `ChatPanel.tsx` under `px-steps` for saved sessions.
- Stage error extraction in `run-task.ts` is resilient across all error formats.
- All 10 bots in `LIVE_ORDER` have distinct specialties and enforce explicit negative constraints.
- Test suites (`team.test.ts`, `chain.test.ts`, `task-flow.test.ts`) comprehensively cover quota errors, credit failures, autonomous continuation, and DECLINED verdicts.
- All 6 checks (`format`, `lint`, `typecheck`, `test`, `build`, `e2e`) pass with 0 errors.

---

## 5. Verification Method

To independently verify this implementation, run the following commands in `/Users/claude/Projects/Brain/Nodes/app`:

```bash
# 1. Format check
npm run format

# 2. Lint check
npm run lint

# 3. TypeScript check
npm run typecheck

# 4. Unit & integration test suite
npm test

# 5. Production single-file bundle build
npm run build

# 6. Playwright E2E browser tests
npm run e2e
```

### Files to Inspect:
- `app/src/components/ChatPanel.tsx` (lines 232-260, 435-450)
- `app/src/components/Coverage.tsx` (lines 20-35)
- `app/src/lib/run-task.ts` (lines 42-125, 340-365)
- `app/src/data/team.ts` (lines 205-245)
- `app/test/team.test.ts` (lines 185-260)
- `app/test/chain.test.ts` (lines 120-220)
- `app/test/task-flow.test.ts` (lines 80-210)
