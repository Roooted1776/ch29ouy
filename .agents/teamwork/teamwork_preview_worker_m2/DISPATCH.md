## 2026-11-02T09:40:05Z
You are Worker 2 (Implementation Worker for Milestone 2 - Streaming Handoff Metrics & Fluid State).
Working Directory: /Users/claude/Projects/Brain/Nodes/.agents/teamwork/teamwork_preview_worker_m2
Original Request: /Users/claude/Projects/Brain/Nodes/.agents/teamwork/ORIGINAL_REQUEST.md
Project Plan: /Users/claude/Projects/Brain/Nodes/.agents/teamwork/PROJECT.md
Explorer Findings: /Users/claude/Projects/Brain/Nodes/.agents/teamwork/teamwork_preview_explorer_survey_2/handoff.md

MANDATORY FIRST STEP: Read /Users/claude/Projects/Brain/Nodes/.agents/teamwork/ORIGINAL_REQUEST.md in full before starting your work.
Then read /Users/claude/Projects/Brain/Nodes/.agents/teamwork/PROJECT.md and /Users/claude/Projects/Brain/Nodes/.agents/teamwork/teamwork_preview_explorer_survey_2/handoff.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your File Ownership (Exclusive):
- `app/src/lib/memory.ts`
- `app/src/lib/run-task.ts`
- `app/src/lib/providers.ts`
- `app/src/store.ts`
- `app/src/components/ChatPanel.tsx`
- `app/src/components/FlowPane.tsx`
- `app/src/lib/approval.ts`
- `app/test/task-flow.test.ts`
- `app/test/stream.test.ts`
DO NOT edit files outside this scope. Do NOT touch RedMed. Zero secrets/keys in files. Never git push.

Your Tasks:
1. Enriched Handoff & Session Metrics (`app/src/lib/memory.ts` and `app/src/lib/run-task.ts`):
   - Support `stageTokens?: Record<string, { in: number; out: number }>` and `transitLatencies?: Record<string, number>` in `Session`.
   - Preserve `Flow = [string, string, number]` tuple format for backward compatibility, update `cleanFlow` and `cleanMs` in `memory.ts` to safely sanitize and preserve new fields while keeping legacy vault files valid.
   - Accurately record input tokens (`tin`), output tokens (`tout`), and word counts per stage in `run-task.ts`.
2. Real Transit Latency & TTFT Tracking:
   - In `run-task.ts` / `providers.ts`, capture Time To First Token (TTFT) from request dispatch until the arrival of the first SSE token chunk. Record real measured transit latency in `transitLatencies[bot]`.
3. Batched Fan-in State Updates (`app/src/lib/run-task.ts`):
   - Replace the loop of individual synchronous `set()` calls when `b === 'grokbot'` with a single atomic state update to prevent Zustand state cascades and layout thrashing.
4. UI Auto-Scroll & Selector Optimization (`app/src/components/ChatPanel.tsx` and `app/src/components/FlowPane.tsx`):
   - In `ChatPanel.tsx`, remove layout-reflowing `scrollIntoView()` and use single-container RAF-aligned `scrollTop = scrollHeight`. Add an `isProgrammaticScroll` guard in `onScroll` so fast deltas don't falsely disengage `autoScroll`.
   - In `ChatPanel.tsx` and `FlowPane.tsx`, memoize or optimize the active pulse selector to avoid allocating new arrays on every render tick.
5. Minor Regex Polish in `app/src/lib/approval.ts`:
   - Support hyphenated negations (e.g. `zero-failure run`) in `hasFailureVerdict` and plural forms (`failures`, `blockers`) in fallback matching.
6. Verification:
   - Run `npm run format`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` in `app/`.
   - Ensure all 44 test files and Playwright e2e tests continue to pass.
7. Write your complete handoff report to:
   `/Users/claude/Projects/Brain/Nodes/.agents/teamwork/teamwork_preview_worker_m2/handoff.md`
   Update your progress.md periodically. Send a completion message to your parent when done.
