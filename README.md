# バンケットサービス - 動的コンテンツ管理システム

岐阜キャッスルイン バンケットサービスの料理ページと料金シミュレーターを、Google Sheetsから編集可能にするシステムです。

## システム構成

```
Google Sheets（データ編集）
    ↓
Google Apps Script（JSON API）
    ↓ fetch
GitHub Pages（cuisine.html / simulator.html）
    ↓ iframe
WIX サイト（メインHP）
```

## セットアップ手順

### 1. Google Spreadsheet を作成

「バンケットサービス データ管理」という名前でスプレッドシートを作成し、以下の6シートを作ります。

#### シート「料理プラン」

| id | label | price | note | description | image | badgeText | badgeColor | sortOrder | active | venueIncluded |
|----|-------|-------|------|-------------|-------|-----------|------------|-----------|--------|---------------|
| kaiseki | 会席料理 | 5200 | コース料理・個別提供 | お一人おひとりに... | (画像URL) | 個別提供 | primary | 1 | TRUE | TRUE |

- `id`: 英数字のID（重複不可）
- `price`: 税込金額（数値のみ、カンマなし）
- `badgeColor`: `primary`（紺）/ `accent-gold`（金）/ `gray-800`（グレー）
- `active`: `FALSE` にすると非表示
- `venueIncluded`: `TRUE` の場合、このプラン選択時は会場費が無料になる

#### シート「フリードリンク」（1行のみ）

| price | duration | description | image |
|-------|----------|-------------|-------|
| 2800 | 110分 | ビール・ノンアルコール... | (画像URL) |

#### シート「会場」

| id | label | area | base | extra | sortOrder |
|----|-------|------|------|-------|-----------|
| suehiro_east | 末広（東） | 102㎡（30坪） | 33000 | 16500 | 1 |

#### シート「備品」

| id | label | price | sortOrder |
|----|-------|-------|-----------|
| mic_w | ワイヤレスマイク | 2200 | 1 |

#### シート「飲物」

| id | label | price | sortOrder |
|----|-------|-------|-----------|
| beer | ビール(中瓶) | 900 | 1 |

#### シート「設定」

| key | value |
|-----|-------|
| facility_name | 岐阜キャッスルイン バンケットサービス |
| facility_company | 有限会社バンケットサービス |
| facility_address | 〒500-8176 岐阜県岐阜市県町2-8 |
| facility_tel | 058-212-3277 |
| facility_fax | 058-269-4377 |

### 2. GAS API をデプロイ

1. スプレッドシートの「拡張機能」→「Apps Script」を開く
2. `gas/Code.gs` の内容をコピー＆ペースト
3. 「デプロイ」→「新しいデプロイ」→「ウェブアプリ」
   - 実行するユーザー: **自分**
   - アクセスできるユーザー: **全員**
4. デプロイ後のURLをコピー

### 3. API URL を設定

`js/banquet-data.js` の先頭にある `BANQUET_API_URL` にデプロイURLを設定:

```javascript
var BANQUET_API_URL = 'https://script.google.com/macros/s/あなたのデプロイID/exec';
```

### 4. GitHub Pages を有効化

1. GitHubにリポジトリを作成（Public）
2. ファイルをpush
3. Settings → Pages → Source: `Deploy from a branch` → Branch: `main` / `/ (root)`
4. 数分後にURLが有効に

### 5. GitHub Secrets を設定

リポジトリの Settings → Secrets and variables → Actions:

| Secret名 | 値 |
|----------|-----|
| `BANQUET_API_URL` | GASデプロイURL（`?type=` パラメータなし） |

### 6. WIX に iframe を埋め込み

- 料理ページ: `https://あなたのユーザー名.github.io/banquet-service/cuisine.html`
- シミュレーター: `https://あなたのユーザー名.github.io/banquet-service/simulator.html`

WIXエディタ → 「要素を追加」→「埋め込みコード」→「HTMLを埋め込む」→ 「ウェブアドレス」に上記URLを入力。

## 運用ガイド

### 料理の料金を変更する

1. Google Sheetsの「料理プラン」シートを開く
2. 該当行の `price` 列の数値を変更
3. ページをリロードすると即座に反映

### 料理プランを追加する

1. 「料理プラン」シートの最終行に新しい行を追加
2. 各列を入力（idは他と重複しない英数字）
3. `sortOrder` で表示順を指定
4. `active` を `TRUE` に設定

### 料理プランを非表示にする

1. 「料理プラン」シートの該当行の `active` 列を `FALSE` に変更

### 備品を追加・変更する

1. 「備品」シートを編集

### シミュレーターの飲物を追加する

1. 「飲物」シートに新しい行を追加

## GAS コード更新時の注意

コードを修正した場合は、必ず「デプロイ」→「**新しいデプロイ**」で新バージョンを作成してください。
「デプロイを管理」から既存デプロイを編集しても反映されません。

新しいデプロイURLが発行されるので、`js/banquet-data.js` と GitHub Secrets の `BANQUET_API_URL` を更新してください。

## トラブルシューティング

### ページに変更が反映されない
- ブラウザのキャッシュをクリア（Ctrl + Shift + R）
- GASのデプロイURLが正しいか確認
- スプレッドシートの `price` 列に数値以外（カンマ、円マーク等）が入っていないか確認

### シミュレーターの計算が合わない
- スプレッドシートの `price` / `base` / `extra` 列が税込金額の数値であることを確認

### APIがエラーを返す
- GASのデプロイが「全員」に公開されているか確認
- スプレッドシートのシート名が正確か確認（「料理プラン」「フリードリンク」「会場」「備品」「飲物」「設定」）
