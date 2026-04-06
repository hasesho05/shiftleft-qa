# allocate

確認項目を最適な test destination に振り分ける legacy internal skill です。

主な役割:

- `review` / `unit` / `integration` / `e2e` / `visual`
- `dev-box` / `manual-exploration` / `skip`

manual exploration に残す前に、前倒しで消化できる項目を切り出します。

通常利用では `design-handoff` の内部処理として扱います。
