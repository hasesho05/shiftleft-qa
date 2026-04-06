---
name: analyze-pr
description: PR と related issue を読み、intent context と既存テストを整理する。
---

# Analyze PR

## 目的

PR を読んで、次の handoff 設計に必要な事実をまとめる。

- PR 概要
- related issue / acceptance criteria / intent context
- changed files
- 既存テストと layer applicability

この skill は、旧 `pr-intake` / `discover-context` / `map-tests` をまたぐ coarse-grained entrypoint として扱う。必要なら `assess-gaps` の一部まで吸収してよい。

## デフォルトの考え方

- v3 では `PR -> test understanding -> manual test design -> QA issue handoff` を主フローとして扱う。
- 現在の実装は内部的に `pr-intake` / `discover-context` / `map-tests` / `assess-gaps` を使ってよい。
- `setup` と local DB / progress files は、現行実装では必要なことがあるが、user-facing には主語にしない。
- ユーザーには individual step 名ではなく、「PR と既存テストを理解する skill」として見せる。
- 先に CLI / GitHub / diff / issue から取れる事実を集め、それでも不足する文脈だけをユーザーに質問する。

## 実行手順

1. `bun run dev analyze-pr --pr <number>` を実行する。
   - 内部で pr-intake / discover-context / map-tests / assess-gaps を順に実行し、結果を統合する。
   - 返却 JSON に internal ID は含まれない。
2. 返却 JSON から intent context / changed files / test coverage / risk highlights / layer applicability を読み取る。
3. 事実だけでは intent や acceptance criteria が足りない場合は、ユーザーに不足文脈を確認する。
4. 整理結果を要約する。
5. `design-handoff` に進んでよいか確認する。

CLI:

```bash
bun run dev analyze-pr --pr <number>
```

## 会話テンプレート

### 開始時

- いまから PR / related issue / diff / existing tests を確認し、handoff 設計の前提を整理することを短く伝える。
- 最初は質問せず、CLI と GitHub から取れる事実を先に集める。

例:

- 「PR と related issue、既存テストを確認し、handoff 設計の前提を整理します。まずは diff と issue から取れる事実を集めます。」

### 質問してよい条件

- PR 本文や related issue を読んでも acceptance criteria が曖昧
- intent context が複数解釈に割れる
- QA scope に影響する前提が diff から読めない

質問は、その skill の判断に必要な不足文脈だけに絞る。

### 要約時

- 少なくとも次を短く整理する。
  - PR の狙い
  - related issue / acceptance criteria の要点
  - changed files の大枠
  - existing tests と layer applicability の要点
  - 残っている不確実性

### 次へ進む確認

- 要約のあと、`design-handoff` に進んでよいかを明示的に確認する。

例:

- 「analysis は以上です。この前提で `design-handoff` に進めてよければ続けます。」

## 完了条件

- linked issue や PR 本文から intent context が読めている。
- changed files と categories が整理されている。
- 既存テスト候補、coverage confidence、layer applicability が確認できている。
- 後続の `design-handoff` が内部 ID や step 順序を意識せずに進められる形に要約されている。
- 次の skill に進む前に、ユーザー確認が取れている。

## 次の Step

- `design-handoff`
