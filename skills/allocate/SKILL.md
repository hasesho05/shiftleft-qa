---
name: allocate
description: coverage gaps をテスト先に振り分け、allocation items を生成する。
---

# テスト先の振り分け (Allocate)

## 目的

assess-gaps の結果（リスクスコア・coverage gaps・exploration themes）を基に、
各 gap を適切なテスト先（unit / integration / e2e / visual / review / dev-box / manual-exploration / skip）へ振り分ける。

## 前提条件

- `assess-gaps` が完了していること。
- risk assessment レコード ID を把握していること。

## 実行手順

1. `bun run dev allocate run --risk-assessment-id <id>` を実行する。
2. 振り分け結果を確認する: `bun run dev allocate list --risk-assessment-id <id>`
3. サマリーを確認する: `bun run dev allocate summary --risk-assessment-id <id>`

## 再開方法

- risk assessment が更新された場合は再実行する。prior items は上書きされる。

## 次の Step

- `handoff`
