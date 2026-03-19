# Media Viewer Tauri化 実装計画書

**作成日**: 2026-03-14
**更新日**: 2026-03-19
**ステータス**: 計画段階
**旧Node.js版**: `v1.0-node` タグで保存済み

## 概要

現在のNode.js + ブラウザ構成のメディアビューアーを、Tauri v2を使ってネイティブデスクトップアプリに移行する。フロントエンドは既存のVanilla JS資産をそのまま活用し、バックエンド処理をRustへ移植する。同一リポジトリ内で段階的に移行する。

## 現状の構成

```
media-viewer/
├── server.js              # Express API サーバー (移行後に削除)
├── lib/
│   ├── scanner.js         # ファイルスキャン + キャッシュ (移行後に削除)
│   └── thumbnail.js       # サムネイル生成 (移行後に削除)
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
media-viewer/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   └── default.json     # 権限定義
│   └── src/
│       ├── main.rs           # エントリポイント
│       ├── lib.rs            # Tauri setup + コマンド登録
│       ├── scanner.rs        # ファイルスキャン (Rust)
│       └── thumbnail.rs      # サムネイル生成 (Rust)
├── public/                   # フロントエンド (既存資産を流用)
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── app.js            # Tauri初期化 + フォルダ選択
│       ├── gallery.js        # fetch → invoke に差し替え
│       ├── lightbox.js       # URL → convertFileSrc に差し替え
│       └── kana-converter.js # 変更なし
└── package.json
```

---

## API移行マッピング

フロントエンドが呼び出す全エンドポイントの対応表:

| 現在 (Express) | 移行後 (Tauri) | 呼び出し元 |
|----------------|---------------|-----------|
| `fetch('/api/media')` | `invoke('scan_media')` | gallery.js:18 |
| `<img src="/api/thumbnail?path=...">` | `invoke('get_thumbnail')` → `convertFileSrc()` | gallery.js:98, 158 |
| `<img src="/api/image?path=...">` | `convertFileSrc(path)` (HEIC変換はRust側) | lightbox.js:80 |
| `<video src="/media/...">` | `convertFileSrc(fullPath)` | lightbox.js:85 |
| `fetch('/api/media-info?path=...')` | `invoke('get_media_info')` | lightbox.js:178 |
| `fetch('/api/scan')` | `invoke('force_scan')` | index.html:190 |
| Google Maps iframe | CSP許可 + iframe維持 | lightbox.js:307 |

---

## 段階的移行計画

### Phase 1: Tauriプロジェクト構築 + フォルダ選択

**ゴール**: Tauriアプリとして起動し、フォルダを選択できる状態にする

**やること**:
- Tauri v2プロジェクトを同一リポジトリ内に作成 (`src-tauri/`)
- 既存の `public/` をフロントエンドとして組み込み
- ネイティブフォルダ選択ダイアログの実装
- 設定の永続化 (`@tauri-apps/plugin-store`)

