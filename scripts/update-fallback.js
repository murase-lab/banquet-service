/**
 * フォールバックデータ更新スクリプト
 *
 * Google Sheets API から最新データを取得し、
 * banquet-data.js のフォールバックデータを上書きする。
 *
 * GitHub Actions から実行される想定。
 * APIレスポンスは /tmp/ に事前にダウンロード済み。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'js', 'banquet-data.js');

// ─── ユーティリティ ───

function readJson(filePath) {
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        console.warn('JSON読み込み失敗:', filePath, e.message);
    }
    return null;
}

/**
 * JavaScriptオブジェクト/配列を整形された文字列に変換
 * JSON.stringify を使い、シングルクォートではなくダブルクォートのまま出力
 */
function formatJsValue(data, indent) {
    return JSON.stringify(data, null, 2)
        .split('\n')
        .map(function(line, i) {
            return i === 0 ? line : ' '.repeat(indent) + line;
        })
        .join('\n');
}

/**
 * 変数の値を置換する（オブジェクトまたは配列に対応）
 * 「var VARNAME = {」または「var VARNAME = [」で始まるブロックを見つけて置換
 */
function updateVariableInFile(content, varName, newData) {
    // 開始パターンを検索
    var startPattern = 'var ' + varName + ' = ';
    var startIndex = content.indexOf(startPattern);
    if (startIndex === -1) {
        console.error(varName + ' が見つかりません');
        return content;
    }

    var valueStart = startIndex + startPattern.length;
    var openChar = content[valueStart];

    if (openChar !== '{' && openChar !== '[') {
        console.error(varName + ' の値が { または [ で始まりません');
        return content;
    }

    var closeChar = openChar === '{' ? '}' : ']';

    // 対応する閉じ括弧を見つける（ネスト考慮）
    var depth = 0;
    var endIndex = -1;
    for (var i = valueStart; i < content.length; i++) {
        if (content[i] === openChar) depth++;
        if (content[i] === closeChar) {
            depth--;
            if (depth === 0) {
                endIndex = i + 1;
                // セミコロンも含める
                if (content[i + 1] === ';') endIndex = i + 2;
                break;
            }
        }
    }

    if (endIndex === -1) {
        console.error(varName + ' の終端が見つかりません');
        return content;
    }

    var indent = 0;
    // インデント幅を検出（var の前のスペース数）
    var lineStart = content.lastIndexOf('\n', startIndex);
    if (lineStart !== -1) {
        indent = startIndex - lineStart - 1;
    }

    var formatted = formatJsValue(newData, indent);
    var newBlock = 'var ' + varName + ' = ' + formatted + ';';

    return content.substring(0, startIndex) + newBlock + content.substring(endIndex);
}

// ─── メイン処理 ───

console.log('=== バンケットサービス フォールバックデータ更新開始 ===\n');

var content = fs.readFileSync(DATA_FILE, 'utf8');
var updated = false;

// 料理データ
var cuisineData = readJson('/tmp/banquet-cuisine-response.json');
if (cuisineData && cuisineData.plans && cuisineData.plans.length > 0) {
    content = updateVariableInFile(content, 'CUISINE_DATA_FALLBACK', cuisineData);
    console.log('料理データ更新完了（' + cuisineData.plans.length + '件のプラン）');
    updated = true;
} else {
    console.log('料理APIデータなし、スキップ');
}

// シミュレーター設定データ
var configData = readJson('/tmp/banquet-config-response.json');
if (configData && configData.venue && configData.food_plans) {
    content = updateVariableInFile(content, 'CONFIG_FALLBACK', configData);
    console.log('シミュレーター設定データ更新完了');
    updated = true;
} else {
    console.log('シミュレーター設定APIデータなし、スキップ');
}

if (updated) {
    fs.writeFileSync(DATA_FILE, content, 'utf8');
    console.log('\nbanquet-data.js を更新しました');
} else {
    console.log('\n更新するデータがありませんでした');
}

console.log('\n=== 完了 ===');
