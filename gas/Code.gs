/**
 * バンケットサービス データ配信 API
 *
 * このスクリプトをGoogle Apps Scriptにコピーして使います。
 * スプレッドシートの各シートのデータをJSON形式で配信します。
 *
 * 【セットアップ手順】
 * 1. Google Sheets で「バンケットサービス データ管理」スプレッドシートを作成
 * 2. 下記6つのシートを作成し、1行目にヘッダーを入力
 *    - 料理プラン: id, label, price, note, description, image, badgeText, badgeColor, sortOrder, active
 *    - フリードリンク: price, duration, description, image
 *    - 会場: id, label, area, base, extra, sortOrder
 *    - 備品: id, label, price, sortOrder
 *    - 飲物: id, label, price, sortOrder
 *    - 設定: key, value
 * 3. 拡張機能 → Apps Script を開く
 * 4. このコードを貼り付けて保存
 * 5. デプロイ → 新しいデプロイ → ウェブアプリ
 *    - 実行するユーザー: 自分
 *    - アクセスできるユーザー: 全員
 * 6. デプロイ後に表示されるURLをコピー
 * 7. そのURLを banquet-data.js の BANQUET_API_URL に設定
 *
 * 【エンドポイント】
 * - ?type=cuisine  → 料理プラン + フリードリンクデータ
 * - ?type=config   → シミュレーター用CONFIGデータ
 * - ?type=all      → 全データ（フォールバック更新用）
 */

function doGet(e) {
  try {
    var type = (e && e.parameter && e.parameter.type) || 'all';
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var result;

    switch (type) {
      case 'cuisine':
        result = getCuisineData(ss);
        break;
      case 'config':
        result = getSimulatorConfig(ss);
        break;
      case 'all':
      default:
        result = {
          cuisine: getCuisineData(ss),
          config: getSimulatorConfig(ss)
        };
        break;
    }

    return createJsonResponse(result);

  } catch (error) {
    return createJsonResponse({ error: error.message });
  }
}

// ===================================================
// 料理ページ用データ取得
// ===================================================
function getCuisineData(ss) {
  // 料理プラン
  var plans = sheetToObjects(ss, '料理プラン');
  plans = plans.filter(function(p) {
    return p.id && String(p.active).toUpperCase() !== 'FALSE';
  });
  plans.forEach(function(p) {
    p.price = Number(p.price) || 0;
    p.sortOrder = Number(p.sortOrder) || 0;
    if (p.image) p.image = convertDriveLink(p.image);
  });
  plans.sort(function(a, b) { return a.sortOrder - b.sortOrder; });

  // フリードリンク
  var fdRows = sheetToObjects(ss, 'フリードリンク');
  var freeDrink = fdRows.length > 0 ? fdRows[0] : {};
  freeDrink.price = Number(freeDrink.price) || 0;
  if (freeDrink.image) freeDrink.image = convertDriveLink(freeDrink.image);

  return {
    plans: plans,
    freeDrink: freeDrink
  };
}

