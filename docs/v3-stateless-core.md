# v3 Stateless Core — Migration Complete

## Current State

`shiftleft-qa` の primary value は、次の 3-skill public flow で完結する。

1. `analyze-pr`
2. `design-handoff`
3. `publish-handoff`

この flow は CLI 主導ではなく、SKILL 主導で順にリレーする。legacy workflow の retirement は完了済み。

## What Is Core

- PR metadata / changed files / related issue / acceptance criteria を読む
- existing tests と layer applicability を整理する
- manual exploration に残す項目だけを handoff markdown に落とす
- GitHub QA Issue を publish / update する
- 各 skill の途中で、CLI や PR / issue から取れない不足文脈だけを `AskUserQuestion` で確認する
- 各 skill の終わりで成果を要約し、`AskUserQuestion` で次の skill に進んでよいか確認する

## What Is Optional

- `config.json` — publish defaults や DB パスの設定に使うが、なくても skill は動作可能
- local SQLite DB — resumable state / cache として使用
- exported artifacts — 補助資料として必要時のみ生成

## Internal Implementation

public skill は内部で legacy analysis step の tool 関数を合成して使う。

Public skill | 内部で使う tool 関数
--- | ---
`analyze-pr` | `pr-intake`, `discover-context`, `map-tests`
`design-handoff` | `assess-gaps`, `allocate`, `handoff generate`
`publish-handoff` | `handoff publish`, `handoff update`

これらの内部 tool 関数は独立した user-facing workflow ではなく、public skill の実装レイヤーとして存続する。

## Design Rule

- user-facing skill は「step 名」ではなく「達成したい outcome」で切る
- public SKILL は outcome-oriented で、対話と判断の主役を持つ
- CLI は fact collection / rendering / publish の実装層として使う
- 意味づけと不明点解消は SKILL 側が持つ
- `AskUserQuestion` は、CLI や PR / issue / diff から取れない文脈に限って使う
- 各 public skill の終わりで、`AskUserQuestion` で次の skill に進んでよいかを確認する
- PR から QA handoff までに必要な中間 record ID を user に意識させない
- public skill が広い責務を持っても、内部 module は分割を維持してよい
