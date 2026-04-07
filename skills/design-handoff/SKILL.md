---
name: design-handoff
description: manual exploration に残す項目を絞り、QA handoff の下書きを作る。
---

# Design Handoff

## 目的

analysis 結果から、何がすでに担保され、何を QA handoff に残すかを整理する。

この skill は、内部的に allocation と handoff markdown 生成を実行して QA handoff ドラフトを作る。

## デフォルトの考え方

- manual exploration は「テスト layer がない場所」ではなく、曖昧さや状態依存が残る場所に限定する。
- non-primary layer の不在をそのまま gap にしない。
- ユーザーには内部 ID や allocation record の存在を前提知識として要求しない。
- 先に CLI から draft 作成に必要な事実を集め、それでも不足する運用判断があれば `AskUserQuestion` で確認する。
- 対象 repository の root で実行するのが基本。別 cwd から実行する場合は `--repository-root <path>` を必ず付ける。

## 実行手順

1. 対象 repository の root で CLI を実行する。plugin ディレクトリなど別 cwd なら `--repository-root <path>` を付ける。
2. `bun run dev design-handoff --pr <number>` を実行する。
   - 内部で allocation → handoff markdown 生成を順に実行する。
   - `config.json` と local DB がなければ自動初期化する。
   - PR 番号だけで前段の analysis 結果を DB から自動解決する。internal ID の指定は不要。
3. 返却 JSON から already covered / should automate / manual exploration / counts / summary を読み取る。
4. ambiguity や scope の判断が残る場合は、`AskUserQuestion` で不足文脈を確認する。
5. handoff draft を要約する。
6. `AskUserQuestion` で `publish-handoff` に進んでよいか確認する。

CLI:

```bash
# 対象 repository の root で実行する場合
bun run dev design-handoff --pr <number>

# GitLab MR などで markdown ファイルとして書き出す場合:
bun run dev design-handoff --pr <number> --output qa-handoff.md

# plugin ディレクトリなど別 cwd から実行する場合
bun run dev design-handoff --pr <number> --repository-root /path/to/target-repo

# plugin ディレクトリなど別 cwd から GitLab MR 用に書き出す場合
bun run dev design-handoff --pr <number> --output qa-handoff.md --repository-root /path/to/target-repo
```

## 会話テンプレート

### 開始時

- いまから `already covered` / `should automate` / `manual exploration required` を整理し、handoff draft を作ることを短く伝える。
- まずは allocation と draft 生成に必要な事実を CLI から集める。

例:

- 「analysis をもとに handoff draft を組み立てます。まずは covered / automate / manual exploration の切り分けを確認します。」

### 質問してよい条件

- manual exploration に残す範囲が広すぎて、運用上の優先順位づけが必要
- should automate と manual exploration の境界が、プロダクト意図に依存する
- publish 前に対象 QA チームへ渡す粒度を確認したい

この場合だけ `AskUserQuestion` を使う。質問は、draft の意味づけに必要な不足判断に限る。

### 要約時

- 少なくとも次を短く整理する。
  - already covered の要点
  - should automate の要点
  - manual exploration required の要点
  - layer applicability の読み方
  - 残っている open question

### 次へ進む確認

- handoff draft の要約後、`AskUserQuestion` で `publish-handoff` に進んでよいかを確認する。

例:

- 「handoff draft は以上です。この内容で `publish-handoff` に進めてよいですか。」

## 完了条件

- `実装要件` セクションが acceptance criteria / userStory / changed files から導出され、各要件に `関連テスト` / `根拠ソース` が紐付いていること。
- `テストレイヤー` が test assets と allocation destinations から導出された日本語表示 (単体テスト / 統合テスト / サービステスト / ビジュアルテスト / E2Eテスト) であること。
- `手動確認が必要な項目` が実行可能な粒度に収まっていること。
- manual exploration が広がりすぎていないこと。
- 次の skill に進む前に、`AskUserQuestion` でユーザー確認が取れていること。

## 次の Step

- `publish-handoff`
