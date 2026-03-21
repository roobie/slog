# Phase 4: Packaging and Publishing - Research

**Researched:** 2026-03-21
**Domain:** npm packaging, JSR publishing, TypeScript source distribution, GitHub Actions CI
**Confidence:** HIGH (most findings verified against official docs and live tooling)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **No JS build step** — ship TypeScript source directly, no compiled JS artifacts
- Consumers use their own bundler/transpiler (modern tooling assumed)
- Package exports point directly to `.ts` files: `"exports": { ".": "./src/index.ts", "./hono": "./src/hono.ts" }`
- Remove `dist/` references from package.json, remove `outDir` from tsconfig
- No tsup, no build script needed
- JSR natively ships TS source — this aligns perfectly
- GitHub Actions for CI
- Tag-triggered publish: push `v1.0.0` tag → CI publishes to both npm and JSR
- Single workflow file: `.github/workflows/publish.yml`
- Atomic: if either registry rejects, the workflow fails
- Manual version bump: edit package.json version, tag, push
- CI also runs tests + `tsc --noEmit` + `attw` before publishing
- npm name: `@bjro/slog`
- JSR name: `@bjro/slog` (consistent across both registries)
- License: Apache 2.0 (explicit patent grant, superior to MIT)
- Add LICENSE file with Apache 2.0 text
- Update package.json: name, license, author fields
- Create `jsr.json` with name `@bjro/slog`, exports map matching package.json
- Audit all public API functions and add explicit return type annotations where missing
- Run `jsr publish --dry-run` to verify no slow types errors
- `hono` listed as JSR `peerDependency` equivalent
- `attw` (Are The Types Wrong?) in CI to verify exports resolve correctly
- Test under both `node16` and `bundler` moduleResolution
- `npx @arethetypeswrong/cli --pack` as CI step

### Claude's Discretion
- Exact GitHub Actions workflow syntax
- Which `attw` flags to use
- Whether to add a `prepublishOnly` script
- README content and structure

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PACK-01 | Zero runtime dependencies | Verified: package.json has no `dependencies` field. Keep it that way. |
| PACK-02 | ESM-only output (no CommonJS) | Verified: `"type": "module"` already set. attw `--ignore-rules cjs-resolves-to-esm` handles ESM-only warning. |
| PACK-03 | Subpath exports: `slog` (core), `slog/hono` (middleware) | Exports map structure fully researched. Both `.` and `./hono` entries needed. |
| PACK-04 | TypeScript declarations for all exports | Resolved: TS source IS the declaration for JSR; for npm, tsc `--emitDeclarationOnly` with `rewriteRelativeImportExtensions` unlocks emit. Alternatively, ship source as types directly. |
| PACK-05 | Published to npm registry | GitHub Actions + npm trusted publishing (OIDC). Requires `id-token: write`, npm >=11.5.1. |
| PACK-06 | Published to JSR registry | GitHub Actions + JSR OIDC (no token needed). Requires `id-token: write` + repo linked in JSR settings. |
| PACK-07 | Explicit return type annotations for JSR slow types compliance | All exported functions must have explicit return types. Internal helpers can infer. Key public API functions identified below. |
</phase_requirements>

---

## Summary

This phase is a configuration and annotation sprint — no new logic, no new source files. The work is: fix package.json exports to point at `src/`, fix tsconfig to remove the emit constraint, create jsr.json, add explicit return types to public API exports, configure GitHub Actions with dual-registry publish, and verify with attw.

The **critical risk** is the TS-source-only approach with attw. Research confirms: the TypeScript team does not recommend shipping `.ts` source to npm consumers (compiler option conflicts, outDir interference, skipLibCheck differences). However, attw version 0.18.2 checks TypeScript resolution via its own internal TS resolution — and when exports point to `.ts` files, attw will attempt to resolve them as types. This works under `bundler` moduleResolution but is likely to show `no-resolution` or type errors under `node16`. See the Critical Risk section for the recommended mitigation.

The **resolved path** for tsconfig: use `rewriteRelativeImportExtensions: true` (TS 5.7+, available in this project at TS 5.9.3) alongside `emitDeclarationOnly: true`. This lets tsc emit `.d.ts` files with correct `.js` sibling references, which attw can check normally. OR — keep full TS source approach and accept attw will only pass under `bundler` profile, ignoring `node16` warnings with `--ignore-rules`.

