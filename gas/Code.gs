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
 *    - SEO: page, title, description, ogImage, noindex （updateSeoSheet() で自動作成可）
 * 3. 拡張機能 → Apps Script を開く
 *
 * 【管理画面】 /exec?page=admin （共有パスワード ADMIN_PASSWORD で制限）
 * 【追加エンドポイント】 ?type=seo → SEOシートのデータ
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
  var p = (e && e.parameter) || {};

  // ── 管理画面（HtmlService）分岐 ──
  // /exec?page=admin → フォーム型の管理UIを返す。それ以外は従来通りJSON。
  if (p.page === 'admin') {
    return renderAdminPage_();
  }

  try {
    var type = p.type || 'all';
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var result;

    switch (type) {
      case 'cuisine':
        result = getCuisineData(ss);
        break;
      case 'config':
        result = getSimulatorConfig(ss);
        break;
      case 'seo':
        result = getSeoData(ss);
        break;
      case 'all':
      default:
        result = {
          cuisine: getCuisineData(ss),
          config: getSimulatorConfig(ss),
          seo: getSeoData(ss)
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
      var entry = {
        base: Number(v.base) || 0,
        extra: Number(v.extra) || 0,
        label: v.label || '',
        area: v.area || ''
      };
      if (v.floor) entry.floor = v.floor;
      // layouts列: JSON文字列 例 {"スクール":28,"コの字":24}
      if (v.layouts) {
        try { entry.layouts = JSON.parse(v.layouts); } catch(e) {}
      }
      // foodPlans列: JSON配列 例 ["kaiseki","warigo"]
      if (v.foodPlans) {
        try { entry.foodPlans = JSON.parse(v.foodPlans); } catch(e) {}
      }
      venue[v.id] = entry;
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

/**
 * 会場シートを最新データに更新する
 * GASエディタから一度だけ手動実行してください
 * ※既存データを上書きします
 */
function updateVenueSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('会場');
  if (!sheet) {
    sheet = ss.insertSheet('会場');
  }

  // ヘッダー
  var headers = ['id', 'label', 'area', 'base', 'extra', 'floor', 'layouts', 'foodPlans', 'sortOrder'];

  // データ
  var venues = [
    ['suehiro_east', '末広（東）', '102㎡（31坪）', 33000, 16500, '2F', '{"スクール":28,"コの字":24,"ロの字":36,"立食":30}', '["kaiseki","sitting","bento_banquet","warigo"]', 1],
    ['suehiro_mid', '末広（中）', '108㎡（33坪）', 33000, 16500, '2F', '{"スクール":28,"コの字":24,"ロの字":36,"円卓":32,"着席ブッフェ":32,"立食":40}', '', 2],
    ['suehiro_west', '末広（西）', '113㎡（34坪）', 33000, 16500, '2F', '{"スクール":42,"コの字":28,"ロの字":48,"円卓":25,"着席ブッフェ":40,"立食":50}', '', 3],
    ['suehiro_mid_east', '末広（中＋東）', '210㎡', 66000, 33000, '2F', '{"円卓":48,"着席ブッフェ":64,"立食":60}', '', 4],
    ['suehiro_west_mid', '末広（西＋中）', '221㎡（66坪）', 66000, 33000, '2F', '{"スクール":54,"コの字":32,"円卓":48,"着席ブッフェ":76,"立食":60}', '', 5],
    ['suehiro_all', '末広（全室）', '323㎡（97坪）', 99000, 49500, '2F', '{"スクール":102,"コの字":56,"円卓":75,"着席ブッフェ":120,"立食":150}', '', 6],
    ['hakuun', '白雲の間', '78畳（126㎡）', 33000, 16500, '8F', '{"スクール":99,"ロの字":56,"円卓":60}', '["kaiseki","sitting","bento_banquet","warigo"]', 7],
    ['hatsune', '初音の間', '24畳（45㎡）', 33000, 16500, '8F', '{"ロの字":16,"円卓":12}', '["kaiseki","warigo"]', 8]
  ];

  // シートをクリアして書き込み
  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (venues.length > 0) {
    sheet.getRange(2, 1, venues.length, headers.length).setValues(venues);
  }

  // 書式調整
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f0f0f0');
  sheet.autoResizeColumns(1, headers.length);

  Logger.log('会場シートを更新しました: ' + venues.length + '件');
}


// ===================================================================
// ▼▼▼ 管理画面（編集UI）＋書き込み層  ここから追記 ▼▼▼
//   - doGet の JSON 契約は変更しない（?type=seo と ?page=admin を追加したのみ）
//   - 書き込みは google.script.run 経由（CORS/トークン不要）
// ===================================================================

/**
 * 管理画面の共有パスワード（実質のアクセスゲート）
 * スクリプトのプロパティ（プロジェクトの設定 → スクリプト プロパティ）に
 * キー ADMIN_PASSWORD で登録する。従業員には別途このパスワードを共有する。
 * ※コードに直書きしない（プロパティで管理し、変更・ローテーションを容易にする）
 */

/**
 * GitHub リポジトリ（「今すぐ反映」ボタン用）
 */
var GITHUB_REPO = 'murase-lab/banquet-service';

/**
 * シート・スキーマ定義（UI描画とサーバ検証の単一の源）
 * type: id | text | textarea | number | bool | select | image | json-object | json-array
 * key: 一意キー列名（null は行キーなし）
 * singleRow: true なら1行のみ（追加/削除不可・編集のみ）
 * reindex: true なら sortOrder を 1..N で振り直す
 * keyValue: true なら key/value 形式（設定シート）
 */
var SHEET_SCHEMA = {
  '料理プラン': {
    label: 'お料理プラン', key: 'id', singleRow: false, reindex: true,
    columns: [
      { name: 'id',           type: 'id' },
      { name: 'label',        type: 'text' },
      { name: 'price',        type: 'number' },
      { name: 'note',         type: 'text' },
      { name: 'description',  type: 'textarea' },
      { name: 'image',        type: 'image' },
      { name: 'badgeText',    type: 'text' },
      { name: 'badgeColor',   type: 'select', options: ['primary', 'accent-gold', 'gray-800'] },
      { name: 'sortOrder',    type: 'number' },
      { name: 'active',       type: 'bool' },
      { name: 'venueIncluded', type: 'bool' }
    ]
  },
  'フリードリンク': {
    label: 'フリードリンク', key: null, singleRow: true, reindex: false,
    columns: [
      { name: 'price',       type: 'number' },
      { name: 'duration',    type: 'text' },
      { name: 'description', type: 'textarea' },
      { name: 'image',       type: 'image' }
    ]
  },
  '会場': {
    label: '会場', key: 'id', singleRow: false, reindex: true,
    columns: [
      { name: 'id',        type: 'id' },
      { name: 'label',     type: 'text' },
      { name: 'area',      type: 'text' },
      { name: 'base',      type: 'number' },
      { name: 'extra',     type: 'number' },
      { name: 'floor',     type: 'text' },
      { name: 'layouts',   type: 'json-object' },
      { name: 'foodPlans', type: 'json-array' },
      { name: 'sortOrder', type: 'number' }
    ]
  },
  '備品': {
    label: '備品', key: 'id', singleRow: false, reindex: true,
    columns: [
      { name: 'id',        type: 'id' },
      { name: 'label',     type: 'text' },
      { name: 'price',     type: 'number' },
      { name: 'sortOrder', type: 'number' }
    ]
  },
  '飲物': {
    label: '飲物', key: 'id', singleRow: false, reindex: true,
    columns: [
      { name: 'id',        type: 'id' },
      { name: 'label',     type: 'text' },
      { name: 'price',     type: 'number' },
      { name: 'sortOrder', type: 'number' }
    ]
  },
  '設定': {
    label: '施設情報', key: 'key', singleRow: false, reindex: false, keyValue: true,
    columns: [
      { name: 'key',   type: 'text' },
      { name: 'value', type: 'text' }
    ]
  },
  'SEO': {
    label: 'SEO', key: 'page', singleRow: false, reindex: false,
    columns: [
      { name: 'page',        type: 'text' },
      { name: 'title',       type: 'text' },
      { name: 'description', type: 'textarea' },
      { name: 'ogImage',     type: 'image' },
      { name: 'noindex',     type: 'bool' }
    ]
  }
};

// ── 認証（共有パスワード方式） ────────────────────
function assertAdmin_(pw) {
  var expected = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!expected) {
    throw new Error('ADMIN_PASSWORD が未設定です（スクリプトのプロパティに登録してください）');
  }
  if (String(pw == null ? '' : pw) !== String(expected)) {
    throw new Error('パスワードが違います');
  }
  return true;
}

// ── 管理画面レンダラ ──────────────────────────────
// シェルHTMLは誰でも取得可（機密なし）。データ取得・書き込みは
// すべて assertAdmin_(pw) で守られるため、パスワードなしでは何もできない。
function renderAdminPage_() {
  var t = HtmlService.createTemplateFromFile('Admin');
  return t.evaluate()
    .setTitle('バンケットサービス 管理')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** HTMLパーシャルの取り込み（<?!= include('AdminJs') ?>） */
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

// ── SEO 読み取り（doGet ?type=seo 用） ────────────
function getSeoData(ss) {
  var rows = sheetToObjects(ss, 'SEO');
  var pages = rows.filter(function(r) { return r.page; }).map(function(r) {
    return {
      page: r.page,
      title: r.title || '',
      description: r.description || '',
      ogImage: r.ogImage ? convertDriveLink(r.ogImage) : '',
      noindex: String(r.noindex).toUpperCase() === 'TRUE'
    };
  });
  return { pages: pages };
}

// ── 書き込み内部ヘルパー ──────────────────────────
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000); // 20秒。取れなければ例外
  try { return fn(); } finally { lock.releaseLock(); }
}

