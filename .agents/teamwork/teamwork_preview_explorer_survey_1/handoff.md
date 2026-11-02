# Handoff Report: Requirement R1 Investigation (Multi-Agent Collaborative Flow)

## 1. Observation

### 1.1 The 10 Specialized Agents in Brain
In `app/src/data/team.ts` (lines 11–21, 38–167), 10 specialized agents are defined in the `AGENTS` registry and ordered in `LIVE_ORDER` (lines 191–202):

```typescript
// app/src/data/team.ts:11-21
export type AgentId =
  | 'grok'
  | 'grokbot'
  | 'claude'
  | 'cursor'
  | 'gemini'
  | 'chatgpt'
  | 'perplexity'
  | 'xcode'
  | 'muse'
  | 'copilot';

// app/src/data/team.ts:191-202
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

The 10 agent specifications (roles, specialties, stages, tasks, tones):
1. **`gemini` (Google · Collab · Casual)**:
   - File: `app/src/data/team.ts:91-103, 208-209, 227`
   - Role: `Context · long documents`
   - Specialty: `Reads a lot at once and cross-checks it, including images and long documents`
   - Stage: `FIRST CHECK. Read the request and any context. List the concrete requirements, limits and anything unclear that blocks the work.`
   - Task: `Pull out requirements, given context and open questions. Deliver a context check.`
2. **`muse` (Independent · Audit · Serious)**:
   - File: `app/src/data/team.ts:155-166, 210, 228`
   - Role: `Independent audit`
   - Specialty: `Audits everyone and finds what is wrong`
   - Stage: `SECOND CHECK. Audit the incoming context and handoff on your own. Name gaps, contradictions, risks and missing evidence.`
   - Task: `Audit the incoming context and handoff for gaps, risks, contradictions and unsupported claims.`
3. **`chatgpt` (OpenAI · Collab · Balanced)**:
   - File: `app/src/data/team.ts:129-141, 211, 229`
   - Role: `Tools · synthesis`
   - Specialty: `Uses tools on code, then pulls the findings together`
   - Stage: `COLLECTIVE CHECK. Turn the reviewed handoff into a concrete step of attack, ordered plan, and deliverable.`
   - Task: `Deploy the concrete step of attack and ordered plan from the reviewed handoff.`
4. **`claude` (Anthropic · Hub · Balanced)**:
   - File: `app/src/data/team.ts:66-78, 212-214, 230`
   - Role: `Reasoning · writing · build`
   - Specialty: `Careful reasoning, clear writing and code`
   - Stage: `BUILDER. Produce the reasoning, writing, design or code proposal as text. Do not claim to have edited files.`
   - Task: `Write the requested reasoning, writing, design or code proposal.`
5. **`cursor` (Anysphere · Collab · Serious)**:
   - File: `app/src/data/team.ts:104-115, 215-216, 231`
   - Role: `Code · repo fit`
   - Specialty: `Reviews supplied code and repository integration risks`
   - Stage: `INTEGRATION REVIEW. Check the proposal for repo fit, integration risks and missing checks, using only what you were given. Do not claim to have opened files.`
   - Task: `Check repo integration risks using only the material provided.`
6. **`copilot` (GitHub · Collab · Balanced)**:
   - File: `app/src/data/team.ts:116-128, 206-207, 226`
   - Role: `Code suggestions · review`
   - Specialty: `Reviews supplied code and suggests focused improvements`
   - Stage: `CODE REVIEW. Explain supplied code and suggest focused improvements as text. Never claim to run tools or change a project.`
   - Task: `Review supplied code and explain useful improvements without changing files.`
7. **`perplexity` (Perplexity · Collab · Balanced)**:
   - File: `app/src/data/team.ts:142-154, 217-218, 232`
   - Role: `Search · logic`
   - Specialty: `Searches sources and checks reasoning using the available context`
   - Stage: `SOURCE CHECK. Judge source quality and what needs a citation. When you can search the web, check the key claims and give links; otherwise use only supplied material. Never invent citations; mark unsupported claims.`
   - Task: `Check the key claims and their sources. Search the web when you can and give links.`
8. **`grok` (xAI · Collab · Casual)**:
   - File: `app/src/data/team.ts:52-65, 218, 233`
   - Role: `Strategy · challenges`
   - Specialty: `Finds weak assumptions, risks and missed options`
   - Stage: `STRATEGY REVIEW. Challenge assumptions, name risks and one option the team missed.`
   - Task: `Challenge assumptions and surface risks or alternatives.`
9. **`xcode` (Apple · Collab · Balanced)**:
   - File: `app/src/data/team.ts:79-90, 219-221, 234`
   - Role: `iOS · device builds`
   - Specialty: `Builds and tests iPhone apps`
   - Stage: `PLATFORM & BUILD CHECK. Review client platforms, device targets (iOS, macOS, web, mobile, desktop), build constraints, performance and deployment feasibility. Do not claim to run builds.`
   - Task: `Review platform compatibility, device targets, build constraints, and deployment feasibility.`
10. **`grokbot` (xAI · Lead · Serious)**:
    - File: `app/src/data/team.ts:39-51, 221-223, 235-237`
    - Role: `Coordination role · final call`
    - Specialty: `Leads the team and makes the final call after the three checks`
    - Stage: `TEAM LEAD. Review the whole chain, settle conflicts, list missing or failed stages, and write the final report with a PASS or FAIL recommendation. You can decline based on the team's response. Owner controls repo changes, push and merge.`
    - Task: `Review every handoff. Combine the work, list open issues and missing checks, and give the final team report and recommendation. You can decline based on the team's response.`

