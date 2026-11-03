# Mobile layout and shared-agent handoff — 2026-11-03

## Overview & Request
Automatically fit phone and tablet screens, minimize top/bottom spacing without losing controls, and preserve Brain/Nodes memory and safe handoffs between agents.

## What Changed & Why
- `app/src/compact.css`: override the late-loading desktop grid on narrow screens. Portrait stacks the 3D brain and chat inside the device height; landscape uses side-by-side panels. Chat-hidden fills the screen. Settings, agent cards, and memory pages fit small displays. Toolbar buttons remain usable. Safe-area spacing accommodates phone cutouts.
- Existing automatic Dream memory and repository sync in `Home.tsx` remain intact. This task does **not** copy private ChatGPT memory into the public repository or claim that agents share live private context.

## Files Touched
- `app/src/compact.css`
- `.agents/skills/team-handoff/MOBILE-HANDOFF-2026-11-03.md`

## Checks & Real Results
- GitHub branch created from `main` and CSS change committed.
- Source inspection confirmed `app/index.html` already has `width=device-width, initial-scale=1`.
- Automated checks and live-device/browser checks: **NOT RUN** (GitHub connector does not execute npm or browser tests).
- Required before merge: `cd app && npm run format && npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`.
- Confirm phone portrait/landscape, chat hidden, settings, scroll, and keyboard/composer on iOS and Android. Confirm production root `index.html` is rebuilt for GitHub Pages.

## How the Next AI Should Check It
1. Verify no other agent or sub-agent has active work on these files; inspect open PRs and branches.
2. Fetch this branch, inspect CSS diff, and run all six checks above.
3. Verify narrow 320/375/390/430px viewports and landscape; ensure no controls overlap.
4. Rebuild and include generated root `index.html` only after checks pass.

## Git State
Branch: `fix/mobile-auto-layout-handoff-20261103`; base: `main`. **Awaiting independent verification and Director approval.** Do not merge unverified changes.

## Durable shared memory and ownership protocol
- Before every edit: identify active task owner, agents and sub-agents, affected files, branch, and review status. No overlapping edits or merge while predecessor is active.
- Write task memory to versioned, non-secret repo notes: task objective, decisions, references, changed files, tests with actual results, blockers, and next owner. Do not store API keys, tokens, or personal chat memory.
- One writer owns each file at a time. Handoff only after the owner confirms all sub-agents have finished; receiving agent acknowledges before changing files.
- Preserve existing team order: Claude build; Cursor integration; Gemini, ChatGPT, Muse independent review; Director and security signoff before merge.
- Ask Gemini for its actual handoff process when Gemini is available; **no Gemini conversation has occurred in this task**. Until then, use this common task-packet approach across providers.
- Handoff state: `READY_FOR_TESTING` (not approved, not deployed). Next owner: available reviewer/maintainer; first action: run checks and verify mobile behavior.
