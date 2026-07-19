/**
 * 文面の初期吸い出しスクリプト（シード生成・一度きり実行）
 *
 * マーカーを埋め込んだHTMLから現在の文面を吸い出し、
 *   - spreadsheet-data/07_文面.seed.json  … シートの内容ミラー（記録用）
 *   - gas/SeedTexts.gs.txt                … GASに貼って1回実行するシード関数
 * を生成する。
 *
 * 併せて3種の検証を行い、マーカー挿入時の人為ミスを機械的に検出する:
 *   1. マーカー構造（build-texts.js のパス1と同一ロジック）
 *   2. 囲んだ区間に <br> 以外のタグが残っていないか（＝キー分割の漏れ）
 *   3. 同一キーがファイル間で違う現行値を持っていないか（＝既存のコピペずれ）
 *
 * 使い方: node scripts/extract-texts.js
 *
 * 依存なし（Node標準のみ）。
 */

const fs = require('fs');
const path = require('path');
const M = require('./text-markers');

const ROOT = path.resolve(__dirname, '..');
const SEED_JSON = path.join(ROOT, 'spreadsheet-data', '07_文面.seed.json');
const SEED_GAS = path.join(ROOT, 'gas', 'SeedTexts.gs.txt');

// key の末尾要素 → 管理画面に出す日本語の項目名
const ELEMENT_LABELS = {
  badge: 'バッジ',
  title: '見出し',
  title_accent: '見出し（強調部分）',
  lead: 'リード文',
  body: '本文',
  note: '注記',
  cta: 'ボタン文言',
  label: '英字ラベル',
  hours: '受付時間',
  copyright: 'コピーライト',
  access: 'アクセス',
  brand_main: '施設名',
  brand_sub: '施設名の上の小さい文字',
  tel_label: '電話番号の見出し'
};

// section スラッグ → 日本語名（label の前半に使う）
const SECTION_LABELS = {
  header: 'ヘッダー',
  footer: 'フッター',
  hero: 'ヒーロー',
  strengths: '3つの強み',
  scenes: '利用シーン',
  cuisine_intro: 'お料理紹介',
  sim_cta: 'シミュレーター誘導',
  monte: 'レストラン紹介',
  cta: '下部CTA',
  intro: '導入文',
  steps: '入力ステップ',
  summary: '集計パネル'
};

function labelFor(key) {
  const parts = key.split('.');
  const section = parts.length >= 3 ? parts[1] : '';
  let element = parts[parts.length - 1];

  // item1_title → title（連番を外して役割語を取り出す）
  const m = element.match(/^item(\d+)_(.+)$/);
  let prefix = '';
  if (m) { prefix = m[1] + 'つ目の'; element = m[2]; }
  // title_1 / title_2（1つの見出しを行で分けたもの）と cta_1 / cta_2（別々のボタン）を区別する
  const n = element.match(/^(.+)_(\d+)$/);
  let suffix = '';
  if (n && ELEMENT_LABELS[n[1]]) {
    element = n[1];
    if (element === 'title') suffix = '（' + n[2] + '行目）';
    else prefix = n[2] + 'つ目の' + prefix;
  }

  const sec = SECTION_LABELS[section] || section;
  const el = ELEMENT_LABELS[element] || element;
  return (sec ? sec + '：' : '') + prefix + el + suffix;
}

// ─── 走査 ───
console.log('=== 文面の吸い出し開始 ===');

const structureErrors = [];
const tagErrors = [];
const collected = new Map(); // key → { value, sources: [file] }

