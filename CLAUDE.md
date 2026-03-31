# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

このファイルは、Claude Code でこのリポジトリを継続実装するための常設ガイドです。
通常の Issue 作業では、`Issue + このファイル + 現在のコード` を読めば着手できます。

## 目的

実装完了後の手動探索的テストを支援する Claude Code Plugin。
PR/MR の Diff・関連テスト・実装コードを解析し、**どの観点で・どの順番で・どこを重点的に手動探索すべきか**を導出する。

不変の方向性:

- TypeScript-first / CLI-centered / file-state-driven
- resumable across sessions / reproducible without chat history
- Auto Compact 耐性: 全状態をファイル + DB に永続化

## コマンド

```bash
# 全チェック（lint + typecheck + test）
bun run check

# 個別
bun run test              # vitest run
bun run test:watch        # vitest（watch mode）
bun run typecheck         # tsc --noEmit
bun run lint              # biome check .
bun run format            # biome check --write .

# 単体テスト1ファイルだけ
bunx vitest run tests/unit/config.test.ts

# CLI 実行
bun run dev --help
bun run dev setup
bun run dev db init
bun run dev progress summary
bun run dev progress handover --step <name> --status <status> --summary <text>
bun run dev doctor
```

意味のある変更の後は `bun run check` を実行すること。

## アーキテクチャ

### 3層ステート管理（stateful-workflow-plugin-framework の核心）

```
Skill Layer (skills/*/SKILL.md)
  │  各スキルは「ステートレス関数」: ファイル群を読み → CLI で処理 → ファイル群を書く
  │  会話履歴への依存ゼロ（Auto Compact 耐性の鍵）
  ▼
┌──────────┐  ┌──────────┐  ┌────────────────────────┐
│  Config  │  │   CLI    │  │    Progress Files       │
│ (JSON)   │  │(JSON I/O)│  │ (MD + YAML frontmatter) │
└──────────┘  └────┬─────┘  └────────────────────────┘
                   │
              ┌────▼─────┐
              │  SQLite   │
              │ (WAL mode)│
              └──────────┘
```

- **Config** (`config.json`): 静的設定。パスは相対で保存し CLI 境界で絶対パスに解決
- **Progress Files** (`.exploratory-testing/progress/`): ステップ間の引き継ぎ文書。frontmatter でメタデータ、本文でサマリー
- **Database** (`exploratory-testing.db`): ドメインデータの正本。DB は直接触らず必ず CLI/repository module 経由

### Skill と CLI の責務分担

| Skill (SKILL.md) | CLI (TypeScript) |
|---|---|
| ワークフロー制御・handover | PR/MR 取得・diff 解析 |
| config/progress の Read/Write | test mapping・risk analysis |
| CLI 呼び出し・結果要約 | charter material generation |
| 次ステップへの誘導 | finding persistence・report 生成 |

高度で再現性の高い処理は CLI 側に寄せ、Skill は呼び出しと制御に徹する。

### ワークフロー（9ステップの線形ステートマシン）

```
setup → pr-intake → discover-context → map-tests → assess-gaps
  → generate-charters → run-session → triage-findings → export-artifacts
```

各ステップは `src/exploratory-testing/config/workflow.ts` の `WORKFLOW_SKILLS` で定義。
Progress ファイルは `NN-<step>.md` の命名規則で、前ステップの引き継ぎを次ステップが読む。

### ソースコードの構成

- `src/exploratory-testing/cli/index.ts` — CLI エントリポイント（`cac` ベース）
- `src/exploratory-testing/models/` — Zod スキーマと型定義（config, progress, plugin-manifest）
- `src/exploratory-testing/db/` — SQLite スキーマと repository（`bun:sqlite` 使用）
- `src/exploratory-testing/tools/` — CLI サブコマンドの実装（setup, progress, doctor, config, manifest）
- `src/exploratory-testing/config/workflow.ts` — ワークフローステップ定義
- `skills/` — 各ステップの SKILL.md（Claude Code Plugin として読まれる）
- `.claude-plugin/plugin.json` — Plugin マニフェスト

### bun:sqlite と Vitest の共存

本番は `bun:sqlite` を使うが、Vitest は Node 環境で動く。
`vitest.config.ts` で `bun:sqlite` を `tests/helpers/bun-sqlite-shim.ts` にエイリアスし、
shim が `sqlite3` CLI を `execFileSync` で叩くことで互換性を確保している。
テスト環境には `sqlite3` コマンドが必要。

## 技術スタック

- Runtime: `bun` (Node 20+ 互換を維持)
- Test: `vitest`
- Lint/Format: `biome` (double quotes, semicolons, space indent)
- Validation: `zod`
- CLI: `cac`
- Subprocess: `execa`
- Frontmatter: `gray-matter`
- Glob: `tinyglobby`

## TypeScript ルール

Hard rules:

- `any` 禁止 → `unknown` を境界で受けて narrow
- `enum` 禁止 → union types を使う
- default export 禁止 → named exports のみ
- exported functions には explicit return type
- `Error` 以外を throw しない

推奨:

- top-level は function declaration 優先
- 1 ファイル 1 責務
- parsing / persistence / presentation を分離
- long positional parameters より object parameter

## 実装時の判断基準

複数案あるときの優先順:

1. より deterministic（LLM 依存ロジックを深い層に入れない）
2. files と DB から再開しやすい
3. Vitest で検証しやすい
4. Bun 専用 API への結合が弱い
5. 後続 Issue で拡張しやすい

## このリポジトリの不変ルール

- state は会話ではなく files + local DB を正本にする
- advanced logic は CLI / TypeScript に置く
- skill は workflow 制御と handover に寄せる
- progress files は markdown + YAML frontmatter
- DB は直接触らず CLI / repository module 経由
- deterministic な処理を優先し LLM 依存ロジックを深い層に入れない

## Issue 作業の開始手順

1. 対象の GitHub Issue を読む
2. この `CLAUDE.md` を読む
3. `main` から issue 用ブランチを切る (`issue-<number>-<short-slug>`)
4. 関連する `src/` と `tests/` を確認する

## Git 運用

```bash
git fetch origin
git checkout main && git pull --ff-only origin main
git checkout -b issue-<number>-<short-slug>
```

完了時: commit → push → PR 作成 → Issue に実装サマリーと確認コマンドを残す

## 現在の基盤状態

Issue #7 完了時点:

- `config.json` のスキーマと相対パス解決が実装済み
- `setup` / `db init` / `progress summary` / `progress handover` の CLI が存在
- SQLite 初期化、WAL、`foreign_keys` 有効化が実装済み
- workspace 初期化は冪等

## 深い仕様を確認したいとき

横断的な仕様変更やアーキテクチャ変更のときだけ参照:

- `requirements.md` — 探索的テストの要件定義（5つの着眼点、8つの探索フレームワーク、出力物要件）
- `stateful-workflow-plugin-framework.md` — ステートフルワークフローの設計パターン集（3層ステート管理、スキル設計パターン、CLI ブリッジ設計）