*Historical Note regarding AGENTS.md*: In the repository root `AGENTS.md` (lines 34–43), an earlier 9-agent table listed `Codex (OpenAI)` and did not yet include `Copilot`. In `app/src/data/team.ts`, the team was unified into the 10 agents above (`chatgpt` replacing Codex, and `copilot` added). `app/test/team.test.ts` lines 17, 73 explicitly asserts `expect(AGENTS).toHaveLength(10)` and `expect(LIVE_ORDER).toHaveLength(10)`.

### 1.2 Task Execution Pipeline Tracing
1. **Entry Point (`app/src/store.ts:427-434`)**:
   - `send(raw)` checks if `raw` starts with `task: ` or `Task for <bot>: `. If so, it invokes `runTask(raw, deps)` (`app/src/lib/run-task.ts:42`).
2. **Task Validation and Setup (`app/src/lib/run-task.ts:42-99`)**:
   - Verifies admin role (`if (!admin()) ...`).
   - Redacts keys from prompt via `redact(raw.trim(), ...)`.
   - Checks provider key validity, rate limit state, single live task per page load (`s.tasks >= 1`), and call budget (`s.calls >= s.live.callCap`).
   - Determines active bots: `bots = chainFor(q, inactive)`. Default returns all 10 agents from `LIVE_ORDER`.
   - Sets store state: `busy: true`, all active bots initialized to `'waiting'` in `stages`, `flow: []`, `timing: {}`.
   - Pulls relevant memories: `relevant(s.mem, q, 6, assignedProj)` retrieves up to 6 memories, generates `ctxBlock` (full memory context with index titles) and `ctxShort` (clipped to 160 characters without index titles).
3. **Delta Streaming and Provider Routing (`app/src/lib/run-task.ts:133-190`)**:
   - `callAs(system, user, isStage)` handles execution.
   - Streaming delta: throttled to 80ms (`if (n - shown < 80) return;`), updating `s.draft = { from: bot, text: clean(t) }`.
   - Provider selection: `pickBotProvider(own, free, pv, usable)` prioritizes free providers (Groq/Google), then the agent's native provider, then primary provider.
