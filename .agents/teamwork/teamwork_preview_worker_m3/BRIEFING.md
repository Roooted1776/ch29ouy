# BRIEFING — 2026-11-02T10:09:00Z

## Mission
Implement Milestone 3: Specialty Guardrails & Robust Failure Handling in Brain/Nodes, covering ChatPanel historical failure visibility, run-task stage error parser, team.ts specialty guardrails, and comprehensive degradation test coverage.

## 🔒 My Identity
- Archetype: implementer
- Roles: implementer, qa, specialist
- Working directory: /Users/claude/Projects/Brain/Nodes/.agents/teamwork/teamwork_preview_worker_m3
- Original parent: d8106e50-8d34-4bff-8263-21cf982431cb
- Milestone: Milestone 3 - Specialty Guardrails & Robust Failure Handling

## 🔒 Key Constraints
- File Ownership (Exclusive):
  - `app/src/components/ChatPanel.tsx`
  - `app/src/lib/run-task.ts`
  - `app/src/data/team.ts`
  - `app/src/components/Coverage.tsx`
  - `app/test/team.test.ts`
  - `app/test/chain.test.ts`
  - `app/test/task-flow.test.ts`
- DO NOT edit files outside this scope.
- Do NOT touch RedMed.
- Zero secrets/keys in files.
- Never git push.
- DO NOT CHEAT. All implementations must be genuine.

## Current Parent
- Conversation ID: d8106e50-8d34-4bff-8263-21cf982431cb
- Updated: 2026-11-02T10:09:00Z

## Task Summary
- **What to build**:
  1. `app/src/components/ChatPanel.tsx`: Historical Incomplete Stage Visibility when viewing saved sessions (`currentSession`).
  2. `app/src/lib/run-task.ts`: Robust Stage Error Parser (`parseStageError`) in `say` interceptor for all error formats (quota, 429, timeouts, 500/503).
  3. `app/src/data/team.ts` & `app/test/team.test.ts`: Verify & enforce 10 distinct bot role prompts & negative constraints; add unit tests.
  4. `app/test/chain.test.ts` & `app/test/task-flow.test.ts`: Failure handling & degradation tests (quota, credit, autonomous continuation, Grok Bot DECLINED verdict).
  5. Verification: run all 6 checks (`npm run format`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run e2e`).
- **Success criteria**: All 6 checks pass cleanly with zero errors. Full coverage of failure handling and specialty guardrails.
- **Interface contracts**: PROJECT.md, SCOPE.md
- **Code layout**: app/src, app/test

## Key Decisions Made
- `ChatPanel.tsx`: When viewing `currentSession`, `stuck` is now dynamically computed from `currentSession.cover` (filtering for `failed` stages or incomplete stages with reasons) and `uncovered`, with reasons mapped via `effectiveNotes`.
- `Coverage.tsx`: `fromSession` now also accounts for `uncovered` array entries to mark them failed/uncovered if not already covered.
- `run-task.ts`: Exported `parseStageError` matching all error patterns (standard prefix, failure verbs, provider limits, timeouts) with robust agent name resolution matching longer names first. In `say` interceptor, stage failures update `stages[id] = 'failed'` and `notes[id] = errorReason`.
- `team.ts`: Explicit negative constraints were added to all 10 bots (preventing tool execution, repo editing, build claims, citation invention).
- Test suites: Expanded `team.test.ts`, `chain.test.ts`, and `task-flow.test.ts` to thoroughly verify negative constraints, quota degradation, autonomous continuation, and DECLINED verdicts.

## Artifact Index
- DISPATCH.md — assignment dispatch
- BRIEFING.md — working memory and identity
- progress.md — liveness heartbeat
- handoff.md — final handoff report

## Change Tracker
- **Files modified**:
  - `app/src/components/ChatPanel.tsx`: Historical stuck and effectiveNotes visibility for past sessions
  - `app/src/components/Coverage.tsx`: Support for session uncovered list in fromSession
  - `app/src/data/team.ts`: Explicit negative constraints across STAGE and TASK for all 10 bots
  - `app/src/lib/run-task.ts`: parseStageError helper and enhanced say failure interceptor
  - `app/test/team.test.ts`: Unit tests for specialty guardrails and negative constraints
  - `app/test/chain.test.ts`: Integration tests for quota errors, onCreditFailure, autonomous continuation, and parser
  - `app/test/task-flow.test.ts`: Live streaming degradation and historical viewSession persistence tests
- **Build status**: PASS (all 6 checks: format, lint, typecheck, test, build, e2e)
- **Pending issues**: none

## Quality Status
- **Build/test result**: PASS (44 test files, 462 unit/integration tests passed, 3 e2e browser tests passed)
- **Lint status**: clean (0 errors)
- **Tests added/modified**: +7 comprehensive tests across team.test.ts, chain.test.ts, task-flow.test.ts

## Loaded Skills
- None
