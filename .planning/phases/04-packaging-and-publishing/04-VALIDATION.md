---
phase: 4
slug: packaging-and-publishing
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-21
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x + tooling (attw, jsr, tsc) |
| **Config file** | `vitest.config.ts` (exists) |
| **Quick run command** | `npm test && npx tsc --noEmit` |
| **Full suite command** | `npm test && npx tsc --noEmit && npx @arethetypeswrong/cli --pack . --ignore-rules cjs-resolves-to-esm` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test && npx tsc --noEmit`
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite + `npx jsr publish --dry-run` must pass
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | PACK-01 | smoke | `node -e "const p=require('./package.json'); console.assert(!p.dependencies)"` | ✅ | ⬜ pending |
| 04-01-02 | 01 | 1 | PACK-02 | tool | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 04-01-03 | 01 | 1 | PACK-03 | smoke | `node -e "const p=require('./package.json'); console.assert(p.exports['.'] && p.exports['./hono'])"` | ✅ | ⬜ pending |
| 04-01-04 | 01 | 1 | PACK-04 | tool | `npx @arethetypeswrong/cli --pack . --ignore-rules cjs-resolves-to-esm` | ✅ | ⬜ pending |
| 04-01-05 | 01 | 1 | PACK-07 | tool | `npx jsr publish --dry-run` | Wave 0 | ⬜ pending |
| 04-02-01 | 02 | 2 | PACK-05 | file check | `test -f .github/workflows/publish.yml` | Wave 0 | ⬜ pending |
| 04-02-02 | 02 | 2 | PACK-06 | file check | `grep "jsr publish" .github/workflows/publish.yml` | Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `jsr.json` — required for PACK-06 and PACK-07
- [ ] `.github/workflows/publish.yml` — CI workflow for PACK-05 and PACK-06
- [ ] Install `@arethetypeswrong/cli` as devDependency
- [ ] Manual: npm scope `@bjro` configured, trusted publisher or NPM_TOKEN secret

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| npm publish succeeds | PACK-05 | Requires registry auth + tag push | Push v0.1.0 tag, verify on npmjs.com |
| JSR publish succeeds | PACK-06 | Requires registry auth + tag push | Push v0.1.0 tag, verify on jsr.io |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
