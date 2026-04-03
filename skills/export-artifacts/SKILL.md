---
name: export-artifacts
description: Export the final exploratory testing brief, charters, and findings reports.
---

# Export Artifacts

## Purpose

Generate stable, shareable artifacts from the current plugin state.
All artifacts are written to the configured `artifactsDirectory` (default `output/`).

## Prerequisites

The following workflow steps should be completed before exporting:

1. `setup` — workspace initialized
2. `pr-intake` — PR/MR ingested
3. `discover-context` — change analysis complete
4. `map-tests` — test mapping and coverage gap map built
5. `assess-gaps` — risk scores and exploration themes generated
6. `generate-charters` — session charters created
7. `run-session` — at least one session executed
8. `triage-findings` — findings triaged

## CLI Usage

```bash
bun run dev export-artifacts --pr-intake-id <id>
```

Options:
- `--pr-intake-id <id>` (required) — the PR intake record ID
- `--config <path>` — path to config.json (default: `config.json`)
- `--manifest <path>` — path to plugin.json (default: `.claude-plugin/plugin.json`)

## Output Files

| File | Description |
|---|---|
| `exploration-brief.md` | PR summary, changed files, change categories, viewpoint seeds, high-risk areas |
| `coverage-gap-map.md` | Coverage gap entries, missing test layers, test assets |
| `session-charters.md` | All generated charters with scope, frameworks, targets, session status |
| `findings-report.md` | All findings organized by type and severity |
| `automation-candidate-report.md` | Automation candidates grouped by recommended test layer |

## Idempotency

Running `export-artifacts` multiple times for the same PR intake produces identical output when the underlying data has not changed. Files are overwritten in place.

## Handover

On completion, writes `09-export-artifacts.md` to the progress directory and updates the progress summary.
