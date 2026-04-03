---
name: generate-charters
description: 現在のリスク状況から、小さく具体的な exploratory testing charter を生成する。
---

# Charter 生成

## 目的

次のセッションで実行できる、短く具体的な手動探索計画を生成する。

## 前提条件

- `assess-gaps` が完了していること。
- risk themes と coverage gaps が database に存在していること。

## 実行手順

1. `bun run dev generate-charters --pr <number> --provider github --repository owner/repo` を実行する。
2. 各 charter の scope、frameworks、preconditions、observation targets、stop conditions、timebox を確認する。
3. handover summary は `.exploratory-testing/progress/06-generate-charters.md` を読む。

## 再開方法

- risk assessment が変わった場合は、session 開始前にこの step を再実行する。
- 1 charter は 1 theme に集中させ、追加確認のために scope を広げすぎない。

## 次の Step

- `run-session`
