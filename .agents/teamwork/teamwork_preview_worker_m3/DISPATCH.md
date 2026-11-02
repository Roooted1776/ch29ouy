## 2026-11-02T09:55:52Z
You are Worker 3 (Implementation Worker for Milestone 3 - Specialty Guardrails & Robust Failure Handling).
Working Directory: /Users/claude/Projects/Brain/Nodes/.agents/teamwork/teamwork_preview_worker_m3
Original Request: /Users/claude/Projects/Brain/Nodes/.agents/teamwork/ORIGINAL_REQUEST.md
Project Plan: /Users/claude/Projects/Brain/Nodes/.agents/teamwork/PROJECT.md
Explorer Findings: /Users/claude/Projects/Brain/Nodes/.agents/teamwork/teamwork_preview_explorer_survey_3/handoff.md

MANDATORY FIRST STEP: Read /Users/claude/Projects/Brain/Nodes/.agents/teamwork/ORIGINAL_REQUEST.md in full before starting your work.
Then read /Users/claude/Projects/Brain/Nodes/.agents/teamwork/PROJECT.md and /Users/claude/Projects/Brain/Nodes/.agents/teamwork/teamwork_preview_explorer_survey_3/handoff.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your File Ownership (Exclusive):
- `app/src/components/ChatPanel.tsx`
- `app/src/lib/run-task.ts`
- `app/src/data/team.ts`
- `app/src/components/Coverage.tsx`
- `app/test/team.test.ts`
- `app/test/chain.test.ts`
- `app/test/task-flow.test.ts`
DO NOT edit files outside this scope. Do NOT touch RedMed. Zero secrets/keys in files. Never git push.

Your Tasks:
1. Historical Incomplete Stage Visibility (`app/src/components/ChatPanel.tsx`):
   - When viewing past saved sessions (`currentSession`), ensure that any incomplete or failed stages (from `currentSession.cover` or notes) and their reasons are explicitly visible under `px-steps` rather than setting `stuck = []`.
2. Robust Stage Error Parser (`app/src/lib/run-task.ts`):
   - In `say` interceptor, enhance the stage failure detection parser so that any stage error format (quota, rate limits, timeouts, provider failures) reliably updates `stages[id] = 'failed'` and sets `notes[id] = errorReason`.
3. Specialty Guardrails & Negative Constraints (`app/src/data/team.ts` and `app/test/team.test.ts`):
   - Verify that all 10 bots have distinct role prompts and explicit negative constraints (no file modification, no tool execution, no build claims, no citation invention).
   - Add unit tests in `team.test.ts` verifying that every one of the 10 bots in `LIVE_ORDER` enforces its specific boundary rules.
4. Failure Handling & Degradation Tests (`app/test/chain.test.ts` and `app/test/task-flow.test.ts`):
   - Expand tests to assert quota errors (`QUOTA_LABEL`), credit failure handling, subsequent bot autonomous continuation after failure, and Grok Bot's final DECLINED verdict when failures exist.
5. Verification:
   - Run `npm run format`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run e2e` in `app/`.
   - Ensure all 6 checks pass with 0 errors.
6. Write your complete handoff report to:
   `/Users/claude/Projects/Brain/Nodes/.agents/teamwork/teamwork_preview_worker_m3/handoff.md`
   Update your progress.md periodically. Send a completion message to your parent when done.
