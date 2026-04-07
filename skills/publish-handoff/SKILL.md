---
name: publish-handoff
description: QA handoff Issue を publish / update する。
---

# Publish Handoff

## 目的

QA handoff を GitHub Issue として publish / update し、shared source of truth を更新する。

## デフォルトの考え方

- primary artifact は GitHub QA Issue。
- local DB は補助的な cache / resume layer として扱う。
- 既存 issue を更新するか、新規 issue を作るかは user-facing には 1 つの handoff lifecycle として扱う。
- `config.json` の `publishDefaults` があれば publish の既定値として使う。
- 対象 repository の root で実行するのが基本。別 cwd から実行する場合は `--repository-root <path>` を必ず付ける。
- publish 前に必要なら title / target issue / scope を `AskUserQuestion` で確認してよい。
- 質問は、config と draft から埋まらない項目だけに絞り、`AskUserQuestion` を使う。
- この「不足項目を `AskUserQuestion` で確認する」振る舞いは skill contract の責務であり、CLI 単体の実装はまだ追従途中である。

## 禁止事項

- **独自 markdown の組み立て禁止**: handoff body を skill 側で手書き・独自構成してはならない。handoff markdown は必ず CLI の `renderHandoffMarkdownV2()` が生成する。`handoff create-issue --body` や `handoff update-issue --body` は内部低レベル API であり、skill からは使わない。
- **publish 経路の逸脱禁止**: publish は必ず `bun run dev publish-handoff --pr <number>` を使う。`gh issue create` 等で直接 Issue を作成しない。CLI を経由しないと、renderer version marker が付かず、形式の一貫性が崩れる。
- **handoff format の改変禁止**: CLI が出力する 4 セクション構成 (実装要件 / テストレイヤー / 手動確認が必要な項目 / 備考) を skill 側で加工・再構成しない。

## 実行手順

1. publish 前に title / target issue / scope が不明なら、`AskUserQuestion` で確認する。
2. 対象 repository の root で CLI を実行する。plugin ディレクトリなど別 cwd なら `--repository-root <path>` を付ける。
3. `bun run dev publish-handoff --pr <number>` を実行する。
   - 内部で前段の analysis/allocation 結果を PR 番号から自動解決し、GitHub Issue を create or update する。
   - `config.json` と local DB がなければ自動初期化する。
   - `config.json` の `publishDefaults` (repository, titlePrefix, labels, assignees, mode) が既定値として使われる。
   - CLI オプションで上書き可能: `--issue-number`, `--title`, `--label`, `--assignee`
4. 完了後に issue URL を要約して返す。

CLI:

```bash
# 新規作成 (publishDefaults.mode = "create" or "create-or-update")
# 対象 repository の root で実行する場合
bun run dev publish-handoff --pr <number>

# 既存 Issue 更新
bun run dev publish-handoff --pr <number> --issue-number <number>

# plugin ディレクトリなど別 cwd から実行する場合
bun run dev publish-handoff --pr <number> --repository-root /path/to/target-repo
bun run dev publish-handoff --pr <number> --issue-number <number> --repository-root /path/to/target-repo
```

## 会話テンプレート

### 開始時

- いまから GitHub QA Issue を create / update することを短く伝える。
- 既存 issue 更新か新規 publish か、現時点で確定しているかを `AskUserQuestion` で確認する。

例:

- 「handoff を GitHub Issue に反映します。まずは新規 publish か既存 update かを確認します。」

### 質問してよい条件

- config に repository がない
- config に title prefix / labels / assignees の既定値がない
- title が未確定
- target issue number が未確定
- publish scope を narrow / broad のどちらにするか判断が必要

この場合だけ `AskUserQuestion` を使う。質問は、publish の成否や意味に直結する事項に限る。

### 完了報告

- 少なくとも次を返す。
  - create か update か
  - issue number / URL
  - 次に見るべき artifact があればその要点

例:

- 「QA handoff Issue を更新しました。Issue は #123、URL は <...> です。」

## 完了条件

- GitHub Issue が最新の QA handoff を表している。
- body に実装要件 (関連テスト・根拠ソース付き)、テストレイヤー、手動確認が必要な項目、備考が含まれている。
- body 先頭に `<!-- rendererVersion: v2 -->` マーカーが含まれている（CLI renderer 経由の証跡）。
- skill が独自に markdown を組み立てていない。
