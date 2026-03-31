---
name: tdd-cycle
description: |
  TDD開発 → レビュー → 修正 → 再レビュー → コミット → PR作成の完全サイクル。
  GitHub Issue ベースの実装・修正・リファクタで使う。テスト駆動開発で実装し、
  code-simplifier の後に codex-review を必須で実施
---

# TDD Development Cycle

GitHub Issue を前提に、このワークフローを順に実行する。各フェーズの完了を確認してから次に進むこと。

---

## Phase 0: 準備

1. `gh issue view` で対象 Issue の受け入れ基準・要件を把握する
2. `CLAUDE.md` と `.claude/rules/` 配下のルールを確認する
3. 対象コードの現状を調査する
4. フェーズごとのタスクを作成し、進捗を追跡する

### 5. ブランチセットアップ

main ブランチを最新にし、feature ブランチを作成する。

```bash
git fetch origin main:main
git checkout -b issue-<number> main
```

既に同名のブランチがある場合は `git checkout issue-<number>` で切り替える。

### 6. 依存関係

```bash
bun install
```

---

## Phase 1: TDD 開発

### 1-1. Planning

- 公開インターフェースと優先テスト対象を確認する
- テスト戦略を決める

### 1-2. Tracer Bullet

- 1つのテストを書いて RED を確認する
- そのテストを通す最小限のコードを書いて GREEN にする

### 1-3. Incremental Loop

- 残りの振る舞いを 1 つずつ RED → GREEN で進める
- 横スライス禁止
- 各サイクルでテストを実行して状態を確認する

### 1-4. Refactor

- 全テスト GREEN 後にのみリファクタする
- リファクタ後に回帰がないことを確認する

### 1-5. Quality Gate

```bash
bun run test
bun run typecheck
bun run lint
```

---

## Phase 2: エージェントレビュー

### 2-0. 規模判定

```bash
git diff HEAD --stat
git diff HEAD --name-status --find-renames
```

### 2-1. 必須レビュー

- `code-simplifier:code-simplifier`
- `codex-review`

### 2-2. レビュー基準

- 一般的なコード品質・保守性: `code-simplifier:code-simplifier`
- バグ、ロジック、規約準拠: `.claude/skills/codex-review/SKILL.md`
- セキュリティ: `.claude/rules/security.md` と `CLAUDE.md` の Known Pitfalls

---

## Phase 3: レビュー結果の検討

1. レビュー結果を要約する
2. 指摘事項を `必須 / 推奨 / 任意` に分類する
3. 対応方針を確認する

---

## Phase 4: 修正 & 再レビュー

1. 選択した指摘事項を修正する
2. Quality Gate を再実行する
3. 必須レビューを再実行する
4. 新たな指摘がなければ次へ進む
5. 最大 3 ループまで

---

## Phase 5: コミット & PR 作成

### 5-1. コミット
1. Issue 番号を含むコミットメッセージにする
2. 作業単位ごとに意味のあるコミットに分割する

### 5-2. ローカル CI 再現チェック

```bash
bun run test && bun run typecheck && bun run lint
```

### 5-3. Push

```bash
git push -u origin issue-<number>
```

リモートへ push して作業履歴を残す。

### 5-4. PR 作成

```bash
gh pr create
```

PR 本文には最低限以下を含める。

- `Closes #<number>`
- 変更サマリー
- 実行したテスト
- レビューで対応した主な指摘

### 5-5. Issue クローズ

Issue を close してよいのは、以下をすべて満たしたときだけ。

- 受け入れ基準を満たしている
- 必須レビューを通している
- テスト / typecheck / lint が完了している
- live E2E が必要な issue は、その検証も完了している
- PR を作成済みである
- close 理由が PR または Issue コメントから辿れる

Issue には最低限以下を記録する。

- 実装サマリー
- 実行したテスト
- レビューで対応した主な指摘
- PR URL
- 残課題があれば派生 Issue

### 5-6. 完了報告

- PR URL
- 追加/変更したファイル
- テスト結果
- 対応したレビュー指摘

---

## Phase 6: 学びの記録

再利用価値のある知見があれば `CLAUDE.md` の `Known Pitfalls` への追記を検討する。


## 注意事項
- `as` キャストは Branded Type 生成関数内のみ
- `any` 禁止、`!` 禁止
