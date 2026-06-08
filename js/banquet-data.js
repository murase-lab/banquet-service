// ======================================================================
// バンケットサービス データローダー
// Google Sheets API から料理・シミュレーターデータを取得
// 取得できない場合はフォールバックデータを使用（2段階レンダリング）
// ======================================================================

// ★ Google Apps Script のデプロイURL をここに設定してください
var BANQUET_API_URL = 'https://script.google.com/macros/s/AKfycby7DhoPLNFoEmqs4AtwjRpaTkWntYGjSgGySCtcearcD0mPA79yqDcxBrsxObe_aZkV/exec';

// ===================================================
// ★ 料理ページ用フォールバックデータ
// ※ GitHub Actions で毎朝自動更新されます
// ===================================================
var CUISINE_DATA_FALLBACK = {
  "plans": [
    {
      "id": "kaiseki",
      "label": "会席料理",
      "price": 5200,
      "note": "コース料理・個別提供",
      "description": "お一人おひとりにサービスする形式です。前菜〜デザートまでのコース料理です。",
      "image": "https://murase-lab.github.io/banquet-service/images/会席料理.png",
      "badgeText": "個別提供",
      "badgeColor": "primary",
      "sortOrder": 1,
      "active": "true",
      "venueIncluded": "true"
    },
    {
      "id": "sitting",
      "label": "シッティング（卓盛）",
      "price": 4700,
      "note": "大皿盛り・スタッフ取り分け",
      "description": "大皿盛り込み料理となります。卓人数に応じお客様のテーブルまでサービススタッフがお運びしお取り分けいたします。",
      "image": "https://murase-lab.github.io/banquet-service/images/シッティング.png",
      "badgeText": "スタッフ配膳",
      "badgeColor": "accent-gold",
      "sortOrder": 2,
      "active": "true",
      "venueIncluded": "true"
    },
    {
      "id": "buffet",
      "label": "ビュッフェ料理（立食・着席）",
      "price": 4700,
      "note": "20名様以上〜",
      "description": "基本ビュッフェ台までお料理を取りに行く形式です。お料理を取り分けるトング類は定期的に交換させていただきます。\\n20名様以上〜",
      "image": "https://murase-lab.github.io/banquet-service/images/ビュッフェ料理.png",
      "badgeText": "セルフサービス",
      "badgeColor": "gray-800",
      "sortOrder": 3,
      "active": "true",
      "venueIncluded": "true"
    },
    {
      "id": "bento_banquet",
      "label": "弁当宴会",
      "price": 4200,
      "note": "開宴前に全品提供",
      "description": "開宴前デザート以外は全て最初にお出しいたします。",
      "image": "https://murase-lab.github.io/banquet-service/images/弁当宴会.png",
      "badgeText": "宴会向け",
      "badgeColor": "primary",
      "sortOrder": 4,
      "active": "true",
      "venueIncluded": "true"
    },
    {
      "id": "warigo",
      "label": "割子弁当",
      "price": 2500,
      "note": "会議後の昼食・持ち帰り可",
      "description": "主に会議終了後のご昼食としてお弁当をご利用いただいております。また、お持ち帰り用弁当としてもご用意できます。（料金相談要）",
      "image": "https://murase-lab.github.io/banquet-service/images/割子弁当.png",
      "badgeText": "会議向け",
      "badgeColor": "accent-gold",
      "sortOrder": 5,
      "active": "true",
      "venueIncluded": ""
    },
    {
      "id": "wedding",
      "label": "披露宴のお料理",
      "price": 10000,
      "note": "披露宴・ウェディング向け",
      "description": "",
      "image": "",
      "badgeText": "披露宴",
      "badgeColor": "accent-gold",
      "sortOrder": 6,
      "active": "true",
      "venueIncluded": "true"
    }
  ],
  "freeDrink": {
    "price": 2800,
    "duration": "110分",
    "description": "ビール・ノンアルコールビール・日本酒・焼酎（麦・芋）・ウィスキー・梅酒・ウーロン茶・オレンジジュース",
    "image": "https://murase-lab.github.io/banquet-service/images/フリードリンク.png"
  }
};