M.PAGES.forEach(function (page) {
  const file = path.join(ROOT, page + '.html');
  if (!fs.existsSync(file)) { console.warn('スキップ（無し）: ' + page + '.html'); return; }
  const html = fs.readFileSync(file, 'utf8');
  const scan = M.scanMarkers(html, page + '.html');
  scan.errors.forEach(function (e) { structureErrors.push(e); });

  scan.markers.forEach(function (m) {
    const raw = html.slice(m.contentStart, m.contentEnd);

    // 検証2: <br> 以外のタグが残っていないか
    const withoutBr = raw.replace(M.BR_RE, '');
    if (/<[^>]+>/.test(withoutBr)) {
      tagErrors.push(page + '.html:' + m.line + ' マーカー内に <br> 以外のタグが残っています: "' +
        m.key + '" → ' + withoutBr.trim().slice(0, 80));
    }

    // 検証2b: 往復（HTML→テキスト→HTML）で元に戻らない実体参照が入っていないか。
    // 例えば &copy; は htmlToText がデコードしないため、textToHtml が &amp;copy; に
    // エスケープしてしまい、サイトに「&copy;」という文字列が表示される。
    // &nbsp; はデコードすると普通の空白になり折り返し防止の意味が失われる。
    // どちらもマーカーの外に出すのが正解なので、ここで弾く。
    const badEntity = withoutBr.match(/&(?!(amp|lt|gt|quot|#39);)[a-zA-Z#][a-zA-Z0-9#]*;/g);
    if (badEntity) {
      tagErrors.push(page + '.html:' + m.line + ' マーカー内に、そのまま表示できない文字コード表記があります: "' +
        m.key + '" → ' + Array.from(new Set(badEntity)).join(' ') +
        '（マーカーの外に出してください）');
    }

    const value = M.htmlToText(raw);
    if (collected.has(m.key)) {
      const prev = collected.get(m.key);
      // 検証3: 同一キーがファイル間で違う値を持っていないか
      if (prev.value !== value) {
        tagErrors.push('キー "' + m.key + '" の現行値がファイル間で食い違っています:\n' +
          '      ' + prev.sources.join(',') + ' → ' + JSON.stringify(prev.value) + '\n' +
          '      ' + page + '.html → ' + JSON.stringify(value));
      }
      prev.sources.push(page + '.html');
    } else {
      collected.set(m.key, { value: value, sources: [page + '.html'] });
    }
  });
});

const allErrors = structureErrors.concat(tagErrors);
if (allErrors.length) {
  console.error('\n検証エラー（修正してから再実行してください）:');
  allErrors.forEach(function (e) { console.error('  - ' + e); });
  process.exit(1);
}

// ─── シード行の組み立て ───
const rows = [];
collected.forEach(function (info, key) {
  // facility.* は「設定」シートを正本とする仮想キーなので文面シートには入れない
  if (key.indexOf('facility.') === 0) return;
  const parts = key.split('.');
  rows.push({
    key: key,
    page: parts[0],
    section: parts.length >= 3 ? parts[1] : '',
    label: labelFor(key),
    value: info.value,
    note: info.sources.length > 1 ? '全ページ共通（' + info.sources.length + 'ページで使用）' : ''
  });
});

rows.sort(function (a, b) {
  if (a.page !== b.page) return a.page < b.page ? -1 : 1;
  if (a.section !== b.section) return a.section < b.section ? -1 : 1;
  return a.key < b.key ? -1 : 1;
});

fs.mkdirSync(path.dirname(SEED_JSON), { recursive: true });
fs.writeFileSync(SEED_JSON, JSON.stringify(rows, null, 2) + '\n', 'utf8');
console.log('出力: spreadsheet-data/07_文面.seed.json（' + rows.length + '件）');

// ─── 貼り付け用のGASシード関数 ───
const gas = [
  '/**',
  ' * 「文面」シートの作成＋投入（upsert）',
  ' *',
  ' * scripts/extract-texts.js が生成したファイル。GASエディタに貼り付けて',
  ' * seedTexts_() を1回だけ手動実行してください。実行後はこの関数を削除して構いません。',
  ' *',
  ' * upsert 方式なので、キーを追加した第2期以降でも安全に再実行できる:',
  ' *   - 既にある行は value（スタッフが編集した文面）をそのまま残し、',
  ' *     page / section / label / note だけ最新にする',
  ' *   - 新しいキーだけ行を追加する',
  ' *   - HTMLから消えたキーは自動削除せず、ログに報告するだけ（誤削除を避ける）',
  ' */',
  'function seedTexts_() {',
  '  var ss = SpreadsheetApp.getActiveSpreadsheet();',
  '  var sheet = ss.getSheetByName(\'文面\');',
  '  var headers = [\'key\', \'page\', \'section\', \'label\', \'value\', \'note\'];',
  '  var seed = ' + JSON.stringify(rows.map(function (r) {
    return [r.key, r.page, r.section, r.label, r.value, r.note];
  }), null, 2).replace(/\n/g, '\n  ') + ';',
  '',
  '  if (!sheet) {',
  '    sheet = ss.insertSheet(\'文面\');',
  '    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);',
  '  }',
  '  sheet.getRange(1, 1, 1, headers.length).setFontWeight(\'bold\').setBackground(\'#f0f0f0\');',
  '  sheet.setColumnWidth(5, 400);',
  '',
  '  // 既存行を読み取り、キー→行番号 のマップを作る',
  '  var last = sheet.getLastRow();',
  '  var existing = {};',
  '  if (last >= 2) {',
  '    var cur = sheet.getRange(2, 1, last - 1, headers.length).getValues();',
  '    for (var i = 0; i < cur.length; i++) {',
  '      var k = String(cur[i][0]).trim();',
  '      if (k) existing[k] = { row: i + 2, value: cur[i][4] };',
  '    }',
  '  }',
  '',
  '  var added = 0, updated = 0;',
  '  var appends = [];',
  '  seed.forEach(function(r) {',
  '    var hit = existing[r[0]];',
  '    if (hit) {',
  '      // value はスタッフの編集を尊重してそのまま残す',
  '      sheet.getRange(hit.row, 2, 1, 3).setValues([[r[1], r[2], r[3]]]);',
  '      sheet.getRange(hit.row, 6).setValue(r[5]);',
  '      updated++;',
  '      delete existing[r[0]];',
  '    } else {',
  '      appends.push(r);',
  '      added++;',
  '    }',
  '  });',
  '  if (appends.length > 0) {',
  '    sheet.getRange(sheet.getLastRow() + 1, 1, appends.length, headers.length).setValues(appends);',
  '  }',
  '',
  '  var orphans = Object.keys(existing);',
  '  Logger.log(\'文面シートを更新しました: 追加 \' + added + \'件 / 既存更新 \' + updated + \'件\');',
  '  if (orphans.length) {',
  '    Logger.log(\'※HTMLに対応するマーカーが無い行が \' + orphans.length + \'件あります（自動削除はしません）: \' + orphans.join(\', \'));',
  '  }',
  '}',
  ''
].join('\n');

fs.writeFileSync(SEED_GAS, gas, 'utf8');
console.log('出力: gas/SeedTexts.gs.txt（GASに貼って seedTexts_() を1回実行）');
console.log('\n=== 完了（' + rows.length + 'キー） ===');
