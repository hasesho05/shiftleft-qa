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
- **Database** (`exploratory-testing.db`): ローカルのドメインデータ格納先。再開可能なローカル状態であり、shared source of truth ではない（共有の handoff 先は GitHub Issue）。DB は直接触らず必ず CLI/repository module 経由

### Skill と CLI の責務分担

| Skill (SKILL.md) | CLI (TypeScript) |
|---|---|
| ワークフロー制御・handover | PR/MR 取得・diff 解析 |
| config/progress の Read/Write | test mapping・risk analysis |
| CLI 呼び出し・結果要約 | charter material generation |
| 次ステップへの誘導 | finding persistence・report 生成 |

高度で再現性の高い処理は CLI 側に寄せ、Skill は呼び出しと制御に徹する。

### ワークフロー（11ステップの線形ステートマシン）

```
setup → pr-intake → discover-context → map-tests → assess-gaps
  → allocate → handoff → generate-charters → run-session
  → triage-findings → export-artifacts
```

各ステップは `src/exploratory-testing/config/workflow.ts` の `WORKFLOW_SKILLS` で定義。
Progress ファイルは `NN-<step>.md` の命名規則で、前ステップの引き継ぎを次ステップが読む。

### ソースコードの構成

- `src/exploratory-testing/cli/index.ts` — CLI エントリポイント（`cac` ベース）
- `src/exploratory-testing/models/` — Valibot スキーマと型定義（config, progress, plugin-manifest）
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
- Validation: `valibot`
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
- standalone function type 禁止 → 名前付き型を定義して使う

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

- ローカル state は会話ではなく files + local DB に永続化する（shared handoff は GitHub Issue）
- advanced logic は CLI / TypeScript に置く
- skill は workflow 制御と handover に寄せる
- progress files は markdown + YAML frontmatter
- DB は直接触らず CLI / repository module 経由
- deterministic な処理を優先し LLM 依存ロジックを深い層に入れない

### ドキュメント責務の分離

- `skills/*/SKILL.md` は workflow の入口・再開方法・読み方を示す運用文書であり、複雑な判定ルールの唯一の正本にしない
- cross-cutting な設計意図、判定原則、誤りやすい解釈は `AGENTS.md` / `CLAUDE.md` / `requirements.md` に残す
- 実装で JSON 契約や出力意味が変わる場合は `SKILL.md` を更新するが、skill が file-local で吸収しづらい設計判断まで押し込まない

### Layer applicability 原則

- `test がない` と `今回の変更でその layer が主要対象ではない` を区別する
- output / handoff / artifact では、layer 不在をそのまま gap や manual exploration 必須と読める形にしない
- 少なくとも次の状態を区別して扱う
  - `primary`
  - `secondary`
  - `not-primary`
  - `no-product-change`
- frontend-only component change、backend-only change、static asset / PDF replacement、docs/test only change、mixed change のような代表ケースを deterministic に説明できるようにする
- `missingLayers` は repository 全体の test asset 不在を示す信号ではあるが、今回の PR でその layer が主要対象かどうかの最終判断には使いすぎない

### 手動探索を膨らませない

- manual exploration は「自動テスト layer が存在しないから行く場所」ではない
- manual exploration に残すのは、曖昧さ・状態依存・横断的リスク・観察価値が deterministic layer に落とし切れない残余である
- non-primary layer の不在を manual exploration の理由に使わない
- 特に frontend-only diff で integration/service 不在、backend-only diff で visual 不在、asset replacement で unit/integration 不在を、そのまま QA gap として扱わない

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

## Known Pitfalls

Issue #2 実装時に踏んだ落とし穴。同じミスを繰り返さないための記録。

Issue #9 / #3 実装時にも、探索出力の品質に直結する落とし穴が見つかった。後続 Issue でも必ず守ること。

### ResolvedPluginConfig のパス使い分け

- `config.repositoryRoot` — config.json に書かれた**生の値**（多くの場合 `"."`）
- `config.workspaceRoot` — configDirectory + repositoryRoot を解決した**絶対パス**

`execa` や `git` の `cwd` には必ず `config.workspaceRoot` を使う。`repositoryRoot` を渡すと `--config` を別ディレクトリから指定したときに壊れる。

### CLI は薄く保つ

CLI (`cli/index.ts`) に provider 判定や fetch ロジックを直接書かない。CLI の責務は引数受け取り + JSON 出力のみ。ビジネスロジックは `tools/` に、SCM 抽象は `scm/` に置く。既存の `setup`, `progress` コマンドのパターンに揃える。

### 外部プロセス出力は Valibot で検証する

`gh` CLI の JSON 出力を `JSON.parse()` した後に `as Record<string, unknown>` で済ませない。このリポジトリは config/manifest で Valibot 検証を徹底しているので、外部コマンド出力も同じ基準で検証する。DB から読み出した JSON カラムも同様。