4. **Handoff Chain Execution (`app/src/lib/chain.ts:27-134`)**:
   - `runChain` iterates sequentially through `bots` (`i = 0` to `bots.length - 1`).
   - Line 80: Initial handoff hook `hooks.handoff('owner', bot, task)` fires.
   - Line 82–83:
     ```typescript
     const incomingFrom = i === 0 ? 'Owner' : AGENT[bots[i - 1]].name;
     const incoming = bot === 'grokbot' ? handoffs.join('\n\n') || previous : previous;
     ```
   - Line 94–98:
     ```typescript
     const chatter = msgs
       .filter(x => x.tag === tag && x.from !== bots[i - 1])
       .slice(-3)
       .map(x => `${AGENT[x.from as AgentId]?.name || x.from}: ${x.text.slice(0, 300)}`)
       .join('\n');
     ```
   - Line 99–102:
     ```typescript
     r = await call(
       systemPrompt(bot, !!opts.web),
       stagePrompt(bot, task, incomingFrom, incoming, next, ctx, chatter),
     );
     ```
   - Line 110–112:
     ```typescript
     say({ from: bot, text, tag });
     completed++;
     previous = `HANDOFF FROM ${AGENT[bot].name}:\n${text}`;
     handoffs.push(previous);
     ```
   - Line 125:
     ```typescript
     if (next) hooks.handoff(bot, next, previous);
     ```
   - In `run-task.ts:256–275`: `hooks.handoff` records word count to `flow` (`[a, b, w]`) and triggers 3D particle pulse. When `b === 'grokbot'` (line 262–274), all prior completed and failed stages emit converging pulses to `grokbot`.
5. **Post-Chain Synthesis and Session Persistence (`app/src/lib/run-task.ts:311-364`)**:
   - `lastGrokBotMsg = result.msgs.filter(x => x.from === 'grokbot').at(-1)?.text || ''`.
   - `hasFailures = result.failed.length > 0 || Object.values(get().stages).some(s => s === 'failed') || /\b(fail|failed|decline|declined|declines|reject|rejected|rejects|block|blocked|abort|aborted)\b/i.test(lastGrokBotMsg);`
   - `grokFinalReview = finalReviewFor(hasFailures)` (`app/src/lib/approval.ts:25`: returns `'DECLINED: Blocked based on team response.'` if true, else `'APPROVED_PENDING_DIRECTOR_REVIEW'`).
   - Session object is constructed, saved to persistent memory, and queued to inbox (`mm.inbox.push({ kind: 'session', ref: sess.id })`).
   - Memory consolidation (`fileByAi`): Grok Bot makes 1 additional model call using `MEMORY_SYSTEM` to extract Concepts, Entities, and Workstreams into Brain's permanent memory (`app/src/lib/ai-memory.ts`).

