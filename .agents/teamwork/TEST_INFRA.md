# E2E Test Infra: Brain Multi-Agent Runtime & Streaming Handoffs

## Test Philosophy
- Opaque-box, requirement-driven, derived from `ORIGINAL_REQUEST.md`.
- Verifies real behavior across all 10 specialized agents, streaming metrics, transit latency, guardrails, and failure recovery.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Combinatorial + Real-World Workload Testing.

## Feature Inventory & Test Coverage
| # | Feature | Source (Requirement) | Tier 1 (Min 5) | Tier 2 (Min 5) | Tier 3 (Pairwise) | Tier 4 (Scenario) |
|---|---------|----------------------|:--------------:|:--------------:|:-----------------:|:-----------------:|
| 1 | 10-Agent Collaborative Chain Order | R1, Acceptance Criteria | 5 | 5 | ✓ | ✓ |
| 2 | Upstream Context Propagation | R1 (Active consumption/building) | 5 | 5 | ✓ | ✓ |
| 3 | 4-Step Collaborative Prompting | R1 (Challenging & critique) | 5 | 5 | ✓ | ✓ |
| 4 | Three-Check Grok Bot Synthesis | R1 (Authoritative final synthesis) | 5 | 5 | ✓ | ✓ |
| 5 | Robust Verdict Extraction | R1, Acceptance Criteria | 5 | 5 | ✓ | ✓ |
| 6 | Enriched Handoff & Session Metrics | R2 (Word/token counts) | 5 | 5 | ✓ | ✓ |
| 7 | Real Transit Latency & TTFT Tracking | R2 (Transit latency & routing) | 5 | 5 | ✓ | ✓ |
| 8 | Batched Fan-in State Updates | R2 (Prevent rendering bottlenecks) | 5 | 5 | ✓ | ✓ |
| 9 | UI Auto-Scroll & Selector Optimization | R2 (Prevent streaming desync) | 5 | 5 | ✓ | ✓ |
| 10 | Distinct Specialty Guardrails | R3 (Preserve bot boundaries) | 5 | 5 | ✓ | ✓ |
| 11 | Historical Incomplete Stage Visibility | R3 (Explicit incomplete markings) | 5 | 5 | ✓ | ✓ |
| 12 | Robust Stage Error & Degradation | R3 (Graceful degradation) | 5 | 5 | ✓ | ✓ |
| 13 | Full Sequence Execution Without Dropping | Acceptance Criteria | 5 | 5 | ✓ | ✓ |
| 14 | Zero Secrets & Untouched RedMed | Acceptance Criteria, System Rules | 5 | 5 | ✓ | ✓ |

## Test Architecture
- Test runner: Vitest (`npm test` in `app/`) for unit, integration, and contract tests; Playwright (`npm run e2e` in `app/`) for browser and rendering tests.
- Invocation: `npm test` and `npm run e2e`.
- Verification Semantics: Strict exit code 0; zero format, lint, typecheck, or test failures.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Full 10-Agent Engineering Architecture Task | F1, F2, F3, F4, F5, F6, F7, F8, F9, F10, F13 | High |
| 2 | Mid-Chain Quota/Rate Limit Error with Autonomous Recovery | F1, F6, F8, F10, F11, F12, F13 | High |
| 3 | Negated Failure Linguistic Disambiguation ("Zero tests failed") | F4, F5, F10, F13 | Medium |
| 4 | High-Velocity Streaming Deltas & Auto-Scroll Retention | F6, F7, F8, F9 | High |
| 5 | Multi-Turn Historical Session Switching & Incomplete Inspection | F6, F9, F11, F12 | Medium |

## Coverage Thresholds
- Tier 1: ≥5 per feature
- Tier 2: ≥5 boundary & corner cases per feature
- Tier 3: Pairwise coverage of all agent-to-agent handoffs and failure intersections
- Tier 4: ≥5 realistic end-to-end application scenarios
