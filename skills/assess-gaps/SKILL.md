---
name: assess-gaps
description: coverage gap を評価し、リスクにもとづいて探索フレームワークを選定する。
---

# Gap 評価

## 目的

change analysis と test map から優先度付きの探索テーマを作る。

## 前提条件

- 同じ PR に対して `map-tests` が完了していること。
- 現在の PR intake、change analysis、test map が database に存在していること。

## 実行手順

1. `bun run dev assess-gaps --pr <number> --provider github --repository owner/repo` を実行する。
2. 生成された risk scores、selected frameworks、exploration themes を確認する。
3. handover summary は `.exploratory-testing/progress/05-assess-gaps.md` を読む。

## 再開方法

- リスク状況が変わったら、charter 生成前にこの step を再実行する。
- 各 exploration theme は短く具体的に保ち、1 charter 1 theme を崩さない。

## 次の Step

- `generate-charters`
