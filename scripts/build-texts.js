/**
 * 文面 静的焼き込みスクリプト
 *
 * GAS API の ?type=texts を元に、各HTMLの <!--T:key-->…<!--/T--> の中身を
 * 「文面」シートの値で置き換える。
 *
 * GitHub Actions から実行される想定（APIレスポンスは /tmp/ に事前DL済み）。
 * ローカル検証時は scripts/texts-sample/texts.json を使ってもよい。
 *
 * 設計方針（build-seo.js と同じ思想）:
 *  - データ起因の異常は「既存の文面を保持して警告」に倒す（誤って空にしない）
 *  - HTML側のマーカー構造エラーは、書き込む前に全ファイル検証して exit 1（公開HTMLを壊さない）
 *  - マーカー自体は残すので、何度実行しても結果が変わらない（冪等）
 *
 * 依存なし（Node標準のみ）。
 */

const fs = require('fs');
const path = require('path');
const M = require('./text-markers');

const ROOT = path.resolve(__dirname, '..');
const IS_CI = !!process.env.GITHUB_ACTIONS;
const API_JSON = '/tmp/banquet-texts-response.json';
const SAMPLE_JSON = path.join(__dirname, 'texts-sample', 'texts.json');

// ─── 入力読み込み ───
function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}

// CI ではサンプルにフォールバックしない。
// API がエラーページを 200 で返した場合などに、古いスナップショットの文面を
// 「正しいデータ」として公開サイトへ焼き込んでしまうのを防ぐ（黙って古い文面に戻る事故）。
let textsJson = readJson(API_JSON);
if (!textsJson && !IS_CI) textsJson = readJson(SAMPLE_JSON);

if (!textsJson) {
  const msg = '文面データを読み込めませんでした（' + API_JSON + ' が無い/JSONとして壊れている）。';
  if (IS_CI) {
    console.error(msg + ' APIの応答を確認してください。');
    process.exit(1); // 古いデータを焼き込むより、止めて気づける方を選ぶ
  }
  console.error(msg + ' 焼き込みをスキップします（既存の文面を保持）。');
  process.exit(0);
}

if (textsJson.error) {
  console.error('APIがエラーを返しました: ' + textsJson.error);
  process.exit(IS_CI ? 1 : 0);
}

if (!textsJson.texts || !Object.keys(textsJson.texts).length) {
  // 文面シート未シード等でデータが正当に空のときは、焼き込み済みHTMLを空文面で
  // 上書きしないようスキップする（既存の文面を保持）。
  console.error('文面データが空です。焼き込みをスキップします（既存の文面を保持）。');
  process.exit(0); // Actionを失敗させない
}

const texts = textsJson.texts;

console.log('=== 文面 焼き込み開始 ===');

// ─── パス1: 全ファイルのマーカー構造を検証（書き込み前） ───
const files = [];
const structureErrors = [];

M.PAGES.forEach(function (page) {
  const file = path.join(ROOT, page + '.html');
  if (!fs.existsSync(file)) { console.warn('スキップ（無し）: ' + page + '.html'); return; }
  const html = fs.readFileSync(file, 'utf8');
  const scan = M.scanMarkers(html, page + '.html');
  scan.errors.forEach(function (e) { structureErrors.push(e); });
  files.push({ page: page, file: file, html: html, markers: scan.markers });
});

if (structureErrors.length) {
  console.error('\nマーカーの構造エラーが見つかりました。1件も書き込まずに中止します:');
  structureErrors.forEach(function (e) { console.error('  - ' + e); });
  process.exit(1);
}

// ─── パス2: 置換して書き込み ───
const usedKeys = new Set();
let replaced = 0, kept = 0, changedFiles = 0;
const warnings = [];

let telRewritten = 0;
let telSkipped = false;

files.forEach(function (f) {
  f.markers.forEach(function (m) { usedKeys.add(m.key); });

  let html = M.replaceMarkers(f.html, f.markers, function (key) {
    if (!Object.prototype.hasOwnProperty.call(texts, key)) {
      warnings.push(f.page + '.html: シートにキーがありません: "' + key + '"（既存の文面を保持）');
      kept++;
      return null;
    }
    const v = M.normalizeValue(texts[key]);
    if (!v) {
      warnings.push(f.page + '.html: 値が空です: "' + key + '"（既存の文面を保持）');
      kept++;
      return null;
    }
    replaced++;
    return M.textToHtml(v);
  });

  // 電話番号は表示だけでなくリンク先（href="tel:"）も追従させる
  if (texts['facility.tel']) {
    const tel = M.replaceTelHrefs(html, texts['facility.tel']);
    if (tel.skipped) telSkipped = true;
    else { html = tel.html; telRewritten += tel.count; }
  }

  if (html !== f.html) {
    fs.writeFileSync(f.file, html, 'utf8');
    changedFiles++;
    console.log('更新: ' + f.page + '.html');
  } else {
    console.log('変更なし: ' + f.page + '.html');
  }
});

if (telSkipped) {
  warnings.push('facility.tel が電話番号として認識できないため tel: リンクは更新していません: "' +
    texts['facility.tel'] + '"（表示のみ更新。施設情報タブの電話番号を確認してください）');
}

// ─── 突合レポート（シートにあるがHTMLに無いキー＝typo検出） ───
Object.keys(texts).forEach(function (key) {
  if (!usedKeys.has(key)) {
    warnings.push('HTMLに該当マーカーがありません: "' + key + '"（シート側のキー誤りの可能性）');
  }
});

const summary = '置換 ' + replaced + '件 / 保持 ' + kept + '件 / 警告 ' + warnings.length +
  '件 / tel:リンク ' + telRewritten + '件（' + changedFiles + 'ファイル更新）';

if (warnings.length) {
  console.warn('\n警告:');
  warnings.forEach(function (w) { console.warn('  - ' + w); });
  // GitHub Actions のUIに黄色い注記として出す（ビルドは緑のまま／ログを掘らなくても気づける）。
  // 「直したのにサイトが変わらない」の原因はほぼこの警告に出ている。
  if (IS_CI) warnings.forEach(function (w) { console.log('::warning::文面: ' + w); });
}

if (IS_CI && process.env.GITHUB_STEP_SUMMARY) {
  const md = ['### 文面の焼き込み', '', summary, '']
    .concat(warnings.length ? ['<details><summary>警告 ' + warnings.length + '件</summary>', '']
      .concat(warnings.map(function (w) { return '- ' + w; }))
      .concat(['', '</details>']) : ['警告なし']);
  try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\n') + '\n'); } catch (e) {}
}

console.log('\n=== 完了: ' + summary + ' ===');
