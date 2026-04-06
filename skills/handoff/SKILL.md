---
name: handoff
description: allocation 結果から QA handoff issue を GitHub に作成する。
---

# QA Handoff

> Legacy internal step. v3 の user-facing default では `publish-handoff` から使い、必要に応じて内部でこの step 群を組み合わせる。

## 目的

allocation 結果を GitHub Issue として公開し、QA チームへの引き継ぎチェックリストを作成する。

ここで公開する checklist は「その layer の test が存在しないから全部 QA で拾う」という意味ではない。Issue には confidence と layer applicability を併記し、今回の変更で primary な layer と、primary ではない layer を区別して handoff する。

## 前提条件

- `allocate` が完了していること。
- risk assessment レコード ID を把握していること。

通常利用では、この step は `publish-handoff` の内部で使う想定であり、user-facing に直接案内しない。

## 実行手順

1. Markdown を生成する: `bun run dev handoff generate --risk-assessment-id <id>`
2. GitHub Issue を作成する: `bun run dev handoff publish --risk-assessment-id <id>`
3. 既存 Issue を更新する: `bun run dev handoff update --risk-assessment-id <id> --issue-number <n>`

## 読み方

- public flow では、これは `publish-handoff` の内部実装として扱う。
- user-facing の主語は `risk-assessment-id` ではなく、「この PR の handoff draft / publish」である。

- `Layer Applicability` は、今回の変更で各 layer が `primary` / `secondary` / `not-primary` / `no-product-change` のどれに近いかを示す。
- たとえば frontend-only component change で `integration/service` が `not-primary` なら、「integration test がない」ことをそのまま QA の gap とみなさない。
- manual exploration は、単に自動テスト layer が足りないという理由ではなく、remainder / ambiguity / statefulness が残っているときに重く読む。

## 探索セッション後の追記

- 探索結果を Issue コメントとして追加する: `bun run dev handoff add-findings --issue-number <n> --session-id <id>`

## 次の Step

- `generate-charters`
