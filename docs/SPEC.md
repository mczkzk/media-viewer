# Media Viewer 仕様書

年代ごとに整理された写真・動画コレクション用のデスクトップメディアビューワー。
Tauri v2 (Rust) + Vanilla JavaScript で構築されたネイティブmacOSアプリケーション。

## 機能一覧

### 表示・ナビゲーション
- **グリッド表示**: サムネイル一覧 (7,000枚以上対応)、仮想スクロールでDOM最小化
- **年区切り**: 年ごとにセクション表示、右サイドバーで年インデックスナビ
- **階層モード**: 年選択でFinder風フォルダ表示、パンくずナビ
- **ライトボックス**: フルスクリーン画像/動画ビューア、矢印キーナビ、Escで閉じる
- **詳細情報パネル**: EXIF、カメラ情報、GPS地図、画像タグを表示 (iボタン)
- **サイズ調整**: サムネイルサイズ (小/中/大)
- **ソート**: 新しい順/古い順

### 検索・フィルタ
- **テキスト検索**: イベント名、ファイル名、パスで部分一致検索
- **AI画像タグ検索**: macOS Vision Frameworkで自動解析したタグで検索 (食べ物、海、犬 等)
- **OCRテキスト検索**: 画像内の文字 (看板、メニュー等) で検索
- **GPS地名検索**: GPS座標から自動取得した地名で検索 (京都/Kyoto 等)
- **バイリンガル**: 英語/日本語どちらでも検索可能 + ローマ字入力対応
- **年フィルタ**: ドロップダウンで年を絞り込み

### メディア対応
- **画像**: JPG/JPEG, PNG, GIF, HEIC/HEIF (自動JPEG変換)
- **動画**: MP4, MOV, AVI, M4V, MKV (Range requestsストリーミング再生)
- **HEIC完全対応**: macOS `sips` で自動変換、永続キャッシュ

### メニューバー
- **File > フォルダを変更 (Cmd+O)**: メディアフォルダ切り替え (リロード不要)
- **File > キャッシュをクリア**: サムネイル + HEIC変換 + スキャンキャッシュを削除
- **File > タグを再生成**: 画像タグを全削除して再解析
- **Edit**: 標準編集メニュー (Undo/Redo/Cut/Copy/Paste/Select All)
- **View**: フルスクリーン

## アーキテクチャ

### データフロー

```
Tauri WebView (Frontend) → IPC/HTTP → Rust Backend → Local Files
                                          ↓
                                    Swift Helpers → macOS Frameworks
```

### バックエンド (Rust)

#### lib.rs - コマンドハブ
- Tauri v2 IPC コマンド登録
- macOS メニューバー構築 + イベント emit
- `media://` プロトコルハンドラ (HEIC変換対応)
- `plugin-store` (設定永続化)、`plugin-dialog` (フォルダ選択)
- `set_stored_path`: パス変更時にスキャンキャッシュを自動無効化

#### scanner.rs - ファイルスキャン
- `walkdir` で `YEAR/EVENT/...files` 構造を再帰スキャン
- `MediaItem`: `{path, year, event, filename, type, mtime}`
- `AppData/cache/index.json` にキャッシュ (24h TTL)
- 隠しファイル、非メディア拡張子をスキップ

#### thumbnail.rs - サムネイル + メディア情報
- `image` crate で 300x300px カバークロップ (EXIF回転対応)
- HEIC: `sips` → 一時JPEG → リサイズ
- 動画: `ffmpeg` で1秒目フレーム抽出
- 失敗時はプレースホルダー生成 (リトライ防止)
- MD5ハッシュでキャッシュファイル命名
- `get_media_info`: EXIF (`kamadak-exif`) + `ffprobe`
- `get_gps`: GPS座標抽出、HEIC は `mdls` フォールバック

#### tagger.rs - 画像タグ付け
- `vision-tagger` Swift ヘルパー呼び出し:
  - `VNClassifyImageRequest`: 画像分類 (confidence >= 0.4)
  - `VNRecognizeTextRequest`: OCR (日英対応、2文字以上、最大20件/画像)
