# 残タスク (Phase 5)

**作成日**: 2026-03-19

## ~~旧コード削除~~ (完了)

- ~~`server.js` 削除~~
- ~~`lib/scanner.js`, `lib/thumbnail.js` 削除~~
- ~~不要なnpm依存を削除: express, sharp, dotenv, exifr, fluent-ffmpeg~~
- ~~`.env.example` 削除~~
- ffmpeg-static, @ffprobe-installer/ffprobe は Rust側が参照するため残存

## メニューバー

- フォルダ変更 (現状はアプリ再起動が必要)
- キャッシュクリア (サムネイル + スキャンキャッシュ)
- About ダイアログ

## アプリ品質

- アプリアイコン設定 (現在デフォルトのTauriアイコン)
- devtools をリリースビルドで無効化
- macOS code signing (未署名だと「開発元不明」警告)
- DMGインストーラーのビルド確認 (`npm run tauri:build`)

## 既知の問題

- 一部のサムネイルが赤エラーで表示されない (生成失敗ファイル。プレースホルダーは保存済みだが、根本原因の調査が必要)
- EXIF回転コードは実装済みだが、旧キャッシュが残っている場合は正しい向きにならない。キャッシュクリアで解決
- 初回のサムネイル生成は遅い (特にHEICはsips変換が必要)。2回目以降はキャッシュから即表示

## 将来的な改善候補

- 複数フォルダ対応
- キーボードショートカット (Tauri global-shortcut plugin)
- ドラッグ&ドロップでフォルダ追加
- HEIC クロスプラットフォーム対応 (libheif-rs)
