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

## v3 Direction

現在の設計方針は `Stateless Core` です。主語は次の 3 段に寄せます。

1. `analyze-pr`
2. `design-handoff`
3. `publish-handoff`

`config.json` / local DB / progress files / 11-step workflow は、現実装ではまだ使いますが、user-facing default ではなく optional な cache / resume layer として下げていく方針です。

この再編は「旧 skill を全部消す」ことが目的ではありません。近い責務を coarse-grained skill にマージし、残した skill の役割を広げる方針です。

最終形では、CLI が主フローを駆動するのではなく、`analyze-pr` → `design-handoff` → `publish-handoff` の 3 つの public skill が順にリレーする形を目指します。

`publish-handoff` で使う publish policy は `config.json` に default 値として保存してよく、空の項目は skill 実行時に `AskUserQuestion` で確認する運用を想定しています。CLI 単体での対話補完はまだ完成していません。

## 対応範囲

対象 | 対応レベル | 備考
--- | --- | ---
GitHub PR ベースの workflow | Full | v2 の主対象
shift-left test allocation | Full | 8 destination に振り分け
GitHub Issue checklist handoff | Full | publish / update / findings comment
manual exploration charter generation | Full | `manual-exploration` 項目のみ対象
local resumable state | Full | 現状は local DB + progress files。v3 では optional layer として扱う
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
- local DB / progress files は個人作業の resumable state / cache
- exported artifacts は補助資料であり、primary handoff ではない
- public SKILL が対話と判断の主役であり、CLI は事実取得と生成の裏方である
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

通常は Claude Code から coarse-grained skill を呼びます。

基本の流れ:

1. 必要なら `capabilities` で前提と非対応を確認する
2. `analyze-pr` で PR / related issue / 既存テストを整理する
3. 不足文脈があれば、その skill の中で `AskUserQuestion` を使って確認する
4. skill の終わりで成果を要約し、`AskUserQuestion` で次の skill に進んでよいか確認する
5. `design-handoff` で manual exploration に残す項目を絞る
6. `publish-handoff` で GitHub QA Issue を publish / update する
7. 必要なときだけ `charters` / `findings` / `export` 相当の補助フローを使う

補足:

- 現在の CLI 実装はまだ内部で `setup` / `pr-intake` / `discover-context` / `map-tests` / `assess-gaps` / `allocate` / `handoff` を使う。
- そのため、今日の実装では `setup` が必要になる場面がある。
- ただし user-facing な説明では、11-step workflow を通常利用の主語にしない。

### Skill Merge 方針

Public skill | 吸収していく旧 skill / step
--- | ---
`analyze-pr` | `pr-intake` / `discover-context` / `map-tests` / `assess-gaps` の一部
`design-handoff` | `assess-gaps` / `allocate` / `handoff generate` / 条件付きで `generate-charters`
`publish-handoff` | `handoff publish` / `handoff update` / `handoff add-findings`

このため、残す skill は単に数を減らした薄い wrapper ではなく、より広い outcome を担当する。

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
- 必要なら findings comment を追加する
- publish 前に title / target issue / scope を `AskUserQuestion` で確認してよい
- `config.json` の `publishDefaults` に target repository / title prefix / labels などがあれば既定値として使う
- 空の項目は skill 実行時に `AskUserQuestion` で確認する想定だが、CLI 単体での対話補完はまだ実装途中
- 完了後に結果を返す

### Claude Code での開始例

```text
/capabilities
/analyze-pr
/design-handoff
/publish-handoff
```

### 現在の内部 workflow

現行実装では、裏側に次の legacy workflow が残っています。

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
`analyze-pr` | `pr-intake` / `discover-context` / `map-tests` 相当を吸収し、PR / related issue / changed files / 既存テストを整理し、不足文脈があれば `AskUserQuestion` で確認する
`design-handoff` | `assess-gaps` / `allocate` / `handoff generate` 相当を吸収し、manual exploration に残す項目を絞り、draft を作り、不足する判断材料があれば `AskUserQuestion` で確認する
`publish-handoff` | `handoff publish` / `handoff update` / `handoff add-findings` 相当を吸収し、GitHub QA Issue を正本として更新し、不足項目があれば `AskUserQuestion` で確認する

### Legacy / Internal Skills

スキル | 役割
--- | ---
`setup` | local persistence layer を初期化する legacy / advanced step
`pr-intake` | PR metadata、changed files、任意の intent context を取り込む internal step
`discover-context` | changed files 周辺の文脈を解析する internal step
`map-tests` | 関連テストと coverage gap を整理する internal step
`assess-gaps` | risk score / framework / exploration themes を作る internal step
`allocate` | 確認項目を destination ごとに振り分ける internal step
`handoff` | confidence つきの QA handoff hypothesis を生成・publish する internal step
`generate-charters` | `manual-exploration` 項目だけから charter を作る optional step
`run-session` | 手動探索セッションを記録する optional step
`triage-findings` | observations を defect / spec-gap / automation-candidate に整理する optional step
`export-artifacts` | 補助資料として markdown artifacts と heuristic feedback report を出力する optional step

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
  },
  "publishDefaults": {
    "repository": "owner/repo",
    "titlePrefix": "QA",
    "labels": ["qa-handoff"],
    "assignees": [],
    "findingsComment": true,
    "mode": "create-or-update"
  }
}
```

補足:

- `setup` は相対パスを `config.json` に保存する
- CLI 境界で絶対パスに解決する
- `publishDefaults` は publish-handoff の既定値であり、空の項目は skill 実行時に補完する想定
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
