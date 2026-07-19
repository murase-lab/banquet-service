/**
 * 文面マーカーの共通ロジック
 *
 * HTML中の  <!--T:key-->本文<!--/T-->  を走査・検証・置換する。
 * build-texts.js（焼き込み）と extract-texts.js（初期吸い出し）の両方が使う。
 *
 * 依存なし（Node標準のみ）。build-seo.js と同じ思想。
 */

const OPEN = '<!--T:';
const CLOSE = '<!--/T-->';
const KEY_RE = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/;
// <br>, <br/>, <br class="hidden md:block"/> などをまとめて改行として扱う。
// 焼き込み後は常に素の <br> になる（ビューポート別の改行出し分けは非対応・仕様）
const BR_RE = /<br\b[^>]*>/gi;

// 対象ページ（build-seo.js の PAGES と揃える）
const PAGES = ['index', 'cuisine', 'venue', 'pricing', 'simulator', 'party', 'access'];

/** 文字位置 → 行番号（エラーメッセージ用） */
function lineOf(html, index) {
  return html.slice(0, index).split('\n').length;
}

/**
 * マーカーを走査する。
 * @returns {{markers: Array, errors: Array<string>}}
 *   markers: { key, contentStart, contentEnd, line } の配列（出現順）
 *   errors:  構造エラーの説明文字列の配列
 */
function scanMarkers(html, fileLabel) {
  const markers = [];
  const errors = [];
  const where = (i) => `${fileLabel}:${lineOf(html, i)}`;
  let i = 0;

  while (true) {
    const si = html.indexOf(OPEN, i);
    if (si === -1) break;

    const keyEnd = html.indexOf('-->', si + OPEN.length);
    if (keyEnd === -1) {
      errors.push(`${where(si)} 開始マーカーが閉じていません（"-->" が見つかりません）`);
      break;
    }

    const key = html.slice(si + OPEN.length, keyEnd);
    if (!KEY_RE.test(key)) {
      errors.push(`${where(si)} キーの書式が不正です: "${key}"（英小文字・数字・_ をドットで区切る）`);
      i = keyEnd + 3;
      continue;
    }

    const contentStart = keyEnd + 3;
    const ei = html.indexOf(CLOSE, contentStart);
    if (ei === -1) {
      errors.push(`${where(si)} 閉じマーカー <!--/T--> がありません: "${key}"`);
      break;
    }

    const nextOpen = html.indexOf(OPEN, contentStart);
    if (nextOpen !== -1 && nextOpen < ei) {
      errors.push(`${where(si)} マーカーが入れ子になっています: "${key}"（マーカーはテキストのみを囲むこと）`);
      i = nextOpen;
      continue;
    }

    markers.push({ key: key, contentStart: contentStart, contentEnd: ei, line: lineOf(html, si) });
    i = ei + CLOSE.length;
  }

  return { markers: markers, errors: errors };
}

/** 保存値の正規化: CRLF→LF、前後trim、3連続以上の改行は2つに丸める */
function normalizeValue(v) {
  return String(v == null ? '' : v)
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** プレーンテキスト → HTML（&<> をエスケープし、改行を <br> に） */
function textToHtml(v) {
  return normalizeValue(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

/** HTML → プレーンテキスト（extract 用。textToHtml の逆） */
function htmlToText(s) {
  return String(s)
    .replace(BR_RE, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')   // & は最後（二重デコードを避ける）
    .trim();
}

/**
 * href="tel:..." を電話番号に追従させる。
 *
 * 電話番号は表示（facility.tel マーカー）だけを差し替えると、リンク先が旧番号のまま残り
 * 「画面には新番号、タップすると旧番号にかかる」という食い違いが起きる。
 * 値は設定シート由来（スタッフの自由入力ではない）なので、数字と + のみに正規化して埋める。
 * 正規化の結果が電話番号として妥当でなければ書き換えない。
 */
function replaceTelHrefs(html, tel) {
  // ハイフンは tel: URI で有効なので残す（既存HTMLの表記と一致し、差分が最小になる）
  const normalized = String(tel == null ? '' : tel).replace(/[^\d+\-]/g, '');
  const digits = normalized.replace(/\D/g, '');
  if (!/^\+?[\d-]+$/.test(normalized) || digits.length < 9 || digits.length > 15) {
    return { html: html, count: 0, skipped: true };
  }
  let count = 0;
  const out = html.replace(/href="tel:[^"]*"/g, function () {
    count++;
    return 'href="tel:' + normalized + '"';
  });
  return { html: out, count: count, skipped: false };
}

/**
 * マーカーの中身を置き換えた HTML を返す。
 * @param resolve (key) => string|null  null を返すと既存の中身を保持する
 */
function replaceMarkers(html, markers, resolve) {
  let out = '';
  let cursor = 0;
  for (const m of markers) {
    out += html.slice(cursor, m.contentStart);
    const next = resolve(m.key);
    out += (next === null || next === undefined)
      ? html.slice(m.contentStart, m.contentEnd)
      : next;
    cursor = m.contentEnd;
  }
  return out + html.slice(cursor);
}

module.exports = {
  OPEN, CLOSE, KEY_RE, BR_RE, PAGES,
  scanMarkers, normalizeValue, textToHtml, htmlToText, replaceMarkers, replaceTelHrefs, lineOf
};
