---
name: publish-handoff
description: QA handoff Issue を publish / update し、必要なら findings を返す。
---

# Publish Handoff

## 目的

QA handoff を GitHub Issue として publish / update し、shared source of truth を更新する。

この skill は、旧 `handoff publish` / `handoff update` / `handoff add-findings` を吸収する public skill として扱う。

## デフォルトの考え方

- primary artifact は GitHub QA Issue。
- local DB / progress / exported artifacts は補助的な cache / resume layer として扱う。
- findings comment は post-handoff の optional follow-up として扱う。
- 既存 issue を更新するか、新規 issue を作るかは user-facing には 1 つの handoff lifecycle として扱う。
- `config.json` の `publishDefaults` があれば publish の既定値として使う。
- publish 前に必要なら title / target issue / scope をユーザーに確認してよい。
- 質問は、config と draft から埋まらない項目だけに絞る。

## 実行手順

1. handoff draft を GitHub QA Issue に create / update する。
2. 必要なら findings comment を返す。
3. publish 前に title / target issue / scope が不明なら、ユーザーに確認する。
4. 完了後に issue URL や comment 結果を要約して返す。

現在の実装で使う CLI 例:

- `bun run dev handoff publish --risk-assessment-id <id>`
- `bun run dev handoff update --risk-assessment-id <id> --issue-number <number>`
- `bun run dev handoff add-findings --issue-number <number> --session-id <id>`

## 会話テンプレート

### 開始時

- いまから GitHub QA Issue を create / update することを短く伝える。
- 既存 issue 更新か新規 publish か、現時点で確定しているかを確認する。

例:

- 「handoff を GitHub Issue に反映します。まずは新規 publish か既存 update かを確認します。」

### 質問してよい条件

- config に repository がない
- config に title prefix / labels / assignees / findingsComment の既定値がない
- title が未確定
- target issue number が未確定
- findings comment を今回返すかどうかが未確定
- publish scope を narrow / broad のどちらにするか判断が必要

質問は、publish の成否や意味に直結する事項に限る。

### 完了報告

- 少なくとも次を返す。
  - create か update か
  - issue number / URL
  - findings comment を返したかどうか
  - 次に見るべき artifact があればその要点

例:

- 「QA handoff Issue を更新しました。Issue は #123、URL は <...> です。findings comment は今回は追加していません。」

## 完了条件

- GitHub Issue が最新の QA handoff を表している。
- body に PR 要約、intent context、layer applicability、manual exploration が含まれている。
- findings を返す場合は最新 session に対応する comment が追加されている。
