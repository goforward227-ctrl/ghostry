# Ghostride — 開発ノート

## プロジェクト概要

macOSメニューバー常駐アプリ。複数のClaude Codeセッションを一元監視し、ツール承認をワンクリックで処理する。

- **リポ**: https://github.com/goforward227-ctrl/ghostride (private)
- **スタック**: Electron 39 + electron-vite + React 19 + TypeScript
- **ターゲット**: macOS only (AppleScript依存)

## アーキテクチャ

```
src/
├── main/                    # メインプロセス
│   ├── index.ts             # エントリポイント、processMap管理、mergeProcessData
│   ├── process-scanner.ts   # ps + lsof で claude プロセスを1.5秒間隔でスキャン
│   ├── session-parser.ts    # ~/.claude/projects/*.jsonl を読んでステータス判定
│   ├── session-watcher.ts   # chokidar で JSONL ファイル変更を監視
│   ├── approval-handler.ts  # AppleScript で iTerm2/Terminal.app にキー送信
│   ├── ipc.ts               # IPC ハンドラ (approve/reject/rename/set-auto-approve)
│   ├── tray.ts              # メニューバーアイコン＋バッジ管理
│   ├── window.ts            # ウィンドウ作成 (トレイ下にポップアップ)
│   └── types.ts             # ClaudeProcess, ScanResult, SessionInfo
├── preload/
│   ├── index.ts             # contextBridge で API 公開
│   └── index.d.ts           # DTO 型定義
└── renderer/src/
    ├── App.tsx              # メインUI (プロセスリスト、承認ボタン、Autoトグル)
    ├── App.css              # ステータスドットpulseアニメーション
    └── i18n.ts              # EN/JA 翻訳
```

## ステータス判定ロジック (session-parser.ts)

JONLの末尾64KBを読み、最後のassistantエントリを解析:
- `tool_use` + tool_result なし → **approval** (承認待ち)
- `tool_use` + name=AskUserQuestion → **input** (ユーザー入力待ち)
- `tool_use` + tool_result あり → **running**
- `text`/`thinking` + mtime > 10秒 → **idle**
- プロセス死亡 → **done**

## 承認メカニズム (approval-handler.ts)

AppleScript経由でターミナルにキー送信:
- **承認**: `1` を送信 (iTerm2: `write text`, Terminal.app: `keystroke`)
- **却下**: ESC を送信

対応ターミナル: iTerm2, Terminal.app

## 永続化 (project-names.json)

`~/Library/Application Support/ghostride/project-names.json`:
```json
{
  "/path/to/project": {
    "name": "My Project",
    "autoApprove": true
  }
}
```
旧フォーマット (`string` 値) は起動時に自動マイグレーション。

## トレイアイコン

- 通常: テンプレート画像 (黒ゴースト、macOSが自動でダーク/ライト対応)
- バッジあり: 非テンプレート画像 (グレー#E5E5E5ゴースト + オレンジ#DF755Dドット)
- `resources/` に 1x(16px) と 2x(32px) のPNG

## 主要カラー

- アクション/バッジ: `#DF755D` (Claudeオレンジ)
- テキスト: `#1d1d1f`
- セカンダリ: `#6e6e73`
- ボーダー: `#ebebf0`

## 残タスク

### 最優先: DMG Finderドラッグ問題
FinderでDMGからApplicationsにドラッグインストールすると、アプリは起動するがプロセスが検出されない。
CLIで`cp -R`すると正常動作する。原因不明。

**確認済み事実:**
- `cp -R /Volumes/Ghostride/Ghostride.app /Applications/` → 動く
- Finderでドラッグ → 動かない（一覧が空）
- codesign済み（Team IDミスマッチは解消済み、クラッシュはしない）
- `ps`, `lsof`のフルパス化済み、NFC正規化済み

**疑い:**
- Finderコピー時にmacOS 15がcodesignatureを再検証して何かブロック？
- quarantine/provenance属性の影響？
- Electron Frameworkのサンドボックス/権限がFinderコピーで変わる？

**調査方法案:**
- Finderドラッグ後に`codesign -dvvv`で署名状態比較
- `xattr -l`で属性比較（cp -R版 vs Finderドラッグ版）
- Console.appでサンドボックス/権限エラーを確認
- `log stream --predicate 'process == "Ghostride"'`でシステムログ確認

### リリース準備
- [ ] 上記DMG問題の解決
- [ ] デモGIF作成 (README用)
- [ ] GitHub リポを public に変更
- [ ] GitHub Releasesに.dmgアップロード
- [ ] Product Hunt ローンチ

### 機能追加候補
- [ ] Warp / Kitty / Alacritty 対応
- [ ] グローバルショートカット (メニューバーから承認)
- [ ] 通知カスタマイズ (サウンド、通知頻度)

### 既知の制約
- macOS only (AppleScript依存)
- Claude Codeの「Yes, allow all」選択後はGhostrideに表示されない (Claude側で自動処理)
- シングルインスタンスロック: 2つ目の起動は即終了して既存ウィンドウをフォーカス

## 開発コマンド

```bash
npm install          # 依存インストール
npm run dev          # 開発サーバー起動 (HMR対応)
npm run build:mac    # .dmg ビルド
npm run typecheck    # 型チェック
```

## 注意事項

- `electron-vite dev` はシングルインスタンスロックに注意。既存プロセスがあると即終了する
- preload の IPC リスナーは `removeAllListeners` してから登録 (HMRリーク対策)
- session-parser の fd は try/finally で確実に close (スキャン間隔が短いためリーク注意)
