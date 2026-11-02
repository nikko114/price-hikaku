# price-hikaku
同じ表品に対して値段と量をそれぞれのお店で記録することで、一番安上がりなお店で買うことができるかを記録しよう！
> そんなことせずに素直にイオンでまとめ買いしたほうが楽だしやすいよ、数円ごときで鳴くんじゃねえ。好きな時にカツ丼食べたり缶コーヒー毎日買ってこい。

## 使い方

- アプリ: https://nikko114.github.io/price-hikaku/ （GitHub Pages を有効にすると開けます）
- iPhone: Safari で開く → 共有ボタン →「ホーム画面に追加」
  - Safari とホーム画面のアプリではデータが別々なので、最初からホーム画面のアプリで使うのがおすすめ
- データはその端末の中だけに保存されます。ときどき「設定 → バックアップ」でファイルに書き出してください
- 記録するときに「📍 現在地からお店を探す」を押すと、近くのお店を出します（まだ登録していないお店は OpenStreetMap の地図データから探します。設定でオフにできます）

## 開発

ビルドなし・ライブラリなしの素の HTML / CSS / JavaScript です。

```bash
python3 -m http.server 8000   # → http://localhost:8000
npm test                      # 計算まわりの単体テスト（node --test）
node tests/e2e.mjs            # 画面の通しテスト（Playwright + Chromium が必要）
node tests/e2e-geo.mjs        # 位置情報まわりの画面テスト（現在地と地図データの応答は固定）
node tools/make-icons.mjs     # アイコンの作り直し
```

- ファイルを足したら `sw.js` の `ASSETS` にも足す（`npm test` で確認できます）
- 公開し直すときは `js/version.js` と `sw.js` の `VERSION` を上げる（上げないと iPhone 側が更新されません）
- 計画・設計: [docs/PLAN.md](docs/PLAN.md)
