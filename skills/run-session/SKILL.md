---
name: run-session
description: exploratory session の観察、証跡、中間 progress を記録する。
---

# セッション実行

## 目的

探索観察を、再開可能な構造化ログとして保存する。

## 前提条件

- `generate-charters` が完了していること。
- 1 つの charter index を選び、その charter に集中して session を進めること。

## 実行手順

1. `bun run dev session start --session-charters-id <id> --charter-index 0` で session を開始する。
2. 各 observation は `bun run dev session observe --session <id> --heuristic "..." --action "..." --expected "..." --actual "..." --outcome pass|fail|unclear|suspicious` で記録する。
3. 保存したいファイルやスクリーンショットがある場合は `--evidence-path` を付ける。
4. 途中で止める必要があれば `bun run dev session interrupt --session <id> --reason "..."` を使う。
5. 終了時は `bun run dev session complete --session <id>` を実行する。

## 再開方法

- 同じ charter に対して再度 `session start` を呼び、session を再開する。
- 直前状態を確認したい場合は `.exploratory-testing/progress/09-run-session.md` を読む。

## 次の Step

- `triage-findings`
