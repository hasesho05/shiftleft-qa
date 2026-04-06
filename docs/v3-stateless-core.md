# v3 Stateless Core

## Goal

`shiftleft-qa` の primary value を、次の core flow に揃える。

1. `analyze-pr`
2. `design-handoff`
3. `publish-handoff`

この core flow は CLI 主導ではなく、SKILL 主導で順にリレーする。

## What Is Core

- PR metadata / changed files / related issue / acceptance criteria を読む
- existing tests と layer applicability を整理する
- manual exploration に残す項目だけを handoff markdown に落とす
- GitHub QA Issue を publish / update する
- 各 skill の途中で、CLI や PR / issue から取れない不足文脈だけを `AskUserQuestion` で確認する
- 各 skill の終わりで成果を要約し、`AskUserQuestion` で次の skill に進んでよいか確認する

## What Becomes Optional

- `config.json`
- local SQLite DB
- progress files
- 11-step workflow tracking
- charters / findings / export の常設フロー化

## Migration Stance

- lower-level functions はすぐ削除しない
- まず user-facing docs / skills / manifest / README を coarse-grained surface に寄せる
- persisted workflow は advanced / legacy path として残す
- live E2E は最終的な GitHub Issue create / update / comment を最優先で守る

## Skill Merge Direction

v3 では「skill 数を単純に減らす」より、近い責務を public skill に吸収して再編する。

Public skill | 吸収する旧 step | 新しい責務
--- | --- | ---
`analyze-pr` | `pr-intake`, `discover-context`, `map-tests`, 必要に応じて `assess-gaps` の一部 | PR / related issue / intent / changed files / existing tests / layer applicability を 1 つの analysis としてまとめる
`design-handoff` | `assess-gaps`, `allocate`, `handoff generate`, 条件付きで `generate-charters` | 何が already covered で、何を automate し、何を manual exploration に残すかを設計する
`publish-handoff` | `handoff publish`, `handoff update`, `handoff add-findings` | GitHub QA Issue を正本として publish / update し、必要な follow-up を返す

Optional skill | 元の主な責務
--- | ---
`charters` | `generate-charters`
`findings` | `run-session`, `triage-findings`
`export` | `export-artifacts`

Legacy / internal step は、public skill の内部実装として残っていてよい。

## Design Rule

- user-facing skill は「step 名」ではなく「達成したい outcome」で切る
- public SKILL は outcome-oriented で、対話と判断の主役を持つ
- CLI は fact collection / rendering / publish の実装層として使う
- 意味づけと不明点解消は SKILL 側が持つ
- `AskUserQuestion` は、CLI や PR / issue / diff から取れない文脈に限って使う
- 各 public skill の終わりで、`AskUserQuestion` で次の skill に進んでよいかを確認する
- PR から QA handoff までに必要な中間 record ID を user に意識させない
- public skill が広い責務を持っても、内部 module は分割を維持してよい
- 旧 step を残す場合でも、README や plugin manifest の主導線には出しすぎない

## Public Skill Contract

### `analyze-pr`

- PR / related issue / acceptance criteria / existing tests / diff を読む
- CLI や GitHub から取れる事実を先に集める
- それでも不足する intent context があれば `AskUserQuestion` で質問する
- 整理結果を要約する
- `AskUserQuestion` で `design-handoff` に進んでよいか確認する

### `design-handoff`

- `already covered` / `should automate` / `manual exploration required` を整理する
- allocation や handoff draft のために必要な事実を CLI から集める
- それでも不足する運用判断やスコープがあれば `AskUserQuestion` で質問する
- handoff draft を要約する
- `AskUserQuestion` で `publish-handoff` に進んでよいか確認する

### `publish-handoff`

- GitHub Issue を create / update する
- 必要なら findings comment を追加する
- `config.json` の `publishDefaults` があれば既定値として使う
- publish 前に title / target issue / scope を `AskUserQuestion` で確認してよい
- skill contract 上は config が空の項目だけを `AskUserQuestion` で確認する
- CLI 単体での対話補完はまだ完成していない
- 完了後に publish 結果を要約して返す

## Current Reality

- 現実装の CLI はまだ `setup` と `config.json` を前提にする command が多い
- `pr-intake` / `discover-context` / `map-tests` / `assess-gaps` / `allocate` / `handoff` は internal sub-steps として維持してよい
- したがって v3 は一気に削るのではなく、surface simplification から始める