function getSheetOrThrow_(ss, name) {
  var s = ss.getSheetByName(name);
  if (!s) throw new Error('シートがありません: ' + name);
  return s;
}

/** key列で対象行を特定（1始まり・ヘッダー含む）。無ければ -1 */
function findRowIndex_(sheet, keyCol, keyValue) {
  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(function(h) { return String(h).trim(); });
  var col = headers.indexOf(keyCol);
  if (col === -1) throw new Error('キー列がありません: ' + keyCol);
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][col]).trim() === String(keyValue).trim()) return i + 1;
  }
  return -1;
}

function assertJson_(v, kind) {
  if (v === '' || v == null) return;
  var parsed;
  try { parsed = JSON.parse(v); } catch (e) { throw new Error('JSONの形式が不正です: ' + v); }
  if (kind === 'array' && !Array.isArray(parsed)) throw new Error('JSON配列で入力してください: ' + v);
  if (kind === 'object' && (Array.isArray(parsed) || typeof parsed !== 'object')) {
    throw new Error('JSONオブジェクトで入力してください: ' + v);
  }
}

/** 画像は生のまま保存（convertDriveLink は読み取り時に走るので二重変換しない） */
function normalizeImageInput_(v) {
  return v == null ? '' : String(v).trim();
}

/** schema に沿って rowObj を検証し、シート列順に並べた配列を返す */
function normalizeRow_(sheetName, sheet, rowObj) {
  var schema = SHEET_SCHEMA[sheetName];
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function(h) { return String(h).trim(); });
  return headers.map(function(h) {
    var col = null;
    for (var k = 0; k < schema.columns.length; k++) {
      if (schema.columns[k].name === h) { col = schema.columns[k]; break; }
    }
    var v = rowObj[h];
    if (!col) return v == null ? '' : v;
    switch (col.type) {
      case 'number':
        if (v === '' || v == null) return '';
        var n = Number(String(v).replace(/[,¥\s]/g, ''));
        if (isNaN(n)) throw new Error(h + ' は数値で入力してください: ' + v);
        return n;
      case 'bool':
        return (v === true || String(v).toUpperCase() === 'TRUE') ? 'TRUE' : 'FALSE';
      case 'image':
        return normalizeImageInput_(v);
      case 'json-object':
        assertJson_(v, 'object'); return v || '';
      case 'json-array':
        assertJson_(v, 'array'); return v || '';
      case 'id':
        if (!/^[A-Za-z0-9_]+$/.test(v)) throw new Error('id は英数字とアンダースコアのみ: ' + v);
        return v;
      default:
        return v == null ? '' : String(v);
    }
  });
}

