---
phase: 1
slug: core-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-21
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 |
| **Config file** | `vitest.config.ts` — Wave 0 creates this |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 0 | CORE-01 | unit | `npx vitest run tests/logger.test.ts -t "log levels"` | Wave 0 | ⬜ pending |
| 01-01-02 | 01 | 0 | CORE-02 | unit | `npx vitest run tests/logger.test.ts -t "level gate"` | Wave 0 | ⬜ pending |
| 01-01-03 | 01 | 0 | CORE-03 | unit | `npx vitest run tests/logger.test.ts -t "object-only api"` | Wave 0 | ⬜ pending |
| 01-01-04 | 01 | 0 | CORE-04 | unit | `npx vitest run tests/logger.test.ts -t "entry schema"` | Wave 0 | ⬜ pending |
| 01-01-05 | 01 | 0 | CORE-05 | unit | `npx vitest run tests/logger.test.ts -t "withContext"` | Wave 0 | ⬜ pending |
| 01-01-06 | 01 | 0 | CORE-06 | unit | `npx vitest run tests/logger.test.ts -t "configurable level"` | Wave 0 | ⬜ pending |
| 01-01-07 | 01 | 0 | CORE-07 | unit | `npx vitest run tests/logger.test.ts -t "zero-config"` | Wave 0 | ⬜ pending |
| 01-02-01 | 02 | 1 | PLUG-01 | unit | `npx vitest run tests/plugins/pipeline.test.ts` | Wave 0 | ⬜ pending |
| 01-02-02 | 02 | 1 | PLUG-02 | unit | `npx vitest run tests/plugins/pipeline.test.ts -t "null drops"` | Wave 0 | ⬜ pending |
| 01-02-03 | 02 | 1 | PLUG-03 | unit | `npx vitest run tests/plugins/errorSerializer.test.ts` | Wave 0 | ⬜ pending |
| 01-02-04 | 02 | 1 | PLUG-04 | unit | `npx vitest run tests/plugins/redact.test.ts` | Wave 0 | ⬜ pending |
| 01-02-05 | 02 | 1 | PLUG-05 | unit | `npx vitest run tests/plugins/levelFilter.test.ts` | Wave 0 | ⬜ pending |
| 01-02-06 | 02 | 1 | PLUG-06 | unit | `npx vitest run tests/plugins/fieldEnrich.test.ts` | Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `package.json` — npm init with TypeScript + Vitest dev dependencies
- [ ] `tsconfig.json` — TypeScript config with `verbatimModuleSyntax`, `strict`, `ESNext` target
- [ ] `vitest.config.ts` — minimal Vitest config pointing at `tests/`
- [ ] `tests/logger.test.ts` — stubs for CORE-01 through CORE-07
- [ ] `tests/plugins/pipeline.test.ts` — stubs for PLUG-01, PLUG-02
- [ ] `tests/plugins/errorSerializer.test.ts` — stubs for PLUG-03
- [ ] `tests/plugins/redact.test.ts` — stubs for PLUG-04
- [ ] `tests/plugins/levelFilter.test.ts` — stubs for PLUG-05
- [ ] `tests/plugins/fieldEnrich.test.ts` — stubs for PLUG-06
- [ ] Framework install: `npm install --save-dev typescript vitest @types/node`

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
