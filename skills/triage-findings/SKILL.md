---
name: triage-findings
description: exploratory findings を分類し、適切な次の品質資産につなげる。
---

# Findings Triage

## 目的

観察結果を defect、spec gap、automation candidate に整理する。

## 前提条件

- `run-session` should already have at least one completed or interrupted session.
- The observations to triage must already exist in the database.

## 実行手順

1. Create findings with `bun run dev finding add --session <id> --observation <id> --type defect|spec-gap|automation-candidate --title "..." --description "..." --severity low|medium|high|critical`.
2. For automation candidates, add `--test-layer unit|integration|e2e|visual|api` and `--rationale "..."`.
3. Generate the findings report with `bun run dev finding report --session <id>`.
4. Generate the automation candidate report with `bun run dev finding automation-report --session <id>`.
5. Write the triage handover with `bun run dev finding handover --session <id>`.

## 再開方法

- Re-run `finding report` or `finding automation-report` after adding new findings.
- Keep the observation ID attached to each finding so later export stays traceable.

## 次の Step

- `export-artifacts`
