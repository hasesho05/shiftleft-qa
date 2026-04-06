# shiftleft-qa

`shiftleft-qa` は、PR の変更内容と related issue を読み、既存テストで担保される部分と manual exploration に残る部分を切り分け、最後に GitHub QA Issue として handoff する Claude Code 向けプラグインです。

この plugin の目的は、手動探索を増やすことではありません。  
review / automated test / dev-box で前倒しに潰せる項目を切り出し、最後に残る manual exploration だけを QA に渡すことを目的としています。

## 想定ユーザー

対象 | 利用イメージ | 対応レベル
--- | --- | ---
実装者 | PR 前後に plugin を実行し、QA handoff を GitHub Issue に publish / update する | Full
QA / reviewer | GitHub Issue を起点に manual exploration を再開する | Full
開発チーム | review / automation / dev-box に寄せられる項目を早めに切り出す | Full

## 対応範囲

対象 | 対応レベル | 備考
--- | --- | ---
GitHub PR ベースの workflow | Full | 主対象
shift-left test allocation | Full | 8 destination に振り分け
GitHub Issue checklist handoff | Full | publish / update
manual exploration design | Full | `manual-exploration` 項目のみ対象
local resumable state | Full | local DB を optional cache として使用
artifact export | Partial | 補助資料としてのみ扱う

## 非対応

対象 | 理由
--- | ---
GitLab handoff の完成形 | `glab` まわりは未完成
manual exploration の完全自動化 | 観察と推論を置き換えるものではない
shared source of truth としての local DB | 運用方針として採らない
live GitHub / GitLab API E2E | GitHub live E2E は拡充中。GitLab 完成形は未対応

## このプラグインの考え方

- shared source of truth は GitHub Issue
- local DB は個人作業の resumable state / cache
- exported artifacts は補助資料であり、primary handoff ではない
- public SKILL が対話と判断の主役であり、CLI は事実取得と生成の裏方である
- handoff checklist は確定仕様ではなく、confidence つきの探索仮説として扱う
- PR 本文や関連 Issue に目的・ユーザーストーリー・達成要件が書かれていれば、analysis で取り込んで後続の判断材料にする
- 手動探索で大事なのは checklist の件数ではなく、状態・境界・タイミング・解釈の曖昧さを推論しながら観察すること

## インストール

### 方法 1: Claude Code Plugin として使う

通常はこちらを想定します。

```bash
/plugin marketplace add hasesho05/shiftleft-qa
/plugin install shiftleft-qa@shiftleft-qa
```

### 方法 2: このリポジトリを clone して開発・検証する

plugin / skill 自体を開発したい場合はこちらです。

```bash
gh auth status
bun install
bun run doctor
bun run check
```

## 使い方

### 基本の流れ

通常は Claude Code から 3 つの public skill を順に呼びます。

1. 必要なら `capabilities` で前提と非対応を確認する
2. `analyze-pr` で PR / related issue / 既存テストを整理する
3. 不足文脈があれば、その skill の中で `AskUserQuestion` を使って確認する
4. skill の終わりで成果を要約し、`AskUserQuestion` で次の skill に進んでよいか確認する
5. `design-handoff` で manual exploration に残す項目を絞る
6. `publish-handoff` で GitHub QA Issue を publish / update する

### Public Skill Contract

`analyze-pr`

- PR / related issue / acceptance criteria / existing tests / diff を読む
- CLI と GitHub から取れる事実を先に集める
- それでも不足する文脈だけを `AskUserQuestion` で質問する
- 整理結果を要約する
- `AskUserQuestion` で `design-handoff` に進んでよいか確認する

`design-handoff`

- `already covered` / `should automate` / `manual exploration required` を整理する
- handoff draft を作る
- 不足する判断材料があれば `AskUserQuestion` で質問する
- draft を要約する
- `AskUserQuestion` で `publish-handoff` に進んでよいか確認する

`publish-handoff`

- GitHub Issue を create / update する
- publish 前に title / target issue / scope を `AskUserQuestion` で確認してよい
- `config.json` の `publishDefaults` に target repository / title prefix / labels などがあれば既定値として使う
- 空の項目は skill 実行時に `AskUserQuestion` で確認する
- 完了後に結果を返す

