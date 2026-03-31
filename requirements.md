# requirements.md

## 目的

TypeScript で実装する Claude Code Plugin を設計・実装したい。  
この Plugin は、**実装完了後の手動探索的テスト**を高品質かつ再現性高く支援することを目的とする。

本 Plugin は、PR / MR の Diff、関連するユニットテスト、E2E テスト、ビジュアルテスト、実装コードを解析し、  
**どの観点で、どの順番で、どこを重点的に手動探索すべきか**を導出する。

探索的テストはランダム操作ではなく、ベストプラクティスに基づく**知識駆動・観点駆動・リスク駆動**の活動として扱うこと。

---

## 前提

- シフトレフトを前提とする
- 実装前に Three Amigos により仕様は十分に固まっている
- 必要であれば、開発中に dev-box テストも行われる
- 本 Plugin の対象は、**実装完了後に行う手動探索的テスト**である
- 手動探索テスト担当者はブラックボックステスターではなく、以下を理解した上で探索する
  - PR / MR の意図
  - Diff
  - 関連コード
  - 既存自動テストの守備範囲
- Plugin は、会話コンテキストではなく**ファイルベースのステート管理**を採用する
- Auto Compact に強い構成にすること
- ローカル DB と `config.json` を使って状態を永続化すること
- 単一サービス専用ではなく、**複数マイクロサービス横断で利用可能**にすること
- CLI での機能を事前に TypeScript ファイルとして定義し、再現性の高い処理を行うこと

---

## この Plugin が解決すべきこと

### 1. 探索前の理解不足を減らす
PR / MR の Diff や関連コードを読んだうえで、探索対象機能を正しく理解できるようにする。

### 2. 自動テストの守備範囲を明確化する
以下を読み取り、何が保証されていて何が未保証かを整理する。

- Unit test
- E2E test
- Visual test
- Storybook story
- API contract test があればそれも含む

### 3. 最適な手動探索テストを導出する
対象機能や変更内容に応じて、手動探索テストの観点、順序、優先度、部分的探索の切り方を提案する。

### 4. 探索中の観察を構造化する
実施中の操作、期待結果、実結果、証拠、解釈を構造化して保存できるようにする。

### 5. 発見事項を次の品質資産に接続する
発見事項を以下に分類できるようにする。

- defect
- spec gap
- automation candidate

---

## 探索的テストのベストプラクティス要件

Plugin は、手動探索的テストのベストプラクティスを漏れなく踏まえること。

### A. 5つの着眼点を必ず収集すること

探索開始前に、少なくとも以下の 5 つの観点を整理すること。

1. 機能的ユーザーフロー
2. ユーザーペルソナ
3. UI のルックアンドフィール
4. データとエラーハンドリング
5. アーキテクチャ / インフラ / 機能横断観点

Plugin は、PR / MR、Diff、関連コード、既存テストからこれらを埋めること。

---

### B. 8つの探索フレームワークを知識モデルとして持つこと

Plugin は以下の 8 つの探索フレームワークを前提知識として持ち、変更内容に応じて適切なものを選択適用すること。

1. 同値クラス分割
2. 境界値分析
3. 状態遷移
4. デシジョンテーブル
5. 原因結果グラフ
6. ペアワイズ法
7. サンプリング
8. エラー推測

重要:
- 毎回全部使わないこと
- Diff / 自動テスト / 実装構造から、適切なものだけを選ぶこと
- 選定理由も説明できるようにすること

---

### C. 部分的探索を支援すること

Plugin は、探索を大きな 1 回の作業として扱わず、**部分的探索**として切り出せるようにすること。

例えば以下のような単位で分割できること。

- 境界値だけ探索
- 権限差分だけ探索
- 既存データあり状態だけ探索
- API エラー時だけ探索
- Cross-service の整合性だけ探索
- loading / disabled / retry / timeout だけ探索

1 セッション 1 テーマで実施できるようにすること。

---

### D. ブラックボックス前提にしないこと

Plugin は、手動探索担当者が以下を事前に読めることを前提とすること。

- PR / MR
- Diff
- 実装コード
- 関連テストコード

つまり、Plugin は「何も知らない状態での操作チェック」を支援するのではなく、  
**変更意図と既存自動テストを踏まえて、その外側を狙う探索**を支援すること。

---

### E. DevTools / Network / Console 観察を標準化すること

特に Web UI の探索では、UI だけでなく以下も標準観察対象に含めること。

- browser console
- network tab
- failed requests
- duplicate requests
- retry
- timeout
- loading / disabled / stale state
- 必要なら backend log 参照情報

---

## 機能要件

### 1. PR / MR 取り込み

PR / MR 番号を入力として、以下を取得できること。

- title
- description
- author
- linked issue / story
- changed files
- base branch / head branch
- reviewer comments が取得可能ならそれも

以下の CLI を利用可能にすること。

- `gh`
- `glab`
- `git`

---

### 2. Diff 解析

Diff から以下を推定できること。

- UI 変更
- API 変更
- validation 変更
- 状態遷移変更
- 権限変更
- 非同期処理変更
- schema 変更
- shared component 変更
- feature flag 変更
- cross-service 影響

---

### 3. 関連テスト抽出

変更に関連する以下のテストファイルを抽出・要約できること。

- unit tests
- e2e tests
- visual tests
- Storybook stories
- API tests

要約すべきこと:

