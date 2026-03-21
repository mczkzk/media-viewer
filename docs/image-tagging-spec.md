# 画像タグ付け機能 仕様書

**作成日**: 2026-03-21
**ステータス**: 設計中

## 概要

macOS Vision Framework を使って画像を自動解析し、タグ（"食べ物", "海", "犬" など）を付与。
既存の検索ボックスでタグも検索対象にすることで、Google Photos のような内容ベース検索を実現する。

## 要件

- **UIは変更なし**: 既存の検索ボックスをそのまま使用
- **オフライン完結**: macOS Vision Framework（無料、プライバシー安全）
- **タグは日本語**: Vision の英語ラベルを日本語に翻訳して保存
- **バックグラウンド処理**: 7000枚を段階的に解析（UIをブロックしない）
- **永続キャッシュ**: 一度解析した画像は再解析不要

## アーキテクチャ

```
[Swiftヘルパー] ←呼出― [Rust tagger.rs] ←IPC― [Frontend gallery.js]
      ↓                      ↓                        ↓
Vision Framework       tags.json (永続)         検索時にタグマッチ
      ↓
画像 → 英語ラベル → 日本語タグ
```

### 1. Swift ヘルパー (`src-tauri/helpers/vision-tagger.swift`)

macOS Vision Framework を呼び出す単体 Swift スクリプト。
`sips` と同じパターンで Rust から `std::process::Command` で実行。

**入力**: 画像ファイルパス（引数）
**出力**: JSON（stdout）

```
$ swift vision-tagger.swift /path/to/photo.jpg
["food","outdoor","plant"]
```

使用する Vision API:
- `VNClassifyImageRequest` - シーン・物体分類（"food", "beach", "dog" 等）
- confidence 閾値: 0.4 以上のラベルを採用

コンパイル: ビルド時に `swiftc` で事前コンパイルしてバイナリ化。
配置: アプリバンドル内 `Resources/vision-tagger`

### 2. Rust タグ管理 (`src-tauri/src/tagger.rs`)

**tags.json の構造:**
```json
{
  "version": 1,
  "tags": {
    "2024/旅行/photo1.jpg": ["食べ物", "屋内", "テーブル"],
    "2024/旅行/photo2.jpg": ["海", "屋外", "空"]
  }
}
```

- キー: MediaItem の相対パス（scanner と同じ）
- 値: 日本語タグの配列
- 保存先: `AppData/cache/tags.json`

**IPC コマンド:**

| コマンド | Args | Returns | 目的 |
|---------|------|---------|------|
| `get_tags` | - | `HashMap<String, Vec<String>>` | 全タグデータ取得 |
| `tag_images` | `paths[]`, `base_path` | `usize` (処理数) | バッチタグ付け |

**バックグラウンド処理フロー:**
1. `scan_media` 完了後、フロントエンドがタグデータを取得
2. 未タグ付けの画像パスを特定
3. バッチ（20枚ずつ）で `tag_images` を呼び出し
4. 各バッチ完了ごとにタグデータを更新・検索に反映

### 3. 英語→日本語翻訳テーブル

Vision Framework のラベルは約200種類。頻出するものを日本語マッピング:

```rust
static LABEL_MAP: &[(&str, &str)] = &[
    ("food", "食べ物"),
    ("beach", "海"),
    ("dog", "犬"),
    ("cat", "猫"),
    ("person", "人物"),
    ("building", "建物"),
    ("sunset", "夕焼け"),
    ("sky", "空"),
    ("plant", "植物"),
    ("flower", "花"),
    ("car", "車"),
    ("indoor", "屋内"),
    ("outdoor", "屋外"),
    ("night", "夜"),
    ("snow", "雪"),
    ("mountain", "山"),
    ("water", "水"),
    ("tree", "木"),
    // ... 主要ラベルを網羅（未翻訳は英語のまま保存）
];
```

### 4. フロントエンド検索統合 (`gallery.js`)

**変更点:**
- `load()` 後にタグデータを取得し `this.tagMap` に保持
- `_matchesQuery()` にタグマッチを追加:
  ```
  既存: event → filename → path → (kana変換)
  追加: tags → (kana変換 of tags)
  ```
- `preConvertSearchFields()` でタグのかな変換も事前生成

**タグ付き MediaItem の拡張（メモリ上のみ）:**
```js
item._tags = ["食べ物", "屋内", "テーブル"]
item._tagsRomaji = "tabemono okunai teeburu"
item._tagsHiragana = "たべもの おくない てーぶる"
```

### 5. 処理性能の見積もり

| 項目 | 見積もり |
|------|---------|
| Vision Framework 1枚あたり | 50-200ms |
| 7000枚の全解析 | 6-23分 |
| バッチサイズ | 20枚 |
| 1バッチの処理時間 | 1-4秒 |
| tags.json のサイズ (7000枚) | ~500KB |

初回は時間がかかるが、2回目以降は差分のみ処理。

### 6. 動画の扱い

動画は既にサムネイル（1秒目のフレーム）が生成されている。
**サムネイル画像を Vision Framework に渡す**ことで動画もタグ付け可能。

## 実装順序

1. Swift ヘルパーの作成・テスト
2. Rust tagger.rs（タグ管理、キャッシュ、翻訳テーブル）
3. IPC コマンド登録
4. フロントエンド検索統合
5. バックグラウンドバッチ処理
6. ビルド統合（Swift バイナリのバンドル）

## ファイル変更一覧

| ファイル | 変更 |
|---------|------|
| `src-tauri/helpers/vision-tagger.swift` | **新規** Swift ヘルパー |
| `src-tauri/src/tagger.rs` | **新規** タグ管理モジュール |
| `src-tauri/src/lib.rs` | IPC コマンド追加 |
| `src-tauri/build.rs` | Swift コンパイル追加 |
| `public/js/gallery.js` | 検索にタグマッチ追加 |
| `public/js/tauri-app.js` | タグ取得 IPC 追加 |
| `public/index.html` | バックグラウンドタグ付けロジック |

## 決定事項

- **タグ付け進捗UI**: stats エリアに「タグ付け中... 1234/7000」を表示
- **clear_cache ではタグを消さない**: 再解析に時間がかかるため別管理
  - フォルダ変更: パスが異なるので問題なし
  - 画像削除: 孤児タグが残るだけ（無害）
  - 画像追加: 未タグとして検出→バックグラウンド処理
  - フォルダ構成変更: 旧パスのタグは孤児、新パスで再解析
- **CLI でタグ削除可能**: `rm ~/Library/Application\ Support/com.mediaviewer.app/cache/tags.json`

## 未決事項

- [ ] Vision Framework の `VNClassifyImageRequest` が返すラベル一覧の正確な確認
- [ ] HEIC ファイルの扱い（変換後の JPEG を渡すか、直接渡せるか）
