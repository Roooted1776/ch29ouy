# BRIEFING — 2026-11-02T09:12:30Z

## Mission
Investigate Brain codebase for Requirement R2: Streaming Handoff Metrics & Fluid State (transit latency, word/token counting, routing structures, UI rendering pipeline, auto-scrolling, desynchronization risks, and concrete architectural proposals).

## 🔒 My Identity
- Archetype: explorer
- Roles: read-only investigator, analyzer, synthesizer
- Working directory: /Users/claude/Projects/Brain/Nodes/.agents/teamwork/teamwork_preview_explorer_survey_2
- Original parent: d8106e50-8d34-4bff-8263-21cf982431cb
- Milestone: survey

## 🔒 Key Constraints
- Read-only investigation — do NOT implement or edit source code
- Files for content delivery, messages for coordination
- Self-contained 5-component handoff.md report
- Plain language, little jargon, precise line numbers and citations
- Never git push, commit locally only if asked

## Current Parent
- Conversation ID: d8106e50-8d34-4bff-8263-21cf982431cb
- Updated: 2026-11-02T09:12:30Z

## Investigation State
- **Explored paths**:
  - `app/src/lib/memory.ts`: `Flow`, `Session`, `cleanFlow`, `cleanMs`, `loadMem`, `saveMem`.
  - `app/src/lib/run-task.ts`: `runTask`, `callAs`, `fileByAi`, `runChain` integration, `onDelta` throttling, timing, flow creation, Grok Bot fan-in handoffs.
  - `app/src/lib/chain.ts`: `runChain`, `StageCall`, `ChainHooks`, sequential execution loop, `hooks.handoff`, credit failure.
  - `app/src/lib/providers.ts`: `callModel`, `readStream`, `foldEvent`, `parseReply`, token accounting (`tin`, `tout`).
  - `app/src/lib/geometry.ts`: `transitMs`, `routeLength`.
  - `app/src/lib/text.ts`: `WORD_CAP`, `capWords`, `words`, `keywords`.
  - `app/src/store.ts`: `State`, `say`, `addPulse`, `speedFor`, `words`, `liveReady`, `timing`, `flow`, `pulses`.
  - `app/src/components/ChatPanel.tsx`: `ChatPanel`, `scrollToBottom`, `onScroll`, `autoScroll`, `threads`, `draftIsAnswer`, `agentCard`, `Handoff`.
  - `app/src/components/FlowPane.tsx`: `FlowPane`, selector instability on `pulses`.
  - `app/src/components/Home.tsx`: Layout, workspace status, flow details container.
  - `app/src/components/Coverage.tsx` & `Tasks.tsx`: Task states, coverage summary.
  - `app/src/components/BrainScene.tsx`: `TaskBubble`, `Transit`, `Transits`.
  - `app/src/components/TeamDiagram.tsx`: 2D node diagram and edge routing pulses.
  - `app/test/task-flow.test.ts`, `app/test/stream.test.ts`, `app/test/ui.test.tsx`, `app/test/chat.test.ts`.
- **Key findings**:
  - `Flow` is currently limited to `[from: string, to: string, words: number]`. Token counts and transit latencies are completely missing from handoff records.
  - Tokens (`tin`, `tout`) are parsed correctly by `callModel` in `providers.ts` but collapsed into global aggregate counters (`x.tin`, `x.tout`) in `run-task.ts`, discarding per-stage metrics.
  - Transit latency is not measured: `speedFor` uses static 3D geometric distance `transitMs` scaled by sqrt of response time. TTFT (Time To First Token) and handoff dispatch-to-start latency are unmeasured.
  - In `ChatPanel.tsx`, `t.task = true` purges intermediate bot messages from the chat view (`t.steps = t.steps.filter(m => !isAgent(m.from))`), delegating them entirely to `BrainScene`'s `TaskBubble`.
  - Rapid stage handoffs trigger multiple unbatched `set()` calls and selector re-allocations (`s.pulses.filter(...).at(-1)`), creating rendering spikes.
  - Auto-scrolling suffers from a double-scroll race condition (`el.scrollTop = el.scrollHeight` + `end.current?.scrollIntoView()`) triggering `onScroll` which can disable `autoScroll`.
- **Unexplored areas**: None for R2 scope.

## Key Decisions Made
- Structuring `handoff.md` with full 5-component protocol, concrete evidence chains, and backward-compatible architectural proposals.

## Artifact Index
- `.agents/teamwork/teamwork_preview_explorer_survey_2/DISPATCH.md` — Inbound message log
- `.agents/teamwork/teamwork_preview_explorer_survey_2/progress.md` — Liveness heartbeat & progress log
- `.agents/teamwork/teamwork_preview_explorer_survey_2/BRIEFING.md` — Persistent situational awareness
- `.agents/teamwork/teamwork_preview_explorer_survey_2/handoff.md` — Final structured 5-component report
