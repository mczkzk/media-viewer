# Tauri版 実装仕様書

**更新日**: 2026-03-19

## アーキテクチャ

### 全体構成

```
[Tauri WebView (フロントエンド)]
    │
    ├── gallery.js ──── invoke('scan_media') ───────┐
    ├── gallery.js ──── invoke('batch_ensure_...') ─┤
    ├── lightbox.js ─── invoke('get_media_info') ───┤ IPC
    ├── tauri-app.js ── invoke('get_stored_path') ──┤
    ├── tauri-app.js ── invoke('set_stored_path') ──┤
    ├── tauri-app.js ── invoke('get_video_server_port')
    │                                               │
    │   [Rust バックエンド]                          │
    │   ├── lib.rs (コマンド登録 + プロトコル) ◄─────┘
    │   ├── scanner.rs (スキャン + キャッシュ)
    │   ├── thumbnail.rs (サムネイル + EXIF + 変換)
    │   └── video_server.rs (ローカルHTTPサーバー)
    │
    │   [ファイル配信]
    │   ├── <img src="http://127.0.0.1:PORT/..."> ──┐
    │   ├── <video src="http://127.0.0.1:PORT/..."> ─┤ ローカルHTTPサーバー
    │   └── <img src="http://127.0.0.1:PORT/..."> ───┘ (別スレッド、非同期)
    │
    │   ※ media:// カスタムプロトコルはHEICフォールバック用に残存
```

### データフロー

1. **起動時**: `plugin-store` から `mediaBasePath` を読み込み。未設定なら `plugin-dialog` でフォルダ選択。ローカルHTTPサーバー (`tiny_http`) をランダムポートで起動
2. **スキャン**: `scan_media` コマンドで YEAR/EVENT 構造をRustで再帰スキャン。結果は `AppData/cache/index.json` にキャッシュ (24h TTL)
3. **サムネイル表示**: フロントエンドでMD5ハッシュからキャッシュパスを計算し、`http://127.0.0.1:PORT/path` を `<img src>` に設定。キャッシュミス (404) 時は `batch_ensure_thumbnails` でバッチ生成後リトライ
4. **フルサイズ表示**: ローカルHTTPサーバーでファイルを配信。HEICは自動JPEG変換。動画はRange requestsでストリーミング
5. **メディア情報**: `get_media_info` コマンドで `kamadak-exif` (EXIF) + `ffprobe` (動画メタデータ) を取得

## Rustモジュール構成

### lib.rs - エントリポイント

**Tauriコマンド:**

| コマンド | 引数 | 戻り値 | 用途 |
|---------|------|--------|------|
| `get_stored_path` | - | `Option<String>` | 保存済みメディアパス取得 |
| `set_stored_path` | `path` | - | メディアパス保存 |
| `scan_media` | `base_path` | `Vec<MediaItem>` | メディアスキャン (キャッシュ付き) |
| `force_scan` | `base_path` | `Vec<MediaItem>` | 強制再スキャン |
| `get_thumbnail` | `path`, `base_path` | `String` (キャッシュパス) | サムネイル生成/取得 |
| `get_thumbnail_cache_dir` | - | `String` | キャッシュディレクトリパス |
| `batch_ensure_thumbnails` | `paths[]`, `base_path` | `Vec<bool>` | バッチサムネイル生成 |
| `get_media_info` | `path`, `base_path` | `JSON` | EXIF/動画メタデータ |
| `get_video_server_port` | - | `u16` | ローカルHTTPサーバーのポート番号 |

**カスタムプロトコル `media://` (フォールバック):**
- HEICファイルの変換+配信用に残存
- メインのファイル配信はローカルHTTPサーバーに移行済み

### video_server.rs - ローカルHTTPサーバー

- `tiny_http` crateで `127.0.0.1:0` (ランダムポート) にバインド
- リクエスト毎にスレッドを生成 (メインスレッドをブロックしない)
- Range requests対応 (動画ストリーミング)
- HEIC自動変換 (sips経由、永続キャッシュ)
- CORS対応 (`Access-Control-Allow-Origin: *`)
- 画像/動画の全MIMEタイプをサポート

**media:// との比較:**

| 項目 | media:// | ローカルHTTPサーバー |
|------|----------|---------------------|
| スレッド | メインスレッド (UI ブロック) | 別スレッド (UI 非ブロック) |
| 動画再生 | カクカク | スムーズ |
| 並列リクエスト | 直列処理 | 並列処理 |
| セキュリティ | WebView内部 | 127.0.0.1のみ、外部アクセス不可 |

### scanner.rs - ファイルスキャナー

- `walkdir` crateで `YEAR/EVENT/...files` 構造を再帰スキャン
- 隠しファイル (`.`) をスキップ
- メディア拡張子のみ収集 (jpg, jpeg, png, gif, heic, heif, mp4, mov, avi, m4v, mkv)
- `birthtime` を `mtime` として使用 (元のNode.js版と同じ)
- JSON形式でキャッシュ (24時間TTL)

