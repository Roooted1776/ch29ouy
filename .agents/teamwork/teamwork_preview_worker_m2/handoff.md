# Handoff Report — Milestone 2: Streaming Handoff Metrics & Fluid State

**Agent**: Worker 2 (Implementation Worker for Milestone 2)  
**Date**: 2026-11-02  
**Milestone**: Milestone 2 — Streaming Handoff Metrics & Fluid State  
**Working Directory**: `/Users/claude/Projects/Brain/Nodes/.agents/teamwork/teamwork_preview_worker_m2`

---

## 1. Observation

1. **`app/src/lib/memory.ts:78-104`**:
   - `Flow` was previously defined solely as `export type Flow = [string, string, number]`. Stored sessions in vault (`brain.mem.v2`) rely on this 3-element tuple format.
   - Enriched structures `FlowTuple`, `FlowMetric`, and optional fields `stageTokens?: Record<string, { in: number; out: number }>` and `transitLatencies?: Record<string, number>` were added to `Session`.
   - Sanitization functions `cleanFlow` and `cleanMs` were exported, and `cleanStageTokens` and `cleanTransitLatencies` were implemented and plugged into `sanitizeMem` (lines 351-356, 405-442) to clamp tokens to `1,000,000` and transit latencies to `600,000ms`.

2. **`app/src/lib/providers.ts:143-149, 350-448`**:
   - `CallResult` was updated to support optional `ttftMs?: number`.
   - In `readStream`, `t0` timestamp is passed from `callModel`, capturing `ttftMs = Math.round(performance.now() - t0)` at the moment `acc.text !== last` (the arrival of the first non-empty text chunk).
   - In `callModel`, both streamed and JSON responses record actual elapsed time from dispatch to first chunk/response, returning `ttftMs`.

3. **`app/src/store.ts:142-146, 209-218, 447-452`**:
   - Added `stageTokens?: Partial<Record<AgentId, { in: number; out: number }>>` and `transitLatencies?: Partial<Record<AgentId, number>>` to `State` and initialized them to `{}`.
   - Implemented and exported `selectActivePulse = (s: State): Pulse | undefined` using reverse loop iteration, preventing `filter()` array allocations on every render tick.

4. **`app/src/lib/run-task.ts:88-93, 142-180, 272-294, 353-356`**:
   - In `runTask`, resets `stageTokens: {}` and `transitLatencies: {}` on task start.
   - In `callAs`, captures `firstTokenAt` and `res.ttftMs`, recording real measured transit latency in `transitLatencies[bot]` and input/output tokens in `stageTokens[bot]`.
   - In `hooks.handoff`, replaced the loop of individual synchronous `set()` calls when `b === 'grokbot'` with a single batched atomic state update: `const fanInFlows: Flow[] = [[a, b, w] as Flow]; ... finished.forEach(...); set(x => ({ flow: [...x.flow, ...fanInFlows].slice(-40) }));`.
   - In `sess` creation, records `stageTokens: get().stageTokens` and `transitLatencies: get().transitLatencies`.

5. **`app/src/components/ChatPanel.tsx:2-4, 176-215, 545-555` & `app/src/components/FlowPane.tsx:4, 33`**:
   - In `ChatPanel.tsx`, eliminated `scrollIntoView()` on `end.current`. Replaced it with single-container RAF-aligned `scrollTop = scrollHeight`.
   - Introduced `isProgrammaticScroll = useRef(false)` guard in `scrollToBottom` and `onScroll` to prevent programmatic scroll deltas from falsely disengaging `autoScroll`.
   - Swapped `pulses.filter(...).at(-1)` in `ChatPanel.tsx` (main panel and `Handoff`) and `FlowPane.tsx` for `useStore(selectActivePulse)`.

6. **`app/src/lib/approval.ts:46-55`**:
   - Updated regex in `hasFailureVerdict` to support hyphenated negations: `/\b(?:no|zero|0|without|not|never|none|nothing)[\s-]+(?:\w+[\s-]+){0,3}(?:fail|failed|failure|failures|decline|declined|declines|reject|rejected|rejects|block|blocked|blockers?|abort|aborted)\b/gi`.
   - Maintained strict compatibility with exact fallback boundary requirements.

7. **Test Suites & Verification Commands**:
   - `npm run format`: Formatted 121 files in 35ms. No fixes applied (0 formatting violations).
   - `npm run lint`: Biome lint reported 0 errors (39 warnings unchanged).
   - `npm run typecheck`: Passed with 0 errors (`tsc --noEmit`).
   - `npm test`: 44 test files passed, 1 skipped (454 tests passed, 3 skipped).
   - `npm run build`: Produced single-file `dist/index.html` (1,785.60 kB) and root `index.html` (1,744 KB) with CSP script hash pinning.
   - `npm run e2e`: Playwright Chromium tests passed 3 of 3 in 30.1s.

---

## 2. Logic Chain

1. **Preserving Vault Compatibility**:
   - *Premise*: Modifying `Flow` tuple shape in `memory.ts` would break deserialization of saved vaults in `brain.mem.v2` and fail existing tests (`F6-T1-1`, `F6-T1-2`).
   - *Action*: Maintained `Flow = FlowTuple = [string, string, number]`. Stored enriched per-stage token breakdowns in `Session.stageTokens` and measured latency in `Session.transitLatencies`. Sanitized these with dedicated validators (`cleanStageTokens`, `cleanTransitLatencies`) inside `sanitizeMem`.
   - *Result*: Zero schema breakage on legacy sessions; full support for enriched metrics on new sessions.

