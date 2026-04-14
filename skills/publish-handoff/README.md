# publish-handoff

QA handoff Issue の publish / update を扱う public skill です。

主な役割:

- GitHub Issue create / update を行う
- publish 前に title / target issue / scope を確認する
- 完了後に issue URL や publish 結果を返す

補足:

- findings comment の追加は別の低レベル CLI コマンドで行う
- 標準の public flow は handoff Issue の publish / update までを責務とする