// ===================================================
// シミュレーター用CONFIGデータ取得
// ===================================================
function getSimulatorConfig(ss) {
  // 会場 → オブジェクト形式 { id: { base, extra, label, area } }
  var venueRows = sheetToObjects(ss, '会場');
  venueRows.sort(function(a, b) { return (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0); });
  var venue = {};
  venueRows.forEach(function(v) {
    if (v.id) {
      venue[v.id] = {
        base: Number(v.base) || 0,
        extra: Number(v.extra) || 0,
        label: v.label || '',
        area: v.area || ''
      };
    }
  });

  // 料理プラン → 配列 [{ id, label, price, note }]
  var cuisinePlans = sheetToObjects(ss, '料理プラン');
  cuisinePlans = cuisinePlans.filter(function(p) {
    return p.id && String(p.active).toUpperCase() !== 'FALSE';
  });
  cuisinePlans.sort(function(a, b) { return (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0); });
  var food_plans = cuisinePlans.map(function(p) {
    return {
      id: p.id,
      label: p.label || '',
      price: Number(p.price) || 0,
      note: p.note || '',
      venueIncluded: String(p.venueIncluded).toUpperCase() === 'TRUE'
    };
  });

  // フリードリンク
  var fdRows = sheetToObjects(ss, 'フリードリンク');
  var fd = fdRows.length > 0 ? fdRows[0] : {};
  var free_drink = {
    price: Number(fd.price) || 0,
    duration: fd.duration || ''
  };

  // 備品 → 配列
  var eqRows = sheetToObjects(ss, '備品');
  eqRows.sort(function(a, b) { return (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0); });
  var equipment = eqRows.filter(function(e) { return e.id; }).map(function(e) {
    return {
      id: e.id,
      label: e.label || '',
      price: Number(e.price) || 0
    };
  });

  // 飲物 → 配列
  var drinkRows = sheetToObjects(ss, '飲物');
  drinkRows.sort(function(a, b) { return (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0); });
  var drinks = drinkRows.filter(function(d) { return d.id; }).map(function(d) {
    return {
      id: d.id,
      label: d.label || '',
      price: Number(d.price) || 0
    };
  });

  // 設定 → 施設情報
  var settings = getSettingsMap(ss);
  var facility = {
    name: settings['facility_name'] || '',
    company: settings['facility_company'] || '',
    address: settings['facility_address'] || '',
    tel: settings['facility_tel'] || '',
    fax: settings['facility_fax'] || ''
  };

  return {
    venue: venue,
    food_plans: food_plans,
    free_drink: free_drink,
    equipment: equipment,
    drinks: drinks,
    facility: facility
  };
}

// ===================================================
// ヘルパー関数
// ===================================================

/**
 * シートのデータをオブジェクト配列に変換
 * 1行目をヘッダー、2行目以降をデータとして扱う
 */
function sheetToObjects(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  var headers = data[0];
  var result = [];

  for (var i = 1; i < data.length; i++) {
    var row = {};
    var hasData = false;

    for (var j = 0; j < headers.length; j++) {
      var key = String(headers[j]).trim();
      if (!key) continue;

      var value = data[i][j];

      // 日付型の場合は文字列に変換
      if (value instanceof Date) {
        value = Utilities.formatDate(value, 'Asia/Tokyo', 'yyyy/MM/dd');
      }

      row[key] = String(value || '');
      if (row[key]) hasData = true;
    }

    if (hasData) result.push(row);
  }

  return result;
}

/**
 * 設定シートをkey-valueマップに変換
 */
function getSettingsMap(ss) {
  var rows = sheetToObjects(ss, '設定');
  var map = {};
  rows.forEach(function(row) {
    if (row.key) {
      map[row.key] = row.value || '';
    }
  });
  return map;
}

/**
 * Google Drive の共有リンクを直接画像URLに変換
 */
function convertDriveLink(url) {
  if (!url) return '';

  // drive.google.com/file/d/FILE_ID/view 形式
  var match = url.match(/drive\.google\.com\/file\/d\/([-\w]+)/);
  if (match) {
    return 'https://lh3.googleusercontent.com/d/' + match[1];
  }

  // drive.google.com/open?id=FILE_ID 形式
  match = url.match(/drive\.google\.com\/open\?id=([-\w]+)/);
  if (match) {
    return 'https://lh3.googleusercontent.com/d/' + match[1];
  }

  return url;
}

/**
 * CORS対応のJSONレスポンスを作成
 */
function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * テスト用: 全データを確認
 */
function testGetAllData() {
  var response = doGet({ parameter: { type: 'all' } });
  Logger.log(response.getContent());
}

/**
 * テスト用: 料理データを確認
 */
function testGetCuisineData() {
  var response = doGet({ parameter: { type: 'cuisine' } });
  Logger.log(response.getContent());
}

/**
 * テスト用: シミュレーター設定を確認
 */
function testGetConfigData() {
  var response = doGet({ parameter: { type: 'config' } });
  Logger.log(response.getContent());
}