- 何を保証しているか
- happy path を見ているか
- error path を見ているか
- boundary を見ているか
- permission を見ているか
- state transition を見ているか
- mock / fixture の暗黙前提は何か

---

### 4. Coverage Gap Map 生成

以下を整理できること。

- 自動テストで保証済みの領域
- 未保証と思われる領域
- 手動探索で重点的に見るべき領域
- どの探索フレームワークを適用すべきか

---

### 5. Session Charter 生成

Plugin は、実行可能な探索セッション計画を生成できること。

各 Charter に含めること:

- title
- goal
- scope
- selected frameworks
- preconditions
- observation targets
- stop conditions
- timebox

原則:
- 1 Charter 1 テーマ
- 短時間で実行可能
- あいまいでない
- 具体的であること

---

### 6. Session 記録

探索実施中に、以下を構造化して保存できること。

- targeted heuristic
- action
- expected
- actual
- outcome
- note
- evidence path

outcome の例:

- pass
- fail
- unclear
- suspicious

---

### 7. Findings triage

発見事項を分類できること。

- defect
- spec gap
- automation candidate

automation candidate については、どの層に追加すべきかも提案できること。

- unit
- integration
- e2e
- visual
- api

---

## 非機能要件

### 1. Auto Compact 耐性
会話履歴に依存しないこと。  
必要な状態は全てファイルまたは DB に保存すること。

### 2. 再開可能性
途中で中断しても、ファイルと DB を読めば再開できること。

### 3. 再現性
判断の元になる処理は可能な限り CLI と TypeScript コード側に寄せること。  
LLM に毎回自由判断させすぎないこと。

### 4. 拡張性
単一アプリ専用でなく、マイクロサービスが増えても対応できる構造にすること。

### 5. 冪等性
同じ PR / MR に対して複数回実行しても壊れにくいこと。

---

## 実装方式の要求

### 1. TypeScript で実装すること

Python ではなく TypeScript で実装する。

### 2. CLI 中心で設計すること

高度で再現性の高い処理は CLI コマンドとして TypeScript で実装すること。  
Skill 側はできるだけそれを呼び出すだけにすること。

### 3. ファイルベース Plugin 構成にすること

Shinkoku plugin のような構成を参考に、以下の思想を持つこと。

- `.claude-plugin/plugin.json`
- `skills/`
- `src/.../cli`
- `src/.../tools`
- `db`
- `config`
- `tests`

---

## 期待するディレクトリ構成の方向性

以下のような構成思想を持つこと。

```text
plugin-root/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   ├── setup/
│   ├── pr-intake/
│   ├── discover-context/
│   ├── map-tests/
│   ├── assess-gaps/
│   ├── generate-charters/
│   ├── run-session/
│   ├── triage-findings/
│   └── export-artifacts/
├── src/
│   └── exploratory-testing/
│       ├── cli/
│       ├── tools/
│       ├── db/
│       ├── config/
│       ├── models/
│       ├── risk/
│       ├── heuristics/
│       ├── parsers/
│       └── scm/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── fixtures/
│   └── helpers/
├── config.example.json
├── package.json
├── tsconfig.json
└── README.md

状態管理要件
config
config.json を使うこと
database
ローカル DB を使うこと
第一候補は SQLite
progress files
各 step の結果を markdown または json で保存すること
CLI bridge
DB 直接操作ではなく CLI を経由すること
入出力は JSON を基本とすること
Skill / CLI に期待する役割分担
Skill
ワークフロー制御
config / progress の読み書き
CLI 呼び出し
結果要約
次ステップへの handover
CLI
PR / MR 取得
diff 解析
changed files 整理
test mapping
risk analysis
charter material generation
finding persistence
report generation
出力物要件

最低限、以下を出力できるようにすること。

1. Exploration Brief
変更概要
5つの着眼点の整理
高リスク領域
変更影響範囲
2. Coverage Gap Map
自動テストで保証済み
未保証
手動探索優先領域
3. Session Charters
実行可能な探索計画
4. Findings Report
発見事項の整理
5. Automation Candidate Report
どの自動テスト層に落とすべきか
品質要求

この Plugin は、以下を満たす品質であること。

手動探索的テストのベストプラクティスを踏み外さないこと
5つの着眼点を漏らさないこと
8つの探索フレームワークの使い分けが妥当であること
自動テストと手動探索の役割分担が明確であること
Session Charter が具体的かつ実行可能であること
マイクロサービス横断の観点が抜けないこと
Auto Compact に依存しないこと
会話ではなくファイルと DB を正本にすること
実装時に重視すること
実装に関係のない説明は最小限にすること
設計よりも、実際に動く Plugin 構成と責務分担を重視すること
プロンプトだけでなく、TypeScript 側で再現性ある処理を持つこと
LLM に丸投げせず、ルール化・構造化・永続化を優先すること
最終的に作りたいもの

最終的には、PR / MR 番号を渡すと、Plugin が以下をできる状態にしたい。

変更内容を理解する
5つの着眼点を整理する
関連自動テストを読む
守備範囲と未保証領域を可視化する
8つの探索フレームワークから適切なものを選ぶ
実行可能な手動探索セッションを生成する
実施ログを保存する
発見事項を triage する
自動化候補へつなげる

この要件を満たす Claude Code Plugin を、TypeScript ベース・CLI 中心・ファイルベースステート管理で設計・実装すること。