**Primary recommendation:** Use `emitDeclarationOnly` to emit `.d.ts` files into `dist/`, point npm exports' `types` condition at `dist/*.d.ts` and `import` condition at `src/*.ts`. This gives attw something concrete to check while keeping the no-compiled-JS promise. JSR gets raw `.ts` source as intended.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@arethetypeswrong/cli` | 0.18.2 (latest as of 2025-06-09) | Verify TypeScript type resolution under node16 and bundler | Industry-standard npm type audit tool |
| `jsr` (CLI) | 0.14.3 (latest as of 2026-03) | Publish to JSR registry, dry-run checks | Official JSR publish CLI |
| GitHub Actions | N/A | CI workflow for tag-triggered publish | Already decided |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `typescript` | 5.9.3 (already installed) | `--emitDeclarationOnly` to generate .d.ts for attw | Needed for type declarations |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `emitDeclarationOnly` + `.d.ts` | Pure TS source, no .d.ts | Simpler but attw won't pass cleanly under node16; TypeScript team discourages raw .ts in node_modules |
| npm OIDC trusted publishing | NPM_TOKEN secret | OIDC is more secure (no rotating tokens), GA as of July 2025, requires npm 11.5.1+ |
| `jsr publish` via `npx jsr` | `deno publish` | Same result; npx approach is idiomatic for Node/npm CI |

**Installation (CI packages, not runtime deps):**
```bash
# All used via npx in CI — no additional npm install needed
# attw: npx @arethetypeswrong/cli
# jsr: npx jsr publish
```

**Version verification (confirmed 2026-03-21):**
- `@arethetypeswrong/cli`: 0.18.2 (published 2025-06-09)
- `jsr`: 0.14.3

---

## Architecture Patterns

### Recommended Project Structure (after this phase)

```
slog/
├── src/
│   ├── index.ts          # Main barrel — stays as-is
│   ├── hono.ts           # Hono subpath — stays as-is
│   ├── types.ts
│   ├── logger.ts
│   ├── levels.ts
│   ├── plugins/
│   └── transports/
├── .github/
│   └── workflows/
│       └── publish.yml   # NEW: tag-triggered dual publish
├── jsr.json              # NEW: JSR package config
├── package.json          # MODIFIED: name, exports, files, license
├── tsconfig.json         # MODIFIED: remove outDir, add rewriteRelativeImportExtensions
├── LICENSE               # ALREADY EXISTS (Apache 2.0)
└── README.md             # MODIFIED: usage docs
```

### Pattern 1: package.json exports with dual `types`/`import` conditions

**What:** Point `types` condition at `.ts` source files directly. Modern bundlers (Vite, esbuild, webpack) with `bundler` moduleResolution understand this. `node16` consumers may not, but the project's target audience uses bundlers.

**When to use:** When shipping TS source to npm and wanting attw to at least pass under `bundler` profile.

**Example:**
```json
{
  "name": "@bjro/slog",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    },
    "./hono": {
      "types": "./src/hono.ts",
      "import": "./src/hono.ts"
    }
  },
  "files": ["src", "LICENSE", "README.md"],
  "license": "Apache-2.0"
}
```

**attw note:** Under `--profile node16`, attw will flag `cjs-resolves-to-esm` (ESM-only package). Ignore with `--ignore-rules cjs-resolves-to-esm`. Under `--profile bundler`, `.ts` exports resolve cleanly.

### Pattern 2: jsr.json for JSR publish

**What:** Mirrors package.json exports, pointing at `.ts` source. JSR natively handles TypeScript source. The `publish.exclude` keeps tests out of the tarball.

```json
{
  "name": "@bjro/slog",
  "version": "1.0.0",
  "exports": {
    ".": "./src/index.ts",
    "./hono": "./src/hono.ts"
  },
  "publish": {
    "include": ["src/**/*.ts", "LICENSE", "README.md", "jsr.json"],
    "exclude": ["**/*.test.ts"]
  }
}
```

JSR does not support `peerDependencies` in jsr.json natively — this is an npm concept. The CONTEXT.md note about "hono as JSR peerDependency equivalent" should be handled via documentation in README, not a jsr.json field. JSR's npm compatibility layer generates its own package.json from jsr.json and will propagate what it can.

### Pattern 3: tsconfig modifications for TS-source-only package

**What:** Remove `outDir` (no JS emission), add `rewriteRelativeImportExtensions` (required to unlock emission if needed), keep `noEmit: true` OR switch to `emitDeclarationOnly`.

**Key constraint:** `allowImportingTsExtensions` requires either `noEmit: true` OR `emitDeclarationOnly: true` to be set. The current tsconfig has neither — confirmed by running `tsc` which errors with TS5096. This must be fixed.

