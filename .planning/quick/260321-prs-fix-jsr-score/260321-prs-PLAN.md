---
phase: quick
plan: 260321-prs
type: execute
wave: 1
depends_on: []
files_modified:
  - jsr.json
  - src/types.ts
  - src/index.ts
  - src/hono.ts
  - src/plugins/errorSerializer.ts
  - src/plugins/redact.ts
  - src/plugins/levelFilter.ts
  - src/plugins/fieldEnrich.ts
  - src/transports/console.ts
  - src/transports/pretty.ts
  - src/transports/http.ts
  - src/transports/routed.ts
  - .github/workflows/publish.yml
autonomous: true
requirements: []
must_haves:
  truths:
    - "All exported symbols have JSDoc with description, @param, and @returns"
    - "Both entrypoints (src/index.ts, src/hono.ts) have @module doc comments"
    - "jsr.json has description field and all four runtimes marked compatible"
    - "CI validates tests pass on Bun and Deno in addition to Node.js"
  artifacts:
    - path: "jsr.json"
      provides: "JSR metadata with description and runtime compat"
      contains: "description"
    - path: "src/index.ts"
      provides: "Module-level JSDoc"
      contains: "@module"
    - path: "src/hono.ts"
      provides: "Module-level JSDoc and symbol JSDoc"
      contains: "@module"
    - path: ".github/workflows/publish.yml"
      provides: "Bun and Deno test jobs"
      contains: "bun test"
  key_links:
    - from: "jsr.json"
      to: "JSR score page"
      via: "description field presence"
      pattern: "\"description\""
    - from: "src/**/*.ts"
      to: "JSR score page"
      via: "JSDoc on exported symbols"
      pattern: "/\\*\\*"
---

<objective>
Fix all missing JSR score items to maximize the score from 52% toward 100%.

Purpose: JSR scores packages on documentation (JSDoc on exported symbols, module docs), metadata (description, runtime compat), and best practices. Currently at 52% due to missing docs and metadata.

Output: Fully documented public API, complete jsr.json metadata, CI runtime validation for Bun and Deno.
</objective>

<execution_context>
@/home/jani/.claude/get-shit-done/workflows/execute-plan.md
@/home/jani/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@jsr.json
@src/index.ts
@src/hono.ts
@src/types.ts
@src/plugins/errorSerializer.ts
@src/plugins/redact.ts
@src/plugins/levelFilter.ts
@src/plugins/fieldEnrich.ts
@src/transports/console.ts
@src/transports/pretty.ts
@src/transports/http.ts
@src/transports/routed.ts
@.github/workflows/publish.yml
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add JSDoc to all exported symbols and module docs to entrypoints</name>
  <files>src/types.ts, src/index.ts, src/hono.ts, src/plugins/errorSerializer.ts, src/plugins/redact.ts, src/plugins/levelFilter.ts, src/plugins/fieldEnrich.ts, src/transports/console.ts, src/transports/pretty.ts, src/transports/http.ts, src/transports/routed.ts</files>
  <action>
Add JSDoc comments to every exported symbol across the public API. Brief description + @param + @returns where applicable. No @example blocks needed.

**Entrypoint module docs** (must be the FIRST comment in each file, before any imports):

- `src/index.ts`: Add `/** @module slog — Structured logging for every JavaScript runtime. */` as the very first line.
- `src/hono.ts`: Add `/** @module slog/hono — Hono middleware for per-request structured logging. */` as the very first line.

**src/types.ts** — Add JSDoc to each exported type/interface and their members:
- `LogLevel`: "Severity levels from least to most severe."
- `LogEntry`: "A structured log record produced by the logger." Document each field (level, timestamp, message, context, data).
- `Plugin`: "Transforms or filters log entries before they reach transports." Document `name` and `transform`.
- `Transport`: "Delivers log entries to an output destination." Document `write` and `flush`.
- `Logger`: "Structured logger supporting leveled methods, child contexts, and flush." Document each method.
- `LoggerOptions`: "Configuration for createLogger()." Document each field.

**src/plugins/errorSerializer.ts** — `errorSerializer` constant:
- `/** Plugin that serializes Error instances in the `error` and `err` data fields into plain objects with name, message, and stack properties. */`

**src/plugins/redact.ts** — `createRedactPlugin`:
- Description: Creates a plugin that replaces values of matching data keys with `[REDACTED]`.
- @param patterns — Array of exact key strings or RegExp patterns to match against data field keys.
- @returns A Plugin that redacts matched fields.

**src/plugins/levelFilter.ts** — `createLevelFilterPlugin`:
- Description: Creates a plugin that drops log entries below the specified minimum severity level.
- @param minLevel — Minimum log level to allow through.
- @returns A Plugin that filters entries below minLevel.

**src/plugins/fieldEnrich.ts** — `createFieldEnrichPlugin`:
- Description: Creates a plugin that merges static fields into every log entry's data.
- @param fields — Key-value pairs to add to each entry. Snapshot is taken at creation time.
- @returns A Plugin that enriches entries with the provided fields.

**src/transports/console.ts** — `createConsoleTransport`:
- Description: Creates a transport that writes JSON-serialized log entries to the console using level-appropriate methods.
- @returns A Transport that writes NDJSON to console.

