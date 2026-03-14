# Media Viewer Tauri化 実装計画書

**作成日**: 2026-03-14
**ステータス**: 計画段階

## 概要

現在のNode.js + ブラウザ構成のメディアビューアーを、Tauri v2を使ってネイティブデスクトップアプリに移行する。フロントエンドは既存のVanilla JS資産をそのまま活用し、バックエンド処理を段階的にRustへ移植する。

## 現状の構成

```
media-viewer/
├── server.js              # Express API サーバー
├── lib/
│   ├── scanner.js         # ファイルスキャン + キャッシュ
│   └── thumbnail.js       # サムネイル生成 (sharp, ffmpeg)
├── public/
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── gallery.js     # ギャラリーUI (flat/hierarchical)
│       ├── lightbox.js    # フルスクリーンビューア
│       └── kana-converter.js  # 日本語検索
└── .env                   # MEDIA_BASE_PATH設定
```

## 移行後の構成

```
media-viewer-app/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   └── default.json     # 権限定義 (dialog, fs, store)
│   └── src/
│       ├── main.rs           # エントリポイント
│       ├── lib.rs            # Tauri setup + コマンド登録
│       ├── scanner.rs        # ファイルスキャン (Rust)
│       └── thumbnail.rs     # サムネイル生成 (Rust)
├── src/                      # フロントエンド (既存資産を移植)
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── app.js            # 初期化 + フォルダ選択
│       ├── gallery.js
│       ├── lightbox.js
│       └── kana-converter.js
└── package.json
```

---

## 段階的移行計画

### Phase 1: 最小限のTauriシェル

**ゴール**: ダブルクリックで起動するアプリにする

**やること**:
- Tauri v2プロジェクト作成 (別リポジトリ)
- 既存のHTML/CSS/JSをフロントエンドとしてそのまま組み込み
- バックエンドはNode.js (`server.js`) をsidecarとして起動
- `.env`の`MEDIA_BASE_PATH`はそのまま利用

**技術的ポイント**:
- `tauri.conf.json`で`devUrl`にlocalhost指定 (開発時)
- `frontendDist`で静的ファイルをバンドル (ビルド時)
- Node.jsはTauriのsidecar機能で起動

**成果物**: 動くアプリ（中身はほぼ変わらない）

---

### Phase 2: Express撤去 + Tauriネイティブ化

**ゴール**: Node.js/Expressを完全に排除し、Tauriの機能で置き換え

#### 2-1. フォルダ選択UI

**現状**: `.env`にパスを手書き
**移行後**: ネイティブフォルダ選択ダイアログ

```javascript
// フロントエンド
import { open } from '@tauri-apps/plugin-dialog';
import { load } from '@tauri-apps/plugin-store';

async function selectMediaFolder() {
  const path = await open({
    directory: true,
    title: 'メディアフォルダを選択'
  });
  if (path) {
    const store = await load('settings.json');
    await store.set('mediaBasePath', path);
    await store.save();
  }
}
```

**UXフロー**:
1. 初回起動 → フォルダ選択ダイアログ表示
2. 選択したパスを `~/Library/Application Support/media-viewer/settings.json` に保存
3. 次回起動時は自動で読み込み
4. メニューバーから「フォルダを変更」で再選択可能

#### 2-2. ファイルスキャン → Rustコマンド

**現状**: `lib/scanner.js` (Node.js fs)
**移行後**: Rustコマンド (`src-tauri/src/scanner.rs`)

```rust
#[tauri::command]
async fn scan_media(base_path: String) -> Result<Vec<MediaItem>, String> {
    // YEAR/EVENT構造をスキャン
    // キャッシュ付き (serde_json でJSONファイルに保存)
}
```

```javascript
// フロントエンドから呼び出し
const items = await invoke('scan_media', { basePath: mediaPath });
```

**Rust学習ポイント**:
- `std::fs` でディレクトリ走査
- `serde` でJSON シリアライズ/デシリアライズ
- `Result<T, E>` でエラーハンドリング
- `walkdir` crateで再帰スキャン

#### 2-3. メディアファイル表示 → Asset Protocol

**現状**: Express経由 (`/api/media/:path`, `/api/thumbnail/:path`)
**移行後**: Tauriの `convertFileSrc()` でダイレクトアクセス

```javascript
import { convertFileSrc } from '@tauri-apps/api/core';

// サムネイルやフル画像のURL生成
const imageUrl = convertFileSrc('/path/to/2025/event/photo.jpg');
img.src = imageUrl;  // asset://localhost/path/to/photo.jpg
```

