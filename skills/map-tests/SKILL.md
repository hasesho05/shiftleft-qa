---
name: map-tests
description: 関連する自動テストを対応付け、何を保証しているかを整理する。
---

# テスト対応付け

## 目的

既存テスト資産を整理し、手動探索が未保証領域に集中できるようにする。

## 前提条件

- `pr-intake` and `discover-context` must already be completed.
- The repository should contain the tests and stories you expect to analyze.

## 実行手順

1. Run `bun run dev map-tests --pr <number> --provider github --repository owner/repo`.
2. Review the inferred test asset list, coverage gap map, and missing layers.
3. Read `.exploratory-testing/progress/04-map-tests.md` for the persisted summary.

## 再開方法

- If new tests were added after discovery, rerun this step to refresh the gap map.
- Keep the same PR number and repository arguments so the mapping stays aligned with the intake.

## 次の Step

- `assess-gaps`
