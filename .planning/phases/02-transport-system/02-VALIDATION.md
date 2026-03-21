---
phase: 2
slug: transport-system
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-21
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 |
| **Config file** | `vitest.config.ts` (exists from Phase 1) |
| **Quick run command** | `npx vitest run tests/transports/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/transports/`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | TRAN-01 | unit | `npx vitest run tests/transports/` | Wave 0 | ⬜ pending |
| 02-01-02 | 01 | 1 | TRAN-02 | unit | `npx vitest run tests/transports/console.test.ts` | Wave 0 | ⬜ pending |
| 02-01-03 | 01 | 1 | TRAN-03 | unit | `npx vitest run tests/transports/pretty.test.ts` | Wave 0 | ⬜ pending |
| 02-01-04 | 01 | 1 | TRAN-05 | unit | `npx vitest run tests/transports/routed.test.ts` | Wave 0 | ⬜ pending |
| 02-02-01 | 02 | 2 | TRAN-04 | unit | `npx vitest run tests/transports/http.test.ts` | Wave 0 | ⬜ pending |
| 02-02-02 | 02 | 2 | TRAN-06 | integration | `npx vitest run tests/transports/` | Wave 0 | ⬜ pending |
| 02-02-03 | 02 | 2 | TRAN-07 | integration | `npx vitest run tests/transports/` | Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/transports/console.test.ts` — stubs for TRAN-02
- [ ] `tests/transports/pretty.test.ts` — stubs for TRAN-03
- [ ] `tests/transports/http.test.ts` — stubs for TRAN-04
- [ ] `tests/transports/routed.test.ts` — stubs for TRAN-05
- [ ] `tests/transports/integration.test.ts` — stubs for TRAN-06, TRAN-07

*Existing infrastructure covers test framework and config.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