### DB の INSERT + SELECT は transaction で包む

`savePrIntake` のように INSERT → 直後の SELECT で結果を返すパターンは `database.transaction()` で包む。既存の `upsertStepHandoverRecord` が同じパターンを使っている。

### gh pr view の呼び出しは1回にまとめる

`gh pr view --json field1,field2,...` は1回の呼び出しで複数フィールドを取得できる。PR metadata / files / reviews を個別に3回呼ぶ必要はない。

### SCM 由来のパスは posix で操作する

`changedFiles[].path` など SCM（git / gh）から取得したファイルパスは常に `/` 区切り。`node:path` の `join()` や `dirname()` は OS 依存でバックスラッシュを生む可能性がある。SCM パスを扱う関数では `node:path/posix` を使うこと。

### standalone function type は禁止

AGENT.md に明記されている。`type Handler = (input: Input) => Output` は書かない。`Parameters<typeof fn>[0]` のような間接参照も避け、名前付き型を直接 import する。ルールは `.claude/rules/no-standalone-function-types.md` にも定義済み。

### Candidate test asset は coverage 済みの証拠ではない

`findTestAssets()` が返すのは「関連候補」であって、保証済みテストの確定ではない。  
`tests/unit/foo.test.ts` のような候補パスが見つかっただけで `covered` にしてはいけない。

- 候補ベースの `testSummary` は `coverageConfidence: "inferred"` にする
- 実際にテスト内容を読んで保証観点を確認したときだけ `coverageConfidence: "confirmed"` にする
- `coverageGapMap` では
  - `confirmed` がある場合だけ `covered`
  - `inferred` のみある場合は `partial`
  - 何もなければ `uncovered`

これを守らないと、Gap Map が「全部 covered」または「全部 uncovered」に崩れて後続の risk analysis が無意味になる。

### Coverage Gap は変更カテゴリに応じて絞る

各 changed file に対して常に全 aspect を並べるとノイズが増える。  
`permission` 変更でもないのに permission gap を出す、`state-transition` と無関係なのに state-transition gap を出す、というのは避ける。

- 最低限 `happy-path` と `error-path` は評価する
- `boundary`, `permission`, `state-transition`, `mock-fixture` は change category に応じて applicable な時だけ出す
- 分類根拠は `discover-context` の `fileAnalyses[].categories` から引く

カテゴリ未分類のファイルだけ、保守的に全 aspect を評価してよい。

### assess-gaps は framework 一覧ではなく partial exploration を出す

`#3` の成果物は「フレームワーク選定結果の一覧」で終わらせない。  
後続の charter 生成で使えるよう、gap 起点の partial exploration theme を必ず作ること。

- framework-based theme だけで終わらせない
- `error-path`, `permission`, `boundary` など gap aspect ごとの theme を出す
- 1 theme は 1 テーマに絞る
- `frameworks`, `targetFiles`, `riskLevel`, `estimatedMinutes` を持たせる

要するに「読むための分析結果」ではなく「次の step がそのまま実行計画に落とせる粒度」にする。

### exploration theme 生成で coverage gap 引数を捨てない

`generateExplorationThemes(riskScores, frameworkSelections, coverageGaps)` の第3引数は未使用にしない。  
gap を使わない theme 生成は partial exploration を作れず、`#6` の session charter が粗くなる。

### 長い repository/tool テストは timeout 前提で設計する

このリポジトリの Vitest は `bun:sqlite` shim 経由で `sqlite3` CLI を多用するため、repository/tool テストは速くない。  
数回の workspace 初期化、DB 書き込み、progress file 更新を含むテストは 5 秒を超えることがある。

- `vitest.config.ts` の `testTimeout` / `hookTimeout` を不用意に短くしない
- idempotency テストでは cleanup race を避ける
- 「遅いけど正しい」テストを、短すぎる timeout で赤くしない

テストが落ちたら実装バグだけでなく timeout 設定も疑うこと。

### finding type ごとの必須項目は model と tool の両方で縛る

`finding` は type によって必須項目が変わる。特に `automation-candidate` は
`recommendedTestLayer` と `automationRationale` が実質必須。

- Valibot model で「type に応じた不変条件」を表現する
- tool 層でも保存前に business rule を明示チェックする
- CLI でも `automation-candidate` のときは `--test-layer` と `--rationale` を要求する

nullable にしておいて後段レポートで吸収する、という設計は避ける。  
requirements 上「どの test layer に落とすか提案できること」が求められているので、
`automation-candidate` なのに layer なし、rationale なしのデータは作ってはいけない。

### report 系は「対象が存在しない」と「対象はあるが件数ゼロ」を区別する

`finding report`, `finding automation-report` のような集計系コマンドは、
対象 `sessionId` / `riskAssessmentId` / `prIntakeId` などの親レコード存在確認を先に行うこと。

- 親が存在しない場合は明確なエラーを返す
- 親は存在するが子レコードが 0 件のときだけ空レポートを返す

