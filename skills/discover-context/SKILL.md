---
name: discover-context
description: 手動探索の前に、変更ファイル周辺の実装コンテキストを解析する。
---

# コンテキスト解析

## 目的

PR intake の内容を change analysis と 5 観点の材料へ変換する。

## 前提条件

- 同じ PR に対して `pr-intake` が完了していること。
- workspace database と progress files が存在していること。

## 実行手順

1. `bun run dev discover-context --pr <number> --provider github --repository owner/repo` を実行する。
2. 生成された change classification、related code candidates、viewpoint seeds を確認する。
3. 永続化された handover は `.exploratory-testing/progress/03-discover-context.md` を読む。

## 再開方法

- PR intake を更新した場合は、先にこの step を再実行する。
- progress summary でこの step が `completed` になっていることを確認する。

## 次の Step

- `map-tests`