**src/transports/pretty.ts** — `PrettyTransportConfig` interface and `createPrettyTransport`:
- `PrettyTransportConfig`: "Configuration for the pretty-print transport." Document `maxValueLength`.
- `createPrettyTransport`: Creates a transport that writes colorized, human-readable log output to the console.
- @param config — Optional pretty-print configuration.
- @returns A Transport that writes human-readable output.

**src/transports/http.ts** — `HttpBatchTransportConfig` interface and `createHttpBatchTransport`:
- `HttpBatchTransportConfig`: "Configuration for the HTTP batch transport." Document `url`, `headers`, `flushInterval`.
- `createHttpBatchTransport`: Creates a transport that buffers entries in memory and sends them as NDJSON batches via HTTP POST on flush.
- @param config — HTTP batch transport configuration.
- @returns A Transport that batches and sends entries over HTTP.

**src/transports/routed.ts** — `TransportRoute` interface, `createRoutedTransport`, `atOrAboveLevel`, `exactLevel`, `belowLevel`:
- `TransportRoute`: "A predicate-transport pair for routing log entries." Document `predicate` and `transport`.
- `createRoutedTransport`: Creates a transport that routes each entry to transports whose predicates match.
- @param routes — Array of predicate-transport pairs.
- @returns A Transport that routes entries by predicate.
- `atOrAboveLevel`: Creates a predicate that matches entries at or above the given severity level. @param level @returns predicate function.
- `exactLevel`: Creates a predicate that matches entries at exactly the given severity level. @param level @returns predicate function.
- `belowLevel`: Creates a predicate that matches entries below the given severity level. @param level @returns predicate function.

**src/index.ts** — `createLogger` is re-exported but defined in `src/logger.ts`. Check if `src/logger.ts` already has JSDoc. If not, add JSDoc there:
- Description: Creates a new structured logger instance.
- @param options — Logger configuration (level, plugins, transports, context).
- @returns A Logger instance.

Also add JSDoc to the `LOG_LEVELS` export in `src/levels.ts` if it lacks one:
- "Numeric severity values for each log level, used for level comparisons."

IMPORTANT: Do NOT change any runtime behavior. Only add JSDoc comments.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npm test</automated>
  </verify>
  <done>Every exported symbol across src/types.ts, all plugin files, all transport files, src/hono.ts, and re-exported symbols from src/index.ts has a JSDoc comment with description and @param/@returns where applicable. Both entrypoints have @module comments as their first line.</done>
</task>

<task type="auto">
  <name>Task 2: Update jsr.json metadata and add Bun/Deno CI test jobs</name>
  <files>jsr.json, .github/workflows/publish.yml</files>
  <action>
**jsr.json changes:**

Add `description` field and runtime compatibility. The final jsr.json should look like:

```json
{
  "name": "@bjro/slog",
  "version": "1.0.2",
  "description": "Structured logging for every JavaScript runtime — zero config, pluggable transports, Hono middleware.",
  "exports": {
    ".": "./src/index.ts",
    "./hono": "./src/hono.ts"
  },
  "publish": {
    "include": [
      "src/**/*.ts",
      "LICENSE",
      "README.md",
      "jsr.json"
    ],
    "exclude": [
      "**/*.test.ts"
    ]
  }
}
```

Note: JSR runtime compatibility is typically inferred or set on the JSR dashboard. If jsr.json supports a `runtimes` field, add it as: `"runtimes": ["node", "deno", "bun", "workerd"]`. If not a valid field, skip it — the CI jobs below prove runtime compat.

**CI workflow changes (.github/workflows/publish.yml):**

Add two new test jobs that run BEFORE the publish jobs. These validate that tests pass on Bun and Deno, proving runtime compatibility claims.

Add a `test-bun` job:
```yaml
  test-bun:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun test
```

Add a `test-deno` job:
```yaml
  test-deno:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - run: deno run -A npm:vitest run
```

Update the `npm` and `jsr` publish jobs to depend on ALL three test jobs:
```yaml
  npm:
    needs: [test, test-bun, test-deno]
```
```yaml
  jsr:
    needs: [test, test-bun, test-deno]
```

This ensures publish only happens after all runtimes pass.
  </action>
  <verify>
    <automated>python3 -c "import json; d=json.load(open('jsr.json')); assert 'description' in d, 'missing description'" && grep -q 'test-bun' .github/workflows/publish.yml && grep -q 'test-deno' .github/workflows/publish.yml && grep -q 'deno run -A npm:vitest' .github/workflows/publish.yml</automated>
  </verify>
  <done>jsr.json has a description field. CI workflow has test-bun and test-deno jobs that run before publish. Both publish jobs depend on all three test jobs passing.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes — JSDoc additions did not break types
2. `npm test` passes — no runtime behavior changed
3. `jsr.json` contains `description` field
4. `.github/workflows/publish.yml` contains `test-bun` and `test-deno` jobs
5. Every exported symbol in `src/` has a `/**` JSDoc comment
6. Both `src/index.ts` and `src/hono.ts` start with `/** @module` comments
</verification>

<success_criteria>
- All exported types, interfaces, functions, and constants have JSDoc with description + @param/@returns
- Both entrypoints have @module doc comments
- jsr.json has description field
- CI workflow validates Bun and Deno runtime compatibility before publish
- All existing tests still pass, no runtime behavior changes
</success_criteria>

<output>
After completion, create `.planning/quick/260321-prs-fix-jsr-score/260321-prs-SUMMARY.md`
</output>
