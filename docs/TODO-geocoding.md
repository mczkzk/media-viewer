# GPS逆ジオコーディング改善

## 現状の問題

CLGeocoder (Apple) がレート制限でブロックされる。

- **推奨上限**: 1分に1リクエスト
- **用途**: リアルタイム用途向け、バッチ処理非対応
- **結果**: 7000枚のタグ付け中にGPS付き画像(数千件)を一気に処理しようとしてブロック
- **制限超過時**: `kCLErrorNetwork` エラー、しばらく(数時間~)空レスポンスが返る

参考:
- https://developer.apple.com/documentation/corelocation/clgeocoder
- https://developer.apple.com/forums/thread/20499
- https://www.darrengillman.com/index.php/2019/10/28/the-curious-case-of-the-apple-geocoder/

## 対策案

### A: オフライン逆ジオコーディング (推奨)

Rustの`rrgeo`crateなどオフラインDB使用。ネットワーク不要、レート制限なし。

- **メリット**: 高速、制限なし、オフライン動作
- **デメリット**: 精度はCLGeocoderより低い(市区町村レベル)、DBサイズ追加
- **調査**: `rrgeo` crateの実用性、日本語地名対応、バンドルサイズ

### B: CLGeocoder + レート制限対策

リクエスト間隔を1秒以上に設定し、バックグラウンドで低速処理。

- **メリット**: 精度が高い、住所レベルまで取れる
- **デメリット**: GPS付き2000枚なら30分以上かかる、ネットワーク必須

### C: ハイブリッド

オフラインDBで県/市レベルを即座に付与 + CLGeocoderで詳細地名をゆっくり追加。

## 次のアクション

- [ ] `rrgeo` crateの調査: 日本語地名対応、DBサイズ、精度
- [ ] 方針決定 (A/B/C)
- [ ] 実装
- [ ] reverse-geocoder.swift の廃止 or 改修
- [ ] tags.json 再生成して検証
