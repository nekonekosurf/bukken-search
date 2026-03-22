# 物件サーチ プロジェクト

## チーム方針

- **ミスなく、ゆっくりと丁寧に、確実にやること**
- 時間は問わない。品質を最優先する
- 急いで雑にやるより、一つずつ確認しながら進める
- 変更前に必ず既存コードを読み、影響範囲を把握する
- 不明点があれば推測せず、確認する

## プロジェクト概要

- 東府中周辺の戸建て賃貸物件を検索・比較するPWAアプリ
- GitHub Pages でホスティング、Bubblewrap でAPK化
- Leaflet.js による地図表示、Tesseract.js によるOCR機能

## 技術スタック

- PWA (Progressive Web App) — ネイティブAndroidコードなし
- HTML/CSS/JavaScript (フレームワークなし)
- Leaflet.js + MarkerCluster + Heatmap
- Service Worker によるオフライン対応
- Bubblewrap CLI でAPKビルド
