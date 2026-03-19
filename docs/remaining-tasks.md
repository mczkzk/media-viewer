# 残タスク (Phase 5)

**作成日**: 2026-03-19

## ~~旧コード削除~~ (完了)

- ~~`server.js` 削除~~
- ~~`lib/scanner.js`, `lib/thumbnail.js` 削除~~
- ~~不要なnpm依存を削除: express, sharp, dotenv, exifr, fluent-ffmpeg~~
- ~~`.env.example` 削除~~
- ffmpeg-static, @ffprobe-installer/ffprobe は Rust側が参照するため残存

## ~~パフォーマンス改善~~ (完了)

- ~~ローカルHTTPサーバー (`tiny_http`) で全コンテンツ配信 (media:// からの移行)~~
- ~~ffmpeg/ffprobe の well-known paths 追加 (ビルド済みアプリ対応)~~
- ~~サムネイル未キャッシュ時のエラー表示抑制 (ローディング維持でバッチ生成待ち)~~
- ~~アドホック署名でリムーバブルボリューム権限を記憶~~
- ~~`npm run install-app` でビルド+インストール+署名を一括実行~~

## メニューバー

- フォルダ変更 (現状はアプリ再起動が必要)
- キャッシュクリア (サムネイル + スキャンキャッシュ)
- About ダイアログ

## ~~アプリ品質~~ (一部完了)

- ~~アプリアイコン設定 (現在デフォルトのTauriアイコン)~~
- ~~タイトルバー整理 (二重タイトル解消、コンテンツ内h1削除)~~
- devtools をリリースビルドで無効化
- DMGインストーラーのビルド確認 (`npm run tauri:build`)

## 既知の問題

- EXIF回転コードは実装済みだが、旧キャッシュが残っている場合は正しい向きにならない。キャッシュクリアで解決
- 初回のサムネイル生成は遅い (特にHEICはsips変換が必要)。2回目以降はキャッシュから即表示

## 将来的な改善候補

- 複数フォルダ対応
- キーボードショートカット (Tauri global-shortcut plugin)
- ドラッグ&ドロップでフォルダ追加
- HEIC クロスプラットフォーム対応 (libheif-rs)
