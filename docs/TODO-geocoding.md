# GPS逆ジオコーディング 実装メモ

## 実装済み

- MKReverseGeocodingRequest (macOS 26+, CLGeocoder非推奨のため移行)
- 英語ロケール固定 (海外地名の日本語化問題を回避)
- 常駐プロセス (stdin/stdout通信, CLGeocoderキャッシュ有効)
- 2秒間隔 + 60秒バックオフ (レート制限対策)
- 50m以内の近接座標スキップ (連続写真の重複リクエスト削減)
- geo_dict.rs: 都道府県47件 + 主要都市100+件の EN→JA 翻訳

## CLGeocoder レート制限の調査結果

- Appleは具体的な数値を非公開
- 経験則: 1分50回が閾値、超過でスロットリング開始
- ja/enの2回呼び出し = 2リクエスト扱い → en_USのみに変更で解決
- 毎回プロセス起動するとキャッシュが効かない → 常駐プロセスに変更で解決
- エラー時は CLError.network が返る、空結果の場合もある

参考:
- https://developer.apple.com/documentation/mapkit/mkreversegeocodingrequest
- https://developer.apple.com/forums/thread/20499