// ===================================================
// ★ シミュレーター用CONFIGフォールバックデータ
// ※ GitHub Actions で毎朝自動更新されます
// ===================================================
var CONFIG_FALLBACK = {
  "venue": {
    "suehiro_east": {
      "base": 33000,
      "extra": 16500,
      "label": "末広（東）",
      "area": "102㎡（31坪）",
      "floor": "2F",
      "layouts": {
        "スクール": 28,
        "コの字": 24,
        "ロの字": 36,
        "立食": 30
      },
      "foodPlans": [
        "kaiseki",
        "sitting",
        "bento_banquet",
        "warigo"
      ]
    },
    "suehiro_mid": {
      "base": 33000,
      "extra": 16500,
      "label": "末広（中）",
      "area": "108㎡（33坪）",
      "floor": "2F",
      "layouts": {
        "スクール": 28,
        "コの字": 24,
        "ロの字": 36,
        "円卓": 32,
        "着席ブッフェ": 32,
        "立食": 40
      }
    },
    "suehiro_west": {
      "base": 33000,
      "extra": 16500,
      "label": "末広（西）",
      "area": "113㎡（34坪）",
      "floor": "2F",
      "layouts": {
        "スクール": 42,
        "コの字": 28,
        "ロの字": 48,
        "円卓": 25,
        "着席ブッフェ": 40,
        "立食": 50
      }
    },
    "suehiro_mid_east": {
      "base": 66000,
      "extra": 33000,
      "label": "末広（中＋東）",
      "area": "210㎡",
      "floor": "2F",
      "layouts": {
        "円卓": 48,
        "着席ブッフェ": 64,
        "立食": 60
      }
    },
    "suehiro_west_mid": {
      "base": 66000,
      "extra": 33000,
      "label": "末広（西＋中）",
      "area": "221㎡（66坪）",
      "floor": "2F",
      "layouts": {
        "スクール": 54,
        "コの字": 32,
        "円卓": 48,
        "着席ブッフェ": 76,
        "立食": 60
      }
    },
    "suehiro_all": {
      "base": 99000,
      "extra": 49500,
      "label": "末広（全室）",
      "area": "323㎡（97坪）",
      "floor": "2F",
      "layouts": {
        "スクール": 102,
        "コの字": 56,
        "円卓": 75,
        "着席ブッフェ": 120,
        "立食": 150
      }
    },
    "hakuun": {
      "base": 66000,
      "extra": 16500,
      "label": "白雲の間",
      "area": "78畳（126㎡）",
      "floor": "8F",
      "layouts": {
        "スクール": 99,
        "ロの字": 56,
        "円卓": 60
      },
      "foodPlans": [
        "kaiseki",
        "sitting",
        "bento_banquet",
        "warigo"
      ]
    },
    "hatsune": {
      "base": 22000,
      "extra": 16500,
      "label": "初音の間",
      "area": "24畳（45㎡）",
      "floor": "8F",
      "layouts": {
        "ロの字": 16,
        "円卓": 12
      },
      "foodPlans": [
        "kaiseki",
        "warigo"
      ]
    }
  },
  "food_plans": [
    {
      "id": "kaiseki",
      "label": "会席料理",
      "price": 5200,
      "note": "コース料理・個別提供",
      "venueIncluded": true
    },
    {
      "id": "sitting",
      "label": "シッティング（卓盛）",
      "price": 4700,
      "note": "大皿盛り・スタッフ取り分け",
      "venueIncluded": true
    },
    {
      "id": "buffet",
      "label": "ビュッフェ料理（立食・着席）",
      "price": 4700,
      "note": "20名様以上〜",
      "venueIncluded": true
    },
    {
      "id": "bento_banquet",
      "label": "弁当宴会",
      "price": 4200,
      "note": "開宴前に全品提供",
      "venueIncluded": true
    },
    {
      "id": "warigo",
      "label": "割子弁当",
      "price": 2500,
      "note": "会議後の昼食・持ち帰り可",
      "venueIncluded": false
    },
    {
      "id": "wedding",
      "label": "披露宴のお料理",
      "price": 10000,
      "note": "披露宴・ウェディング向け",
      "venueIncluded": true
    }
  ],
  "free_drink": {
    "price": 2800,
    "duration": "110分"
  },
  "equipment": [
    {
      "id": "mic_w",
      "label": "ワイヤレスマイク",
      "price": 2200
    },
    {
      "id": "mic_c",
      "label": "有線マイク",
      "price": 2200
    },
    {
      "id": "scr_l",
      "label": "スクリーン（大）",
      "price": 16500
    },
    {
      "id": "scr_m",
      "label": "スクリーン（中）",
      "price": 11000
    },
    {
      "id": "scr_s",
      "label": "スクリーン（小）",
      "price": 5500
    },
    {
      "id": "proj",
      "label": "プロジェクター",
      "price": 16500
    },
    {
      "id": "whiteboard",
      "label": "ホワイトボード",
      "price": 1100
    },
    {
      "id": "dvd",
      "label": "DVDデッキ",
      "price": 3300
    },
    {
      "id": "tv",
      "label": "モニターTV(32inch)",
      "price": 3300
    },
    {
      "id": "podium",
      "label": "演台",
      "price": 5500
    },
    {
      "id": "mc_podium",
      "label": "司会台",
      "price": 3300
    },
    {
      "id": "lan",
      "label": "有線LAN",
      "price": 1100
    },
    {
      "id": "sign_hang",
      "label": "吊り看板",
      "price": 26000
    }
  ],
  "drinks": [
    {
      "id": "beer",
      "label": "ビール(中瓶)",
      "price": 900
    },
    {
      "id": "sake",
      "label": "清酒(1合)",
      "price": 880
    },
    {
      "id": "shochu_glass",
      "label": "焼酎グラス",
      "price": 770
    },
    {
      "id": "whisky_s",
      "label": "ウィスキー(シングル)",
      "price": 880
    },
    {
      "id": "soft_orange",
      "label": "オレンジジュース",
      "price": 500
    },
    {
      "id": "soft_oolong",
      "label": "ウーロン茶",
      "price": 550
    },
    {
      "id": "coffee",
      "label": "コーヒー",
      "price": 550
    },
    {
      "id": "pet_water",
      "label": "ペットボトル水",
      "price": 360
    },
    {
      "id": "pet_tea",
      "label": "ペットボトルお茶",
      "price": 360
    }
  ],
  "facility": {
    "name": "岐阜キャッスルイン バンケットサービス",
    "company": "有限会社バンケットサービス",
    "address": "〒500-8176 岐阜県岐阜市県町2-8",
    "tel": "058-212-3277",
    "fax": "058-269-4377"
  }
};