- `reverse-geocoder` Swift ヘルパー (常駐プロセス, stdin/stdout通信):
  - `MKReverseGeocodingRequest` (en_US locale, macOS 26+)
  - 2秒間隔でレート制限回避、失敗時60秒バックオフ
  - 50m以内の近接座標はキャッシュ再利用
- タグ構成: Vision英語ラベル + 日本語翻訳 + OCRテキスト + GPS地名(EN) + 日本語地名(geo_dict)
- `AppData/cache/tags.json` に永続保存 (cache clearでは消えない)
- 動画: キャッシュ済みサムネイルを分類に使用 (サムネ先行生成)

#### label_dict.rs - Visionラベル翻訳辞書
- Vision Framework ラベル → 日本語翻訳 (~500エントリ)
- 英語と日本語の両方をタグに保存

#### geo_dict.rs - 地名翻訳辞書
- 都道府県47件 + 主要都市/観光地100+件の英語→日本語変換
- "Karuizawa" → ["軽井沢"], "Kyoto" → ["京都府", "京都"] のように複数タグ返却

#### video_server.rs - HTTPサーバー
- `tiny_http` でローカルHTTPサーバー (ランダムポート、別スレッド)
- 全メディアファイル配信 (サムネ、画像、動画)
- Range requests 対応 (動画ストリーミング)
- HEIC → JPEG 変換キャッシュ経由で配信
- クエリストリング除去 (cache-bust対応)

### Swift ヘルパー (src-tauri/helpers/)

#### vision-tagger.swift
- **入力**: 画像パス (引数、複数可)
- **出力**: `[{"labels":["sky","outdoor"], "text":["MENU","HOTEL"]}]`
- `npm run build:helpers` でコンパイル、アプリバンドル `Resources/helpers/` に配置

#### reverse-geocoder.swift
- **常駐プロセス**: stdin で `lat,lon` を1行ずつ受信、stdout で JSON 1行ずつ返却
- **出力**: `{"location":"Karuizawa, Nagano, Japan","error":""}`
- **API**: `MKReverseGeocodingRequest` (en_US locale, macOS 26+)
- **エラー検出**: rate_limit / no_result / empty を区別して返却
- `quit` で終了

### フロントエンド (Vanilla JS)

#### tauri-app.js - Tauri統合
- `window.__TAURI__` 検出
- JS側MD5ハッシュでサムネイルURL生成 (IPC不要)
- バッチサムネイル生成 (404時リトライ)
- 全コンテンツ `http://127.0.0.1:PORT/...` 経由
- `changeFolder()`: フォルダ選択 + 状態初期化 (リロード不要)
- メニューイベントリスナー

#### gallery.js - ギャラリー表示
- **Flat Mode** (デフォルト): 年区切りグリッド + 仮想スクロール
- **Hierarchical Mode**: Finder風フォルダ/ファイル表示 + パンくず
- `tagMap`: バックエンドから取得したタグデータ
- `_matchesQuery()`: path → event → filename → tags の順でマッチ (全てかな変換対応)
- `preConvertSearchFields()`: ロード時にromaji/hiragana/katakana事前生成
- `load({ force })`: 通常スキャン or 強制スキャン

#### virtual-scroll.js - 仮想スクロール
- 可視行のみDOM生成
- 行リサイクル + スクロールベース描画
- サムネイルロードのスケジューリング

#### lightbox.js - ライトボックス
- フルスクリーン画像/動画表示
- 矢印キーナビ、Escape、(i)情報パネル
- `filteredItems` 順でナビゲーション
- 情報パネル最下部にタグをピル表示

#### kana-converter.js - かな変換
- romaji ↔ hiragana ↔ katakana 相互変換
- 最長一致ローマ字テーブル、二重子音→っ変換
- 全検索フィールドを事前変換してO(1)検索

### IPC コマンド一覧