### Claude Code での開始例

```text
/capabilities
/analyze-pr
/design-handoff
/publish-handoff
```

## スキル

スキル | 役割
--- | ---
`capabilities` | 対応範囲・前提・非対応を案内する
`analyze-pr` | PR / related issue / changed files / 既存テストを整理し、不足文脈があれば `AskUserQuestion` で確認する
`design-handoff` | manual exploration に残す項目を絞り、draft を作り、不足する判断材料があれば `AskUserQuestion` で確認する
`publish-handoff` | GitHub QA Issue を正本として更新し、不足項目があれば `AskUserQuestion` で確認する

## Source of Truth

対象 | 役割
--- | ---
GitHub Issue | 実装者 / QA / reviewer 間の shared handoff の正本
Local SQLite DB | resumable state / cache

## 前提条件

必須:

- `bun`
- `git`
- `gh`

任意:

- `node`
- `sqlite3`
- `glab`

この workspace での確認済みバージョン:

- Bun `1.3.5`
- Node.js `v20.19.0`
- GitHub CLI `2.74.1`
- Git `2.39.3`
- SQLite `3.43.2`

## 設定ファイル

`config.example.json` は次の形です。

```json
{
  "version": 1,
  "repositoryRoot": ".",
  "scmProvider": "auto",
  "defaultLanguage": "ja",
  "paths": {
    "database": "exploratory-testing.db",
    "progressDirectory": ".exploratory-testing/progress",
    "progressSummary": ".exploratory-testing/progress/progress-summary.md",
    "artifactsDirectory": "output"
  },
  "publishDefaults": {
    "repository": "owner/repo",
    "titlePrefix": "QA",
    "labels": ["qa-handoff"],
    "assignees": [],
    "mode": "create-or-update"
  }
}
```

補足:

- CLI 境界で相対パスを絶対パスに解決する
- `publishDefaults` は publish-handoff の既定値であり、空の項目は skill 実行時に補完する想定
- secrets は `config.json` に入れない
- GitHub 認証は raw token より `gh auth` を優先する

## CLI コマンド

```bash
# 環境チェック
bun run dev doctor

# DB 初期化
bun run dev db init

# Plugin manifest 確認
bun run dev manifest show

# 3-skill public flow
bun run dev analyze-pr --pr <number>
bun run dev design-handoff --pr <number>
bun run dev publish-handoff --pr <number>

# Handoff 操作（低レベル GitHub Issue 操作）
bun run dev handoff create-issue --repository <owner/repo> --title <title> --body <markdown>
bun run dev handoff update-issue --repository <owner/repo> --issue-number <number> --body <markdown>
bun run dev handoff add-comment --repository <owner/repo> --issue-number <number> --body <markdown>
```

## 注意事項

- local DB は shared source of truth ではありません
- GitHub Issue が QA handoff の正本です
- この plugin の目的は manual exploration を増やすことではなく、manual に残る前に削ることです
- 手動探索では checklist 消化よりも、推論しながら曖昧さを観察することを重視します

## 開発者向け

利用者向け情報より後ろに置くべき最低限だけをまとめます。

### 技術スタック

- Runtime: Bun
- Compatibility target: Node.js 20+
- Test: Vitest
- Lint / format: Biome
- Validation: Valibot
- CLI: `cac`
- Subprocess: `execa`

### リポジトリ構成

```text
.
├── .claude-plugin/
├── .exploratory-testing/
├── skills/
│   ├── analyze-pr/
│   ├── capabilities/
│   ├── design-handoff/
│   └── publish-handoff/
├── src/exploratory-testing/
│   ├── analysis/
│   ├── cli/
│   ├── db/
│   ├── models/
│   ├── scm/
│   └── tools/
├── tests/
│   ├── e2e/
│   ├── helpers/
│   └── unit/
├── config.example.json
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### 開発コマンド

```bash
bun run test
bun run typecheck
bun run lint
bun run format
bun run check
```

この README は `shinkoku` の README 構成を参考に、利用者向け説明を前半、開発者向け情報を後半に寄せています。