### 1.3 Analysis of Prompt Formatting and Siloed vs Collaborative Behavior
Direct examination of `stagePrompt` in `app/src/data/team.ts` (lines 387–413) reveals:
```typescript
export function stagePrompt(
  id: AgentId,
  task: string,
  incomingFrom: string,
  incoming: string,
  next: AgentId | null,
  brainContext: string,
  chatter = '',
): string {
  const handTo = next
    ? AGENT[next].name.toUpperCase()
    : id === 'grokbot'
      ? 'OWNER (FINAL SITUATION REPORT)'
      : 'GROK BOT';
  return (
    `${HANDOFF_RULE}\n\nOWNER TASK:\n${task}\n\n` +
    (brainContext ? `${brainContext}\n\n` : '') +
    `INCOMING HANDOFF FROM ${incomingFrom.toUpperCase()} (COLLECT & REVIEW FIRST):\n${incoming}\n\n` +
    (chatter ? `EARLIER IN THE TEAM CHAT (you may reply to anyone here):\n${chatter}\n\n` : '') +
    `YOUR ASSIGNED WORK:\n${TASK[id]}\n\n` +
    'ONE TEAM PRINCIPLE: We are all one team of people and bots. Never hide information out of emotion. Complete your task and push across the desk to the next person.\n' +
    'OPERATING PIPELINE: Collect --> Review --> Edit --> Review --> Pass to next --> Review.\n' +
    'STEP OF ATTACK DEPLOYED: Target Recon -> Threat Audit -> Tactical Plan -> Surgical Strike -> Verification.\n' +
    'CRITICAL FORMAT RULE: NO CODE BLOCKS. Never output markdown code fences (```). The live chat is for common interactions, team chatter, and passes between teammates. Explain your work and plans in natural conversational words.\n' +
    `Talk like a lively team group chat: open with a quick line of banter to ${incomingFrom} or anyone above, do your work in natural words, then pass to ${handTo} with a short send-off. Text only, no code blocks. ${toneLine(id)}`
  );
}
```

Critical observations regarding siloing:
1. **Upstream Starvation**: Intermediate agents ($i \ge 1$, except Grok Bot) only receive `previous` (the immediately preceding bot's text). As a result:
   - `Cursor` (agent 5) only receives Claude's message; it does NOT receive Gemini's requirements or Muse's audit.
   - `Copilot` (agent 6) only receives Cursor's message; it does NOT receive Claude's full proposal.
   - `Perplexity` (agent 7) only receives Copilot's suggestions; it does NOT receive Claude's design or Gemini's scope.
   - `Grok` (agent 8) only receives Perplexity's citation review; Grok is supposed to review strategic assumptions and identify missed options, but lacks visibility into Claude's implementation proposal!
   - `Xcode` (agent 9) only receives Grok's critique; it lacks visibility into Claude's architectural choices.
2. **Truncated Chatter**: `chatter` provides at most 3 prior messages sliced to 300 characters each. This is insufficient for preserving complex architectural context or technical constraints.
3. **Chatter Directive Framing**: The prompt concludes with:
   `"Talk like a lively team group chat: open with a quick line of banter to ${incomingFrom} or anyone above, do your work in natural words, then pass to ${handTo} with a short send-off."`
   This prompts the LLM to treat the handoff as casual chatter ("open with banter... do your work in natural words") rather than demanding an explicit review: endorsing, challenging, refining, or building upon specific assertions of the prior agent.
4. **Length and Word Cap Friction**:
   In `app/src/lib/text.ts:58`, `WORD_CAP = 150`. In `app/src/data/team.ts:8`, `const CAP_RULE = ' Keep every message to ' + WORD_CAP + ' words or fewer.'`. In `app/src/store.ts:365`, `isAgent(m.from) ? capWords(clean(m.text)) : clean(m.text)` truncates any response exceeding 150 words with an ellipsis. If prompt instructions encourage extensive greetings and banter, agents exhaust their token budget on superficial pleasantries, leaving minimal capacity for analytical depth.

### 1.4 Grok Bot's Final Synthesis Analysis
1. **Input**: Grok Bot is the only agent that receives `incoming = handoffs.join('\n\n') || previous` (`chain.ts:83`), giving it the concatenated text of all prior handoffs.
2. **Stage Assignment**:
   `TASK['grokbot'] = "Review every handoff. Combine the work, list open issues and missing checks, and give the final team report and recommendation. You can decline based on the team's response."` (`team.ts:235-237`).
3. **Fragile Verdict Parsing**:
   In `app/src/lib/run-task.ts:318-323`:
   ```typescript
   const lastGrokBotMsg = result.msgs.filter(x => x.from === 'grokbot').at(-1)?.text || '';
   const hasFailures =
     result.failed.length > 0 ||
     Object.values(get().stages).some(s => s === 'failed') ||
     /\b(fail|failed|decline|declined|declines|reject|rejected|rejects|block|blocked|abort|aborted)\b/i.test(
       lastGrokBotMsg,
     );
   const grokFinalReview = finalReviewFor(hasFailures);
   ```
   If Grok Bot writes "Zero checks failed", "No tests failed", or "Passing without failure", the keyword regex matches `fail` and marks the task as `DECLINED`. Conversely, if Grok Bot rejects the proposal using phrasing outside those exact keywords, it defaults to `APPROVED_PENDING_DIRECTOR_REVIEW`.
4. **Missing Check Verification Structure**:
   `AGENTS.md:46–52` mandates a formal "Three-check review order":
   - Check 1: Gemini (Context, scope, documents).
   - Check 2: Muse (Adversarial audit, errors, risks, evidence).
   - Check 3: Collective review (Codex/ChatGPT, Claude, Cursor, Copilot, Perplexity, Grok, Xcode).
   Grok Bot currently has no prompt schema to verify these three checks systematically, summarize consensus vs dissent, or state the exact verification conditions.

---

## 2. Logic Chain

1. **Premise 1 (Agent Definition & Order)**: Observation 1.1 proves that Brain has exactly 10 agents configured in `AGENTS` and `LIVE_ORDER` in `app/src/data/team.ts`. All 10 agents participate in `runChain`.
2. **Premise 2 (Context Starvation in Intermediate Handoffs)**: In Observation 1.2 and 1.3, lines 83 and 94–98 of `app/src/lib/chain.ts` show that intermediate agents receive only `previous` and a 300-char truncated snippet of up to 3 prior messages in `chatter`.
3. **Inference 1 (Root Cause of Siloing)**: Because intermediate agents do not have access to the foundational problem decomposition (Gemini) or core technical design (Claude), agents 5 through 9 cannot evaluate whether subsequent refinements fit the original requirements or architecture. They are forced to respond in a silo based solely on their immediate predecessor's comments.
4. **Premise 3 (Prompt Directives Promote Superficial Chatter)**: Observation 1.3 shows that `stagePrompt` instructs agents to "open with a quick line of banter... do your work in natural words, then pass with a short send-off".
5. **Inference 2 (Collaborative Prompting Deficit)**: Without an explicit prompt contract requiring agents to: (a) identify and validate/challenge specific claims from preceding workers, (b) apply their specialty to advance the deliverable, and (c) identify unresolved risks or downstream focus, agents default to conversational filler.
6. **Premise 4 (Grok Bot Synthesis & Verdict Fragility)**: Observation 1.4 demonstrates that Grok Bot receives the full handoff text, but has no structured synthesis framework reflecting the Three-Check protocol (AGENTS.md), and its final verdict is parsed by a fragile regex prone to false positives on negated failure statements.
7. **Inference 3 (Necessary Architectural Enhancements)**: To satisfy Requirement R1 ("each agent in the chain actively consumes, challenges, and builds upon the findings of previous agents... Grok Bot synthesizes all preceding agent findings into an authoritative final report and decision"), the pipeline requires:
   - Structured context propagation across intermediate stages in `runChain`.
   - Explicit multi-step collaborative reasoning directives in `stagePrompt` that mandate consumption, critique, and advancement within the 150-word cap.
   - Dedicated Three-Check Synthesis & Verification prompting for Grok Bot.
   - Robust decision and verdict extraction in `run-task.ts` and `approval.ts`.

---

## 3. Caveats

1. **Word Cap Constraint**: `WORD_CAP = 150` (`app/src/lib/text.ts:58`) is enforced in UI log rendering (`store.ts:365`). Any prompt schema must remain concise; overly verbose output templates will cause message truncation.
2. **No Code Blocks Rule**: `AGENTS.md` and `stagePrompt` strictly forbid markdown code blocks (` ``` `). Collaborative flow must describe code changes and architecture conversationally.
3. **Test Invariants**:
   - `test/chain.test.ts` asserts:
     - `expect(prompts[1]).toContain('HANDOFF FROM Gemini')`
     - `expect(prompts[9]).toContain('HANDOFF FROM Gemini')`
     - `expect(prompts[9]).toContain('HANDOFF FROM Xcode')`
     - `expect(prompts[9]).toMatch(/FINAL SITUATION REPORT/)`
   - `test/keyguide.test.ts` asserts:
     - `expect(got[1][2]).toBe('HANDOFF FROM Gemini:\none two three')`
   Any enhancement to `runChain` or `stagePrompt` must preserve these exact substrings in `prompts` and `hooks.handoff` payloads.

