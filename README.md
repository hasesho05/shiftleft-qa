# shiftleft-qa

`shiftleft-qa` は、PR の変更内容を読み、確認項目を `review` / `unit` / `integration` / `e2e` / `visual` / `dev-box` / `manual-exploration` / `skip` に振り分け、最後に残った手動探索だけを GitHub Issue に handoff する Claude Code 向けプラグインです。

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
GitHub PR ベースの workflow | Full | v2 の主対象
shift-left test allocation | Full | 8 destination に振り分け
GitHub Issue checklist handoff | Full | publish / update / findings comment
manual exploration charter generation | Full | `manual-exploration` 項目のみ対象
local resumable state | Full | local DB + progress files
artifact export | Partial | 補助資料としてのみ扱う

## 非対応

対象 | 理由
--- | ---
GitLab handoff の完成形 | `glab` まわりは未完成
manual exploration の完全自動化 | 観察と推論を置き換えるものではない
shared source of truth としての local DB | 運用方針として採らない
live GitHub / GitLab API E2E | 現状は local / mocked test 中心

## このプラグインの考え方

- shared source of truth は GitHub Issue
- local DB / progress files は個人作業の resumable state / cache
- exported artifacts は補助資料であり、primary handoff ではない
- handoff checklist は確定仕様ではなく、confidence つきの探索仮説として扱う
- PR 本文や関連 Issue に目的・ユーザーストーリー・達成要件が書かれていれば、`pr-intake` で任意に取り込んで後続 step の判断材料にする
- 手動探索で大事なのは checklist の件数ではなく、状態・境界・タイミング・解釈の曖昧さを推論しながら観察すること
- そのため `generate-charters` は allocation の残余である `manual-exploration` だけを対象にする

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

### 基本の使い方

通常は Claude Code から skill を呼びます。  
利用者が毎回 `bun run ...` を手で打つ前提ではなく、AI に workflow を進めてもらう想定です。

基本の流れ:

1. 必要なら `capabilities` で前提と非対応を確認する
2. `setup` で local state を初期化する
3. `pr-intake` 以降で PR を解析する
4. AI が allocation を作り、confidence つきの GitHub QA handoff Issue を publish / update する
5. `manual-exploration` に残った項目だけから charter を作る
6. 探索結果を findings として GitHub に返す

### Claude Code での開始例

```text
/capabilities
/setup
```

またはそのまま:

```text
/setup
```

### 内部的な workflow

裏側では次の順で step が進みます。

```text
capabilities
→ setup
→ pr-intake
→ discover-context
→ map-tests
→ assess-gaps
→ allocate
→ handoff
→ generate-charters
→ run-session
→ triage-findings
→ export-artifacts
```

## 主要スキル

スキル | 役割
--- | ---
`capabilities` | 対応範囲・前提・非対応を案内する
`setup` | local state を初期化する
`pr-intake` | PR metadata、changed files、任意の intent context を取り込む
`discover-context` | changed files 周辺の文脈を解析する
`map-tests` | 関連テストと coverage gap を整理する
`assess-gaps` | risk score / framework / exploration themes を作る
`allocate` | 確認項目を destination ごとに振り分ける
`handoff` | confidence つきの QA handoff hypothesis を GitHub Issue に publish / update する
`generate-charters` | `manual-exploration` 項目だけから charter を作る
`run-session` | 手動探索セッションを記録する
`triage-findings` | observations を defect / spec-gap / automation-candidate に整理する
`export-artifacts` | 補助資料として markdown artifacts と heuristic feedback report を出力する

## Source of Truth

対象 | 役割
--- | ---
GitHub Issue | 実装者 / QA / reviewer 間の shared handoff の正本
Local SQLite DB | resumable state / cache
Progress markdown files | ローカルの handover / audit trail
Exported markdown artifacts | deep dive 用の補助資料

## 出力物

primary handoff は GitHub Issue です。  
`output/` は必要なときだけ `export-artifacts` で補助資料として出力します。常に自動生成される主成果物ではありません。

ファイル | 内容
--- | ---
`exploration-brief.md` | PR 概要、変更カテゴリ、viewpoint seeds、guarantee-oriented layer summary、リスク要約
`coverage-gap-map.md` | coverage gaps、missing layers、関連テスト候補
`session-charters.md` | `manual-exploration` 向け charter
`findings-report.md` | findings 一覧
`automation-candidate-report.md` | automation candidate 一覧
`heuristic-feedback-report.md` | findings と allocation / charter のズレを見直す補助レポート

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
  }
}
```

補足:

- `setup` は相対パスを `config.json` に保存する
- CLI 境界で絶対パスに解決する
- secrets は `config.json` に入れない
- GitHub 認証は raw token より `gh auth` を優先する

## 注意事項

- local DB / progress files は shared source of truth ではありません
- GitHub Issue が QA handoff の正本です
- この plugin の目的は manual exploration を増やすことではなく、manual に残る前に削ることです
- exported artifacts は補助資料であり、運用の主役ではありません
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
├── src/exploratory-testing/
│   ├── analysis/
│   ├── cli/
│   ├── config/
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