// ===================================================
// 現在のデータ（フォールバックで初期化）
// ===================================================
var CUISINE_DATA = CUISINE_DATA_FALLBACK;
var CONFIG = CONFIG_FALLBACK;

// ===================================================
// データ取得関数
// ===================================================

/**
 * 料理データをGoogle Sheetsから取得
 * @param {function} callback - データ取得後に呼ばれるコールバック
 * @param {string} [fadeTargetId] - フェードトランジション対象の要素ID
 */
function loadCuisineData(callback, fadeTargetId) {
  if (!BANQUET_API_URL) {
    CUISINE_DATA = CUISINE_DATA_FALLBACK;
    if (callback) callback(CUISINE_DATA);
    return;
  }

  fetch(BANQUET_API_URL + '?type=cuisine')
    .then(function(response) {
      if (!response.ok) throw new Error('API response error');
      return response.json();
    })
    .then(function(data) {
      if (data && data.plans && data.plans.length > 0) {
        // 数値型に変換
        data.plans.forEach(function(p) {
          p.price = Number(p.price) || 0;
          p.sortOrder = Number(p.sortOrder) || 0;
        });
        if (data.freeDrink) {
          data.freeDrink.price = Number(data.freeDrink.price) || 0;
        }

        // データ変更チェック（ID一覧で比較）
        var oldIds = CUISINE_DATA.plans.map(function(p) { return p.id; }).join(',');
        var newIds = data.plans.map(function(p) { return p.id; }).join(',');
        CUISINE_DATA = data;

        if (oldIds !== newIds && fadeTargetId) {
          var el = document.getElementById(fadeTargetId);
          if (el) {
            el.style.transition = 'opacity 0.3s ease';
            el.style.opacity = '0';
            setTimeout(function() {
              if (callback) callback(CUISINE_DATA);
              el.style.opacity = '1';
            }, 300);
            return;
          }
        }
        if (oldIds === newIds) return;
      } else {
        CUISINE_DATA = CUISINE_DATA_FALLBACK;
      }
      if (callback) callback(CUISINE_DATA);
    })
    .catch(function(error) {
      console.warn('料理データの取得に失敗。フォールバックデータを使用:', error.message);
      CUISINE_DATA = CUISINE_DATA_FALLBACK;
      if (callback) callback(CUISINE_DATA);
    });
}

/**
 * シミュレーター設定をGoogle Sheetsから取得
 * @param {function} callback - データ取得後に呼ばれるコールバック
 */
function loadSimulatorConfig(callback) {
  if (!BANQUET_API_URL) {
    CONFIG = CONFIG_FALLBACK;
    if (callback) callback(CONFIG);
    return;
  }

  fetch(BANQUET_API_URL + '?type=config')
    .then(function(response) {
      if (!response.ok) throw new Error('API response error');
      return response.json();
    })
    .then(function(data) {
      if (data && data.venue && data.food_plans) {
        // 数値型に変換 + layouts解析
        Object.keys(data.venue).forEach(function(key) {
          data.venue[key].base = Number(data.venue[key].base) || 0;
          data.venue[key].extra = Number(data.venue[key].extra) || 0;
          if (data.venue[key].layouts && typeof data.venue[key].layouts === 'string') {
            try { data.venue[key].layouts = JSON.parse(data.venue[key].layouts); } catch(e) {}
          }
          if (data.venue[key].foodPlans && typeof data.venue[key].foodPlans === 'string') {
            try { data.venue[key].foodPlans = JSON.parse(data.venue[key].foodPlans); } catch(e) {}
          }
        });
        data.food_plans.forEach(function(p) {
          p.price = Number(p.price) || 0;
          p.venueIncluded = p.venueIncluded === true || String(p.venueIncluded).toUpperCase() === 'TRUE';
        });
        data.free_drink.price = Number(data.free_drink.price) || 0;
        data.equipment.forEach(function(e) { e.price = Number(e.price) || 0; });
        data.drinks.forEach(function(d) { d.price = Number(d.price) || 0; });

        CONFIG = data;
      } else {
        CONFIG = CONFIG_FALLBACK;
      }
      if (callback) callback(CONFIG);
    })
    .catch(function(error) {
      console.warn('シミュレーター設定の取得に失敗。フォールバックデータを使用:', error.message);
      CONFIG = CONFIG_FALLBACK;
      if (callback) callback(CONFIG);
    });
}
