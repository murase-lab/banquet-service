/**
 * SEO 静的焼き込みスクリプト
 *
 * GAS API の ?type=seo / ?type=config を元に、各HTMLの <head> の
 * SEO:AUTO マーカー領域を再生成し、sitemap.xml / robots.txt を出力する。
 *
 * GitHub Actions から実行される想定（APIレスポンスは /tmp/ に事前DL済み）。
 * ローカル検証時は scripts/seo-sample/*.json を使ってもよい。
 *
 * 依存なし（Node標準のみ）。update-fallback.js と同じ思想。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://banquet-service.net';
const DEFAULT_OG_IMAGE = SITE + encodeURI('/images/末広の間メイン.webp');
const GA4_ID = (process.env.GA4_ID || '').trim();      // 例: G-XXXXXXXXXX（未設定ならGA4を挿入しない）

const START = '<!-- SEO:AUTO:START — generated, do not edit by hand -->';
const END = '<!-- SEO:AUTO:END -->';

// ページ → HTMLファイル名（index は / を正規URLにする）
const PAGES = ['index', 'cuisine', 'venue', 'pricing', 'simulator', 'party', 'access'];
const JSONLD_PAGES = ['index', 'access']; // LocalBusinessを入れるページ

// ─── 入力読み込み ───
function readJson(p, fallbackPaths) {
  const candidates = [p].concat(fallbackPaths || []);
  for (const c of candidates) {
    try { return JSON.parse(fs.readFileSync(c, 'utf8')); } catch (e) {}
  }
  return null;
}

const seoJson = readJson('/tmp/banquet-seo-response.json',
  [path.join(__dirname, 'seo-sample', 'seo.json')]);
const configJson = readJson('/tmp/banquet-config-response.json',
  [path.join(__dirname, 'seo-sample', 'config.json')]);

if (!seoJson || !seoJson.pages || !seoJson.pages.length) {
  // SEOシート未シード等でデータが空のときは、焼き込み済みHTMLを空メタで
  // 上書きしないようスキップする（既存の静的metaを保持）。
  console.error('SEOデータが空です。HTML焼き込みをスキップします（既存metaを保持）。');
  process.exit(0); // Actionを失敗させない
}

const seoByPage = {};
seoJson.pages.forEach(function (r) { seoByPage[r.page] = r; });
const facility = (configJson && configJson.facility) || {};

// ─── ヘルパー ───
function canonicalFor(page) {
  return page === 'index' ? SITE + '/' : SITE + '/' + page + '.html';
}
function attr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function telE164(tel) {
  if (!tel) return '';
  // 国内番号の先頭0を除いて +81- を付与。元のハイフン構造は維持する。
  const t = String(tel).trim().replace(/[()\s]/g, '');
  if (!/\d/.test(t)) return '';
  return '+81-' + t.replace(/^0/, '');
}
// '〒500-8176 岐阜県岐阜市県町2-8' → PostalAddress
function parseAddress(addr) {
  const out = { postalCode: '', addressRegion: '', addressLocality: '', streetAddress: '' };
  if (!addr) return out;
  const pc = addr.match(/〒?\s*(\d{3}-?\d{4})/);
  if (pc) out.postalCode = pc[1];
  let rest = addr.replace(/〒?\s*\d{3}-?\d{4}\s*/, '').trim();
  const region = rest.match(/^(北海道|.{2,3}[都道府県])/);
  if (region) { out.addressRegion = region[1]; rest = rest.slice(region[1].length); }
  const loc = rest.match(/^(.+?[市区町村])/);
  if (loc) { out.addressLocality = loc[1]; rest = rest.slice(loc[1].length); }
  out.streetAddress = rest.trim();
  return out;
}

function buildJsonLd() {
  const a = parseAddress(facility.address);
  const obj = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: facility.name || '岐阜キャッスルイン バンケットサービス',
    url: SITE + '/',
    image: DEFAULT_OG_IMAGE
  };
  if (facility.company) obj.legalName = facility.company;
  if (facility.tel) obj.telephone = telE164(facility.tel);
  if (facility.fax) obj.faxNumber = telE164(facility.fax);
  obj.address = {
    '@type': 'PostalAddress',
    postalCode: a.postalCode,
    addressRegion: a.addressRegion,
    addressLocality: a.addressLocality,
    streetAddress: a.streetAddress,
    addressCountry: 'JP'
  };
  return JSON.stringify(obj, null, 2);
}

