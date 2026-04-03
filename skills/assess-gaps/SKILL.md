---
name: assess-gaps
description: coverage gap を評価し、リスクにもとづいて探索フレームワークを選定する。
---

# Gap 評価

## 目的

change analysis と test map から優先度付きの探索テーマを作る。

## 前提条件

- `map-tests` must be completed for the same PR.
- The current PR intake, change analysis, and test map must all be in the database.

## 実行手順

1. Run `bun run dev assess-gaps --pr <number> --provider github --repository owner/repo`.
2. Review the risk scores, selected frameworks, and exploration themes.
3. Read `.exploratory-testing/progress/05-assess-gaps.md` for the handover summary.

## 再開方法

- If the risk picture changes, rerun this step before generating charters.
- Keep exploration themes short and specific so each charter remains one theme.

## 次の Step

- `generate-charters`