// ── 書き込みAPI（google.script.run から呼ぶ） ──────
function adminGetSchema(pw) {
  assertAdmin_(pw);
  return SHEET_SCHEMA;
}

/** 生の文字列で全行を返す（doGet と違い非activeも含む・型変換なし） */
function adminListSheet(pw, sheetName) {
  assertAdmin_(pw);
  if (!SHEET_SCHEMA[sheetName]) throw new Error('不明なシート: ' + sheetName);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getSheetOrThrow_(ss, sheetName);
  var rows = sheetToObjects(ss, sheetName);
  return { sheet: sheetName, schema: SHEET_SCHEMA[sheetName], rows: rows };
}

function adminAddRow(pw, sheetName, rowObj) {
  assertAdmin_(pw);
  return withLock_(function() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = getSheetOrThrow_(ss, sheetName);
    var sc = SHEET_SCHEMA[sheetName];
    if (sc.singleRow) throw new Error('この表は行追加できません（編集のみ）');
    if (sc.key) {
      if (!rowObj[sc.key]) throw new Error(sc.key + ' は必須です');
      if (findRowIndex_(sheet, sc.key, rowObj[sc.key]) !== -1) {
        throw new Error('キーが重複しています: ' + rowObj[sc.key]);
      }
    }
    if (sc.reindex && (rowObj.sortOrder === '' || rowObj.sortOrder == null)) {
      rowObj.sortOrder = Math.max(1, sheet.getLastRow()); // 末尾に追加
    }
    var arr = normalizeRow_(sheetName, sheet, rowObj);
    sheet.appendRow(arr);
    return { ok: true, row: rowObj };
  });
}

