---
name: export-artifacts
description: 最終的な exploratory testing brief、charters、findings report を出力する。
---

# 成果物出力

## 目的

現在の plugin state から、安定して共有できる成果物を生成する。

## 前提条件

- `setup`, `pr-intake`, `discover-context`, `map-tests`, `assess-gaps`, `generate-charters`, `run-session`, and `triage-findings` should already be complete.
- Use the `pr-intake` record ID for the PR you want to export.

## 実行手順

1. Run `bun run dev export-artifacts --pr-intake-id <id>`.
2. Confirm the command writes `exploration-brief.md`, `coverage-gap-map.md`, `session-charters.md`, `findings-report.md`, and `automation-candidate-report.md` into `output/`.
3. Read `.exploratory-testing/progress/09-export-artifacts.md` for the final handover.

## 再開方法

- Re-run the export if upstream data changed; the files are overwritten in place.
- If the export fails because a prerequisite artifact is missing, rerun the missing upstream step before exporting again.

## 出力ファイル

- `exploration-brief.md`
- `coverage-gap-map.md`
- `session-charters.md`
- `findings-report.md`
- `automation-candidate-report.md`
