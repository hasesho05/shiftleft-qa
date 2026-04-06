---
name: allocate
description: coverage gaps をテスト先に振り分け、allocation items を生成する。
---

# テスト先の振り分け (Allocate)

> Legacy internal step. 通常利用では `design-handoff` の内部処理として吸収される想定。

## 目的

assess-gaps の結果（リスクスコア・coverage gaps・exploration themes）を基に、
各 gap を適切なテスト先（unit / integration / e2e / visual / review / dev-box / manual-exploration / skip）へ振り分ける。

この step の目的は、存在しない layer を機械的に不足扱いすることではなく、今回の変更でどの layer が主要対象かを保守的に整理することにある。

## 前提条件

- `assess-gaps` が完了していること。
- risk assessment レコード ID を把握していること。

通常利用では、この内部 ID を user-facing に要求しない。

## 実行手順

1. `bun run dev allocate run --risk-assessment-id <id>` を実行する。
2. 振り分け結果を確認する: `bun run dev allocate list --risk-assessment-id <id>`
3. サマリーを確認する: `bun run dev allocate summary --risk-assessment-id <id>`

## 読み方

- `integration` / `e2e` / `visual` が 0 件でも、今回の変更でその layer が主要対象ではないだけのことがある。
- 例:
  - frontend component / story / unit test 中心の差分では、`integration` や一部の `e2e` は primary でないことがある。
  - backend API / schema 変更では、`visual` が primary でないことがある。
  - PDF / static asset 差し替えでは、`unit` や `integration` が primary でないことがある。
- したがって `allocate` の件数だけで「不足 layer」や「手動探索が必要」と断定せず、後続の `handoff` / `export-artifacts` に出る layer applicability もあわせて読む。

## 再開方法

- risk assessment が更新された場合は再実行する。prior items は上書きされる。

## 次の Step

- legacy の `handoff`