function adminUpdateRow(pw, sheetName, keyValue, rowObj) {
  assertAdmin_(pw);
  return withLock_(function() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = getSheetOrThrow_(ss, sheetName);
    var sc = SHEET_SCHEMA[sheetName];
    if (!sc.key) throw new Error('この表はキー更新できません');
    var rowIdx = findRowIndex_(sheet, sc.key, keyValue);
    if (rowIdx === -1) throw new Error('対象が見つかりません: ' + keyValue);
    // キー変更時は重複チェック
    if (rowObj[sc.key] && String(rowObj[sc.key]) !== String(keyValue)) {
      if (findRowIndex_(sheet, sc.key, rowObj[sc.key]) !== -1) {
        throw new Error('キーが重複しています: ' + rowObj[sc.key]);
      }
    }
    var arr = normalizeRow_(sheetName, sheet, rowObj);
    sheet.getRange(rowIdx, 1, 1, arr.length).setValues([arr]);
    return { ok: true, row: rowObj };
  });
}

function adminDeleteRow(pw, sheetName, keyValue) {
  assertAdmin_(pw);
  return withLock_(function() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = getSheetOrThrow_(ss, sheetName);
    var sc = SHEET_SCHEMA[sheetName];
    if (sc.singleRow) throw new Error('この表は削除できません');
    if (sc.keyValue) throw new Error('設定は削除できません（値の編集のみ）');
    var rowIdx = findRowIndex_(sheet, sc.key, keyValue);
    if (rowIdx === -1) throw new Error('対象が見つかりません: ' + keyValue);
    sheet.deleteRow(rowIdx);
    return { ok: true };
  });
}

/** sortOrder を orderedKeys の順で 1..N に振り直す */
function adminReorder(pw, sheetName, orderedKeys) {
  assertAdmin_(pw);
  return withLock_(function() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = getSheetOrThrow_(ss, sheetName);
    var sc = SHEET_SCHEMA[sheetName];
    if (!sc.reindex) throw new Error('この表は並び替えできません');
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      .map(function(h) { return String(h).trim(); });
    var soCol = headers.indexOf('sortOrder');
    if (soCol === -1) throw new Error('sortOrder列がありません');
    for (var i = 0; i < orderedKeys.length; i++) {
      var rowIdx = findRowIndex_(sheet, sc.key, orderedKeys[i]);
      if (rowIdx !== -1) sheet.getRange(rowIdx, soCol + 1).setValue(i + 1);
    }
    return { ok: true };
  });
}

