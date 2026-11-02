# Project: Brain Multi-Agent Runtime & Streaming Handoffs

## Architecture
Brain is an AI orchestration platform modeling a 10-specialist collaborative team.
- **Runtime Pipeline**: `app/src/lib/run-task.ts` and `app/src/lib/chain.ts` execute a 10-agent sequential chain (`gemini` -> `muse` -> `chatgpt` -> `claude` -> `cursor` -> `copilot` -> `perplexity` -> `grok` -> `xcode` -> `grokbot`), culminating in Grok Bot's final situation report and memory consolidation.
- **Streaming & Handoffs**: Streaming SSE deltas via `app/src/lib/providers.ts`, captured by `run-task.ts` with delta throttling, handoff tracking via `Flow` tuples, and 3D visual particle pulses in `BrainScene.tsx`.
- **State & Storage**: Zustand reactive store (`app/src/store.ts`) backed by persistent encrypted vault (`app/src/lib/memory.ts`).
- **UI & Presentation**: Compact tech UI (`app/src/compact.css`) with 3D brain view, ChatPanel, Coverage chips, and FlowPane.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | 10-Agent Collaborative Chain Order | Preserve and verify all 10 agents in `LIVE_ORDER` | M1 | Survey (Explorer 1) |
| 2 | Upstream Context Propagation | Pass structured `chainDigest` representing upstream milestones to prevent context starvation in intermediate stages | M1 | Survey (Explorer 1) |
| 3 | 4-Step Collaborative Prompting Directives | Mandate Critique -> Advance -> Audit -> Handoff in `stagePrompt` within 150-word cap | M1 | Survey (Explorer 1) |
| 4 | Three-Check Grok Bot Synthesis Schema | Dedicated prompt for Grok Bot verifying Check 1, Check 2, and Check 3, resolving conflicts | M1 | Survey (Explorer 1) |
| 5 | Robust Verdict Extraction | Disregard negated failures ("no tests failed") and accurately parse PASS/FAIL in `run-task.ts` and `approval.ts` | M1 | Survey (Explorer 1) |
| 6 | Enriched Handoff & Session Metrics | Record input/output tokens per stage and handoff in `FlowMetric`/`Session` while preserving `Flow` tuple backward compatibility | M2 | Survey (Explorer 2) |
| 7 | Real Transit Latency & TTFT Tracking | Timestamp handoff dispatch to first chunk (TTFT) to record real network transit latency | M2 | Survey (Explorer 2) |
| 8 | Batched Fan-in State Updates | Batch Grok Bot fan-in pulses and flow updates in single atomic Zustand mutation | M2 | Survey (Explorer 2) |
| 9 | UI Auto-Scroll & Selector Optimization | Fix double-scroll layout reflows in `ChatPanel.tsx` and memoize active pulse selector in `FlowPane.tsx` | M2 | Survey (Explorer 2) |
| 10 | Distinct Specialty Guardrails | Maintain and enforce distinct boundaries and negative constraints across all 10 agents | M3 | Survey (Explorer 3) |
| 11 | Historical Incomplete Stage Visibility | Display failed/incomplete stages and reasons under `px-steps` in `ChatPanel.tsx` for past sessions | M3 | Survey (Explorer 3) |
| 12 | Robust Stage Error Parser & Degradation | Structured error parsing in `run-task.ts` and autonomous handoff continuation without crashing | M3 | Survey (Explorer 3) |
| 13 | Comprehensive Unit & Integration Test Suites | Unit and integration tests covering R1, R2, and R3 in `chain.test.ts`, `team.test.ts`, `task-flow.test.ts` | M3 | Survey (Explorer 3) |
| 14 | Automated Verification Across All 6 Checks | `npm run format`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run e2e` pass with 0 errors | M5 | Survey (Explorer 3) |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Collaborative Flow & Synthesis (R1) | Features 1-5: `chain.ts`, `team.ts`, `run-task.ts`, `approval.ts` | Survey | DONE |
| M2 | Streaming Handoff Metrics & Fluid State (R2) | Features 6-9: `memory.ts`, `run-task.ts`, `providers.ts`, `store.ts`, `ChatPanel.tsx`, `FlowPane.tsx` | M1 | IN_PROGRESS |
| M3 | Specialty Guardrails & Failure Handling (R3) | Features 10-13: `team.ts`, `ChatPanel.tsx`, `run-task.ts`, test suites | M1, M2 | PLANNED |
| M4 | E2E Testing Track (Requirement-Driven) | Test infra, 4-tier opaque-box test suite for all 14 features, publish `TEST_READY.md` | Independent | DONE |
| M5 | Final Milestone: All 6 Checks & Adversarial Hardening | Pass 100% E2E tests, Tier 5 hardening, Forensic Integrity Audit | M1, M2, M3, M4 | PLANNED |

## Interface Contracts
### `app/src/lib/chain.ts` <-> `app/src/data/team.ts`
- `stagePrompt(id: AgentId, task: string, incomingFrom: string, incoming: string, next: AgentId | null, brainContext: string, chatter?: string, chainDigest?: string): string`
- `chainDigest`: optional structured summary of upstream findings (Gemini context, Muse audit, Claude architecture).
- Preservation of test substrings: `'HANDOFF FROM <Name>'`, `'FINAL SITUATION REPORT'`.

### `app/src/lib/memory.ts` <-> `app/src/store.ts` & `app/src/lib/run-task.ts`
- `Flow = [string, string, number]` preserved for backward compatibility.
- `Session`:
  - `flow?: Flow[]`
  - `ms?: Record<string, number>`
  - `stageTokens?: Record<string, { in: number; out: number }>`
  - `transitLatencies?: Record<string, number>`
- `cleanFlow` and `cleanMs` safely preserve legacy and enriched sessions.

### `app/src/lib/run-task.ts` <-> `app/src/lib/approval.ts`
- `finalReviewFor(hasFailures: boolean, lastGrokBotMsg?: string)`:
  - If any stage failed -> DECLINED.
  - If Grok Bot reports `DECISION: FAIL` or `VERDICT: FAIL` -> DECLINED.
  - Negated phrases like "no tests failed" do NOT trigger DECLINED.

## Code Layout
- `app/src/data/team.ts`: 10 agents, roles, specialties, prompts (`stagePrompt`, `systemPrompt`, `LIVE_ORDER`).
- `app/src/lib/chain.ts`: `runChain` execution loop, handoffs, error catching.
- `app/src/lib/run-task.ts`: Live task orchestrator, delta streaming, pulse generation, Grok Bot final review.
- `app/src/lib/approval.ts`: Review status and approval state.
- `app/src/lib/memory.ts`: `Flow`, `Session`, vault persistence, memory cleaning.
- `app/src/lib/providers.ts`: SSE client, `callModel`, token counting.
- `app/src/store.ts`: Reactive state, pulse dispatch, speed/timing computations.
- `app/src/components/ChatPanel.tsx`: Chat UI, streaming display, auto-scroll, steps rendering.
- `app/src/components/FlowPane.tsx`: Handoff flow visualization and pulse tracking.
- `app/src/components/Coverage.tsx`: Bot coverage chips and status indicators.
- `app/test/`: Vitest test suites (`chain.test.ts`, `team.test.ts`, `task-flow.test.ts`, `approval.test.ts`).
- `app/e2e/`: Playwright end-to-end tests.
