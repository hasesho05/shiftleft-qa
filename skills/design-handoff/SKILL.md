---
name: design-handoff
description: manual exploration に残す項目を絞り、QA handoff の下書きを作る。
---

# Design Handoff

## 目的

analysis 結果から、何がすでに担保され、何を QA handoff に残すかを整理する。

この skill は、旧 `assess-gaps` / `allocate` / `handoff generate` をまとめた public skill として扱う。manual exploration が多い場合だけ `generate-charters` の役割も一部吸収してよい。

## デフォルトの考え方

- manual exploration は「テスト layer がない場所」ではなく、曖昧さや状態依存が残る場所に限定する。
- non-primary layer の不在をそのまま gap にしない。
- 現在の実装は内部的に `allocate` と `handoff generate` を使ってよい。
- ユーザーには allocation item や risk assessment record の存在を前提知識として要求しない。
- 先に CLI から draft 作成に必要な事実を集め、それでも不足する運用判断があれば `AskUserQuestion` で確認する。

## 実行手順

1. `bun run dev design-handoff --pr <number>` を実行する。
   - 内部で allocate / handoff generate を順に実行する。
   - PR 番号だけで前段の analysis 結果を DB から自動解決する。internal ID の指定は不要。
2. 返却 JSON から already covered / should automate / manual exploration / counts / summary を読み取る。
3. ambiguity や scope の判断が残る場合は、`AskUserQuestion` で不足文脈を確認する。
4. handoff draft を要約する。
5. `AskUserQuestion` で `publish-handoff` に進んでよいか確認する。

CLI:

```bash
bun run dev design-handoff --pr <number>
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

## 確認ポイント

- `Already Covered` / `Should Automate` / `Manual Exploration Required` の分離が妥当であること。
- `Layer Applicability` が `primary` / `secondary` / `not-primary` / `no-product-change` を保守的に表現していること。
- manual exploration が広がりすぎていないこと。
- charter 生成が必要なら、この段階で「どのテーマを短い実行単位に落とすか」まで判断できること。
- 次の skill に進む前に、`AskUserQuestion` でユーザー確認が取れていること。

## 次の Step

- `publish-handoff`
