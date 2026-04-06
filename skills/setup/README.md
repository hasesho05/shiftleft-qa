# setup

workspace の初期化を行う legacy / advanced skill です。

主な役割:

- `config.json` の生成または確認
- SQLite DB の初期化
- progress files の初期化

通常利用の入口としては扱いません。基本は `analyze-pr` から開始し、`setup` は local persistence を明示的に使いたいときだけ使います。
