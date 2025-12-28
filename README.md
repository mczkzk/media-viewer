# 📷 Media Viewer

年代ごとに整理された写真・動画コレクション用のローカルWebビューワー

## ✨ 機能

- **グリッド表示** - サムネイル一覧表示（7,000枚以上対応）
- **HEIC完全対応** - iPhone写真を自動JPEG変換
- **動画再生** - ライトボックス内でMP4/MOV/AVI再生
- **スライドショー** - 矢印キー（← →）でナビゲーション
- **検索・フィルタ** - 年とイベント名で絞り込み
- **ソート** - 新しい順/古い順を切り替え
- **サイズ調整** - サムネイルサイズ（小/中/大）を選択可能
- **年区切り** - 年ごとにセクション表示
- **Lazy Loading** - スクロールに応じて段階的に読み込み
- **キャッシュ** - サムネイルと変換済み画像をキャッシュ

## 🛠 技術スタック

- **バックエンド**: Node.js + Express
- **フロントエンド**: Vanilla JavaScript (フレームワーク不使用)
- **画像処理**: sharp (サムネイル生成)
- **HEIC変換**: macOS標準 `sips` コマンド

## 📋 必要要件

- **macOS** (sipsコマンド使用のため必須)
- **Node.js** 14.x 以上
- **外付けSSD** (またはメディアファイルが保存されているドライブ)

## 🚀 インストール

```bash
# リポジトリをクローン
git clone https://github.com/mczkzk/media-viewer.git
cd media-viewer

# 依存関係をインストール
npm install
```

## ⚙️ セットアップ

### 環境変数の設定

`.env.example` をコピーして `.env` を作成：

```bash
cp .env.example .env
```

`.env` を編集してメディアファイルのパスを設定：

```bash
# Media files directory path
MEDIA_BASE_PATH=/Volumes/Extreme SSD/00_Memories/Selected_Media

# Server port (default: 3000)
PORT=3000
```

**注意**: `.env` ファイルは `.gitignore` に含まれており、Gitにコミットされません

### ディレクトリ構造の想定

```
/your-media-path/
├── 1989/
│   ├── 1989-04/
│   │   └── photo.jpg
│   └── 1989-05/
├── 1990/
│   └── 1990_Daily/
│       └── vacation/
│           └── photo.jpg  # 深い階層も対応
└── ...
```

## 🎮 使い方

### サーバー起動

```bash
node server.js
```

### ブラウザでアクセス

```
http://localhost:3000
```

### 操作方法

- **年フィルター** - 特定の年のみ表示
- **検索ボックス** - イベント名やファイル名で検索
- **ソート** - 新しい順/古い順を切り替え
- **サイズ** - サムネイルサイズ（小/中/大）を選択
- **クリック** - 画像拡大、動画再生
- **矢印キー** - ライトボックス内でナビゲーション
- **Escキー** - ライトボックスを閉じる

## 📁 ディレクトリ構造

```
media-viewer/
├── server.js              # Expressサーバー
├── package.json           # 依存関係定義
├── cache/                 # 自動生成（.gitignore済み）
│   ├── index.json        # スキャン結果キャッシュ
│   ├── thumbnails/       # サムネイル（300x300px）
│   └── converted/        # HEIC→JPEG変換済みファイル
├── lib/
│   ├── scanner.js        # ディレクトリスキャン（再帰）
│   └── thumbnail.js      # サムネイル生成
└── public/
    ├── index.html        # メインHTML
    ├── css/
    │   └── style.css     # スタイル定義
    └── js/
        ├── gallery.js    # グリッド表示・フィルタ
        └── lightbox.js   # 拡大表示・スライドショー
```

## 🎯 パフォーマンス

- **初回起動**: ディレクトリスキャン（数十秒、7,000ファイルで約10秒）
- **2回目以降**: キャッシュ使用（即座に起動）
- **サムネイル生成**: オンデマンド（スクロール時に自動生成）
- **HEIC変換**: 初回のみ変換、2回目以降はキャッシュから即座に表示

## 🔐 セキュリティ

- ディレクトリトラバーサル対策実装済み
- ベースパス外へのアクセスを拒否
- ローカル専用（外部公開非推奨）

## 🐛 トラブルシューティング

### サムネイルが表示されない

```bash
# キャッシュをクリア
rm -rf cache/thumbnails/*
rm -f cache/index.json

# サーバー再起動
node server.js
```

### HEICファイルが表示されない

- macOSの`sips`コマンドが必要です
- `which sips` で確認（通常は `/usr/bin/sips`）

### 深いディレクトリのファイルが表示されない

- 自動的に再帰スキャンされます（階層制限なし）
- `cache/index.json`を削除して再スキャン

### ポート3000が使用中

`server.js` の8行目を編集：

```javascript
const PORT = 3001; // 別のポートに変更
```

## 📊 対応フォーマット

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

## 📝 ライセンス

ISC

## 🙏 作成者

プライベート使用
