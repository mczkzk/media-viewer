# Media Viewer Tauri化 実装計画書

**作成日**: 2026-03-14
**更新日**: 2026-03-19
**ステータス**: Phase 1-4 完了、Phase 5 未着手
**旧Node.js版**: `v1.0-node` タグで保存済み

## 概要

Node.js + Express + ブラウザ構成のメディアビューアーを、Tauri v2 (Rust) を使ってネイティブデスクトップアプリに移行した。フロントエンドは既存のVanilla JS資産をそのまま活用し、バックエンド処理をRustへ移植。同一リポジトリ内で段階的に移行。

## 移行結果

### 完了したPhase

| Phase | 内容 | 状態 |
|-------|------|------|
| Phase 1 | Tauriプロジェクト構築 + フォルダ選択 | 完了 |
| Phase 2 | メディア表示 (スキャン + カスタムプロトコル) | 完了 |
| Phase 3 | サムネイル生成 (image crate + sips + ffmpeg) | 完了 |
| Phase 4 | EXIF/メディア情報 (kamadak-exif + ffprobe) | 完了 |
| Phase 5 | UX改善 + アプリ品質向上 | 未着手 |

### 計画からの変更点

1. **Asset Protocol (`http://asset.localhost`) を断念** - Tauri v2で正常動作せず。代わりにカスタムURIプロトコル (`media://`) を実装。Range requests対応で動画ストリーミングも実現。

2. **base64方式を経由して最終的にカスタムプロトコルに到達** - 初期はIPCでbase64を返していたが、パフォーマンス問題のため廃止。サムネイルはキャッシュパスを直接URLに変換し、IPCなしでブラウザが並列読み込み。

3. **sidecar方式 (Phase 1旧案) はスキップ** - Node.jsバンドルの問題が大きいため、最初からRust実装に着手。

## Phase 5 残タスク

- [ ] Express/Node.js関連コード削除 (server.js, lib/, 不要npm依存)
- [ ] メニューバー (フォルダ変更、キャッシュクリア、About)
- [ ] キーボードショートカット
- [ ] ドラッグ&ドロップでフォルダ追加
- [ ] アプリアイコン設定
- [ ] macOS code signing
- [ ] DMGインストーラー生成
- [ ] 複数フォルダ対応