### thumbnail.rs - サムネイル/メディア処理

**サムネイル生成:**
- 300x300px JPEG、cover crop (中央トリミング)
- `image` crate + Triangle フィルタ (速度優先)
- EXIF Orientation に基づく自動回転 (`kamadak-exif`)
- MD5ハッシュでキャッシュファイル名生成
- 失敗時はプレースホルダー画像を保存 (再試行ループ防止)

**HEIC変換:**
- macOS `sips` コマンドで JPEG に変換
- サムネイル用: tempディレクトリに書き出し、リサイズ後に削除
- フルサイズ表示用: `AppData/cache/converted/` に永続キャッシュ

**動画サムネイル:**
- `ffmpeg` (npm ffmpeg-static、`/opt/homebrew/bin`、またはシステム) で1秒目フレーム抽出
- 失敗時はダークグレーのプレースホルダー

**メディア情報 (`get_media_info`):**
- 画像: `kamadak-exif` でEXIF (撮影日時、カメラ、レンズ、ISO、F値、露出、焦点距離、GPS)
- 動画: `ffprobe` で再生時間、コーデック、fps、解像度
- 共通: ファイルサイズ、更新日時、寸法、メガピクセル

## フロントエンド構成

### tauri-app.js - Tauri統合レイヤー

- `window.__TAURI__` の存在でTauri/ブラウザ環境を判定
- 起動時に `thumbnailCacheDir` と `videoServerPort` を取得
- MD5ハッシュをJSで計算し、サムネイルURLを直接生成
- 全コンテンツ (サムネイル、画像、動画) をローカルHTTPサーバー経由で配信

### gallery.js - ギャラリーUI

- `tauriApp` パラメータでTauri対応 (コンストラクタ注入)
- `getThumbnailUrl()`: Tauri時は `http://127.0.0.1:PORT/...`、ブラウザ時は `/api/thumbnail`
- `getMediaUrl()`: Tauri時は `http://127.0.0.1:PORT/...`、ブラウザ時は `/api/image` or `/media/`
- `loadTauriThumbnails()`: キャッシュミス時のバッチ生成 + リトライ (404でもエラー表示せずローディング維持)

### lightbox.js - ライトボックス

- `getMediaUrl()` 経由でTauri/ブラウザ両対応
- `loadMediaInfo()`: Tauri時は `invoke('get_media_info')`、ブラウザ時は `fetch('/api/media-info')`

## 設定・権限

### tauri.conf.json

- `withGlobalTauri: true` (バンドラー不要でTauri APIにアクセス)
- CSP: `media:` スキーム、`http://127.0.0.1:*`、Google Maps iframe を許可
- ウィンドウ: 1200x800、リサイズ可能

### capabilities/default.json

- `core:default`, `dialog:allow-open`, `store:default`, `fs:default`

## ビルド・インストール

```bash
npm run install-app
```

以下を一括実行:
1. `tauri build --bundles app` (Rustコンパイル + .appバンドル)
2. `/Applications/Media Viewer.app` を削除+コピー
3. `codesign --force --deep -s -` でアドホック署名 (macOSが権限を記憶するため)

## テスト (21件)

### scanner (10件)
- ディレクトリ構造スキャン、隠しファイル除外、非メディア除外
- メディアタイプ判定、年/イベント割り当て、ネストパス
- キャッシュ読み書き、キャッシュ使用/強制スキャン、無効ディレクトリ

### thumbnail (9件)
- MD5ハッシュ生成 (決定性、一意性)、動画/HEIC判定
- JPEG生成、キャッシュヒット、ファイル未検出
- リサイズアスペクト比、メディア情報取得、HEIC拡張子判定

### lib (2件)
- コマンドハンドラの存在確認、MIMEタイプ判定

## パフォーマンス最適化

| 最適化 | 効果 |
|--------|------|
| ローカルHTTPサーバー (tiny_http) | 全コンテンツを別スレッドで配信。UIブロックゼロ |
| `[profile.dev.package."*"] opt-level = 2` | 依存crateをdevでも最適化。画像処理が5-10倍高速 |
| MD5をJSで計算 | キャッシュ済みサムネイルはIPC不要。ブラウザが直接並列読み込み |
| バッチサムネイル生成 | 未キャッシュ分を1回のIPCで20枚ずつ処理 |
| Range requests | 動画ストリーミング対応。メモリ使用量削減 |
| Triangle フィルタ | Lanczos3より高速なリサイズ (サムネイルには十分な品質) |
| HEIC永続キャッシュ | sips変換結果をAppDataに保存。2回目以降は即座に配信 |
| 失敗プレースホルダー | 生成失敗ファイルにダミー画像を保存。再試行ループ防止 |
| ffmpeg well-known paths | ビルド済みアプリから `/opt/homebrew/bin` 等を直接参照 |
| アドホック署名 | macOSがリムーバブルボリューム権限を記憶 |
