---
name: export-artifacts
description: 最終的な exploratory testing brief、charters、findings report を出力する。
---

# 成果物出力

## 目的

現在の plugin state から、安定して共有できる成果物を生成する。

特に `exploration-brief.md` の Guarantee-Oriented Layer Summary では、「未テスト」と「今回の変更ではその layer が主要対象ではない」を区別して読めるようにする。

## 前提条件

- `setup`、`pr-intake`、`discover-context`、`map-tests`、`assess-gaps`、`allocate`、`handoff`、`generate-charters`、`run-session`、`triage-findings` が完了していること。
- 出力したい PR の `pr-intake` record ID を把握していること。

## 実行手順

1. `bun run dev export-artifacts --pr-intake-id <id>` を実行する。
2. `output/` に `exploration-brief.md`、`coverage-gap-map.md`、`session-charters.md`、`findings-report.md`、`automation-candidate-report.md`、`heuristic-feedback-report.md` が出力されることを確認する。
3. 最終 handover は `.exploratory-testing/progress/11-export-artifacts.md` を読む。

## 再開方法

- 上流データが変わった場合は再度 export を実行する。ファイルは上書きされる。
- 前提成果物不足で失敗した場合は、不足している upstream step を先に再実行してから再試行する。

## 出力ファイル

- `exploration-brief.md`
- `coverage-gap-map.md`
- `session-charters.md`
- `findings-report.md`
- `automation-candidate-report.md`
- `heuristic-feedback-report.md`

## 読み方

- Guarantee-Oriented Layer Summary に layer が出てこない、または `not-primary` と書かれている場合、それは「その layer の test が存在しないから不足」という意味ではない。
- 例:
  - frontend-only component change では `integration/service` が `not-primary` になりうる
  - backend-only change では `visual` が `not-primary` になりうる
  - PDF / static asset replacement では `unit` / `integration` が `not-primary` になりうる
  - docs only / test only では `no-product-change` が出る
- manual exploration を読むときは、単なる layer absence ではなく、曖昧さ・状態依存・観察価値が残っているかを見る。
