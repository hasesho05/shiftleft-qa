---
name: codex-review
description: |
  Codex CLI（read-only）を用いて、必要十分な範囲でレビューし、
  blocking 指摘がある場合のみ最小限の再レビューを行う軽量レビューゲート。
  仕様書/SPEC/PRD/要件定義/設計、実装計画の作成・更新直後、
  公開 API / 新規モジュール / security / config 変更時、
  および PR 前・merge 前に使用する。
  キーワード: Codexレビュー, codex review, レビューゲート, code review
argument-hint: "[diff_range] [--max-iters N] [--focus AREA] [--parallelism N]"
disable-model-invocation: false
allowed-tools: Read, Grep, Glob, Bash, Agent, AskUserQuestion
---

# Codexレビュー

Codex CLI を read-only サンドボックスで呼び出し、まず軽量レビューを行う。
深掘りは必要なときだけ行い、再レビューは blocking 指摘がある場合だけ実施する。

## フロー

規模判定 → まず diff レビュー → 必要時のみ arch / 並列化 → blocking 時のみ再レビュー

```
[規模判定] → small:  diff ───────────────────────→ [必要時のみ再レビュー]
          → medium: diff ──┬─→ [必要時 arch] ───→ [必要時のみ再レビュー]
          → large:  diff ──┴─→ [必要時 並列化] ─→ [必要時のみ再レビュー]
```

- Codex: read-onlyでレビュー（監査役）
- Claude Code: 修正担当

## 規模判定

```bash
git diff <diff_range> --stat
git diff <diff_range> --name-status --find-renames
```

| 規模 | 基準 | 戦略 |
|-----|------|-----|
| small | ≤3ファイル、≤100行 | diff |
| medium | 4-10ファイル、101-400行 | diff |
| large | >10ファイル、または >400行 | diff |

`diff_range` 省略時: HEAD を使用し、作業ツリーの未コミット変更（作業ツリー vs HEAD）を対象とする（staged/unstaged の区別はしない）。

## 追加フェーズの発火条件

### arch を追加する条件

以下のいずれかに当てはまる場合のみ `arch` を追加する:

- 新規モジュール追加
- 公開 API 変更
- `container.ts`、config、security 境界の変更
- diff レビューで責務分割や依存違反の疑いが出た場合

### 並列 diff / cross-check を追加する条件

以下のいずれかに当てはまる場合のみ並列化する:

- 20ファイル超
- 800行超
- 1回の diff レビューでは見切れないと判断した場合
- cross-cutting な変更で、単発 diff だと interface 整合や横断影響を見落としやすい場合

並列化する場合:

- 並列: 2-4 サブエージェント
- 分割: 1呼び出しあたり最大5ファイル / 300行
- cross-check は並列レビューを行った場合のみ実施

## 修正ループ

`ok: false` かつ blocking 指摘がある場合のみ、`max_iters`回まで反復:
1. `issues`解析 → 修正計画
2. Claude Codeが修正（最小差分のみ、仕様変更は未解決issueに）
3. テスト/リンタ実行（可能なら）
4. Codexに再レビュー依頼

停止条件:
`ok: true` / blocking 指摘解消 / `max_iters`到達 / テスト2回連続失敗

デフォルト:

- advisory のみなら再レビューしない
- 再レビューは原則 1 回、最大 2 回まで

## Codex実行

```bash
codex exec --sandbox read-only "<PROMPT>"
```

- PROMPT には（スキーマ含む）最終プロンプトを渡す
- 主要な関連ファイルパスはClaude Codeが明示
- レビュー完了待ち（必須）: codex exec 実行中は次の工程に進まない（別タスク開始・推測での中断禁止）
  - 定期確認: 30秒ごとに最大10回、`poll i/10` と経過時間のみをログし、追加作業はしない
  - 10回到達後も未完了なら: 「タイムアウト」扱いでエラー時ルールへ
  - 長時間無出力になり得るため、必要に応じて codex exec をバックグラウンド実行し、プロセス生存確認を poll として扱ってよい。

## Codex出力スキーマ

CodexにJSON1つのみ出力させる。Claude Codeはプロンプト末尾に以下のスキーマとフィールド説明を添付。