存在確認なしで `list*()` の結果が空だからといって `0件` 扱いすると、
オペレーションミスと本当に結果が空のケースを区別できなくなる。  
このリポジトリでは resumable / auditable な運用が前提なので、集計対象の実在性は必ず検証する。

### CLI の machine output を壊さない

このリポジトリの CLI は後続 step や skill から機械的に読まれる前提。  
`cli/index.ts` の各 command は最後に `emitJson()` で返しているので、構造化出力を壊す人間向けログを混ぜないこと。

- `console.log("starting...")` のようなデバッグ出力を command 本体に足さない
- machine output は JSON だけにする
- 人間向けの説明は progress/handover 文書に書く

JSON 契約を壊すと skill 側の再現性が落ちる。

### CLI の JSON 契約を変えたら SKILL.md / README も同時に更新する

CLI の出力 shape は skill の実行手順や README の確認手順とセットで扱う。  
top-level JSON を `{ status, data }` に変える、field 名を変える、必須 field をネストする、といった変更をしたら `skills/*/SKILL.md` と必要な README 記述も同じ PR で更新すること。

- CLI だけ更新して skill の「JSON 出力に X が含まれることを確認する」を放置しない
- success/error envelope を変えたら、その command を参照する skill と docs を grep して追従箇所を洗う
- code が正しくても運用文書が古いと plugin の実運用は壊れる、とみなす

### handover の `summary` と本文を手抜きしない

`writeStepHandoverFromConfig()` に渡す `summary` は、単なる「done」ではなく次 step が判断材料にできる具体値を入れること。

- 件数
- 主要カテゴリ
- missing layer 数
- selected framework 数
- generated theme 数

本文の `## Next step` も workflow と一致させる。summary が曖昧だと progress-summary は更新されても、再開時の判断材料として弱い。

### Markdown table に入る文字列は必ず escape する

handover 本文では file path や reason を Markdown table に流し込むことが多い。  
`|` を含む path や説明文をそのまま出すと table が壊れる。

- table cell に入れる path / reason / coveredBy は `escapePipe()` 相当で処理する
- change analysis, map-tests, assess-gaps の handover では特に注意する
- free-text 入力（observation の action / expected / actual / note など）は改行も `<br>` に置換すること。`|` だけ escape しても `\n` が table 行を分断する

progress file は人間が読む成果物でもあるので、壊れた Markdown を残さないこと。

### `find*` 系 repository は「最新1件を取る」前提を崩さない

`findPrIntake()` は `provider + repository + pr_number` で最新の 1 件を返す。  
`head_sha` ごとに履歴を持てる設計なので、同じ PR 番号でも過去レコードが残る。

- 「同じ PR は常に 1 レコード」と思い込まない
- 冪等性キーと lookup キーは分けて考える
- 後続 step は基本的に「最新 intake にぶら下がる analysis/mapping」を扱う

履歴を潰してしまうと再実行や head 更新時の挙動が壊れる。

### schema を変えたら repository と model と test を同時に見る

このリポジトリは JSON カラムを Valibot で round-trip 検証している。  
DB schema だけ足して終わると、repository / model / test のどこかがすぐズレる。

- `db/schema.ts`
- `db/workspace-repository.ts`
- `models/*.ts`
- repository test
- tool test

最低でもこの 5 箇所はセットで確認すること。

### workflow step を増減したら progress 系も一緒に確認する

step 定義は `WORKFLOW_SKILLS` だけでは完結しない。  
step 名や順序を変えたら、`createStepProgressFilename()`, `detectCurrentStep()`, handover の `nextStep`, setup 後の current step まで見ること。

`workflow.ts` だけ更新して progress 側を見落とすと、summary と handover が不整合になる。

### heuristic は「高精度の断定」ではなく「保守的な推定」に倒す

このプラグインの初期実装は rules-first だが、rules は万能ではない。  
分類や test mapping で迷うときは、

- 断定して `covered` にするより `partial`
- 無関係な aspect を増やすより applicable scope を絞る
- 強い理由がないのに high confidence を付けない

の方が安全。探索プランニング用途では、偽陽性の安心感より偽陰性寄りの慎重さの方がマシ。

また、multi-source merge するロジック（例: `inferChangePurpose`）では、分類不能時に `"other"` のような具体値を返さないこと。  
`"other"` を返すと後続ソースの具体的な分類が無視される。分類不能は `null` を返し、呼び出し元が fallback を決める設計にする。

## 深い仕様を確認したいとき

横断的な仕様変更やアーキテクチャ変更のときだけ参照:

- `requirements.md` — 探索的テストの要件定義（5つの着眼点、8つの探索フレームワーク、出力物要件）
- `stateful-workflow-plugin-framework.md` — ステートフルワークフローの設計パターン集（3層ステート管理、スキル設計パターン、CLI ブリッジ設計）
