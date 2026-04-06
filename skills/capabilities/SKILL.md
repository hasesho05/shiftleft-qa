---
name: capabilities
description: shiftleft-qa の対応範囲、前提、非対応事項を案内する。
---

# Capabilities

## 目的

この plugin が何を扱い、何を扱わないかを最初に共有する。

## 案内内容

- plugin の目的
- source of truth の置き方
- stateless-first の主要 workflow
- 非対応事項
- 利用者が最初に呼ぶべき skill

## 伝えるべき要点

- まずは `analyze-pr` → `design-handoff` → `publish-handoff` を主フローとして案内する
- この 3 つの public skill が順にリレーし、各 skill の中で必要なら不足文脈を質問する
- GitHub Issue が shared handoff の正本
- local DB / progress files は cache / resumable state として扱う
- manual exploration を増やすためではなく、manual に残る前に削るための plugin
- exported artifacts は補助資料
- 現在の実装では一部 command が `setup` / `config.json` を前提にするが、これは legacy persistence layer 寄りの都合である
- CLI は事実取得と publish の実装層であり、意味づけと次 step への確認は skill 側が持つ

## 案内の終わり方

- 利用者が `analyze-pr` から始める前提を明示する
- 必要なら `setup` は legacy / advanced path だと補足する
- `analyze-pr` に進んでよいかを確認して終える

## 会話テンプレート

### 開始時

- plugin の目的と source of truth を短く案内する。
- 詳細な実装論より、利用者がどの flow で進めるかを先に示す。

例:

- 「この plugin は PR と既存テストを整理し、最後に GitHub QA Issue へ handoff するためのものです。主フローは `analyze-pr` → `design-handoff` → `publish-handoff` です。」

### 終了時

- `setup` は通常利用の入口ではないと必要に応じて補足する。
- `analyze-pr` に進んでよいかを確認して閉じる。

例:

- 「通常は `setup` ではなく `analyze-pr` から始めます。このまま `analyze-pr` に進めてよければ続けます。」

## 次の Step

- `analyze-pr`