```javascript
// フロントエンド (app.js)
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

**Rust学習ポイント**: プロジェクト構造、Cargo、基本構文、Tauriコマンド

**成果物**: 起動してフォルダ選択ができるアプリ (メディア表示はまだ)

---

### Phase 2: メディア表示 (Asset Protocol + スキャン)

**ゴール**: 選択したフォルダのメディアをグリッド表示できる

#### 2-1. Asset Protocol でメディアファイル配信

**現状**: Express経由 (`/api/image`, `/media/*`)
**移行後**: Tauriの `convertFileSrc()` でダイレクトアクセス

```javascript
import { convertFileSrc } from '@tauri-apps/api/core';

// 画像・動画のURL生成
const imageUrl = convertFileSrc('/path/to/2025/event/photo.jpg');
img.src = imageUrl;  // asset://localhost/path/to/photo.jpg
```

**必要な設定**:
- `tauri.conf.json` の `security.csp` でメディアソースを許可
- `fs` プラグインのスコープに `MEDIA_BASE_PATH` を含める
- 動画ストリーミング (Range requests) の動作確認

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

**Rust学習ポイント**: `std::fs`、`serde`、`Result<T, E>`、`walkdir` crate

**成果物**: フォルダ選択 → メディア一覧がグリッド表示される (サムネイルはまだフルサイズ)

---

### Phase 3: サムネイル生成

**ゴール**: サムネイルが高速に表示される

**現状**: `lib/thumbnail.js` (sharp + ffmpeg)
**移行後**: Rustコマンド + `convertFileSrc()`

**サムネイル配信フロー**:
1. フロントエンドが `invoke('get_thumbnail', {path})` を呼ぶ
2. Rust側でキャッシュ確認 → 未生成なら生成 (300x300 JPEG)
3. 生成済みサムネイルのファイルパスを返す
4. フロントエンドが `convertFileSrc(returnedPath)` で `<img src>` に設定

```rust
#[tauri::command]
async fn get_thumbnail(file_path: String, cache_dir: String) -> Result<String, String> {
    // キャッシュ確認 → HIT: return cache_path
    // 画像: image crate でリサイズ
    // HEIC: macOSでは sips コマンド (Command API経由)、将来的にlibheif対応
    // 動画: ffmpeg CLIで1秒目フレーム抽出
    // return generated_path
}
```

**使用crate**:
- `image` -- 画像リサイズ、フォーマット変換
- `md5` -- キャッシュファイル名ハッシュ

**HEIC対応方針**: macOSでは `sips` を引き続き利用 (Tauri `Command` API経由)。クロスプラットフォーム対応はPhase 5で検討。

**Rust学習ポイント**: `image` crate、非同期処理、外部プロセス呼び出し

**成果物**: サムネイルが表示されるギャラリー

---

### Phase 4: EXIF/メディア情報

**ゴール**: 情報パネルにEXIF、動画メタデータ、GPSマップを表示

**現状**: `exifr` (npm) + `sharp` + `fluent-ffmpeg`
**移行後**: Rustコマンド

```rust
#[tauri::command]
async fn get_media_info(file_path: String) -> Result<MediaInfo, String> {
    // kamadak-exif でEXIF読み取り
    // GPS座標、カメラ情報、撮影日時
    // 動画: ffprobeで情報取得
    // 画像寸法: image crateで取得
}
```

**使用crate**:
- `kamadak-exif` -- EXIF読み取り
- `image` -- 画像寸法取得

**Google Maps iframe**: `tauri.conf.json` の CSP で `frame-src https://maps.google.com` を許可

**Rust学習ポイント**: バイナリ処理、エラーハンドリング

**成果物**: 情報パネルが完全に動作

---

### Phase 5: UX改善 + アプリ品質向上

**ゴール**: 配布可能な品質のアプリにする

- [ ] Express/Node.js関連コード削除 (server.js, lib/, 不要npm依存)
- [ ] メニューバー (フォルダ変更、キャッシュクリア、About)
- [ ] キーボードショートカット (Tauri global-shortcut plugin)
- [ ] ドラッグ&ドロップでフォルダ追加
- [ ] アプリアイコン設定
- [ ] macOS code signing
- [ ] DMGインストーラー生成
- [ ] 複数フォルダ対応
- [ ] HEIC クロスプラットフォーム対応 (`libheif-rs` 検討)

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

# Tauriプロジェクト初期化 (同一リポ内)
npm install @tauri-apps/cli
npm run tauri init

# 開発
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
| `@tauri-apps/plugin-shell` | 外部コマンド実行 (sips, ffmpeg) |

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
    "fs:allow-exists",
    "shell:allow-open"
  ]
}
```

**CSP設定** (`tauri.conf.json`):
```json
{
  "security": {
    "csp": "default-src 'self'; img-src 'self' asset: https://asset.localhost; media-src 'self' asset: https://asset.localhost; frame-src https://maps.google.com"
  }
}
```

**FSスコープ**: `MEDIA_BASE_PATH` とキャッシュディレクトリをランタイムで許可する必要あり。

---

## 想定スケジュール感

| Phase | 内容 | Rust学習要素 |
|-------|------|-------------|
| Phase 1 | Tauriプロジェクト + フォルダ選択 | プロジェクト構造、Cargo、基本構文、コマンド |
| Phase 2-1 | Asset Protocol | 設定理解、セキュリティモデル |
| Phase 2-2 | ファイルスキャン | std::fs、serde、Result型、構造体 |
| Phase 3 | サムネイル生成 | image crate、非同期処理、外部crate |
| Phase 4 | EXIF読み取り | バイナリ処理、エラーハンドリング |
| Phase 5 | UX改善 + 配布 | ビルド、署名、CI/CD |