/** フリードリンク（1行のみ）編集専用 */
function adminUpdateSingleRow(pw, sheetName, rowObj) {
  assertAdmin_(pw);
  return withLock_(function() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = getSheetOrThrow_(ss, sheetName);
    var sc = SHEET_SCHEMA[sheetName];
    if (!sc.singleRow) throw new Error('この表は単一行編集ではありません');
    var arr = normalizeRow_(sheetName, sheet, rowObj);
    if (sheet.getLastRow() < 2) {
      sheet.getRange(2, 1, 1, arr.length).setValues([arr]);
    } else {
      sheet.getRange(2, 1, 1, arr.length).setValues([arr]);
    }
    return { ok: true, row: rowObj };
  });
}

/** SEO行の保存（無ければ追加、あれば更新） */
function adminSaveSeoRow(pw, page, seoObj) {
  assertAdmin_(pw);
  seoObj.page = page;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getSheetOrThrow_(ss, 'SEO');
  var exists = findRowIndex_(sheet, 'page', page) !== -1;
  return exists ? adminUpdateRow(pw, 'SEO', page, seoObj) : adminAddRow(pw, 'SEO', seoObj);
}

/** 「今すぐ反映」→ GitHub Actions を repository_dispatch で起動 */
function adminTriggerResync(pw) {
  assertAdmin_(pw);
  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_PAT');
  if (!token) throw new Error('GITHUB_PAT が未設定です（スクリプトのプロパティに登録してください）');
  var url = 'https://api.github.com/repos/' + GITHUB_REPO + '/dispatches';
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
    payload: JSON.stringify({ event_type: 'resync' }),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code !== 204) throw new Error('GitHub 起動に失敗しました（HTTP ' + code + '）: ' + res.getContentText());
  return { ok: true };
}

/**
 * SEOシートを初期値で作成/更新する
 * GASエディタから一度だけ手動実行してください（既存を上書き）
 */
function updateSeoSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('SEO');
  if (!sheet) sheet = ss.insertSheet('SEO');

  var headers = ['page', 'title', 'description', 'ogImage', 'noindex'];
  var rows = [
    ['index',     '【公式】バンケットサービス | 岐阜キャッスルイン 宴会・会議・法要',
      '岐阜市・名鉄岐阜駅から徒歩1分。宴会・会議・法要・二次会に対応する岐阜キャッスルインのバンケットサービス。会席・ビュッフェ料理、最大150名の会場をご用意。', '', 'FALSE'],
    ['cuisine',   'お料理プラン | 岐阜キャッスルイン バンケットサービス',
      '会席・シッティング・ビュッフェ・折詰など、ご予算とシーンに合わせて選べるお料理プラン。フリードリンクもご用意しています。', '', 'FALSE'],
    ['venue',     '会場案内・レイアウト | 岐阜キャッスルイン バンケットサービス',
      '末広の間・白雲の間・初音の間など、10名の会議から150名の宴会まで対応する多彩な会場とレイアウトをご案内します。', '', 'FALSE'],
    ['pricing',   '各種料金表 | 岐阜キャッスルイン バンケットサービス',
      '会場費・お料理・お飲物・備品レンタルの料金表。宴会・会議・法要のご予算検討にお役立てください。', '', 'FALSE'],
    ['simulator', '料金シミュレーター | 岐阜キャッスルイン バンケットサービス',
      '人数・会場・料理・備品を選ぶだけで、宴会・会議の概算費用がその場でわかる料金シミュレーター。', '', 'FALSE'],
    ['party',     '二次会ご案内 | 岐阜キャッスルイン バンケットサービス',
      '結婚式二次会・各種パーティーに。岐阜駅前で好アクセス、幹事様の負担を減らすプランをご用意しています。', '', 'FALSE'],
    ['access',    'アクセス・会社概要 | 岐阜キャッスルイン バンケットサービス',
      '名鉄岐阜駅から徒歩1分。有限会社バンケットサービスの所在地・連絡先・会社概要のご案内。', '', 'FALSE']
  ];

  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f0f0f0');
  sheet.autoResizeColumns(1, headers.length);
  Logger.log('SEOシートを更新しました: ' + rows.length + '件');
}

/**
 * テスト用: SEOデータを確認
 */
function testGetSeoData() {
  var response = doGet({ parameter: { type: 'seo' } });
  Logger.log(response.getContent());
}

// ===================================================================
// ▲▲▲ 管理画面（編集UI）＋書き込み層  ここまで追記 ▲▲▲
// ===================================================================