**Recommended tsconfig (TS-source approach):**
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "rewriteRelativeImportExtensions": true,
    "noEmit": true,
    "verbatimModuleSyntax": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": false,
    "declaration": false,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

Remove `outDir`, `rootDir`, `declaration: true`, `declarationMap: true`, `sourceMap: true` — these are all build-step artifacts. Add `noEmit: true`.

### Pattern 4: GitHub Actions publish workflow

**What:** Tag-triggered workflow that runs tests, tsc --noEmit, attw, then publishes to npm (OIDC) and JSR (OIDC).

```yaml
# Source: official JSR docs + npm trusted publishing docs
name: Publish

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write   # Required for both npm OIDC and JSR OIDC

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          registry-url: 'https://registry.npmjs.org'

      - run: npm ci

      - name: Type check
        run: npx tsc --noEmit

      - name: Test
        run: npm test

      - name: Check types (attw)
        run: npx @arethetypeswrong/cli --pack . --ignore-rules cjs-resolves-to-esm

      - name: Publish to npm
        run: npm publish --access public --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
          # OR: use npm trusted publishing (no NPM_TOKEN needed once configured)

      - name: Publish to JSR
        run: npx jsr publish --provenance
```

**npm OIDC trusted publishing prerequisite:** Must configure the package on npmjs.com under Settings > Trusted Publisher BEFORE first publish. Until that is configured, use `NPM_TOKEN` secret as fallback. npm trusted publishing requires npm 11.5.1+ (current CI will get this via `node: '22'` + npm update or by pinning `node: '24'`).

**JSR OIDC prerequisite:** Must link the GitHub repo on jsr.io package settings before the first publish. No token needed after linking.

**scoped npm packages:** `--access public` is required for first publish of a scoped package. Without it, npm defaults scoped packages to private.

### Pattern 5: attw invocation for ESM-only TS-source packages

```bash
# Full check under bundler profile (passes for TS-source packages)
npx @arethetypeswrong/cli --pack . --profile bundler

# With CJS warning suppressed for ESM-only packages
npx @arethetypeswrong/cli --pack . --ignore-rules cjs-resolves-to-esm

# JSON output for CI parsing
npx @arethetypeswrong/cli --pack . --format json --ignore-rules cjs-resolves-to-esm
```

### Anti-Patterns to Avoid

- **Putting tests and .planning/ in the published package:** The current `npm pack --dry-run` shows `.planning/` docs and `tests/` being included because there is no `files` field and `.gitignore` doesn't exclude them. Fix: add a `files` whitelist to package.json.
- **Using `dist/` paths in exports when dist/ doesn't exist:** Current package.json exports point at `dist/` which is gitignored and never built. This is the primary thing to fix.
- **Forgetting `--access public` on first npm publish:** Scoped packages default to private. CI will succeed but users can't install.
- **Committing npm tokens to the workflow:** Use OIDC trusted publishing or repository secrets, never hardcoded tokens.
- **Version mismatch between jsr.json and package.json:** Both files must have the same version. Manual sync is error-prone — the planner should make this explicit.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Type resolution verification | Custom script checking .d.ts paths | `@arethetypeswrong/cli` | Checks all 12 problem kinds across node10/node16/bundler resolutions |
| JSR slow types detection | Manual return type audit | `jsr publish --dry-run` | JSR's own validator reports exact slow type violations with file/line |
| Package file inclusion | Manual .npmignore maintenance | `files` whitelist in package.json | Whitelist is safer than blacklist; explicit is better |
| npm authentication | Custom token rotation | npm OIDC trusted publishing | No secrets to manage, provenance automatic |
| JSR authentication | API token management | JSR OIDC via GitHub Actions | Built-in, no token storage needed |

---

## Common Pitfalls

### Pitfall 1: `allowImportingTsExtensions` blocks tsc emit

**What goes wrong:** Running `tsc` (for build or CI type check with declaration emit) fails with `TS5096: Option 'allowImportingTsExtensions' can only be used when either 'noEmit' or 'emitDeclarationOnly' is set`.

**Why it happens:** The current tsconfig has `allowImportingTsExtensions: true` plus `declaration: true` but no `noEmit`. TypeScript enforces that `.ts` import extensions are not emittable to JS without either flag.

**How to avoid:** Add `"noEmit": true` and remove `declaration`, `declarationMap`, `sourceMap`, `outDir`, `rootDir` from tsconfig. The CI type check should use `tsc --noEmit`.

