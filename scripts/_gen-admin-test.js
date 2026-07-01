// ローカル検証用: gas/Admin.html に google.script.run のモックを差し込んだ
// _admin_test.html を生成する（本番には含めない一時ファイル）
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

let html = fs.readFileSync(path.join(ROOT, 'gas', 'Admin.html'), 'utf8');

const schema = {
  '料理プラン': { label: 'お料理プラン', key: 'id', singleRow: false, reindex: true, columns: [
    { name: 'id', type: 'id' }, { name: 'label', type: 'text' }, { name: 'price', type: 'number' },
    { name: 'note', type: 'text' }, { name: 'description', type: 'textarea' }, { name: 'image', type: 'image' },
    { name: 'badgeText', type: 'text' }, { name: 'badgeColor', type: 'select', options: ['primary', 'accent-gold', 'gray-800'] },
    { name: 'sortOrder', type: 'number' }, { name: 'active', type: 'bool' }, { name: 'venueIncluded', type: 'bool' } ] },
  '会場': { label: '会場', key: 'id', singleRow: false, reindex: true, columns: [
    { name: 'id', type: 'id' }, { name: 'label', type: 'text' }, { name: 'area', type: 'text' },
    { name: 'base', type: 'number' }, { name: 'extra', type: 'number' }, { name: 'floor', type: 'text' },
    { name: 'layouts', type: 'json-object' }, { name: 'foodPlans', type: 'json-array' }, { name: 'sortOrder', type: 'number' } ] },
  'フリードリンク': { label: 'フリードリンク', key: null, singleRow: true, reindex: false, columns: [
    { name: 'price', type: 'number' }, { name: 'duration', type: 'text' }, { name: 'description', type: 'textarea' }, { name: 'image', type: 'image' } ] },
  '設定': { label: '施設情報', key: 'key', singleRow: false, reindex: false, keyValue: true, columns: [
    { name: 'key', type: 'text' }, { name: 'value', type: 'text' } ] },
  'SEO': { label: 'SEO', key: 'page', singleRow: false, reindex: false, columns: [
    { name: 'page', type: 'text' }, { name: 'title', type: 'text' }, { name: 'description', type: 'textarea' },
    { name: 'ogImage', type: 'image' }, { name: 'noindex', type: 'bool' } ] }
};

const data = {
  '料理プラン': [
    { id: 'kaiseki', label: '会席料理', price: '5200', note: '個別', description: 'x', image: '', badgeText: '個別提供', badgeColor: 'primary', sortOrder: '1', active: 'TRUE', venueIncluded: 'TRUE' },
    { id: 'warigo', label: '割子弁当', price: '3800', note: '', description: '', image: '', badgeText: '', badgeColor: 'gray-800', sortOrder: '2', active: 'TRUE', venueIncluded: 'FALSE' }
  ],
  '会場': [
    { id: 'suehiro_east', label: '末広東', area: '102', base: '33000', extra: '16500', floor: '2F', layouts: JSON.stringify({ 'スクール': 28, 'コの字': 24 }), foodPlans: JSON.stringify(['kaiseki']), sortOrder: '1' }
  ],
  'フリードリンク': [ { price: '2800', duration: '110分', description: 'x', image: '' } ],
  '設定': [ { key: 'facility_tel', value: '058-212-3277' } ],
  'SEO': [ { page: 'cuisine', title: 'お料理プラン | 岐阜キャッスルイン バンケットサービス', description: '会席・ビュッフェなど選べるお料理プラン。', ogImage: '', noindex: 'FALSE' } ]
};

const mock =
'  <script>\n' +
'  var _schema = ' + JSON.stringify(schema) + ';\n' +
'  var _data = ' + JSON.stringify(data) + ';\n' +
'  function _runner(){ var ok=null,fail=null; var api={\n' +
'    withSuccessHandler:function(f){ok=f;return api;},\n' +
'    withFailureHandler:function(f){fail=f;return api;},\n' +
'    adminGetSchema:function(pw){ setTimeout(function(){ pw==="test"?ok(_schema):fail({message:"パスワードが違います"}); },30); },\n' +
'    adminListSheet:function(pw,name){ setTimeout(function(){ ok({sheet:name,schema:_schema[name],rows:(_data[name]||[]).slice()}); },30); },\n' +
'    adminUpdateRow:function(){ setTimeout(function(){ok({ok:true});},30); },\n' +
'    adminAddRow:function(){ setTimeout(function(){ok({ok:true});},30); },\n' +
'    adminDeleteRow:function(){ setTimeout(function(){ok({ok:true});},30); },\n' +
'    adminReorder:function(){ setTimeout(function(){ok({ok:true});},30); },\n' +
'    adminUpdateSingleRow:function(){ setTimeout(function(){ok({ok:true});},30); },\n' +
'    adminTriggerResync:function(){ setTimeout(function(){ok({ok:true});},30); }\n' +
'  }; return api; }\n' +
'  window.google = { script: { get run(){ return _runner(); } } };\n' +
'  <' + '/script>\n';

html = html.replace('</head>', mock + '</head>');
fs.writeFileSync(path.join(ROOT, '_admin_test.html'), html);
console.log('wrote _admin_test.html');
