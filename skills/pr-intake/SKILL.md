---
name: pr-intake
description: exploratory testing 用に PR / MR のメタデータと変更ファイルを取り込む。
---

# PR 取り込み

## 目的

変更要求を永続化された成果物として保存する。

## 前提条件

- 先に `bun run dev setup` を実行しておく。
- `gh` にログイン済みの GitHub checkout で実行する。
- リポジトリルートで実行し、remote 判定が正しく動くようにする。

## 実行手順

1. `bun run dev pr-intake --pr <number>` を実行する。
2. JSON 出力に PR タイトル、author、変更ファイル数、review comment 数、`handoverPath` が含まれることを確認する。
3. 永続化された要約が必要なら `.exploratory-testing/progress/02-pr-intake.md` を読む。

## 再開方法

- 同じ PR を再実行してもよい。intake record は PR と head SHA をキーにしている。
- 失敗した場合は認証や repository context を直してから再実行する。

## 次の Step

- `discover-context`
