---
name: map-tests
description: 関連する自動テストを対応付け、何を保証しているかを整理する。
---

# テスト対応付け

## 目的

既存テスト資産を整理し、手動探索が未保証領域に集中できるようにする。

## 前提条件

- `pr-intake` と `discover-context` が完了していること。
- 解析対象の tests や stories が repository に含まれていること。

## 実行手順

1. `bun run dev map-tests --pr <number> --provider github --repository owner/repo` を実行する。
2. 推定された test asset 一覧、coverage gap map、missing layers を確認する。
3. 永続化された summary は `.exploratory-testing/progress/04-map-tests.md` を読む。

## 再開方法

- discovery 後に新しいテストが追加された場合は、この step を再実行して gap map を更新する。
- intake と整合するように、同じ PR 番号と repository 引数を使い続ける。

## 次の Step

- `assess-gaps`
