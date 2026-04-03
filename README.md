# exploratory-testing-plugin

Claude Code Plugin for risk-driven manual exploratory testing after implementation.

## Runtime choices

- Primary runtime: Bun
- Compatibility target: Node.js 20+
- Test runner: Vitest
- Lint / format: Biome

This repository is optimized for `bun`, but the code should stay close to standard Node-compatible TypeScript unless there is a clear payoff.

## Verified local prerequisites

Validated in this workspace on 2026-03-31 with:

- Bun `1.3.5`
- Node.js `v20.19.0`
- GitHub CLI `2.74.1`
- Git `2.39.3`
- SQLite `3.43.2`

## Required tools

- `bun`
- `gh`
- `git`

## Optional tools

- `node`
- `glab`
- `sqlite3`

## Setup

1. Authenticate GitHub CLI.
2. Install dependencies.
3. Run the environment doctor.
4. Run tests and type checks.

```bash
gh auth status
bun install
bun run doctor
bun run test
bun run typecheck
```

## Available scripts

```bash
bun run doctor
bun run dev --help
bun run dev setup
bun run dev db init
bun run dev progress summary
bun run test
bun run test:watch
bun run typecheck
bun run lint
bun run format
bun run check
```

## Environment notes

- Prefer `gh auth` over raw tokens when possible.
- Keep secrets out of `config.json`; use environment variables only for auth or external integrations.
- `setup` writes relative paths to `config.json` and resolves them to absolute paths at the CLI boundary.
- Workspace state is persisted in both markdown progress files and a local SQLite database.
- The production DB path uses Bun's SQLite support; the Vitest shim uses `sqlite3` when tests run under Node-compatible workers.

## Proposed libraries

- `cac`: small CLI definition
- `valibot`: runtime validation for config and JSON I/O
- `execa`: subprocess wrapper for `gh`, `git`, `glab`
- `gray-matter`: markdown frontmatter parsing
- `tinyglobby`: file discovery for tests, stories, fixtures
- `vitest`: unit and integration tests
- `@biomejs/biome`: lint and format

## Current repository layout

```text
.
├── .claude-plugin/
├── .exploratory-testing/
├── skills/
├── src/
│   └── exploratory-testing/
│       ├── cli/
│       ├── config/
│       ├── db/
│       ├── models/
│       └── tools/
├── tests/
│   ├── helpers/
│   └── unit/
├── config.example.json
├── .env.example
├── biome.json
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Workspace state

`config.example.json` shows the expected schema:

```json
{
  "version": 1,
  "repositoryRoot": ".",
  "scmProvider": "auto",
  "defaultLanguage": "ja",
  "paths": {
    "database": "exploratory-testing.db",
    "progressDirectory": ".exploratory-testing/progress",
    "progressSummary": ".exploratory-testing/progress/progress-summary.md",
    "artifactsDirectory": "output"
  }
}
```

`bun run dev setup` initializes:

- `config.json`
- `exploratory-testing.db`
- `.exploratory-testing/progress/progress-summary.md`
- `.exploratory-testing/progress/01-setup.md`

## End-to-end workflow

The plugin follows an 11-step linear workflow. Each step produces structured output that feeds the next.

```bash
# 1. Initialize workspace
bun run dev setup

# 2. Ingest PR metadata and changed files
bun run dev pr-intake --pr <number>

# 3. Analyze diff and context
bun run dev discover-context --pr <number> --provider github --repository owner/repo

# 4. Map tests and build coverage gap map
bun run dev map-tests --pr <number> --provider github --repository owner/repo

# 5. Score risk, select frameworks, generate exploration themes
bun run dev assess-gaps --pr <number> --provider github --repository owner/repo

# 6. Allocate coverage gaps to testing destinations
bun run dev allocate run --risk-assessment-id <id>

# 7. Create QA handoff issue
bun run dev handoff publish --risk-assessment-id <id>

# 8. Generate session charters (manual-exploration items only)
bun run dev generate-charters --pr <number> --provider github --repository owner/repo

# 9. Run exploratory sessions
bun run dev session start --session-charters-id <id> --charter-index 0
bun run dev session observe --session <id> --heuristic "..." --action "..." --expected "..." --actual "..." --outcome pass
bun run dev session complete --session <id>

# 10. Triage findings
bun run dev finding add --session <id> --observation <id> --type defect --title "..." --description "..." --severity high
bun run dev finding handover --session <id>

# 11. Export final artifacts
bun run dev export-artifacts --pr-intake-id <id>
```

All state is stored in the local SQLite database and progress files. Sessions can be interrupted and resumed at any point.

### Output artifacts

After step 11, the `output/` directory contains:

| File | Description |
|---|---|
| `exploration-brief.md` | PR summary, change categories, viewpoint seeds, high-risk areas |
| `coverage-gap-map.md` | Coverage gaps, missing test layers, existing test assets |
| `session-charters.md` | Executable exploration plans with scope and frameworks |
| `findings-report.md` | All findings organized by type and severity |
| `automation-candidate-report.md` | Automation candidates grouped by recommended test layer |
