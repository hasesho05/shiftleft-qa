---
name: handoff
description: allocation 結果から QA handoff issue を GitHub に作成する。
---

# QA Handoff

## 目的

allocation 結果を GitHub Issue として公開し、QA チームへの引き継ぎチェックリストを作成する。

## 前提条件

- `allocate` が完了していること。
- risk assessment レコード ID を把握していること。

## 実行手順

1. Markdown を生成する: `bun run dev handoff generate --risk-assessment-id <id>`
2. GitHub Issue を作成する: `bun run dev handoff publish --risk-assessment-id <id>`
3. 既存 Issue を更新する: `bun run dev handoff update --risk-assessment-id <id> --issue-number <n>`

## 探索セッション後の追記

- 探索結果を Issue コメントとして追加する: `bun run dev handoff add-findings --issue-number <n> --session-id <id>`

## 次の Step

- `generate-charters`
