# Investigation Report: Streaming Handoff Metrics & Fluid State (Requirement R2)

**Explorer**: Explorer 2 (Streaming Metrics & Handoff Explorer)  
**Date**: 2026-11-02  
**Target Requirement**: R2 (Streaming Handoff Metrics & Fluid State)  
**Working Directory**: `/Users/claude/Projects/Brain/Nodes/.agents/teamwork/teamwork_preview_explorer_survey_2`

---

## 1. Observation

### 1.1 Handoff and Metric Data Structures
- **`Flow` Tuple Definition**:
  In [`app/src/lib/memory.ts:79`](file:///Users/claude/Projects/Brain/Nodes/app/src/lib/memory.ts#L79):
  ```typescript
  /** What really passed in one handoff: sender, receiver and the number of words. 'memory' and 'brain' are Brain's own ends. */
  export type Flow = [string, string, number];
  ```
  `Flow` is strictly a 3-element tuple `[from, to, words]`. It contains no tokens, latency measurements, or timestamps.
- **`Session` Metric Fields**:
  In [`app/src/lib/memory.ts:82-95`](file:///Users/claude/Projects/Brain/Nodes/app/src/lib/memory.ts#L82-L95):
  ```typescript
  export interface Session {
    id: string;
    ts: number;
    q: string;
    ...
    flow?: Flow[];
    ms?: Record<string, number>;
  ```
- **Handoff & Metric Sanitization**:
  In [`app/src/lib/memory.ts:394-407`](file:///Users/claude/Projects/Brain/Nodes/app/src/lib/memory.ts#L394-L407):
  ```typescript
  const END = (x: unknown) => typeof x === 'string' && (isAgent(x) || x === 'owner' || x === 'memory' || x === 'brain');
  function cleanFlow(f: unknown): Flow[] | undefined {
    if (!Array.isArray(f)) return undefined;
    return f
      .filter(x => Array.isArray(x) && x.length === 3 && END(x[0]) && END(x[1]) && Number.isFinite(x[2]) && x[2] >= 0)
      .slice(0, 40)
      .map(x => [x[0], x[1], Math.min(100000, Math.round(x[2]))] as Flow);
  }
  function cleanMs(m: unknown): Record<string, number> | undefined {
    if (!m || typeof m !== 'object') return undefined;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(m as Record<string, unknown>))
      if (isAgent(k) && Number.isFinite(v) && (v as number) >= 0) out[k] = Math.min(600000, Math.round(v as number));
    return out;
  }
  ```

### 1.2 Metric Computation & Token Handling
- **Word Counting**:
  In [`app/src/store.ts:391`](file:///Users/claude/Projects/Brain/Nodes/app/src/store.ts#L391):
  ```typescript
  const words = (t?: string) => (t ? t.trim().split(/\s+/).filter(Boolean).length : undefined);
  ```
  When handing off in [`app/src/lib/chain.ts:111-125`](file:///Users/claude/Projects/Brain/Nodes/app/src/lib/chain.ts#L111-L125), `previous` is formatted as:
  ```typescript
  previous = `HANDOFF FROM ${AGENT[bot].name}:\n${text}`;
  handoffs.push(previous);
  if (next) hooks.handoff(bot, next, previous);
  ```
  The word count passed to `hooks.handoff` counts whitespace-delimited tokens in `previous`, which includes the `"HANDOFF FROM <Name>:"` prefix (3 extra words).
- **Token Accounting Discarded Per Stage**:
  In [`app/src/lib/providers.ts:355, 370`](file:///Users/claude/Projects/Brain/Nodes/app/src/lib/providers.ts#L355), `callModel` reads SSE stream events and folds them via `foldEvent`, returning `CallResult`:
  ```typescript
  export interface CallResult {
    text: string;
    why: string;
    tin: number;
    tout: number;
  }
  ```
  However, in [`app/src/lib/run-task.ts:174-178`](file:///Users/claude/Projects/Brain/Nodes/app/src/lib/run-task.ts#L174-L178):
  ```typescript
  set(x => ({
    tin: x.tin + res.tin,
    tout: x.tout + res.tout,
    ...(bot && x.limited.includes(bot) ? { limited: x.limited.filter(b => b !== bot) } : {}),
  }));
  ```
  `res.tin` and `res.tout` are accumulated into global page-level state `x.tin` and `x.tout`. They are never associated with the stage or the handoff, nor saved to `Session`.
- **Transit Latency vs Generation Duration**:
  In [`app/src/lib/run-task.ts:142, 186-187`](file:///Users/claude/Projects/Brain/Nodes/app/src/lib/run-task.ts#L142):
  ```typescript
  const bot = st.active,
    t0 = performance.now();
  ...
  if (bot && isStage)
    set(x => ({ timing: { ...x.timing, [bot]: Math.round(performance.now() - t0) }, draft: null }));
  ```
  `timing[bot]` records the *total execution time* of `callModel` (from initiation until stream close).
  Transit latency between agents is NOT measured from real network/dispatch events. Instead, visual pulse transit is synthetic:
  In [`app/src/lib/geometry.ts:352-355`](file:///Users/claude/Projects/Brain/Nodes/app/src/lib/geometry.ts#L352-L355):
  ```typescript
  export function transitMs(a: string, b: string): number {
    const k = a + '>' + b;
    if (!transitCache.has(k)) transitCache.set(k, Math.round(Math.max(1100, Math.min(3400, routeLength(a, b) * 380))));
    return transitCache.get(k)!;
  }
  ```
  And in [`app/src/store.ts:384-390`](file:///Users/claude/Projects/Brain/Nodes/app/src/store.ts#L384-L390):
  ```typescript
  const speedFor = (a: string, b: string) => {
    const ms = get().timing[a as AgentId];
    if (!ms) return undefined;
    return Math.round(
      Math.max(900, Math.min(4200, transitMs(a, b) * Math.max(0.7, Math.min(1.5, Math.sqrt(ms / 3000))))),
    );
  };
  ```

### 1.3 Sender-Receiver Routing Between Bot Stages
- **Execution Pipeline**:
  [`app/src/data/team.ts:191-202`](file:///Users/claude/Projects/Brain/Nodes/app/src/data/team.ts#L191-L202) defines the fixed 10-bot chain:
  `gemini` → `muse` → `chatgpt` → `claude` → `cursor` → `copilot` → `perplexity` → `grok` → `xcode` → `grokbot`.
- **Fan-in Routing at Grok Bot**:
  In [`app/src/lib/run-task.ts:262-274`](file:///Users/claude/Projects/Brain/Nodes/app/src/lib/run-task.ts#L262-L274):
  ```typescript
  if (b === 'grokbot')
    Object.entries(get().stages)
      .filter(([k, v]) => k !== a && k !== 'grokbot' && (v === 'done' || v === 'failed'))
      .forEach(([k], i) => {
        const w =
          words(
            get()
              .log.filter(m => m.from === k)
              .at(-1)?.text,
          ) || 0;
        set(x => ({ flow: [...x.flow, [k, b, w] as Flow].slice(-40) }));
        addPulse(k, b, color, { delay: 120 * (i + 1), words: w || undefined });
      });
  ```
  When Grok Bot is invoked, a loop executes up to 8 additional synchronous `set()` calls to append each preceding agent's handoff to `x.flow` and dispatch staggered pulses.

### 1.4 UI Rendering Pipeline & Desync Risks
- **Stream Throttling**:
  In [`app/src/lib/run-task.ts:145-151`](file:///Users/claude/Projects/Brain/Nodes/app/src/lib/run-task.ts#L145-L151):
  ```typescript
  const onDelta = bot
    ? (t: string) => {
        const n = performance.now();
        if (n - shown < 80) return;
        shown = n;
        set({ draft: { from: bot, text: clean(t) } });
      }
    : undefined;
  ```
  Deltas are throttled to ~12.5 Hz (80ms).
- **Flash of Disappearing Draft on Completion**:
  When `callModel` completes, `finally` in [`app/src/lib/run-task.ts:187`](file:///Users/claude/Projects/Brain/Nodes/app/src/lib/run-task.ts#L187) immediately sets `draft: null`. Only subsequently in `runChain` is `say({ from: bot, text, tag })` called. In that interim microtask/render turn, the active streaming text vanishes before the committed log entry is mounted.
- **Chat Purge of Task Steps**:
  In [`app/src/components/ChatPanel.tsx:247-250`](file:///Users/claude/Projects/Brain/Nodes/app/src/components/ChatPanel.tsx#L247-L250):
  ```typescript
  if (t.q && !chatTurn) {
    t.task = true;
    t.steps = t.steps.filter(m => !isAgent(m.from));
  }
  ```
  Because `t.task` is marked `true` for all team tasks, all intermediate agent responses are filtered out of the chat threads. Intermediate streaming text (`showDraft && !draftIsAnswer && !t.task`) is also skipped in chat (line 415), being displayed solely via `TaskBubble` in [`app/src/components/BrainScene.tsx:1066`](file:///Users/claude/Projects/Brain/Nodes/app/src/components/BrainScene.tsx#L1066).
- **Auto-Scroll Jitter & Disablement**:
  In [`app/src/components/ChatPanel.tsx:184-210`](file:///Users/claude/Projects/Brain/Nodes/app/src/components/ChatPanel.tsx#L184-L210):
  ```typescript
  const scrollToBottom = (smooth = false) => {
    const el = msgsRef.current;
    if (el) {
      if (smooth && typeof el.scrollTo === 'function') {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      } else {
        el.scrollTop = el.scrollHeight;
      }
    }
    end.current?.scrollIntoView?.({ block: 'end', behavior: smooth ? 'smooth' : 'auto' });
  };

  useEffect(() => {
    if (!autoScroll && !busy) return;
    scrollToBottom(false);
  }, [log.length, viewing, draft?.text, draft?.from, flow.length, stages, autoScroll, busy]);

  const onScroll = () => {
    const el = msgsRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    if (isNearBottom !== autoScroll) {
      setAutoScroll(isNearBottom);
    }
  };
  ```
  1. `scrollToBottom` performs a double scroll: `el.scrollTop = el.scrollHeight` followed by `end.current?.scrollIntoView()`.
  2. `scrollIntoView()` bubbles to ancestor containers and generates layout reflows and asynchronous scroll events.
  3. Rapid stream deltas or element resizing during image/icon load trigger `onScroll` before `scrollTop` settles, causing `isNearBottom` to evaluate to `false` and disabling `autoScroll`.
  4. Once `autoScroll` is false and `busy` becomes false, subsequent messages do not scroll into view automatically.
- **Selector Re-allocation Overhead**:
  In [`app/src/components/ChatPanel.tsx:182, 536`](file:///Users/claude/Projects/Brain/Nodes/app/src/components/ChatPanel.tsx#L182) and [`app/src/components/FlowPane.tsx:33`](file:///Users/claude/Projects/Brain/Nodes/app/src/components/FlowPane.tsx#L33):
  ```typescript
  activePulse = useStore(s => s.pulses.filter(p => !p.from.startsWith('mem:')).at(-1));
  ```
  Every store change allocates a new array via `.filter()`, defeating reference equality checks and triggering unnecessary component re-renders.

---

## 2. Logic Chain

1. **Premise 1**: Requirement R2 mandates: *"Ensure live handoff data structures accurately capture real token/word counts, transit latency, and sender-receiver routing between bot stages. Prevent chat rendering bottlenecks or streaming desynchronization during fast message arrivals."*
2. **Step 1 (Word and Token Metrics)**:
   - Observation 1.1 shows `Flow` only stores `[string, string, number]` (words).
   - Observation 1.2 shows `callModel` already measures and returns real tokens `tin` and `tout`, but `runTask` collapses them into page totals without storing stage or handoff breakdown.
   - Observation 1.2 shows word count naively splits by whitespace and includes the 3-word handoff prefix.
   - *Deduction*: To capture real token counts, `Flow` (or an enriched `HandoffRecord`) must store both input and output token counts per stage, and `Session` must persist this breakdown.
3. **Step 2 (Transit Latency Measurement)**:
   - Observation 1.2 shows `speedFor` relies on static 3D geometric distance `transitMs` and generation duration `timing[bot]`.
   - Observation 1.2 shows real network latency (dispatch timestamp to Time To First Token / TTFT) is completely unmeasured.
   - *Deduction*: Real transit latency must be recorded by timestamping the handoff emission (`t_dispatched`) and the arrival of the first SSE chunk (`t_first_chunk`) in `callModel`.
4. **Step 3 (Sender-Receiver Routing & Grok Bot Fan-In)**:
   - Observation 1.3 shows sequential 1:1 transitions until Grok Bot, where fan-in transitions fire 8 unbatched `set()` calls in a loop.
   - *Deduction*: Fan-in transitions must be batched in a single state mutation `set(x => ({ flow: [...], pulses: [...] }))` to prevent state update thrashing.
5. **Step 4 (UI Bottlenecks & Desync Risks)**:
   - Observation 1.4 shows double scrolling (`scrollTop` + `scrollIntoView`), selector instability (`pulses.filter`), and draft unmounting before log mounting.
   - *Deduction*: Eliminating `scrollIntoView` in favor of single-container RAF-aligned `scrollTop`, stabilizing selectors, and atomically transitioning `draft` to committed message will eliminate rendering bottlenecks and desync.

---

## 3. Caveats

1. **Storage Schema Compatibility**:
   `KEY = 'brain.mem.v2'` in `memory.ts` is shared with saved encrypted vaults. Any modifications to `Flow` or `Session` must be strictly backward-compatible with legacy `[string, string, number]` tuples.
2. **Provider SSE Token Availability**:
   Some free/community providers (e.g. certain OpenRouter endpoints or Anthropic non-streaming fallbacks) report usage only at the end of the stream in `message_delta` or `response.completed`. Time To First Token (TTFT) provides accurate network transit latency regardless of when the provider emits the token count block.
3. **Owner Design Rules**:
   According to `AGENTS.md` and `ChatPanel.tsx:245`, Owner's design intention is that intermediate task steps play out visually on the 3D brain and in the `FlowPane`, while the chat focuses on the prompt and Grok Bot's final verdict. Streaming improvements must respect this division without breaking the 3D bubble or chat layout.

---

## 4. Conclusion

The current system has the foundational scaffolding for streaming and handoffs, but suffers from four architectural deficiencies under R2:
1. **Lost Token Data**: Real token metrics (`tin`, `tout`) parsed in `providers.ts` are discarded instead of being recorded per handoff.
2. **Synthetic Transit Latency**: Latency is simulated via 3D coordinates rather than measured from real dispatch-to-first-token events.
3. **Unbatched State Cascades**: Stage completion and Grok Bot fan-in trigger multiple sequential Zustand `set()` calls.
4. **Auto-Scroll & UI Jitter**: Double scroll triggers layout thrashing and false-positive scroll detachments.

### Concrete Implementation Proposals

#### Proposal 1: Enriched Handoff & Session Data Structures
Keep `Flow` compatible, but support an enriched structure or optional metrics:
```typescript
// app/src/lib/memory.ts
export type FlowTuple = [string, string, number];
export interface FlowMetric {
  from: string;
  to: string;
  words: number;
  tokensIn?: number;
  tokensOut?: number;
  transitMs?: number;
  durationMs?: number;
}
export type Flow = FlowTuple; // preserve existing tuple format for backward compatibility
```
In `Session`, add:
```typescript
export interface Session {
  ...
  flow?: Flow[];
  ms?: Record<string, number>;
  stageTokens?: Record<string, { in: number; out: number }>;
  transitLatencies?: Record<string, number>; // real measured transit ms
}
```
Update `cleanFlow` and `cleanMs` to safely validate these optional structures while preserving legacy sessions.

#### Proposal 2: Real Transit Latency & TTFT Tracking
In `app/src/lib/run-task.ts` and `callModel`:
1. Record `handoffDispatchedAt` when `hooks.handoff` is invoked.
2. In `callModel`, record `t0 = performance.now()` and capture `firstTokenAt = performance.now()` on the first delta.
3. Compute `transitLatency = Math.round(firstTokenAt ? firstTokenAt - t0 : performance.now() - t0)`.
4. Store `transitLatencies[bot] = transitLatency`.

#### Proposal 3: Batched Stage & Fan-In Updates
In `run-task.ts:256-275`:
Replace individual loop `set()` calls for Grok Bot fan-in with a single atomic state update:
```typescript
if (b === 'grokbot') {
  const finishedEntries = Object.entries(get().stages)
    .filter(([k, v]) => k !== a && k !== 'grokbot' && (v === 'done' || v === 'failed'));
  
  const newFlows: Flow[] = [];
  const newPulses: Pulse[] = [];
  
  finishedEntries.forEach(([k], i) => {
    const lastMsg = get().log.filter(m => m.from === k).at(-1)?.text;
    const w = words(lastMsg) || 0;
    newFlows.push([k, b, w]);
    newPulses.push({
      id: ++pulseN,
      from: k,
      to: b,
      t0: performance.now() + 120 * (i + 1),
      color,
      words: w || undefined,
    });
  });

  set(x => ({
    flow: [...x.flow, ...newFlows].slice(-40),
    pulses: [...x.pulses, ...newPulses],
  }));
}
```

#### Proposal 4: UI Auto-Scroll & Selector Optimization
1. In `ChatPanel.tsx`, remove `end.current?.scrollIntoView()`. Rely exclusively on `el.scrollTop = el.scrollHeight` inside `requestAnimationFrame`.
2. Guard `onScroll` during programmatic scrolling using an `isProgrammaticScroll` ref flag to prevent false-positive `setAutoScroll(false)`.
3. In `ChatPanel.tsx` and `FlowPane.tsx`, memoize selector for the active pulse:
   ```typescript
   const selectActivePulse = (s: State) => {
     for (let i = s.pulses.length - 1; i >= 0; i--) {
       if (!s.pulses[i].from.startsWith('mem:')) return s.pulses[i];
     }
     return undefined;
   };
   ```

---

## 5. Verification Method

To verify these findings and any downstream implementations:

1. **Inspect Target Files**:
   - `app/src/lib/memory.ts` (lines 79, 82-95, 394-407)
   - `app/src/lib/run-task.ts` (lines 142-189, 256-275)
   - `app/src/lib/chain.ts` (lines 80-125)
   - `app/src/lib/providers.ts` (lines 355-389)
   - `app/src/store.ts` (lines 370-395)
   - `app/src/components/ChatPanel.tsx` (lines 184-210, 245-250)
   - `app/src/components/FlowPane.tsx` (lines 30-65)

2. **Automated Verification Commands**:
   Run in `/Users/claude/Projects/Brain/Nodes/app`:
   ```bash
   npm run typecheck
   npm run lint
   npm test -- test/task-flow.test.ts test/stream.test.ts
   npm run build
   ```

3. **Conditions That Invalidate This Assessment**:
   - If `Session.flow` format is changed to a non-tuple without updating `cleanFlow`, breaking stored sessions in `brain.mem.v2`.
   - If `t.steps` filter in `ChatPanel.tsx` was intentionally designed to never show intermediate agent steps in the DOM under any circumstances, including accessibility or fallback views.