**Confirmed:** Running `npx tsc` in this project currently produces this error. Running `npx tsc --noEmit` passes cleanly.

### Pitfall 2: attw fails completely for TS-source exports under node16

**What goes wrong:** attw reports "No types" or "Resolution failed" for the package entrypoints because `.ts` files are not conventional type declaration files from the node16 perspective.

**Why it happens:** Under `--moduleResolution node16`, TypeScript expects type declarations at `.d.ts` files (not `.ts` source). Pointing exports directly at `.ts` works under `bundler` moduleResolution (used by Vite, esbuild) but not under strict node16 rules.

**How to avoid:** Use `--profile bundler` or `--ignore-rules cjs-resolves-to-esm` (for the ESM-only warning) when running attw. Accept that node16 consumers won't be supported — this is consistent with the project's "modern tooling assumed" decision. Document this limitation in README.

**Alternative:** Run `tsc --emitDeclarationOnly` as a pre-attw step to generate `.d.ts` files, point `types` condition in exports at `dist/*.d.ts`, run attw, then clean up dist. This gives a clean attw run under node16 but adds complexity.

### Pitfall 3: `.planning/` and `tests/` included in published package

**What goes wrong:** `npm pack --dry-run` shows 400KB+ of planning docs and test files being included because there is no `files` field and `npm warn gitignore-fallback` uses `.gitignore` which doesn't exclude `.planning/`.

**How to avoid:** Add `"files": ["src", "LICENSE", "README.md"]` to package.json. This whitelist is definitive — only these directories/files will be included regardless of `.gitignore` or `.npmignore`.

### Pitfall 4: JSR slow types on exported factory functions

**What goes wrong:** `jsr publish --dry-run` reports slow type errors on factory functions that return object literals without explicit return types.

**Why it happens:** JSR requires explicit return types on all exported symbols. Functions like `createConsoleTransport()` that return `{ write: ..., flush: ... }` must declare `Transport` as return type explicitly.

**How to avoid:** Audit all exported functions from `src/index.ts` and `src/hono.ts`. The following public API functions need explicit return type annotations verified against the `Plugin` and `Transport` interfaces defined in `src/types.ts`:
- `createLogger(options?: LoggerOptions): Logger` — already has return type
- `createConsoleTransport(): Transport` — already has return type
- `createPrettyTransport(): Transport` — needs verification
- `createHttpBatchTransport(...): Transport` — needs verification
- `createRoutedTransport(...): Transport` — needs verification
- `errorSerializer: Plugin` — const, not a function, JSR infers from type annotation on const
- `createRedactPlugin(...): Plugin` — needs verification (return type is the object `{ name, transform }`)
- `createLevelFilterPlugin(...): Plugin` — needs verification
- `createFieldEnrichPlugin(...): Plugin` — needs verification
- `atOrAboveLevel(...)`, `exactLevel(...)`, `belowLevel(...)` — return type is `(entry: LogEntry) => boolean`, needs explicit annotation
- `slogMiddleware(logger: Logger)` in `hono.ts` — return type is `MiddlewareHandler`, needs explicit annotation

**Warning signs:** `jsr publish --dry-run` will list each offending function with file path and line number.

### Pitfall 5: Version mismatch between package.json and jsr.json

**What goes wrong:** Publishing succeeds to one registry but fails the other because versions are out of sync.

**How to avoid:** Treat `package.json` as the version source of truth. The workflow should read version from package.json and assert `jsr.json` matches (or use a single jsr.json with `"version"` and script to sync). Alternatively, use a `prepublishOnly` script that validates both files have matching versions.

### Pitfall 6: Scoped npm package defaults to private

**What goes wrong:** `npm publish` for `@bjro/slog` succeeds (exit 0) but package is inaccessible to other users because it defaults to private for scoped packages.

**How to avoid:** Always pass `--access public` for the first publish of a scoped npm package. Can also set `"publishConfig": { "access": "public" }` in package.json to make this automatic.

### Pitfall 7: npm trusted publishing not configured before first CI run

**What goes wrong:** CI workflow runs with `id-token: write` but npm rejects the OIDC token with 403 because the trusted publisher is not configured in npmjs.com package settings.

**How to avoid:** Before merging the CI workflow, manually publish v1.0.0 once with an NPM_TOKEN secret OR configure trusted publishing on npmjs.com. The package must exist on npm before trusted publishing can be linked. The planner should include a Wave 0 manual step for this.

---