---

## 4. Conclusion & Concrete Proposals for Requirement R1

To deepen multi-agent collaborative flow across all 10 agents, the following architectural and implementation changes are proposed:

### Proposal 1: Structured Chain Context Propagation in `app/src/lib/chain.ts`
- **Location**: `app/src/lib/chain.ts:81–105`
- **Mechanism**:
  - Keep `incoming` containing `previous` (preserving `test/chain.test.ts` and `test/keyguide.test.ts` compatibility).
  - For intermediate agents ($i \ge 1$), generate a structured `chainDigest` representing upstream milestones:
    - Requirements & Scope (Gemini)
    - Security & Risk Audit (Muse)
    - Technical Proposal / Architecture (Claude)
    - Preceding specialist contributions
  - Provide this upstream digest in `stagePrompt` as `UPSTREAM CHAIN PROGRESS` so downstream agents (Cursor, Copilot, Perplexity, Grok, Xcode) have full visibility into the solution evolution.

### Proposal 2: Enhanced Collaborative Reasoning Directives in `app/src/data/team.ts`
- **Location**: `app/src/data/team.ts:387–413` (`stagePrompt`)
- **Mechanism**:
  - Replace generic "do your work in natural words" with a structured 4-step collaborative protocol:
    1. **Critique & Acknowledge**: Name the predecessor's specific claim or proposal being reviewed; state whether you endorse, challenge, or refine it.
    2. **Specialty Advance**: Apply your specialized domain lens to advance the deliverable (not just general commentary).
    3. **Risk / Edge Case Audit**: Explicitly identify any new risks, missing checks, or constraints.
    4. **Direct Handoff**: Pass to the next specialist with a specific directive on what they should inspect.
  - Maintain the registered tone (`toneLine(id)`), voice, and banter requirements without sacrificing analytical rigor.

