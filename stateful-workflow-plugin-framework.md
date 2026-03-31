# Stateful Workflow Plugin Framework

> Claude Code Plugin で、LLM のコンテキストウィンドウに依存しない
> 段階的ワークフローを構築するための設計フレームワーク。
>
> shinkoku（確定申告プラグイン v0.6.3）の実装から抽出・抽象化した設計パターン集。
> ドメイン固有の要素を全て取り除き、任意の複雑なワークフローに適用可能な形にまとめる。

---

## 目次

1. [核心思想](#1-核心思想)
2. [全体アーキテクチャ](#2-全体アーキテクチャ)
3. [3層ステート管理](#3-3層ステート管理)
4. [ワークフロー・ステートマシン](#4-ワークフロー・ステートマシン)
5. [スキル設計パターン](#5-スキル設計パターン)
6. [CLI ブリッジ設計](#6-cliブリッジ設計)
7. [データベース設計](#7-データベース設計)
8. [重複検知・冪等性](#8-重複検知・冪等性)
9. [エラーハンドリング](#9-エラーハンドリング)
10. [プラグイン実装チェックリスト](#10-プラグイン実装チェックリスト)

---

## 1. 核心思想

### 前提: LLM のコンテキストウィンドウは「揮発性メモリ」

Claude Code の会話コンテキストには2つの制約がある:

1. **Auto Compaction** — 会話が長くなると古いメッセージが要約・圧縮される
2. **セッション境界** — 新しい会話を開始するとコンテキストはゼロになる

これらの制約下で、何十ステップにも及ぶ複雑なワークフローを正確に実行するには、
**全ての状態をコンテキストウィンドウの外に持つ** 必要がある。

### 設計原則

```
原則1: コンテキストウィンドウには何も保存しない
  → 全てのデータ・状態・判断をファイルシステムに永続化する

原則2: 各スキルは「ステートレス関数」として設計する
  → 入力: ファイル群（Config + Progress + DB）
  → 出力: ファイル群（更新された Progress + DB）
  → 会話履歴への依存: ゼロ

原則3: 引き継ぎ文書（Handover Document）で文脈を渡す
  → 人間同士の業務引き継ぎと同じ発想
  → 前任者（前スキル）が書いたメモを後任者（次スキル）が読む
```

### 比喩: 「シフト制の作業チーム」

```
従来の設計（1人が全部やる）:
  1人の作業員が朝から晩まで全工程を担当
  → 途中で交代すると、引き継ぎ漏れが発生

本フレームワーク（シフト制）:
  各工程に専任の作業員がいる
  ├─ 作業指示書（Config）を全員が読む
  ├─ 引き継ぎメモ（Progress Files）を前工程が書き、次工程が読む
  └─ 部品棚（Database）から必要な部品を取り出して使う
  → 誰がいつ担当しても、同じ品質で作業できる
```

---

## 2. 全体アーキテクチャ

```
┌───────────────────────────────────────────────────────────────┐
│                    Claude Code Session                         │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐     │
│  │              Skill Layer（SKILL.md 群）                │     │
│  │                                                      │     │
│  │  各スキルは以下の手順を実行:                           │     │
│  │  1. Config を Read tool で読む                        │     │
│  │  2. Progress ファイルを Read tool で読む               │     │
│  │  3. CLI を Bash tool で呼ぶ（DB操作）                 │     │
│  │  4. 結果を Write tool で Progress に書く              │     │
│  └──────────┬────────────┬────────────┬─────────────────┘     │
│             │            │            │                       │
│         Read tool    Bash tool    Write tool                  │
│             │            │            │                       │
└─────────────┼────────────┼────────────┼───────────────────────┘
              │            │            │
              ▼            ▼            ▼
┌──────────┐ ┌──────────┐ ┌──────────────────────────┐
│  Config  │ │   CLI    │ │     Progress Files       │
│  (YAML)  │ │(JSON I/O)│ │  (Markdown + frontmatter)│
└──────────┘ └────┬─────┘ └──────────────────────────┘
                  │
                  ▼
            ┌──────────┐
            │  SQLite   │
            │ (WAL mode)│
            └──────────┘
```

### 構成要素の対応表

| 構成要素 | 役割 | 変更頻度 | アクセス方法 |
|---------|------|---------|------------|
| **Config（YAML）** | 「誰が」「どう」行うかの静的設定 | 初回のみ | Read tool |
| **Progress Files（MD）** | 「どこまで進んだか」の引き継ぎ文書 | ステップ毎 | Read/Write tool |
| **Database（SQLite）** | ドメインデータの正本 | 随時 | CLI（Bash tool） |
| **CLI（Python等）** | DB と LLM の間のステートレスなブリッジ | 不変 | Bash tool |
| **Skill（SKILL.md）** | LLM への作業指示書 | 不変 | Plugin system |

---

## 3. 3層ステート管理

### Layer 1: Config（静的設定）

ワークフロー全体を通じてほぼ不変の設定値。ユーザーの属性、パス設定、動作モードなど。

#### ファイル形式: YAML

```yaml
# {plugin_name}.config.yaml

# 対象期間・バージョン
target_period: 2025
workflow_version: 1

# データベース・出力パス
db_path: ./{plugin_name}.db
output_dir: ./output

# ドメイン固有の設定
# （例: ユーザー属性、対象、モード選択）
user:
  name: "..."
  role: "..."

options:
  mode: "standard"        # standard | advanced
  language: "ja"
```

#### 設計ルール

| ルール | 理由 |
|-------|------|
| パスは相対パスで保存 | ディレクトリ移動への耐性 |
| スキルは読み込み時に絶対パスに変換 | CLI に渡す際の曖昧さ排除 |
| デフォルト値を全フィールドに設定 | 部分的な設定でも動作 |
| 機密情報は別ファイル or 環境変数 | Git 管理との共存 |

#### 初回生成パターン

```
/setup スキル:
  1. ユーザーに対話的に質問
  2. 回答を YAML に組み立て
  3. Write tool で {plugin_name}.config.yaml に書き出し
  4. 生成結果をユーザーに提示して確認
```

---

### Layer 2: Progress Files（引き継ぎ文書）

各ステップの完了状態・結果・判断をファイルに記録する。
次のスキルはこのファイルを読んで文脈を復元する。

#### ディレクトリ構造

```
.{plugin_name}/
└── progress/
    ├── 01-{step1_name}.md      # ステップ1の引き継ぎ文書
    ├── 02-{step2_name}.md      # ステップ2の引き継ぎ文書
    ├── ...
    ├── NN-{stepN_name}.md
    └── progress-summary.md     # 全体ダッシュボード
```

#### ファイル形式: YAML Frontmatter + Markdown

```markdown
---
step: 3
skill: data-import
status: completed          # completed | in_progress | interrupted | failed
completed_at: "2026-03-15"
target_period: 2025
---

# データインポートの結果

## サマリー

- 処理件数: 133件
- エラー: 0件
- 警告: 2件（重複スキップ）

## 判断ログ

- ファイルA.csv: 全件インポート
- ファイルB.csv: 3件重複スキップ（既存データと同一ハッシュ）

## 次のステップ

/validate で整合性チェックを行う
```

#### 設計ルール

| ルール | 理由 |
|-------|------|
| YAML frontmatter に構造化メタデータ | プログラム的にパース可能 |
| Markdown 本文に判断ログ・サマリー | 人間にも可読 |
| 「次のステップ」を必ず記載 | フロー制御の明確化 |
| 数値は具体的に記載（概算しない） | 次スキルの計算精度確保 |
| ステップ番号をファイル名に含める | 実行順序の明示 |

#### progress-summary.md（ダッシュボード）

```markdown
---
target_period: 2025
last_updated: "2026-03-15"
current_step: validate
---

# ワークフロー進捗サマリー

| # | ステップ | スキル | 状態 |
|---|---------|--------|------|
| 1 | 初期設定 | /setup | ✅ completed |
| 2 | データ収集 | /gather | ✅ completed |
| 3 | データインポート | /import | ✅ completed |
| 4 | 検証 | /validate | 🔄 in_progress |
| 5 | 計算 | /calculate | ⏳ pending |
| 6 | 出力 | /export | ⏳ pending |
```

---

### Layer 3: Database（ドメインデータの正本）

SQLite + WAL モードで、ワークフローが扱うドメインデータを永続化する。

#### なぜ SQLite か

| 特性 | メリット |
|-----|---------|
| ファイルベース | インストール不要、ポータブル |
| WAL モード | 読み書き同時実行、クラッシュ耐性 |
| SQL | 複雑なクエリ・集計が可能 |
| トランザクション | データ整合性の保証 |
| 軽量 | 1ファイルで完結 |

#### CLI 経由でのみアクセスする理由

```
❌ スキルが直接 SQL を書く
  → SQL インジェクションリスク
  → スキーマ変更時に全スキル修正
  → LLM が不正な SQL を生成するリスク

✅ CLI がデータベースを抽象化
  → 入力バリデーション済み
  → スキーマ変更は CLI 内部で吸収
  → スキルは JSON I/O のみ
```

---

## 4. ワークフロー・ステートマシン

### フロー定義パターン

```
┌─────────────────────────────────────────────────────┐
│  Main Flow（線形ステートマシン）                      │
│                                                     │
│  Step 1 ──→ Step 2 ──→ Step 3 ──→ ... ──→ Step N  │
│  (FIRST)   (MIDDLE)   (MIDDLE)          (LAST)     │
│                                                     │
│  各矢印 = Progress ファイルによる引き継ぎ             │
└──────────────────────┬──────────────────────────────┘
                       │
         ┌─────────────┼─────────────┐
         │             │             │
    ┌────▼───┐   ┌────▼───┐   ┌────▼───┐
    │UTILITY │   │UTILITY │   │BROWSER │
    │ Skill  │   │ Skill  │   │ Skill  │
    └────────┘   └────────┘   └────────┘
    (任意タイミング   (任意タイミング  (特定ステップ
     で呼び出し可能)   で呼び出し可能)  から分岐)
```

### ステップ遷移ルール

```python
# 擬似コード: ステートマシンの遷移ルール

def can_transition(current_step: int, target_step: int) -> bool:
    """ステップ遷移の可否判定"""

    # ルール1: 前ステップが completed でなければ進めない
    prev_progress = read_progress(target_step - 1)
    if prev_progress.status != "completed":
        return False

    # ルール2: 条件付きスキップ（例: 対象外なら飛ばす）
    if target_step in optional_steps:
        assess = read_progress(assess_step)
        if not assess.requires(target_step):
            mark_as_skipped(target_step)
            return can_transition(current_step, target_step + 1)

    return True
```

### 条件付きスキップ

特定の条件で不要なステップを飛ばすパターン:

```markdown
# progress-summary.md での表現

| 5 | オプション処理 | /optional | — 対象外 |
```

判定ロジックは **assess（判定）スキル** が担い、progress ファイルに結果を記録する。
後続スキルはこの判定結果を読んでスキップを決定する。

---

## 5. スキル設計パターン

### 5種類のスキルタイプ

```
┌──────────────────────────────────────────────────────────────┐
│  Type A: FIRST（初期化スキル）                                 │
│  ─────────────────────────────────────────────────────────── │
│  • Config ファイルを生成する唯一のスキル                       │
│  • DB を初期化する                                            │
│  • CLI ツールのインストール確認                                │
│  • progress-summary.md の初版を書く                           │
│  • 例: /setup                                                │
├──────────────────────────────────────────────────────────────┤
│  Type B: MIDDLE（処理スキル）                                  │
│  ─────────────────────────────────────────────────────────── │
│  • Config を読む（存在必須、なければ /setup へ誘導）           │
│  • 前ステップの Progress を読む                               │
│  • CLI でデータを処理する                                     │
│  • 自身の Progress ファイルを書く                              │
│  • 例: /import, /calculate, /validate                        │
├──────────────────────────────────────────────────────────────┤
│  Type C: LAST（最終スキル）                                    │
│  ─────────────────────────────────────────────────────────── │
│  • 全ステップの Progress を読み、完了を検証する               │
│  • 最終的な出力を生成する                                     │
│  • progress-summary.md を最終更新する                         │
│  • 例: /export, /submit                                      │
├──────────────────────────────────────────────────────────────┤
│  Type D: UTILITY（ユーティリティスキル）                       │
│  ─────────────────────────────────────────────────────────── │
│  • Progress ファイルを書かない                                │
│  • 構造化データを直接返す（他スキルが消費）                    │
│  • ワークフロー順序に依存しない                               │
│  • 例: /read-document, /parse-image                          │
├──────────────────────────────────────────────────────────────┤
│  Type E: BROWSER（ブラウザ操作スキル）                         │
│  ─────────────────────────────────────────────────────────── │
│  • 特定ステップの結果を前提とする                             │
│  • 中断状態の保存・復帰をサポート                             │
│  • status: interrupted + 復帰手順を Progress に書く          │
│  • 例: /e-filing, /submit-online                             │
└──────────────────────────────────────────────────────────────┘
```

### 共通初期化テンプレート

全スキル（UTILITY を除く）は以下の初期化手順を共有する:

```markdown
## 設定の読み込み（最初に必ず実行）

1. `{plugin_name}.config.yaml` を Read ツールで読み込む
   - ファイルが存在しない場合 → `/setup` スキルの実行を案内して**終了**
2. 相対パスを CWD 基準の絶対パスに変換する:
   - `db_path` → CLI の `--db-path` 引数に使用
   - `output_dir` → 出力先ディレクトリ
   - その他のディレクトリパス

## 進捗情報の読み込み

1. `.{plugin_name}/progress/progress-summary.md` を Read ツールで読む（存在する場合）
2. 前提となるステップの引き継ぎ文書を Read ツールで読む:
   - `.{plugin_name}/progress/NN-{prerequisite}.md`
3. 読み込んだ情報を以降のステップで活用する（ユーザーへの再質問を避ける）
4. ファイルが存在しない場合 → スキップし、ユーザーに直接確認する
```

### スキルの SKILL.md テンプレート

```markdown
---
name: {skill-name}
description: >
  {このスキルの目的と、いつ使うべきかの説明}
  Trigger phrases include: "{trigger1}", "{trigger2}", ...
---

# {スキル表示名}

## 設定の読み込み（最初に実行）

{共通初期化テンプレートを記述}

## 進捗情報の読み込み

{依存する前ステップの Progress ファイルを列挙}

## 前提条件の確認

{前ステップが completed であることの検証}
{必要な CLI コマンドの存在確認}

## ステップ1: {作業内容}

{具体的な作業指示}
{CLI コマンドの呼び出し例}
{ユーザーへの確認ポイント}

## ステップ2: {作業内容}

...

## 引き継ぎ文書の書き出し

以下の形式で `.{plugin_name}/progress/NN-{skill-name}.md` に Write ツールで書き出す:

```yaml
---
step: {N}
skill: {skill-name}
status: completed
completed_at: "{today's date}"
target_period: {period from config}
---
```

{構造化された結果サマリー}

## progress-summary.md の更新

当該ステップの行を `✅ completed` に更新する。
```

### Progress ファイルの依存読み込み例

```
FIRST スキル:
  読み込み: なし（自身が起点）

MIDDLE スキル（例: /calculate）:
  読み込み:
    - progress-summary.md       ... 全体状態の確認
    - 03-validate.md            ... 直前ステップの結果
    - 01-assess.md              ... 判定結果（条件分岐用）

LAST スキル（例: /export）:
  読み込み:
    - progress-summary.md       ... 全ステップの完了確認
    - 04-calculate.md           ... 計算結果
    - 01-assess.md              ... モード判定結果
```

---

## 6. CLIブリッジ設計

### なぜ CLI か

LLM がデータベースに直接アクセスすると、以下の問題が起きる:

1. **SQL インジェクション** — LLM が生成する SQL は安全とは限らない
2. **スキーマ結合** — スキーマ変更時に全スキルを修正する必要がある
3. **バリデーション不在** — データの整合性チェックが LLM 任せになる

CLI は「型付きの関数呼び出し」として機能し、これらの問題を防ぐ。

### JSON I/O プロトコル

```
┌─ Skill (Claude) ─┐        ┌─ CLI (Python) ─┐        ┌─ DB ─┐
│                   │        │                 │        │      │
│  JSON入力を構築   │──Bash──▶│  入力をパース    │──SQL──▶│      │
│                   │        │  バリデーション   │        │      │
│  JSON出力をパース │◀─stdout─│  処理実行        │◀─rows─│      │
│                   │        │  JSON出力        │        │      │
└───────────────────┘        └─────────────────┘        └──────┘
```

#### 入力パターン

```bash
# パターン1: コマンドライン引数のみ
{plugin} {subcommand} {command} \
  --db-path /absolute/path/to/db \
  --target-period 2025

# パターン2: JSON ファイル入力
{plugin} {subcommand} {command} \
  --db-path /absolute/path/to/db \
  --input /absolute/path/to/input.json

# パターン3: 標準入力（パイプ）
echo '{"key": "value"}' | {plugin} {subcommand} {command} --db-path ...
```

#### 出力プロトコル

```json
// 成功
{
  "status": "ok",
  "data": { ... }
}

// エラー
{
  "status": "error",
  "message": "人間が読めるエラーメッセージ"
}

// 警告付き成功
{
  "status": "ok",
  "data": { ... },
  "warnings": [
    {"code": "DUPLICATE_DETECTED", "message": "..."}
  ]
}
```

### CLI 実装テンプレート（Python）

```python
# cli/__init__.py

import argparse
import json
import sys

def main() -> None:
    parser = argparse.ArgumentParser(
        prog="{plugin_name}",
        description="{プラグインの説明}"
    )
    subparsers = parser.add_subparsers(dest="command")

    # 各モジュールがサブコマンドを登録
    from .{module1} import register as reg1
    from .{module2} import register as reg2
    reg1(subparsers)
    reg2(subparsers)

    args = parser.parse_args()
    if not hasattr(args, "func"):
        parser.print_help()
        sys.exit(1)

    try:
        args.func(args)
    except SystemExit:
        raise
    except Exception as e:
        # エラーも JSON で返す（LLM がパースしやすい）
        print(json.dumps(
            {"status": "error", "message": str(e)},
            ensure_ascii=False
        ))
        sys.exit(1)
```

```python
# cli/{module}.py

def register(subparsers) -> None:
    sub = subparsers.add_parser("{subcommand}", help="...")
    cmd_parsers = sub.add_subparsers(dest="subcommand")

    # 個別コマンド登録
    p = cmd_parsers.add_parser("{command}", help="...")
    p.add_argument("--db-path", required=True)
    p.add_argument("--input", help="JSON input file path")
    p.set_defaults(func=cmd_handler)

def cmd_handler(args) -> None:
    input_data = _load_json(args.input) if args.input else {}
    result = business_logic(args.db_path, input_data)
    print(json.dumps(
        {"status": "ok", "data": result},
        ensure_ascii=False, indent=2
    ))
```

### パス解決ルール（重要）

```
Config ファイル内:   db_path: ./data.db      （相対パス）
                         ↓
スキルが読み込み時:  CWD = /home/user/project/
                         ↓
CLI に渡す時:       --db-path /home/user/project/data.db  （絶対パス）
```

**全ての CLI 呼び出しで絶対パスを使う。** 相対パスは Config ファイル内の保存形式としてのみ使用する。

---

## 7. データベース設計

### 接続パターン

```python
# db.py

import sqlite3
from pathlib import Path

SCHEMA_PATH = Path(__file__).parent / "schema.sql"

def get_connection(db_path: str) -> sqlite3.Connection:
    """WAL モード + 外部キー制約を有効化した接続を返す"""
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.row_factory = sqlite3.Row
    return conn

def init_db(db_path: str) -> sqlite3.Connection:
    """DB を初期化（CREATE IF NOT EXISTS で冪等）"""
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = get_connection(db_path)
    schema_sql = SCHEMA_PATH.read_text(encoding="utf-8")
    conn.executescript(schema_sql)
    _migrate(conn)
    conn.commit()
    return conn
```

### マイグレーション戦略

バージョンテーブルを使わない、**宣言的カラム検出方式**:

```python
def _migrate(conn: sqlite3.Connection) -> None:
    """PRAGMA table_info でカラムの存在を確認し、
    なければ ALTER TABLE ADD COLUMN で追加する。
    冪等（何度実行しても安全）。"""

    # 例: items テーブルに category カラムを追加
    cols = {row[1] for row in conn.execute(
        "PRAGMA table_info(items)"
    ).fetchall()}
    if "category" not in cols:
        conn.execute(
            "ALTER TABLE items ADD COLUMN category TEXT"
        )
```

**この方式の利点:**
- マイグレーションファイルの管理が不要
- 実行順序に依存しない
- 途中で失敗しても再実行可能

**注意:** カラムの型変更やカラム削除には非対応。
これらが必要な場合は、テーブル再作成（`CREATE TABLE new → INSERT INTO → DROP old → ALTER TABLE RENAME`）を使う。

### スキーマ設計の原則

```sql
-- schema.sql テンプレート

-- 1. 期間管理テーブル（ワークフローの単位）
CREATE TABLE IF NOT EXISTS periods (
    id          TEXT PRIMARY KEY,  -- "2025" や "2025-Q1" など
    status      TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'closed')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. マスターテーブル（参照データ）
CREATE TABLE IF NOT EXISTS categories (
    code        TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    parent_code TEXT REFERENCES categories(code),
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_active   INTEGER NOT NULL DEFAULT 1
);

-- 3. トランザクションテーブル（業務データ）
CREATE TABLE IF NOT EXISTS records (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    period_id    TEXT NOT NULL REFERENCES periods(id),
    date         TEXT NOT NULL,
    description  TEXT,
    content_hash TEXT,  -- 重複検知用 SHA-256
    source       TEXT,  -- csv_import | manual | api | ocr
    source_file  TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 4. 重複防止インデックス
CREATE UNIQUE INDEX IF NOT EXISTS idx_records_hash
    ON records(period_id, content_hash)
    WHERE content_hash IS NOT NULL;

-- 5. 監査ログテーブル
CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id   INTEGER NOT NULL,
    period_id   TEXT NOT NULL,
    operation   TEXT NOT NULL CHECK (operation IN ('update', 'delete')),
    before_json TEXT NOT NULL,
    after_json  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 6. インポート履歴テーブル
CREATE TABLE IF NOT EXISTS import_sources (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    period_id   TEXT NOT NULL,
    file_hash   TEXT NOT NULL,  -- SHA-256 of file content
    file_name   TEXT NOT NULL,
    file_path   TEXT,
    row_count   INTEGER,
    imported_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(period_id, file_hash)
);
```

### WAL モードの副産物ファイル

```
{plugin_name}.db       ← 本体（読み取り用）
{plugin_name}.db-wal   ← 書き込みログ（コミット前の変更）
{plugin_name}.db-shm   ← 共有メモリ（WAL インデックス）
```

- `.db-wal` と `.db-shm` は SQLite が自動的に生成・管理する
- 正常終了時に `.db-wal` は `.db` に統合される（チェックポイント）
- **これらのファイルを手動で削除してはいけない**

---

## 8. 重複検知・冪等性

### コンテンツハッシュ方式

同じデータを何度投入しても、DB に重複レコードが作られないことを保証する。

```python
# hashing.py

import hashlib

def compute_content_hash(key_fields: list[str]) -> str:
    """正規化したキーフィールドから SHA-256 ハッシュを生成する。

    設計判断:
    - 人間が変更しうるフィールド（description 等）は除外する
    - 順序に依存しないよう、入力をソートする
    - セパレータ（|）で結合し、衝突を防ぐ
    """
    normalized = sorted(key_fields)
    raw = "|".join(normalized)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
```

#### ハッシュ対象の選定ガイド

```
✅ ハッシュに含めるもの:
  - 日付、金額、コード値 → 取引の「同一性」を定義するフィールド

❌ ハッシュから除外するもの:
  - 摘要、メモ、備考 → 人間が後から変更する可能性があるフィールド
  - 作成日時 → 同じデータの再投入で変わるフィールド
```

### ファイルハッシュ方式

同じファイルの再インポートをブロックする。

```python
def compute_file_hash(file_path: str) -> str:
    """ファイル全体の SHA-256 ハッシュ"""
    content = Path(file_path).read_bytes()
    return hashlib.sha256(content).hexdigest()
```

### 多段スコアリング

```
Score 100  完全一致    content_hash が同一           → ブロック
Score  90  強い一致    日付+金額+分類が同一          → 警告（確認要求）
Score  70  類似       日付+合計金額が同一            → 通知
```

---

## 9. エラーハンドリング

### CLI エラーの検出パターン

スキル内で CLI を呼び出した後の標準的な処理:

```markdown
## CLI 実行後の処理

Bash ツールで CLI コマンドを実行した後:

1. JSON 出力をパースする
2. `status` フィールドを確認する:
   - `"ok"` → 正常。`data` フィールドから結果を取得
   - `"error"` → 異常。`message` をユーザーに分かりやすく伝える
3. `warnings` フィールドがある場合:
   - 各警告をユーザーに提示する
   - 続行の意思を確認してから進む
4. 致命的エラーの場合:
   - スキルを中断する
   - 前提となるスキルの再実行を案内する
```

### バリデーションゲート

重要な処理の前に必ず検証を行う:

```markdown
## サニティチェック（スキップ不可）

以下の全項目が OK でなければ、次のステップに進んではいけない:

1. □ データ件数が0件でないこと
2. □ 合計値の整合性（借方合計 = 貸方合計）
3. □ 必須フィールドに NULL がないこと
4. □ 前ステップの status が completed であること

1つでも NG がある場合:
→ エラー内容を具体的にユーザーに説明する
→ 修正方法を提案する
→ 修正後に再度チェックを実行する
```

### 中断・復帰パターン（Browser スキル用）

```markdown
---
step: 6
skill: online-submit
status: interrupted
last_completed_substep: "3"
interrupted_at: "2026-03-15"
---

# オンライン申請（中断）

## 中断時の状態

- 最後に完了したサブステップ: 3
- 保存データ: あり（.data ファイル）

## 復帰方法

1. `/online-submit` を再実行する
2. 保存データがある場合 → サブステップ 4 から再開
3. 保存データがない場合 → サブステップ 1 からやり直し
```

---

## 10. プラグイン実装チェックリスト

### フェーズ1: 基盤構築

```
□ plugin.json を作成
□ {plugin_name}.config.yaml のスキーマを設計
□ schema.sql を作成（期間管理 + マスター + トランザクション + 監査ログ + インポート履歴）
□ db.py を実装（get_connection + init_db + _migrate）
□ hashing.py を実装（コンテンツハッシュ + ファイルハッシュ）
□ CLI エントリーポイントを実装（JSON I/O プロトコル）
□ /setup スキル（Type A: FIRST）を実装
```

### フェーズ2: コアワークフロー

```
□ ワークフローのステップを定義（何を、どの順で行うか）
□ 各ステップの依存関係を整理
□ 条件付きスキップの判定ロジックを設計
□ /assess スキル（判定・分岐）を実装
□ Type B: MIDDLE スキルを順に実装
   □ 共通初期化テンプレートを適用
   □ CLI コマンドを実装
   □ 引き継ぎ文書のフォーマットを定義
□ Type C: LAST スキルを実装
```

### フェーズ3: ユーティリティ・拡張

```
□ Type D: UTILITY スキル（OCR、パーサー等）を実装
□ Type E: BROWSER スキル（外部サービス連携）を実装
□ 中断・復帰パターンのテスト
□ 重複検知のテスト（同じデータを2回投入）
□ 新セッションからの復帰テスト（compaction 耐性）
```

### フェーズ4: 堅牢化

```
□ マイグレーションの追加（新カラム等）
□ バリデーションゲートの追加
□ エラーメッセージの改善（ユーザーの言語で）
□ progress-summary.md の自動更新
□ .gitignore の設定（DB ファイル、機密情報）
```

---

## 付録: ディレクトリ構造テンプレート

```
{plugin_name}/
├── plugin.json                      # プラグインマニフェスト
├── skills/
│   ├── setup/SKILL.md               # Type A: 初期化
│   ├── assess/SKILL.md              # 判定・分岐
│   ├── {step1}/SKILL.md             # Type B: 処理
│   ├── {step2}/SKILL.md             # Type B: 処理
│   ├── {step3}/SKILL.md             # Type B: 処理
│   ├── {final}/SKILL.md             # Type C: 最終
│   ├── {utility1}/SKILL.md          # Type D: ユーティリティ
│   └── {browser1}/SKILL.md          # Type E: ブラウザ
├── src/{plugin_name}/
│   ├── __init__.py
│   ├── config.py                    # Pydantic 設定モデル
│   ├── models.py                    # 入出力データモデル
│   ├── db.py                        # DB 接続・初期化・マイグレーション
│   ├── schema.sql                   # テーブル定義
│   ├── hashing.py                   # コンテンツ / ファイルハッシュ
│   ├── duplicate_detection.py       # 重複検知ロジック
│   ├── cli/
│   │   ├── __init__.py              # argparse エントリーポイント
│   │   ├── {module1}.py             # サブコマンド群
│   │   └── {module2}.py
│   └── tools/
│       ├── {module1}.py             # ビジネスロジック
│       └── {module2}.py
├── pyproject.toml
└── README.md

--- ユーザー作業ディレクトリ（実行時に生成） ---

{user_project}/
├── {plugin_name}.config.yaml        # ユーザー設定
├── {plugin_name}.db                 # SQLite DB
├── {plugin_name}.db-wal             # WAL ログ
├── {plugin_name}.db-shm             # WAL 共有メモリ
├── .{plugin_name}/
│   └── progress/
│       ├── 01-setup.md
│       ├── 02-assess.md
│       ├── ...
│       └── progress-summary.md
└── output/                          # 生成物
```

---

## 付録: 設計判断のトレードオフ

| 判断 | 採用理由 | トレードオフ |
|------|---------|------------|
| SQLite（サーバーレス DB） | インストール不要、1ファイル完結 | 同時書き込み性能に限界 |
| WAL モード | 読み書き同時実行、クラッシュ耐性 | 副産物ファイル（-wal, -shm）が増える |
| YAML Config | 人間が直接編集可能 | 型安全性が弱い（Pydantic で補完） |
| Markdown Progress | 人間にも LLM にも可読 | 構造化データとしてのパース精度 |
| CLI ブリッジ | SQL インジェクション防止、抽象化 | プロセス起動のオーバーヘッド |
| Content Hash で重複検知 | 冪等なデータ投入 | ハッシュ衝突（SHA-256 では実質無視可能） |
| 宣言的マイグレーション | 冪等、順序非依存 | カラム削除・型変更に非対応 |
| Progress ファイルに数値を書く | Compaction 後も正確な値が残る | DB との二重管理リスク |

---

## 付録: アンチパターン

### ❌ 会話コンテキストに状態を持つ

```
User: 「売上は540万です」
Claude: （この数値を記憶して後で使おう）

→ Auto compaction で数値が消失
→ 新セッションで数値が不明に
```

### ❌ CLI を使わず LLM が直接 SQL を書く

```python
# スキル内で直接 SQL を実行
cursor.execute(f"INSERT INTO records VALUES ('{user_input}')")

→ SQL インジェクションのリスク
→ スキーマ変更時に全スキルを修正
```

### ❌ Progress ファイルなしで次ステップに進む

```
/step1 完了 → /step2 を直接実行（引き継ぎ文書なし）

→ 新セッションで step1 の結果が不明
→ step2 がユーザーに同じ質問を再度する
```

### ❌ 相対パスを CLI に渡す

```bash
{plugin} command --db-path ./data.db

→ CWD が変わると DB が見つからない
→ 絶対パスに変換してから渡す
```