2. **Measuring Real Transit Latency & TTFT**:
   - *Premise*: Latency was previously purely synthetic based on 3D geometric distance (`transitMs`).
   - *Action*: In `providers.ts`, `readStream` records `performance.now() - t0` when the first chunk updates `acc.text`. In `run-task.ts`, `callAs` records `transitLatency = res.ttftMs ?? Math.round(firstTokenAt - t0)` and commits it to `transitLatencies[bot]`.
   - *Result*: Every bot stage now has a genuine, measured millisecond transit latency from dispatch to first token.

3. **Preventing Fan-in State Cascades**:
   - *Premise*: When Grok Bot was reached, a loop called `set()` for every preceding agent (up to 8 times sequentially), triggering repeated Zustand store notifications and component re-renders.
   - *Action*: Pre-collected `fanInFlows` for all predecessor agents and dispatched a single atomic `set(x => ({ flow: [...x.flow, ...fanInFlows].slice(-40) }))`.
   - *Result*: Handoff ordering is preserved identically, while state mutations for the entire fan-in phase execute in a single atomic tick.

4. **Eliminating Layout Thrashing & Auto-Scroll Jitter**:
   - *Premise*: Calling `scrollIntoView()` inside `scrollToBottom` bubbled to parent layout containers, forcing reflows, and triggered `onScroll` during message rendering, causing false disengagement of `autoScroll`.
   - *Action*: Replaced `scrollIntoView()` with container-local `scrollTop = scrollHeight` inside `requestAnimationFrame`. Added `isProgrammaticScroll` guard ref so programmatic adjustments do not trigger `setAutoScroll(false)`.
   - *Result*: Fluid, non-blocking auto-scrolling that remains pinned to streaming output.

5. **Eliminating Render-Loop GC Pressure**:
   - *Premise*: In `ChatPanel.tsx` and `FlowPane.tsx`, `useStore(s => s.pulses.filter(...).at(-1))` created a new array reference on every single state change across the app.
   - *Action*: Replaced with `selectActivePulse`, which performs a reverse traversal and returns a stable reference or `undefined`.
   - *Result*: Eliminates repeated array allocations and prevents spurious re-renders.

---

## 3. Caveats

1. **Non-Streaming Provider Fallbacks**:
   - When a provider does not support SSE or falls back to a single JSON response, `ttftMs` equals the complete round-trip response duration (`performance.now() - t0`).
2. **Playwright Chromium in Headless Mode**:
   - Playwright browser tests pass against the built single-file `index.html`. Real WebGL shader compilation and three.js rendering are verified in Chromium headless environment.
3. **No Changes Outside Exclusive Scope**:
   - Changes were restricted strictly to the 9 assigned files. RedMed and untouched files remained completely untouched.

---

## 4. Conclusion

Milestone 2 (Streaming Handoff Metrics & Fluid State) is complete, robust, and fully verified.
- Real per-stage token counts (`tin`, `tout`) and transit latencies (`ttftMs`) are measured and recorded in `Session` and `store`.
- Backward compatibility for `Flow = [string, string, number]` is preserved.
- Grok Bot fan-in updates are atomically batched into a single state mutation.
- Chat scrolling uses RAF-aligned container scroll without `scrollIntoView()` reflows, protected by `isProgrammaticScroll`.
- Pulse selection is memoized to avoid allocation churn.
- All 6 checks (`format`, `lint`, `typecheck`, `test`, `build`, `e2e`) pass with 0 errors across 45 test files and Playwright.

---

## 5. Verification Method

To independently reproduce and verify this work, run the following commands in `/Users/claude/Projects/Brain/Nodes/app`:

```bash
# 1. Format check
npm run format

# 2. Lint check
npm run lint

# 3. TypeScript type check
npm run typecheck

# 4. Unit and integration tests (all 45 test suites)
npm test

# 5. Targeted test execution
npm test test/task-flow.test.ts test/stream.test.ts

# 6. Build single-file index.html
npm run build

# 7. Playwright end-to-end tests
npm run e2e
```

**Files to Inspect**:
- `app/src/lib/memory.ts`: `FlowTuple`, `FlowMetric`, `Session`, `cleanStageTokens`, `cleanTransitLatencies`
- `app/src/lib/run-task.ts`: `callAs` latency / token tracking, batched fan-in in `hooks.handoff`, `sess` creation
- `app/src/lib/providers.ts`: `readStream` and `callModel` TTFT calculation
- `app/src/store.ts`: `State.stageTokens`, `State.transitLatencies`, and `selectActivePulse`
- `app/src/components/ChatPanel.tsx`: `scrollToBottom` RAF alignment, `isProgrammaticScroll`, `selectActivePulse`
- `app/src/components/FlowPane.tsx`: `selectActivePulse` usage
- `app/src/lib/approval.ts`: hyphenated negation regex in `hasFailureVerdict`
- `app/test/task-flow.test.ts`: assertions on `sess.stageTokens` and `sess.transitLatencies`
- `app/test/stream.test.ts`: assertions on `ttftMs`, metric sanitization, and hyphenated negations
