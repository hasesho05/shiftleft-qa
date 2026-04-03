---
name: run-session
description: exploratory session の観察、証跡、中間 progress を記録する。
---

# セッション実行

## 目的

探索観察を、再開可能な構造化ログとして保存する。

## 前提条件

- `generate-charters` must be completed.
- Pick one charter index and keep the session focused on that charter.

## 実行手順

1. Start a session with `bun run dev session start --session-charters-id <id> --charter-index 0`.
2. Record each observation with `bun run dev session observe --session <id> --heuristic "..." --action "..." --expected "..." --actual "..." --outcome pass|fail|unclear|suspicious`.
3. Add `--evidence-path` when you have a file or screenshot to keep.
4. Use `bun run dev session interrupt --session <id> --reason "..."` if you need to stop early.
5. Finish with `bun run dev session complete --session <id>`.

## 再開方法

- Reopen the session by calling `session start` again with the same charter.
- Read `.exploratory-testing/progress/07-run-session.md` to recover the last recorded state.

## 次の Step

- `triage-findings`
