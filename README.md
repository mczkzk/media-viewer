# Media Viewer

年代ごとに整理された写真・動画コレクション用のデスクトップメディアビューワー

Tauri v2 (Rust) + Vanilla JavaScript で構築されたネイティブmacOSアプリケーション。

## 機能

- **グリッド表示** - サムネイル一覧表示 (7,000枚以上対応)
- **HEIC完全対応** - iPhone写真を自動JPEG変換 (macOS sips)
- **動画再生** - ライトボックス内でMP4/MOV/AVI/M4V/MKVをストリーミング再生
- **スライドショー** - 矢印キーでナビゲーション
- **検索・フィルタ** - 年とイベント名で絞り込み (日本語ローマ字検索対応)
- **ソート** - 新しい順/古い順を切り替え
- **サイズ調整** - サムネイルサイズ (小/中/大) を選択可能
- **年区切り** - 年ごとにセクション表示、右サイドバーで年インデックスナビ
- **階層モード** - 年選択でFinder風フォルダ表示、パンくずナビ
- **Lazy Loading** - スクロールに応じてサムネイルをオンデマンド生成
- **キャッシュ** - サムネイル、HEIC変換、スキャン結果を永続キャッシュ
- **EXIF情報** - カメラ、レンズ、設定値、GPS地図表示
- **動画メタデータ** - 再生時間、コーデック、fps、解像度
- **ネイティブフォルダ選択** - macOSダイアログでメディアフォルダを選択

## 技術スタック

- **バックエンド**: Rust (Tauri v2)
- **フロントエンド**: Vanilla JavaScript (フレームワーク不使用)
- **画像処理**: image crate (サムネイル生成、リサイズ)
- **HEIC変換**: macOS標準 `sips` コマンド
- **動画サムネイル**: ffmpeg (npm ffmpeg-static)
- **EXIF読み取り**: kamadak-exif crate
- **動画メタデータ**: ffprobe
- **ファイル配信**: カスタムURIプロトコル (`media://`) + Range requests

## 必要要件

- **macOS** (sipsコマンド使用のため必須)
- **Rust** 1.77.2 以上
- **Node.js** 18.x 以上
- **Xcode Command Line Tools** (`xcode-select --install`)

## インストール

```bash
# Rust (未インストールの場合)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# リポジトリをクローン
git clone https://github.com/mczkzk/media-viewer.git
cd media-viewer

# 依存関係をインストール
npm install
```

## 開発

```bash
# 開発サーバー起動 (ホットリロード対応)
npm run tauri:dev

# Rustテスト実行
cd src-tauri && cargo test
```

## ビルド

```bash
# macOSアプリをビルド
npm run tauri:build

# ユニバーサルバイナリ (Apple Silicon + Intel)
npm run tauri:build -- --target universal-apple-darwin
```

## 使い方

### 初回起動

1. アプリを起動するとフォルダ選択ダイアログが表示される
2. メディアファイルが格納されたフォルダを選択
3. 選択したパスは自動保存され、次回起動時に自動読み込み

### 操作方法

| 操作 | 動作 |
|------|------|
| クリック | 画像拡大、動画再生 |
| 矢印キー (左右) | ライトボックス内でナビゲーション |
| Escキー | ライトボックスを閉じる |
| 年フィルター | 特定の年のみ表示 (階層モードに切替) |
| 検索ボックス | イベント名やファイル名で検索 |
| ソート | 新しい順/古い順を切り替え |
| サイズ | サムネイルサイズ (小/中/大) を選択 |
| 年インデックス | 右サイドバーの年をクリックでジャンプ |
| 情報ボタン (i) | EXIF、カメラ情報、GPS地図を表示 |
| 再スキャンボタン | メディアフォルダを再スキャン |

### ディレクトリ構造の想定

```
/your-media-path/
├── 1989/
│   ├── 1989-04/
│   │   └── photo.jpg
│   └── 1989-05/
├── 2024/
│   └── 2024-06-vacation/
│       ├── photo.jpg
│       └── subfolder/       # 深い階層も対応
│           └── photo.jpg
└── ...
```

第1階層がグループ (通常は年)、第2階層がイベント。深いネストも再帰スキャン。

## プロジェクト構成

```
media-viewer/
├── src-tauri/                 # Rustバックエンド
│   ├── Cargo.toml
│   ├── tauri.conf.json        # Tauri設定 (CSP、ウィンドウ等)
│   ├── capabilities/
│   │   └── default.json       # 権限定義
│   └── src/
│       ├── main.rs            # エントリポイント
│       ├── lib.rs             # コマンド登録 + media:// プロトコル
│       ├── scanner.rs         # ディレクトリスキャン + キャッシュ
│       └── thumbnail.rs       # サムネイル + EXIF + HEIC変換
├── public/                    # フロントエンド
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── tauri-app.js       # Tauri統合レイヤー
│       ├── gallery.js         # グリッド表示・フィルタ
│       ├── lightbox.js        # 拡大表示・スライドショー
│       └── kana-converter.js  # 日本語かな検索
├── docs/
│   ├── tauri-migration-plan.md
│   └── tauri-implementation-notes.md
└── package.json
```

## パフォーマンス

- **初回起動**: ディレクトリスキャン (7,000ファイルで約10秒)
- **2回目以降**: キャッシュ使用 (即座に起動)
- **サムネイル**: オンデマンド生成 + 永続キャッシュ (300x300 JPEG)
- **HEIC変換**: 初回のみ変換、永続キャッシュから即座に配信
- **動画**: Range requestsによるストリーミング再生

## 対応フォーマット

### 画像
- JPG/JPEG
- PNG
- GIF
- HEIC/HEIF (自動JPEG変換)

### 動画
- MP4
- MOV
- AVI
- M4V
- MKV

## トラブルシューティング

### サムネイルが表示されない

アプリ内の再スキャンボタンを押す。改善しない場合はキャッシュを削除:

```bash
# サムネイルキャッシュ
rm ~/Library/Application\ Support/com.mediaviewer.app/cache/thumbnails/*.jpg

# スキャンキャッシュ
rm ~/Library/Application\ Support/com.mediaviewer.app/cache/index.json
```

### HEICファイルが表示されない

macOSの `sips` コマンドが必要:
```bash
which sips  # 通常は /usr/bin/sips
```

### Rustがインストールされていない

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

## ライセンス

ISC