| コマンド | 引数 | 戻り値 | 用途 |
|---------|------|--------|------|
| `get_stored_path` | - | `Option<String>` | 保存済みメディアフォルダパス取得 |
| `set_stored_path` | `path` | - | メディアフォルダパス保存 + キャッシュ無効化 |
| `scan_media` | `base_path` | `Vec<MediaItem>` | メディアスキャン (キャッシュ使用) |
| `force_scan` | `base_path` | `Vec<MediaItem>` | 強制再スキャン |
| `get_thumbnail` | `path`, `base_path` | `String` | サムネイル生成/取得 |
| `get_thumbnail_cache_dir` | - | `String` | サムネイルキャッシュディレクトリ |
| `batch_ensure_thumbnails` | `paths[]`, `base_path` | `Vec<bool>` | バッチサムネイル生成 |
| `get_media_info` | `path`, `base_path` | `JSON` | EXIF/動画メタデータ |
| `get_video_server_port` | - | `u16` | HTTPサーバーポート |
| `clear_cache` | - | `String` | キャッシュ全削除 (タグ以外) |
| `get_tags` | - | `HashMap<String, Vec<String>>` | 全タグデータ取得 |
| `tag_images` | `paths[]`, `base_path` | `usize` | バッチタグ付け (Vision+OCR+GPS) |
| `clear_tags` | - | - | タグ全削除 (再生成用) |

### データ永続化

```
~/Library/Application Support/com.mediaviewer.app/
├── settings.json              # plugin-store (mediaBasePath)
└── cache/
    ├── index.json             # スキャンキャッシュ (24h TTL)
    ├── tags.json              # 画像タグ (永続、cache clearで消えない)
    ├── thumbnails/<md5>.jpg   # サムネイルキャッシュ (永続)
    └── converted/<md5>.jpg    # HEIC変換キャッシュ (永続)
```

### URL状態管理
- クエリパラメータ: `?year=2025&q=tokyo` (階層モード + 検索)
- ハッシュ: `#2025` (フラットモードのスクロール位置)
- ページリロード時に復元

## プラットフォーム依存

- **macOS** 必須 (`sips`, Vision Framework, `CLGeocoder`, `mdls`)
- **Xcode** 必須 (Swiftヘルパーのコンパイル)
- **Rust** 1.77.2+
- **Node.js** 18+
- **ffmpeg/ffprobe**: npm (`ffmpeg-static`) or well-known paths (`/opt/homebrew/bin`)

## プロジェクト構成

```
media-viewer/
├── src-tauri/
│   ├── Cargo.toml
│   ├── build.rs                   # Swiftヘルパーコンパイル
│   ├── tauri.conf.json            # Tauri設定
│   ├── capabilities/default.json  # 権限定義
│   ├── helpers/
│   │   ├── vision-tagger.swift    # 画像分類 + OCR
│   │   └── reverse-geocoder.swift # GPS逆ジオコーディング
│   └── src/
│       ├── main.rs
│       ├── lib.rs                 # IPCコマンド + メニュー + プロトコル
│       ├── scanner.rs             # ディレクトリスキャン + キャッシュ
│       ├── thumbnail.rs           # サムネイル + EXIF + GPS抽出
│       ├── tagger.rs              # タグ管理 (Vision + OCR + GPS統合)
│       ├── label_dict.rs          # Visionラベル EN→JA翻訳辞書
│       ├── geo_dict.rs            # 地名 EN→JA翻訳辞書
│       └── video_server.rs        # HTTPファイルサーバー
├── public/
│   ├── index.html                 # エントリ + 初期化 + バックグラウンドタグ付け
│   ├── css/style.css
│   └── js/
│       ├── tauri-app.js           # Tauri統合 + MD5 + IPC
│       ├── gallery.js             # 表示 + 検索 + フィルタ
│       ├── virtual-scroll.js      # 仮想スクロール
│       ├── lightbox.js            # ライトボックス + 情報パネル
│       └── kana-converter.js      # かな変換
├── docs/
│   └── SPEC.md                    # この仕様書
├── CLAUDE.md                      # Claude Code用ガイド
├── README.md                      # プロジェクト概要
└── package.json
```