## Code Examples

### package.json — complete target state
```json
{
  "name": "@bjro/slog",
  "version": "1.0.0",
  "description": "A dead-simple structured logger for ECMAScript runtimes",
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    },
    "./hono": {
      "types": "./src/hono.ts",
      "import": "./src/hono.ts"
    }
  },
  "files": ["src", "LICENSE", "README.md"],
  "publishConfig": {
    "access": "public"
  },
  "peerDependencies": {
    "hono": ">=4.0.0"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "license": "Apache-2.0",
  "author": "bjro",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/roobie/slog.git"
  },
  "devDependencies": {
    "@types/node": "^25.5.0",
    "hono": "^4.12.8",
    "typescript": "^5.9.3",
    "vitest": "^4.1.0"
  }
}
```

### tsconfig.json — complete target state
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "verbatimModuleSyntax": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": false,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

Remove: `outDir`, `rootDir`, `declaration`, `declarationMap`, `sourceMap`.
Add: `noEmit: true`.

### jsr.json — complete target state
```json
{
  "name": "@bjro/slog",
  "version": "1.0.0",
  "exports": {
    ".": "./src/index.ts",
    "./hono": "./src/hono.ts"
  },
  "publish": {
    "include": ["src/**/*.ts", "LICENSE", "README.md", "jsr.json"],
    "exclude": ["**/*.test.ts"]
  }
}
```

### Explicit return type annotation pattern (for JSR slow types)
```typescript
// Source: JSR slow types docs — https://jsr.io/docs/about-slow-types
// Pattern: factory functions must declare return type explicitly

import type { Transport } from '../types.ts';

// BEFORE (inferred — slow type for JSR)
export function createConsoleTransport() {
  return { write: ..., flush: ... };
}

// AFTER (explicit — JSR compliant)
export function createConsoleTransport(): Transport {
  return { write: ..., flush: ... };
}
```

### attw CI invocation
```bash
# Run in CI after npm pack produces the tarball
npx @arethetypeswrong/cli --pack . --ignore-rules cjs-resolves-to-esm

# With explicit profile for bundler consumers
npx @arethetypeswrong/cli --pack . --profile bundler

# Exit code is non-zero on problems — CI will fail automatically
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Long-lived NPM_TOKEN in CI | npm OIDC trusted publishing | July 2025 (GA) | No secrets to rotate; provenance automatic |
| Compile to JS + .d.ts for npm | Ship TS source directly (bundler-only consumers) | 2023–2024 with bundler moduleResolution | Simpler but node16 consumers excluded |
| `npm publish` with manual token | `jsr publish` with OIDC | 2024 (JSR launch) | JSR uses OIDC natively, no token setup |
| `--profile strict` in attw | `--profile bundler` or `--ignore-rules` for ESM-only | 2023+ | ESM-only packages need rule suppression |

**Deprecated/outdated:**
- `"main"` and `"types"` top-level fields: replaced by `"exports"` map with conditions. attw flags packages that use only top-level `types` without exports conditions.
- `"module"` field: Bundler-specific, not standard. Not needed here.

---

## Open Questions

1. **Will attw pass cleanly for `.ts`-only exports under `bundler` profile?**
   - What we know: attw resolves types via internal TypeScript resolution. Under `bundler` moduleResolution, `.ts` files are valid module extensions. Under `node16`, they are not.
   - What's unclear: attw may report "no types" for `.ts` entries even under `bundler` because `.ts` is not a `.d.ts` file.
   - Recommendation: The planner should include a spike task: run `npx @arethetypeswrong/cli --pack . --profile bundler` after applying package.json changes and check the output. If it errors, switch to `emitDeclarationOnly` strategy.

2. **JSR `peerDependencies` for hono**
   - What we know: `jsr.json` does not support `peerDependencies` as a native field.
   - What's unclear: Whether JSR's npm compatibility layer picks up peerDependencies from `package.json` if both files coexist.
   - Recommendation: Keep `peerDependencies` in `package.json` (which is included in the npm publish). Document in README that JSR users need to have hono installed separately.

3. **npm trusted publishing vs NPM_TOKEN for first publish**
   - What we know: Trusted publishing must be configured on npmjs.com before CI can use it. The package must exist on npm first OR the trusted publisher configuration must be done before any publish.
   - What's unclear: Whether trusted publishing can be configured before the package exists (for brand new packages).
   - Recommendation: The planner should include a manual prerequisite step: create the npm package scope (`@bjro`) and configure trusted publisher on npmjs.com before merging the CI workflow. Until then, use `NPM_TOKEN` as a secret.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- --reporter=verbose 2>&1 \| tail -5` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

