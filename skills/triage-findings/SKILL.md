---
name: triage-findings
description: exploratory findings を分類し、適切な次の品質資産につなげる。
---

# Findings Triage

## 目的

観察結果を defect、spec gap、automation candidate に整理する。

## 前提条件

- `run-session` で少なくとも 1 つの completed または interrupted session が存在すること。
- triage 対象の observations が database に保存されていること。

## 実行手順

1. `bun run dev finding add --session <id> --observation <id> --type defect|spec-gap|automation-candidate --title "..." --description "..." --severity low|medium|high|critical` で finding を追加する。
2. automation candidate の場合は `--test-layer unit|integration|e2e|visual|api` と `--rationale "..."` を付ける。
3. `bun run dev finding report --session <id>` で findings report を生成する。
4. `bun run dev finding automation-report --session <id>` で automation candidate report を生成する。
5. `bun run dev finding handover --session <id>` で triage handover を書き出す。

## 再開方法

- 新しい finding を追加した後は `finding report` または `finding automation-report` を再実行する。
- 後続 export で追跡できるよう、各 finding と observation ID の対応を維持する。

## 次の Step

- `export-artifacts`
