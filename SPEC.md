# Ghostry 仕様書

## 概要

Ghostryは、macOSのメニューバーに常駐するElectronアプリ。
実行中のClaude Code CLIプロセスを自動検出し、承認待ちプロンプトをワンクリックで承認・却下できるダッシュボードを提供する。

## 技術スタック

- **Electron** v39 + **electron-vite** (react-ts テンプレート)
- **React** 19 + **TypeScript** 5.9
- **chokidar** v5 (ファイル監視)
- ビルド: electron-builder

## アーキテクチャ

```
メニューバー (Tray)
  └── 左クリック → ポップオーバーウィンドウ (380×520, frameless)
  └── 右クリック → コンテキストメニュー (一括承認 / 終了)

Main Process
  ├── ProcessScanner (1.5秒間隔)
  │   └── ps -eo pid,tty,comm → claude プロセス検出
  │   └── lsof -a -p PID -d cwd -Fn → cwd 取得
  ├── SessionWatcher (chokidar)
  │   └── ~/.claude/projects/**/*.jsonl を監視
  │   └── 変更検知 → Scanner にスキャントリガー
  ├── SessionParser
  │   └── JSONL ファイルの末尾 64KB を解析
  │   └── ステータス判定 + メッセージ抽出
  ├── ApprovalHandler
  │   └── AppleScript 経由で iTerm2 / Terminal.app に入力送信
  └── IPC Handlers (approve / reject / bulk-approve / rename)

Renderer (React)
  └── プロセスリスト表示
  └── 承認 / 却下ボタン
  └── プロジェクト名のインライン編集
```

## プロセス検出

1. `ps -eo pid,tty,comm` で `claude` コマンドのプロセスを取得
2. TTY が `??` や `-` のものは除外（デーモン等）
3. 各プロセスの `lsof` で cwd (作業ディレクトリ) を取得
4. cwd をキーに `~/.claude/projects/` 内の JSONL セッションファイルを照合

## ステータス判定

JSONL ファイルの末尾エントリを解析し、以下のルールで判定:

| ステータス | 条件 | 表示 | 色 |
|-----------|------|------|-----|
| `approval` | 最後のassistantエントリの末尾ブロックが `tool_use` で、後続に `tool_result` がない | 承認待ち | 黄 (#F5C542) |
| `running` | `tool_result` が存在、またはファイルが10秒以内に更新された `text`/`thinking` ブロック | 実行中 | 青 (#007AFF) パルスアニメーション |
| `idle` | プロセス生存中だがJSONLファイルが10秒以上未更新 | 待機中 | グレー (#aeaeb2) |
| `done` | プロセスが終了済み (5分後に自動削除) | 完了 | 薄グレー (#c7c7cc) |

## 承認メカニズム

Claude Code の承認プロンプト形式:
```
Do you want to ...?
1. Yes
2. Yes, allow all ...
3. No
```

- **承認**: AppleScript で `1` を送信 (`write text "1" newline no`)
- **却下**: AppleScript で `Escape` キーを送信 (`write text "\x1b" newline no`)
- **一括承認**: 全 `approval` ステータスのプロセスに順次承認送信

### AppleScript 送信フロー

1. iTerm2 を試行: 全ウィンドウ → タブ → セッションの `tty` を照合し `write text` で送信
2. iTerm2 失敗時: Terminal.app で同等の処理を試行
3. `newline no` オプションでEnterキーを付加しない（`1` 単体で承認が発動するため）

## プロジェクト名

- cwd をキーにカスタム名を永続保存 (`userData/project-names.json`)
- デフォルトは `basename(cwd)`
- UI上で名前をクリックするとインライン編集可能
- Enter で確定、Escape でキャンセル

## ウィンドウ

- **サイズ**: 380×520, リサイズ不可
- **スタイル**: frameless, 白背景, 角丸, 常に最前面
- **動作**: トレイアイコン直下にポップオーバー表示
- **blur時**: 150ms 遅延後に非表示 (ボタンクリック猶予)
- **close時**: 非表示にするだけ (Cmd+Q で完全終了)
- Dock 非表示 (メニューバー専用アプリ)

## トレイ

- テンプレートアイコン (`trayIconTemplate.png`)
- 承認待ち数をタイトルに表示 (例: ` 2`)
- 左クリック: ポップオーバー toggle
- 右クリック: コンテキストメニュー

## UI 構成

### ヘッダー
- 「すべての通知」タイトル + プロセス数表示

### タブ
- **すべて**: 全プロセス表示
- **承認待ち**: `approval` ステータスのみ (バッジ付き)
- 承認待ちがある場合、右に「一括承認」ボタン表示

### プロセスカード
- ステータスドット (色分け + running 時パルスアニメーション)
- プロジェクト名 (クリックで編集) + ステータスラベル
- 最新メッセージ (テキスト or ツール名)
- 経過時間 (たった今 / ○秒前 / ○分前 / ○時間前)
- 承認待ち時: 承認ボタン + `...` メニュー (却下)

### エラーバー
- 承認/却下失敗時に赤帯で表示、×で閉じる

## ファイル構成

```
src/
├── main/
│   ├── index.ts            # メインプロセス・オーケストレーション
│   ├── process-scanner.ts  # ps/lsof でプロセス検出
│   ├── session-parser.ts   # JSONL 解析・ステータス判定
│   ├── session-watcher.ts  # chokidar で JSONL 監視
│   ├── approval-handler.ts # AppleScript で承認/却下送信
│   ├── ipc.ts              # IPC ハンドラー登録
│   ├── window.ts           # ウィンドウ作成・配置
│   ├── tray.ts             # トレイアイコン管理
│   └── types.ts            # 型定義
├── preload/
│   ├── index.ts            # contextBridge API 公開
│   └── index.d.ts          # DTO / API 型定義
├── renderer/
│   └── src/
│       ├── App.tsx          # React UI
│       ├── App.css          # スタイル
│       └── main.tsx         # エントリポイント
└── shared/
    └── protocol.ts          # (CLI ラッパー用、将来利用)
```

## 設定の永続化

| データ | 保存先 |
|-------|--------|
| プロジェクト名 | `~/Library/Application Support/ghostry/project-names.json` |
| ウィンドウ位置 | 毎回トレイアイコン位置から計算 |
| 単一インスタンスロック | Electron の `requestSingleInstanceLock()` |

## 既知の制約

- **macOS 専用**: AppleScript による入力送信は macOS のみ対応
- **対応ターミナル**: iTerm2, Terminal.app
- **macOS Sequoia**: TIOCSTI (TTY 入力インジェクション) が無効化されているため、AppleScript の `write text` を使用
- **自動承認済みセッション**: Claude Code で「Yes, allow all」を選択した操作は承認プロンプトが出ないため Ghostry では検知不可

## 将来構想 (CLI ラッパー方式)

`src/cli/` および `src/shared/protocol.ts` に、node-pty を使った CLI ラッパー方式のコードが残されている。
この方式では `ghostry claude ...` でラッパー経由で Claude Code を起動し、PTY を直接制御して承認を送信する。
ターミナル依存を排除できるが、ユーザーのワークフロー変更が必要なためペンディング中。