function buildBlock(page) {
  const s = seoByPage[page] || {};
  const canonical = canonicalFor(page);
  const title = s.title || '';
  const desc = s.description || '';
  const ogImg = s.ogImage ? s.ogImage : DEFAULT_OG_IMAGE;
  const L = [];
  L.push(START);
  if (desc) L.push('<meta name="description" content="' + attr(desc) + '">');
  if (s.noindex) L.push('<meta name="robots" content="noindex,follow">');
  L.push('<link rel="canonical" href="' + attr(canonical) + '">');
  L.push('<meta property="og:type" content="website">');
  L.push('<meta property="og:site_name" content="岐阜キャッスルイン バンケットサービス">');
  if (title) L.push('<meta property="og:title" content="' + attr(title) + '">');
  if (desc) L.push('<meta property="og:description" content="' + attr(desc) + '">');
  L.push('<meta property="og:url" content="' + attr(canonical) + '">');
  L.push('<meta property="og:image" content="' + attr(ogImg) + '">');
  L.push('<meta name="twitter:card" content="summary_large_image">');
  if (title) L.push('<meta name="twitter:title" content="' + attr(title) + '">');
  if (desc) L.push('<meta name="twitter:description" content="' + attr(desc) + '">');
  L.push('<meta name="twitter:image" content="' + attr(ogImg) + '">');
  L.push('<link rel="icon" href="/favicon.ico" sizes="any">');
  L.push('<link rel="apple-touch-icon" href="/apple-touch-icon.png">');
  if (GA4_ID) {
    L.push('<script async src="https://www.googletagmanager.com/gtag/js?id=' + GA4_ID + '"></script>');
    L.push('<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag(\'js\',new Date());gtag(\'config\',\'' + GA4_ID + '\');</script>');
  }
  if (JSONLD_PAGES.indexOf(page) !== -1) {
    L.push('<script type="application/ld+json">');
    L.push(buildJsonLd());
    L.push('</script>');
  }
  L.push(END);
  return L.join('\n');
}

// マーカー領域を置換。無ければ </head> 直前に挿入。
function injectBlock(html, block) {
  const si = html.indexOf(START);
  const ei = html.indexOf(END);
  if (si !== -1 && ei !== -1 && ei > si) {
    return html.slice(0, si) + block + html.slice(ei + END.length);
  }
  const head = html.indexOf('</head>');
  if (head === -1) { console.warn('  </head> が見つかりません'); return html; }
  return html.slice(0, head) + block + '\n' + html.slice(head);
}

// <title> を SEO の title で置換（あれば）
function replaceTitle(html, title) {
  if (!title) return html;
  if (/<title>[\s\S]*?<\/title>/.test(html)) {
    return html.replace(/<title>[\s\S]*?<\/title>/, '<title>' + attr(title) + '</title>');
  }
  return html;
}

// ─── メイン ───
console.log('=== SEO 焼き込み開始 ===');
let changed = 0;
PAGES.forEach(function (page) {
  const file = path.join(ROOT, page + '.html');
  if (!fs.existsSync(file)) { console.warn('スキップ（無し）: ' + page + '.html'); return; }
  let html = fs.readFileSync(file, 'utf8');
  const before = html;
  html = injectBlock(html, buildBlock(page));
  const s = seoByPage[page];
  if (s && s.title) html = replaceTitle(html, s.title);
  if (html !== before) { fs.writeFileSync(file, html, 'utf8'); changed++; console.log('更新: ' + page + '.html'); }
  else console.log('変更なし: ' + page + '.html');
});

// sitemap.xml
const today = new Date().toISOString().slice(0, 10);
const urls = PAGES
  .filter(function (p) { const s = seoByPage[p]; return !(s && s.noindex); })
  .map(function (p) {
    return '  <url><loc>' + canonicalFor(p) + '</loc><lastmod>' + today + '</lastmod></url>';
  }).join('\n');
const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + '\n</urlset>\n';
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap, 'utf8');
console.log('sitemap.xml 出力');

// robots.txt
const robots = 'User-agent: *\nAllow: /\n\nSitemap: ' + SITE + '/sitemap.xml\n';
fs.writeFileSync(path.join(ROOT, 'robots.txt'), robots, 'utf8');
console.log('robots.txt 出力');

console.log('=== 完了（' + changed + 'ページ更新） ===');
