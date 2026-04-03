---
name: setup
description: exploratory testing plugin の config、workspace state、progress tracking を初期化する。
---

# セットアップ

## 目的

後続 step が会話履歴ではなく、ファイルと SQLite を正本として再開できるように workspace を初期化する。

## 前提条件

- リポジトリのルートで実行する。
- `.claude-plugin/plugin.json` が存在することを確認する。
- 次に PR を取り込むなら `gh` と `git` が使えることを確認する。

## 実行手順

1. `bun run dev setup` を実行する。
2. `config.json`、`exploratory-testing.db`、`.exploratory-testing/progress/progress-summary.md`、`.exploratory-testing/progress/01-setup.md` が作成または更新されることを確認する。
3. progress summary を読み、現在 step が `pr-intake` になっていることを確認する。

## 再開方法

- すでに setup 済みでも同じコマンドを再実行してよい。冪等に動く。
- workspace を移動した場合は `config.json` を見直したうえで setup を再実行し、解決済みパスを更新する。

## 次の Step

- `pr-intake`