```json
{
  "ok": true,
  "phase": "arch|diff|cross-check",
  "summary": "レビューの要約",
  "issues": [
    {
      "severity": "blocking",
      "category": "security",
      "file": "src/auth.py",
      "lines": "42-45",
      "problem": "問題の説明",
      "recommendation": "修正案"
    }
  ],
  "notes_for_next_review": "メモ"
}
```

フィールド説明:
- `ok`: blockingなissueが0件ならtrue、1件以上ならfalse
- `severity`: 2段階
  - blocking: 修正必須。1件でもあれば`ok: false`
  - advisory: 推奨・警告。`ok: true`でも出力可、レポートに記載のみ
- `category`: correctness / security / perf / maintainability / testing / style
- `notes_for_next_review`: Codexが残すメモ。再レビュー時にClaude Codeがプロンプトに含める

## プロンプトテンプレート

### arch

```
以下の変更のアーキテクチャ整合性をレビューせよ。出力はJSON1つのみ。スキーマは末尾参照。

これはレビューゲートとして実行されている。blocking が1件でもあれば ok: false とせよ。advisory は過剰に増やさず、本当に有益なものだけに絞れ。

diff_range: {diff_range}
観点: 依存関係、責務分割、破壊的変更、セキュリティ設計
前回メモ: {notes_for_next_review}
```

### diff

```
以下の変更をレビューせよ。出力はJSON1つのみ。スキーマは末尾参照。

これはレビューゲートとして実行されている。blocking が1件でもあれば ok: false とせよ。advisory は厳選し、修正コストに見合うものだけ指摘せよ。

diff_range: {diff_range}
対象: {target_files}
観点: {review_focus}
前回メモ: {notes_for_next_review}
```

### cross-check

```
並列レビュー結果を統合し横断レビューせよ。出力はJSON1つのみ。スキーマは末尾参照。

これはレビューゲートとして実行されている。横断的な blocking（例: interface不整合、認可漏れ、API互換破壊）があれば ok: false とせよ。advisory は最小限に絞れ。

全体stat: {stat_output}
各グループ結果: {group_jsons}
観点: interface整合、error handling一貫性、認可、API互換、テスト網羅
```

## figflow 固有のレビュー観点

Codex に渡す diff レビュープロンプトには、以下の figflow 固有観点を含める:

- **レイヤー依存**: domain/ が外部パッケージや上位層を import していないか
- **型安全**: `as Type` キャスト、`!` non-null assertion、`any` の使用がないか
- **クラスレス**: class / this を使用していないか（FigflowError 以外）
- **ポートパターン**: application/ がポート経由でのみ外部アクセスしているか
- **セキュリティ**: symlink チェック、パストラバーサル検出、SVG サニタイズが適切か
- **エラーコード**: FigflowError のコード形式が `FF-{CATEGORY}-{3桁}` に従っているか
- **readonly**: interface プロパティに readonly が付与されているか
- **exactOptionalPropertyTypes**: optional プロパティに `| undefined` が明示されているか

## エラー時の共通ルール

Codex exec失敗時（タイムアウト・API障害・その他）:
1. 1回だけリトライする
2. 並列フェーズで失敗した場合は単一 diff にフォールバックする
3. 再失敗 → 該当フェーズをスキップし、理由をレポートに記録する

## パラメータ

| 引数 | 既定 | 説明 |
|-----|-----|-----|
| max_iters | 2 | 最大反復（上限2） |
| review_focus | - | 重点観点 |
| diff_range | HEAD | 比較範囲 |
| parallelism | 2 | 並列 diff 時の並列度（上限4） |

## 終了レポート例

```
## Codexレビュー結果
- 規模: large（12ファイル、620行）
- 戦略: diff → arch
- 反復: 1/2 / ステータス: ✅ ok

### 修正履歴
- auth.py: 認可チェック追加

### Advisory（参考）
- main.py: 関数名がやや冗長、リファクタ推奨

### 未レビュー（エラー時のみ）
- utils/legacy.py: Codexタイムアウト、手動確認推奨

### 未解決（あれば）
- main.py: 内容、リスク、推奨アクション
```
