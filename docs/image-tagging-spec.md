# 画像タグ付け機能 仕様書

**作成日**: 2026-03-21
**ステータス**: 実装済み

## 概要

macOS Vision Framework で画像を自動解析し、タグ（"食べ物", "海", "犬" など）を付与。
GPS座標から地名（"京都府", "東京都" など）もタグに追加。
既存の検索ボックスでタグも検索対象にすることで、Google Photos のような内容ベース検索を実現。

## 要件

- **UIは変更なし**: 既存の検索ボックスをそのまま使用
- **オフライン完結**: macOS Vision Framework（無料、プライバシー安全）
- **タグは英語+日本語の両方**: "sky" と "空" の両方を保存し、どちらでも検索可能
- **OCRテキスト認識**: 画像内の文字を読み取りタグに追加 (看板、メニュー等)
- **GPS地名**: EXIF GPS座標をCLGeocoderで逆ジオコーディング、日英両方の地名をタグに追加
- **バックグラウンド処理**: 7000枚を段階的に解析（UIをブロックしない）
- **永続キャッシュ**: 一度解析した画像は再解析不要
- **clear_cacheではタグを消さない**: 再解析に時間がかかるため別管理
- **タグ再生成メニュー**: File > タグを再生成 でロジック変更後の再解析が可能

## アーキテクチャ

```
[vision-tagger]     ←呼出― [Rust tagger.rs] ←IPC― [Frontend gallery.js]
  Vision Framework            ↓                        ↓
  画像 → 英語ラベル      tags.json (永続)         検索時にタグマッチ

[reverse-geocoder]  ←呼出―    ↑
  CLGeocoder              GPS座標 → 地名
  座標 → 日本語地名
```

### 1. Swift ヘルパー

#### vision-tagger (`src-tauri/helpers/vision-tagger.swift`)

macOS Vision Framework で画像分類 + OCRテキスト認識。

- **入力**: 画像ファイルパス（引数、複数可）
- **出力**: JSON配列（stdout）。各要素は `{"labels":["food","outdoor"], "text":["MENU","HOTEL"]}`
- **分類**: `VNClassifyImageRequest` (confidence >= 0.4)
- **OCR**: `VNRecognizeTextRequest` (JA+EN対応、2文字以上、最大20件)
- **例**: `./vision-tagger menu.jpg` → `[{"labels":["structure"],"text":["MAMPEI HOTEL","MENU"]}]`

#### reverse-geocoder (`src-tauri/helpers/reverse-geocoder.swift`)

macOS CLGeocoder でGPS座標を日本語地名に変換。

- **入力**: `lat,lon` 形式の座標（引数、複数可）
- **出力**: JSON文字列配列（stdout）
- **ロケール**: 日本語+英語の両方を返す
- **例**: `./reverse-geocoder 35.01,135.77` → `[{"ja":"日本 京都府 京都市","en":"Japan Kyoto Nakagyo"}]`

両ヘルパーは `build.rs` で `swiftc` コンパイルされ、アプリバンドルの `Resources/helpers/` に配置。

### 2. Rust タグ管理 (`src-tauri/src/tagger.rs`)

**tags.json の構造:**
```json
{
  "version": 1,
  "tags": {
    "2024/旅行/photo1.jpg": ["food", "食べ物", "indoor", "屋内", "日本", "京都府", "京都市"],
    "2024/旅行/photo2.jpg": ["sky", "空", "outdoor", "屋外"]
  }
}
```

- キー: MediaItem の相対パス（scanner と同じ）
- 値: 英語+日本語タグ + GPS地名の配列
- 保存先: `AppData/cache/tags.json`

### 3. 英語→日本語翻訳 (`src-tauri/src/label_dict.rs`)

Vision Framework ラベルの日本語翻訳辞書（約500エントリ）。
英語ラベルと日本語翻訳の**両方**をタグに保存するため、英語でも日本語でも検索可能。

### 4. GPS地名取得

1. `kamadak-exif` でJPEG/TIFFのGPS座標を読み取り
2. HEIC で失敗した場合は `mdls` (macOS Spotlight) にフォールバック
3. 座標を `reverse-geocoder` で地名に変換（日本語）
4. 地名をスペースで分割して個別タグとして保存

### 5. IPC コマンド

| コマンド | Args | Returns | 目的 |
|---------|------|---------|------|
| `get_tags` | - | `HashMap<String, Vec<String>>` | 全タグデータ取得 |
| `tag_images` | `paths[]`, `base_path` | `usize` (処理数) | バッチタグ付け (Vision + GPS) |

### 6. フロントエンド検索統合

- `gallery.tagMap`: タグデータをメモリに保持
- `_matchesQuery()`: 既存の path/event/filename マッチに加えてタグマッチを追加
- `preConvertSearchFields()`: タグのかな変換（romaji/hiragana/katakana）を事前生成
- バックグラウンドタグ付け中は stats エリアに進捗表示
- 100件ごとに検索フィールドを更新し、処理中でも新しいタグで検索可能

### 7. 動画の扱い

動画はキャッシュ済みサムネイル（1秒目のフレーム）を Vision Framework に渡してタグ付け。
サムネイル未生成の場合はスキップ。

## ファイル一覧

| ファイル | 内容 |
|---------|------|
| `src-tauri/helpers/vision-tagger.swift` | Vision Framework ヘルパー |
| `src-tauri/helpers/reverse-geocoder.swift` | GPS逆ジオコーディングヘルパー |
| `src-tauri/src/tagger.rs` | タグ管理、バッチ処理、GPS統合 |
| `src-tauri/src/label_dict.rs` | 英語→日本語翻訳辞書 |
| `src-tauri/src/thumbnail.rs` | `get_gps()` 追加 (HEIC mdls fallback) |
| `src-tauri/src/lib.rs` | `get_tags`, `tag_images` IPC コマンド |
| `src-tauri/build.rs` | Swift ヘルパーのコンパイル |
| `src-tauri/tauri.conf.json` | バンドルリソース設定 |
| `public/js/gallery.js` | タグ検索マッチ、tagMap 管理 |
| `public/js/tauri-app.js` | タグ IPC メソッド |
| `public/index.html` | バックグラウンドタグ付け + 進捗表示 |

## CLI でのタグ管理

```bash
# タグキャッシュ削除（再解析が必要）
rm ~/Library/Application\ Support/com.mediaviewer.app/cache/tags.json

# タグ統計確認
python3 -c "import json; d=json.load(open('$HOME/Library/Application Support/com.mediaviewer.app/cache/tags.json')); print(f'Tagged: {len(d[\"tags\"])}')"
```