**メリット**: Express不要、ファイルIOのオーバーヘッドなし

#### 2-4. サムネイル生成 → Rust

**現状**: `lib/thumbnail.js` (sharp + ffmpeg)
**移行後**: Rust (`image` crate + `ffmpeg` bindings)

```rust
#[tauri::command]
async fn get_thumbnail(file_path: String, cache_dir: String) -> Result<String, String> {
    // image crate でリサイズ
    // HEIC: image crate が対応 (libheifバインディング)
    // Video: ffmpeg CLIまたはRustバインディングで1秒目フレーム抽出
}
```

**使用crate**:
- `image` — 画像リサイズ、フォーマット変換
- `kamadak-exif` — EXIF読み取り
- `md5` — キャッシュファイル名ハッシュ

#### 2-5. EXIF/メディア情報 → Rust

**現状**: `exifr` (npm) でフロントエンドから取得
**移行後**: Rustコマンド

```rust
#[tauri::command]
async fn get_media_info(file_path: String) -> Result<MediaInfo, String> {
    // kamadak-exif でEXIF読み取り
    // GPS座標、カメラ情報、撮影日時など
}
```

---

### Phase 3: UX改善 + アプリ品質向上

**ゴール**: 配布可能な品質のアプリにする

- [ ] メニューバー (フォルダ変更、キャッシュクリア、About)
- [ ] キーボードショートカット (Tauri global-shortcut plugin)
- [ ] ドラッグ&ドロップでフォルダ追加
- [ ] アプリアイコン設定
- [ ] macOS code signing
- [ ] DMGインストーラー生成
- [ ] 複数フォルダ対応 (複数のMEDIA_BASE_PATH)

---

## YEAR/EVENT構造について

**現行のディレクトリ制約は維持する**。理由:

- 年インデックスナビゲーション (右サイドバー) が機能するために必須
- 年フィルタードロップダウンが機能するために必須
- 階層モード (年→イベント) のUXが成立するために必須
- `YEAR/EVENT/files` は写真整理として自然なパターン

**ただし以下の柔軟性は追加する**:
- 第1階層が4桁数字でなくても動作 (フォルダ名をそのままグループとして扱う)
- 第2階層がなくてもフラット表示で動作

---

## macOSビルド要件

```bash
# 前提条件
xcode-select --install
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add aarch64-apple-darwin   # Apple Silicon
rustup target add x86_64-apple-darwin    # Intel

# プロジェクト作成
npm create tauri-app@latest media-viewer-app -- --template vanilla

# 開発
cd media-viewer-app
npm install
npm run tauri dev

# ビルド (ユニバーサルバイナリ)
npm run tauri build -- --target universal-apple-darwin
```

## 必要なTauriプラグイン

| プラグイン | 用途 |
|-----------|------|
| `@tauri-apps/plugin-dialog` | フォルダ選択ダイアログ |
| `@tauri-apps/plugin-store` | 設定永続化 (mediaBasePath等) |
| `@tauri-apps/plugin-fs` | ファイルシステムアクセス |

## Capabilities (権限定義)

```json
{
  "identifier": "default",
  "description": "Media Viewer permissions",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:allow-open",
    "store:allow-get",
    "store:allow-set",
    "store:allow-save",
    "store:allow-load",
    "fs:allow-read",
    "fs:allow-exists"
  ]
}
```

---

## 想定スケジュール感

| Phase | 内容 | Rust学習要素 |
|-------|------|-------------|
| Phase 1 | Tauriシェル + sidecar | プロジェクト構造、Cargo、基本構文 |
| Phase 2-1 | フォルダ選択UI | Tauri コマンド、フロントエンド連携 |
| Phase 2-2 | ファイルスキャン | std::fs、serde、Result型、構造体 |
| Phase 2-3 | Asset Protocol | 設定理解、セキュリティモデル |
| Phase 2-4 | サムネイル生成 | image crate、非同期処理、外部crate |
| Phase 2-5 | EXIF読み取り | バイナリ処理、エラーハンドリング |
| Phase 3 | UX改善 + 配布 | ビルド、署名、CI/CD |

## HEIC対応のクロスプラットフォーム化

**現状**: macOS `sips` コマンド依存
**Phase 2-4で解決**:
- Rust `image` crate + `libheif-rs` でクロスプラットフォーム対応
- `sips` は完全に不要になる
