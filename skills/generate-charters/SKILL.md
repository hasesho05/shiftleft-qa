---
name: generate-charters
description: 現在のリスク状況から、小さく具体的な exploratory testing charter を生成する。
---

# Charter 生成

## 目的

次のセッションで実行できる、短く具体的な手動探索計画を生成する。

## 前提条件

- `assess-gaps` must be completed.
- Risk themes and coverage gaps must be present in the database.

## 実行手順

1. Run `bun run dev generate-charters --pr <number> --provider github --repository owner/repo`.
2. Review each charter for scope, frameworks, preconditions, observation targets, stop conditions, and timebox.
3. Read `.exploratory-testing/progress/06-generate-charters.md` for the handover summary.

## 再開方法

- If the risk assessment changes, rerun this step before starting sessions.
- Keep one charter focused on one theme; do not widen scope to fit extra checks.

## 次の Step

- `run-session`
