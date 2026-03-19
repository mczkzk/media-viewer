# Tauri移行 実装メモ

**更新日**: 2026-03-19

## 既存機能の再現状況

README.mdに記載された全機能のTauri版での対応状況。

| 機能 | Node.js版 | Tauri版 | 状態 |
|------|----------|---------|------|
| グリッド表示 (7000枚以上) | Express API | `invoke('scan_media')` | 動作 |
| サムネイル生成 (300x300) | sharp | image crate + base64 | 動作 (JPG/PNG) |
| HEIC→JPEG変換 | sips | sips (Command API) | 未確認 (エラー発生の可能性) |
| 動画サムネイル | ffmpeg | ffmpeg (Command API) | 未確認 |
| 動画再生 | Express static | base64 data URL | 未実装 (大容量動画はbase64不可) |
| ライトボックス表示 | /api/image | `invoke('get_media_file')` base64 | 動作 (JPG) |
| スライドショー (矢印キー) | gallery.js + lightbox.js | そのまま流用 | 動作 |
| 年フィルター | gallery.js | そのまま流用 | 動作 |
| イベント名検索 | gallery.js + kana-converter | そのまま流用 | 動作 |
| ソート (新しい順/古い順) | gallery.js | そのまま流用 | 動作 |
| サムネイルサイズ切替 | CSS class | そのまま流用 | 動作 |
| 年区切り表示 | gallery.js | そのまま流用 | 動作 |
| 年インデックスナビ | gallery.js | そのまま流用 | 動作 |
| Lazy Loading | loading="lazy" | IntersectionObserver | 動作 |
| サムネイルキャッシュ | cache/thumbnails/ | AppData/cache/thumbnails/ | 動作 |
| スキャンキャッシュ (24h TTL) | cache/index.json | AppData/cache/index.json | 動作 |
| 再スキャンボタン | /api/scan | `invoke('force_scan')` | 動作 |
| フォルダ選択 | .env手動設定 | ネイティブダイアログ | 動作 (改善) |
| 設定永続化 | .env | plugin-store | 動作 (改善) |
| 階層モード (Finder風) | gallery.js | そのまま流用 | 動作 |
| パンくずナビ | gallery.js | そのまま流用 | 動作 |
| URL状態永続化 (?year=&q=) | gallery.js | そのまま流用 | 動作 |
| 日本語かな検索 | kana-converter.js | そのまま流用 | 動作 |
| EXIF情報表示 | /api/media-info | 未実装 | 未実装 |
| GPS地図表示 | Google Maps iframe | 未実装 | 未実装 |
| ディレクトリトラバーサル対策 | validatePath() | Rust型安全 + fsスコープ | 動作 (改善) |

## 未解決の問題

### 1. 動画再生 (base64方式の限界)
現在 `get_media_file` はファイル全体をbase64で返す。動画ファイル(数百MB)では不可能。
**対策**: Asset Protocolを解決するか、ローカルHTTPサーバーをRust側で立てる。

### 2. HEIC変換の動作確認
`sips` コマンドをRust `Command` APIで呼んでいるが、実際のHEICファイルでの動作未確認。
パスにスペースや日本語が含まれる場合の動作も要確認。

### 3. Asset Protocol未解決
`http://asset.localhost` が「Could not connect to the server」で機能しない。
config: `assetProtocol.enable: true`, `scope: ["/**"]`, feature: `protocol-asset` 設定済みだが動作せず。
base64方式で回避中だが、動画再生のためにいずれ解決が必要。

## 技術的な決定事項

### base64方式を選択した理由
- Asset Protocol (`http://asset.localhost`) が動作しない問題の回避
- サムネイル(300x300 JPEG)はbase64でも十分高速
- フルサイズ画像もJPEG/PNGなら数MBでbase64可能

### EXIF回転の実装
- `kamadak-exif` crateでOrientation読み取り
- `image` crateの `rotate90()` / `rotate270()` 等で回転
- 元の `sharp().rotate()` と同等の動作

### IntersectionObserver採用
- 元のNode.js版は `loading="lazy"` のみ
- Tauri版はbase64非同期読み込みのため、IntersectionObserverで可視領域+200pxのみリクエスト
- 7000枚を一度にリクエストしないよう制御

## Rustテスト (18件)

### scanner (10件)
- ディレクトリ構造スキャン、隠しファイル除外、非メディア除外
- メディアタイプ判定、年/イベント割り当て、ネストパス
- キャッシュ読み書き、キャッシュ使用/強制スキャン、無効ディレクトリ

### thumbnail (7件)
- MD5ハッシュ生成、動画/HEIC判定
- JPEG生成、キャッシュヒット、ファイル未検出、リサイズアスペクト比

### lib (1件)
- コマンドハンドラの存在確認
