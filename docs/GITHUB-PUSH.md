# GitHub push on ch29ouy

Owner deploy rule: work lands on `main`; GitHub Pages publishes from `main` `/`.

## Why Push disappears / fails

Repo ruleset **Protect main** (`ruleset id 26272557`, created 2026-10-31) is active on the default branch and requires a pull request before any update. Bypass is set to **never**, so even Owner cannot push straight to `main`. GitHub then offers **Propose changes** / PR flows instead of a normal Push / Commit-to-main option. Cursor Source Control matches that: direct push to `main` is rejected.

Feature branches still push fine. Cloud Agents can push `cursor/…` branches and open PRs.

## Owner fix (one minute, must be signed in as Roooted1776)

1. Open https://github.com/Roooted1776/ch29ouy/rules/26272557
2. Prefer **Delete ruleset** (clearest for main-only Pages), or edit and turn off **Require a pull request before merging**.
3. Optional: if you keep the ruleset, add a bypass for repository admin so Owner can still push.
4. Confirm at https://github.com/Roooted1776/ch29ouy/rules that nothing still forces PRs on `main`.

Only **Roooted1776** can change rulesets. The Cursor GitHub App (`cursor[bot]`) can push branches and open PRs but cannot edit rulesets (API 403).

## After the fix

- Owner: push / merge to `main` again; Pages redeploys from that commit.
- Agents: still open a branch + PR for review unless Owner explicitly says to land on `main`.
