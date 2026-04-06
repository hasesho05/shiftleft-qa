# capabilities

この plugin の対応範囲と前提を最初に案内する skill です。

主な役割:

- 何のための plugin かを説明する
- source of truth をどこに置くかを説明する
- 非対応事項を先に共有する
- 最初に `analyze-pr` を呼ぶ relay 型フローへつなぐ
- `analyze-pr` → `design-handoff` → `publish-handoff` が public flow であると案内する
- CLI は裏方で、public skill が対話と判断の主役だと共有する

`setup` は残っていても、通常利用の最初の入口としては扱わない。