This phase is primarily configuration work (package.json, tsconfig, jsr.json, CI workflow). The "tests" are tool invocations, not Vitest unit tests.

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PACK-01 | Zero runtime dependencies | smoke | `node -e "const p=require('./package.json'); console.assert(!p.dependencies, 'has deps')"` | ✅ package.json |
| PACK-02 | ESM-only output | tool | `npx @arethetypeswrong/cli --pack . --ignore-rules cjs-resolves-to-esm` | ✅ package.json |
| PACK-03 | Subpath exports present | smoke | `node -e "const p=require('./package.json'); console.assert(p.exports['.'] && p.exports['./hono'])"` | ✅ package.json |
| PACK-04 | TypeScript declarations resolve | tool | `npx @arethetypeswrong/cli --pack . --profile bundler` | ✅ package.json |
| PACK-05 | npm publish (CI) | manual | CI workflow runs on tag push | ❌ Wave 0 |
| PACK-06 | JSR publish (CI) | manual | CI workflow runs on tag push | ❌ Wave 0 |
| PACK-07 | No JSR slow types | tool | `npx jsr publish --dry-run` | ❌ Wave 0 (needs jsr.json) |

### Sampling Rate
- **Per task commit:** `npm test && npx tsc --noEmit`
- **Per wave merge:** `npm test && npx tsc --noEmit && npx @arethetypeswrong/cli --pack . --ignore-rules cjs-resolves-to-esm`
- **Phase gate:** All three commands green + `npx jsr publish --dry-run` passes

### Wave 0 Gaps
- [ ] `.github/workflows/publish.yml` — CI workflow for PACK-05 and PACK-06
- [ ] `jsr.json` — required for PACK-06 and PACK-07 verification
- Manual prerequisite: npm scope `@bjro` must exist, trusted publisher configured on npmjs.com OR `NPM_TOKEN` secret added to GitHub repo

---

## Sources

### Primary (HIGH confidence)
- `npx @arethetypeswrong/cli --help` (v0.18.2) — all flags, ignore-rules, profiles verified live
- `npx tsc` in project — confirmed TS5096 error with current tsconfig
- `npx tsc --noEmit` in project — confirmed passes cleanly
- `npm pack --dry-run` in project — confirmed test files and .planning/ are included without `files` field
- https://jsr.io/docs/about-slow-types — JSR slow types requirements
- https://jsr.io/docs/publishing-packages — JSR jsr.json format and OIDC workflow
- https://jsr.io/docs/npm-compatibility — JSR generates .d.ts + .js tarballs for npm compat
- https://devblogs.microsoft.com/typescript/announcing-typescript-5-7/ — rewriteRelativeImportExtensions
- `npm view @arethetypeswrong/cli version` → 0.18.2 (2025-06-09)
- `npm view jsr version` → 0.14.3

### Secondary (MEDIUM confidence)
- https://philna.sh/blog/2026/01/28/trusted-publishing-npm/ — npm trusted publishing requirements, Node 24 + npm 11.5.1+
- https://remarkablemark.org/blog/2025/12/19/npm-trusted-publishing/ — `--access public` + `--provenance` flags
- https://dev.to/fabon/publish-pure-esm-npm-package-written-in-typescript-to-jsr-4ih2 — jsr.json publish.include pattern, jsr.json must be in include list
- https://github.com/honojs/hono/blob/main/jsr.json — reference jsr.json from a major real-world package

### Tertiary (LOW confidence)
- https://github.com/microsoft/TypeScript/issues/12358 — TypeScript team guidance "don't ship .ts to node_modules" (issue is old but still valid)
- attw behavior with `.ts`-only exports under node16 profile — not directly documented; inferred from tool's TypeScript resolution behavior

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions confirmed via npm registry live check
- Architecture (package.json, jsr.json): HIGH — verified against official docs
- tsconfig changes: HIGH — confirmed by running tsc in the project
- attw behavior with TS source: MEDIUM — behavior under `bundler` profile inferred from docs; behavior under `node16` for `.ts` exports uncertain
- CI workflow syntax: MEDIUM — based on official GitHub Actions docs and verified examples
- npm trusted publishing: HIGH — GA since July 2025, requirements confirmed

**Research date:** 2026-03-21
**Valid until:** 2026-06-21 (90 days — npm trusted publishing is GA, JSR OIDC is stable)
