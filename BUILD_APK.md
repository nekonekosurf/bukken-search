# Android APKビルド手順

## 前提
このPWAをAndroid APKとしてパッケージ化する方法です。

## 方法1: PWABuilder（推奨、最も簡単）
1. アプリをHTTPS環境にデプロイ（Cloudflare Pages等）
2. https://www.pwabuilder.com/ にアクセス
3. デプロイしたURLを入力
4. 「Package for stores」→「Android」を選択
5. APKをダウンロード→端末にインストール

## 方法2: ローカルで直接インストール
1. PCとAndroid端末を同じWi-Fiに接続
2. Android Chromeで http://[PCのIP]:8053 を開く
3. メニュー →「ホーム画面に追加」→「インストール」
4. ホーム画面にアプリアイコンが追加される
※これが最も手軽で、APKビルド不要

## 方法3: Bubblewrap CLI
```bash
npm install -g @nicolo-ribaudo/bubblewrap-cli
bubblewrap init --manifest=https://your-url/manifest.json
bubblewrap build
# output.apk が生成される
```
