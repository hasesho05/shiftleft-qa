---
name: tdd-cycle
description: |
  GitHub Issue ベースで、このリポジトリの実装を TDD で進めるための標準サイクル。
  Claude Code での通常実装・不具合修正・小規模リファクタに使う。
  受け入れ基準に live E2E やブラウザ確認が含まれる場合は、
  build 完了だけで done とせず、別途その検証を完了すること。
---

# TDD Cycle

このリポジトリでは、通常の Issue 実装は `Issue + CLAUDE.md + 現状コード` で進めてよい。
`requirements.md` と `stateful-workflow-plugin-framework.md` は、Issue で判断できない
横断仕様や大きな設計変更が入るときだけ参照する。

## Phase 0: Start

1. `gh issue view <number>` で対象 Issue の受け入れ基準・スコープ・依存関係を確認する
2. `CLAUDE.md` を読んで、このリポジトリの不変ルールを確認する
3. `main` を最新化し、issue 用 branch を切る
4. 対象コードと既存テストを確認する
5. 変更対象を小さく分け、1サイクルで何を GREEN にするか決める

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
git checkout -b issue-<number>-<short-slug>
```

## Phase 1: RED

1. まず失敗するテストを書く
2. 追加するのは、今から実装する 1 振る舞いだけに絞る
3. bug fix の場合は再現テストを先に置く

## Phase 2: GREEN

1. 直前の RED を通す最小限のコードを書く
2. 横スライスで広げず、1 つずつ完了させる
3. CLI・config・DB・progress の境界では入力を必ず検証する

## Phase 3: REFACTOR

1. 全テストが GREEN になってからだけ整理する
2. 責務分離、命名、重複除去を優先する
3. 仕様を広げる変更はこのフェーズで混ぜない

## Phase 4: Quality Gate

必ず実行する:

```bash
bun run test
bun run typecheck
bun run lint
```

必要なら追加で:

```bash
bun run dev --help
```

## Phase 5: Self Review

1. `git diff --stat`
2. `git diff --name-status --find-renames`
3. 差分を見て、次を確認する
   - Issue の受け入れ基準を満たしているか
   - `CLAUDE.md` の不変ルールを破っていないか
   - 余計な変更を混ぜていないか
   - progress / config / DB の責務境界が崩れていないか

## Phase 6: Issue Update

Issue が完了したら GitHub 側に最低限これを残す:

- 実装サマリー
- 実行した確認コマンド
- 必要なら残課題
- PR URL

親 Issue にチェックリストがある場合は更新する。

## Phase 7: Commit / PR

通常の Issue 作業ではここまで進める。

1. コミット前に Quality Gate を再実行する
2. Issue 番号が追えるコミットメッセージにする
3. branch を push する
4. PR を作成する
5. PR には Issue へのリンク、変更サマリー、実行コマンドを含める

```bash
git push -u origin issue-<number>-<short-slug>
gh pr create
```

## Repository Notes

- Runtime は Bun を第一候補とする
- コードは極力 Node 互換に寄せる
- テストは Vitest、lint/format は Biome
- state の正本は files + local DB
- advanced logic は CLI / TypeScript 側に置く
- skill 側は workflow 制御と handover に寄せる
- `any` 禁止、`enum` 禁止、default export 禁止
- exported function には explicit return type を付ける
