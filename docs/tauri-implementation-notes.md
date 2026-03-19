# Tauri版 実装仕様書

**更新日**: 2026-03-19

## アーキテクチャ

### 全体構成

```
[Tauri WebView (フロントエンド)]
    │
    ├── gallery.js ──── invoke('scan_media') ───────┐
    ├── gallery.js ──── invoke('get_thumbnail') ────┤
    ├── gallery.js ──── invoke('batch_ensure_...') ─┤
    ├── lightbox.js ─── invoke('get_media_info') ───┤ IPC
    ├── tauri-app.js ── invoke('get_stored_path') ──┤
    ├── tauri-app.js ── invoke('set_stored_path') ──┤
    │                                               │
    │   [Rust バックエンド]                          │
    │   ├── lib.rs (コマンド登録 + プロトコル) ◄─────┘
    │   ├── scanner.rs (スキャン + キャッシュ)
    │   └── thumbnail.rs (サムネイル + EXIF + 変換)
    │
    ├── <img src="media://..."> ────────────────────┐
    ├── <video src="media://..."> ──────────────────┤ カスタムプロトコル
    └── <img src="media://...thumbnail.jpg"> ───────┘ (Range対応)
```

### データフロー

1. **起動時**: `plugin-store` から `mediaBasePath` を読み込み。未設定なら `plugin-dialog` でフォルダ選択
2. **スキャン**: `scan_media` コマンドで YEAR/EVENT 構造をRustで再帰スキャン。結果は `AppData/cache/index.json` にキャッシュ (24h TTL)
3. **サムネイル表示**: フロントエンドでMD5ハッシュからキャッシュパスを計算し、`media://` URLを `<img src>` に直接設定。キャッシュミス (404) 時は `batch_ensure_thumbnails` でバッチ生成後リトライ
4. **フルサイズ表示**: `media://` カスタムプロトコルでファイルを配信。HEICは自動JPEG変換。動画はRange requestsでストリーミング
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

**カスタムプロトコル `media://`:**
- URLパスをデコードしてローカルファイルを配信
- HEIC: sipsで変換、永続キャッシュ (`AppData/cache/converted/`)
- 動画: Range requests対応 (HTTP 206)、4MBチャンク
- 大ファイル (10MB超): 自動的にチャンク配信

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
- `ffmpeg` (npm ffmpeg-static またはシステム) で1秒目フレーム抽出
- 失敗時はダークグレーのプレースホルダー

**メディア情報 (`get_media_info`):**
- 画像: `kamadak-exif` でEXIF (撮影日時、カメラ、レンズ、ISO、F値、露出、焦点距離、GPS)
- 動画: `ffprobe` で再生時間、コーデック、fps、解像度
- 共通: ファイルサイズ、更新日時、寸法、メガピクセル

## フロントエンド構成

### tauri-app.js - Tauri統合レイヤー

- `window.__TAURI__` の存在でTauri/ブラウザ環境を判定
- Node.js版と同じJSファイルが両方の環境で動作
- MD5ハッシュをJSで計算し、サムネイルURLをIPC不要で直接生成
- 起動時に `thumbnailCacheDir` を1回だけ取得

### gallery.js - ギャラリーUI

- `tauriApp` パラメータでTauri対応 (コンストラクタ注入)
- `getThumbnailUrl()`: Tauri時は `media://` URL、ブラウザ時は `/api/thumbnail`
- `getMediaUrl()`: Tauri時は `media://` URL、ブラウザ時は `/api/image` or `/media/`
- `loadTauriThumbnails()`: キャッシュミス時のバッチ生成 + リトライ

### lightbox.js - ライトボックス

- `getMediaUrl()` 経由でTauri/ブラウザ両対応
- `loadMediaInfo()`: Tauri時は `invoke('get_media_info')`、ブラウザ時は `fetch('/api/media-info')`

## 設定・権限

### tauri.conf.json

- `withGlobalTauri: true` (バンドラー不要でTauri APIにアクセス)
- CSP: `media:` スキームと Google Maps iframe を許可
- ウィンドウ: 1200x800、リサイズ可能

### capabilities/default.json

- `core:default`, `dialog:allow-open`, `store:default`, `fs:default`

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
| `[profile.dev.package."*"] opt-level = 2` | 依存crateをdevでも最適化。画像処理が5-10倍高速 |
| MD5をJSで計算 | キャッシュ済みサムネイルはIPC不要。ブラウザが直接並列読み込み |
| バッチサムネイル生成 | 未キャッシュ分を1回のIPCで20枚ずつ処理 |
| Range requests | 動画を4MBチャンクでストリーミング。メモリ使用量削減 |
| Triangle フィルタ | Lanczos3より高速なリサイズ (サムネイルには十分な品質) |
| HEIC永続キャッシュ | sips変換結果をAppDataに保存。2回目以降は即座に配信 |
| 失敗プレースホルダー | 生成失敗ファイルにダミー画像を保存。再試行ループ防止 |
