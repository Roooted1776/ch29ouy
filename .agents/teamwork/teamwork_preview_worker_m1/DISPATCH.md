## 2026-11-02T09:12:40Z
[Message] timestamp=2026-11-02T09:12:40Z sender=d8106e50-8d34-4bff-8263-21cf982431cb priority=MESSAGE_PRIORITY_HIGH content=You are Worker 1 (Implementation Worker for Milestone 1 - Multi-Agent Collaborative Flow & Grok Bot Synthesis).
Working Directory: /Users/claude/Projects/Brain/Nodes/.agents/teamwork/teamwork_preview_worker_m1
Original Request: /Users/claude/Projects/Brain/Nodes/.agents/teamwork/ORIGINAL_REQUEST.md
Project Plan: /Users/claude/Projects/Brain/Nodes/.agents/teamwork/PROJECT.md
Explorer Findings: /Users/claude/Projects/Brain/Nodes/.agents/teamwork/teamwork_preview_explorer_survey_1/handoff.md

MANDATORY FIRST STEP: Read /Users/claude/Projects/Brain/Nodes/.agents/teamwork/ORIGINAL_REQUEST.md in full before starting your work.
Then read the Explorer findings at /Users/claude/Projects/Brain/Nodes/.agents/teamwork/teamwork_preview_explorer_survey_1/handoff.md and /Users/claude/Projects/Brain/Nodes/.agents/teamwork/PROJECT.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your File Ownership (Exclusive):
- `app/src/lib/chain.ts`
- `app/src/data/team.ts`
- `app/src/lib/run-task.ts`
- `app/src/lib/approval.ts`
- `app/test/chain.test.ts`
- `app/test/team.test.ts`
DO NOT edit files outside this scope. Do NOT touch RedMed. Zero secrets/keys in files. Never git push.

Your Tasks:
1. Implement Upstream Chain Digest in `app/src/lib/chain.ts`:
   - Propagate upstream milestone contributions (Gemini context, Muse audit, Claude builder proposal, and preceding specialist notes) so intermediate agents (Cursor, Copilot, Perplexity, Grok, Xcode) have full visibility into requirements and architecture.
   - Maintain compatibility: keep `incoming` containing `previous` (preserving `test/chain.test.ts` invariants).
2. Enhance Collaborative Reasoning Directives in `app/src/data/team.ts` (`stagePrompt`):
   - Replace generic banter with a 4-step collaborative protocol:
     a. Critique & Acknowledge: explicitly cite and endorse/challenge/refine predecessor's assertions.
     b. Specialty Advance: apply domain lens to advance the deliverable.
     c. Risk / Edge Case Audit: surface new risks, missing checks, or constraints.
     d. Direct Handoff: direct the next specialist on what to inspect.
   - Keep within the 150-word cap and preserve tone rules, `HANDOFF_RULE`, and required test substrings (`'HANDOFF FROM <Name>'`, `'FINAL SITUATION REPORT'`). No code blocks (no markdown fences).
3. Authoritative Three-Check Grok Bot Synthesis Schema in `app/src/data/team.ts`:
   - For `grokbot`, structure the prompt to synthesize Check 1 (Gemini), Check 2 (Muse), and Check 3 (Collective), resolve conflicts, and output an explicit authoritative decision.
4. Robust Verdict Extraction in `app/src/lib/run-task.ts` and `app/src/lib/approval.ts`:
   - Replace naive keyword matching that false-declined on "no tests failed" or "zero checks failed". Match structured decisions `/(?:DECISION|VERDICT|RECOMMENDATION):\s*(PASS|FAIL|DECLINE|BLOCKED)/i` while ignoring negated failure phrases. If any stage has `s === 'failed'` or `result.failed.length > 0`, always decline.
5. Verification:
   - In `app/`: run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
   - Update tests in `app/test/chain.test.ts` and `app/test/team.test.ts` if needed to assert these invariants.
6. Write your complete handoff report to:
   `/Users/claude/Projects/Brain/Nodes/.agents/teamwork/teamwork_preview_worker_m1/handoff.md`
   Update your progress.md periodically. Send a message to your parent upon completion.
