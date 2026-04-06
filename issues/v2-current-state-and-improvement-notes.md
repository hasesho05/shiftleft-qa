# Workflow v2 Current State and Improvement Notes

## Purpose

このメモは、workflow v2 完了後の現在地を整理し、手動探索的テスト plugin としての課題と改善案を残すためのもの。

主な前提:

- v2 の中心目的は `shift-left test allocation + GitHub Issue handoff`
- plugin の主目的は manual exploration を増やすことではなく、review / automated test / dev-box に寄せられる項目を先に整理し、最後に残る manual exploration だけを handoff すること
- shared source of truth は GitHub Issue
- local DB / progress files は resumable state / cache

## Current State

### できていること

- `allocate` により確認項目を `review` / `unit` / `integration` / `e2e` / `visual` / `dev-box` / `manual-exploration` / `skip` に振り分けられる
- `handoff` により GitHub Issue を checklist-first で publish / update / comment できる
- `generate-charters` により `manual-exploration` に残った項目だけから charter を生成できる
- `findings` を GitHub Issue comment として返せる
- README / plugin metadata / SKILL / skill README は、概ね v2 の skill-first 運用に揃った
- Issue #29 は CLI E2E ではなく SKILL-based E2E を対象に更新済み

### 実装として持っている考え方

- 5つの着眼点
  - `functional-user-flow`
  - `user-persona`
  - `ui-look-and-feel`
  - `data-and-error-handling`
  - `architecture-cross-cutting`
- 8つの探索フレームワーク
  - equivalence partitioning
  - boundary value analysis
  - state transition
  - decision table
  - cause-effect graph
  - pairwise
  - sampling
  - error guessing
- partial exploration / one-session-one-theme の思想

## Fit to Intended Product Direction

今回の plugin の主目的は次の通り:

1. PR / diff / 実装 / テストを読む
2. shift-left できる項目を先に分ける
3. それでも残る manual exploration を正しい観点で提案する
4. その内容を GitHub Issue に handoff する

この方向に対して、現状は部分的には合っているが、まだ十分ではない。

### 合っている点

- allocation -> handoff -> generate-charters の骨格は目的に合っている
- 8つのフレームワークを knowledge model として持っている
- `manual-exploration` だけを最後に残す構造になっている
- handoff の shared source of truth を GitHub Issue に寄せている

### まだ弱い点

- 5つの着眼点のうち、実際に強く効いているのは `functional-user-flow`、`ui-look-and-feel`、`data-and-error-handling`、`architecture-cross-cutting` くらいで、`user-persona` は浅い
- `ドメイン`、`ビジネス優先事項`、`達成要件` など、人間の意図が intake に十分入っていない
- 「正しい観点での提案」よりも、「heuristic で destination を早く確定する」寄りの実装になっている
- handoff Issue が exploration hypothesis というより fixed checklist に見えやすい

## Main Concerns

### 1. CLI が推論を補助するより、結論を先に決めすぎる

特に `allocate` は change category と gap aspect から destination を早く決める。

これにより:

- 本来 manual exploration に残すべき曖昧さまで automation / review 側へ押し出す
- QA Issue に載る時点で「仮説」ではなく「確定作業」に見える
- 後続の skill や人間が見直す余地が狭くなる

### 2. 5つの着眼点が code-derived seed に寄りすぎる

現在の viewpoint seeds は主に file category から作られる。

そのため:

- PR の変更目的
- ユーザーストーリー
- 達成要件
- 非目標
- 想定ユーザー
- ビジネス上の意図

のような文脈を十分に取り込めていない。

### 3. Charter が generic になりやすい

charter 生成は framework と gap からかなり整然と出る一方、PR 固有の「なぜここが怪しいのか」が弱くなりやすい。

結果として:

- reasoning-heavy な探索計画というより
- generic で安全な checklist

に寄る危険がある。

### 4. Handoff Issue の見せ方が強すぎる

Issue 本文は allocation 結果をそのまま checklist 化している。

そのため:

- `confidence`
- heuristic 由来であること
- どこが未確定なのか
- なぜ manual に残したのか

が十分に見えない。

## What We Should Not Overdo

今回の plugin は以下まで吸収しなくてよい。

- dev-box 環境の詳細運用
- deployment 管理
- bug bash / release test の運営
- テストデータ運用やスタブ運用の実務全体

これらは shift-left / delivery の実務運用として、開発者やビジネス側がよしなにやるべき部分も大きい。

plugin が担うべきコアは:

- コードと変更意図を読む
- 正しい観点で manual exploration を提案する
- GitHub Issue に handoff する

に絞る。

## Most Promising Improvement Direction

### Add optional intent context at PR intake

最も効果が高そうなのは、PR や linked issue に書かれた意図を intake に取り込むこと。

対象例:

- 変更の目的
- ユーザーストーリー
- 達成要件
- 非目標
- 想定ユーザー
- 既知リスク
- QA 向け注意点

これがあると:

- 5つの着眼点の不足を補いやすい
- viewpoint seeds を `code-only` から `code + intent` にできる
- allocation の精度を上げやすい
- handoff Issue に「なぜそこを見るのか」を書きやすい
- 的外れな checklist を減らしやすい

### Suggested storage model

SKILL 間のやり取りは local DB に保存してよい。

最初は free text ベースの optional context として保存するのが安全。
最初から厳密構造化しすぎない方がよい。

候補フィールド:

- `changePurpose`
- `userStory`
- `acceptanceCriteria`
- `nonGoals`
- `targetUsers`
- `businessRisks`
- `notesForQa`

## Recommended Next Changes

### Small change

- `pr-intake` で PR body と linked issue body を取得する
- optional intent context を抽出して DB に保存する
- `discover-context` の viewpoint seeds にその context を混ぜる

### Medium change

- `allocate` を「単一の確定 destination」よりも「推奨 + 理由 + 残る曖昧さ」に寄せる
- `handoff` に `confidence` や `open questions` を出せるようにする
- `generate-charters` に PR 固有の意図や acceptance criteria をもっと反映する

### Do not do yet

- 環境衛生の詳細な model 化
- deployment / dev-box 運用の自動管理
- bug bash / release test の workflow 取り込み

## Practical Conclusion

v2 は骨格としては成立している。
ただし現状は、まだ「人の推論を支える plugin」より「heuristic で allocation を先に決める CLI」に寄っている。

次の改善は、環境運用を広げることではなく、

- code
- diff
- tests
- PR / Issue の人間の意図

をまとめて読み、manual exploration をより妥当な仮説として handoff できるようにすること。