### Proposal 3: Authoritative Three-Check Grok Bot Synthesis Schema
- **Location**: `app/src/data/team.ts:387–413` and `TASK['grokbot']` (`team.ts:235–237`)
- **Mechanism**:
  - When `id === 'grokbot'`, format a dedicated prompt requiring a structured Final Situation Report:
    - **Check 1 Audit (Gemini)**: Requirements completeness and scope adherence.
    - **Check 2 Audit (Muse)**: Resolution of identified risks and contradictions.
    - **Check 3 Synthesis (Collective)**: Integration of Claude's architecture, Cursor's repo fit, Copilot's code suggestions, Perplexity's citations, Grok's strategic options, and Xcode's platform constraints.
    - **Consensus & Dissent**: Settle conflicts between agents.
    - **Authoritative Decision**: Explicitly render `DECISION: PASS` or `DECISION: FAIL` with concrete rationale.

### Proposal 4: Robust Verdict Extraction in `app/src/lib/run-task.ts` and `app/src/lib/approval.ts`
- **Location**: `app/src/lib/run-task.ts:318–325` and `app/src/lib/approval.ts`
- **Mechanism**:
  - Replace the naive failure keyword regex with structured verdict detection:
    - Detect explicit decision headers: `/(?:DECISION|VERDICT|RECOMMENDATION):\s*(PASS|FAIL|DECLINE|BLOCKED)/i`.
    - Disregard negative contexts such as `/(no|zero|without)\s+(checks?\s+)?(fail|failure)/i`.
    - Retain strict safety fallback: if any stage has `s === 'failed'` or `result.failed.length > 0`, always decline.

---

## 5. Verification Method

### 5.1 Verification Commands
Execute the complete verification suite in `app/`:
```bash
cd /Users/claude/Projects/Brain/Nodes/app
npm run format
npm run lint
npm run typecheck
npm test
npm run build
```

### 5.2 Specific Test Invariants to Inspect
1. `app/test/chain.test.ts`:
   - All 10 stages run in order (`gemini` through `grokbot`).
   - `prompts[1]` contains `'HANDOFF FROM Gemini'`.
   - `prompts[9]` contains `'HANDOFF FROM Gemini'` and `'HANDOFF FROM Xcode'`.
   - `prompts[9]` matches `/FINAL SITUATION REPORT/`.
   - `hand[0]` is `'owner>gemini'` and `hand` contains `'xcode>grokbot'`.
2. `app/test/team.test.ts`:
   - All 10 agents verified with distinct tones and roles.
   - `HANDOFF_RULE` present in all system and stage prompts.
3. `app/test/task-flow.test.ts`:
   - Full simulated task execution passes across all 10 stages + memory filing.
   - Handoff flow pairs and reply times recorded accurately.
4. `app/test/approval.test.ts`:
   - Approval state records `APPROVED_PENDING_DIRECTOR_REVIEW` or `DECLINED` without triggering external commands.

### 5.3 Invalidation Conditions
- Any change that alters the 10-agent ordering in `LIVE_ORDER`.
- Any prompt format change that removes required test strings (`'HANDOFF FROM Gemini'`, `'FINAL SITUATION REPORT'`, etc.).
- Output generation that violates the `WORD_CAP = 150` limit or emits raw markdown code fences (` ``` `).
- False-positive task declines caused by uncalibrated regex pattern matching.
