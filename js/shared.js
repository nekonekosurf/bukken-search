/* ============================
   物件サーチ PWA - 共通モジュール
   ============================ */

// 全ページ共通の物件データキャッシュ
window.BukkenShared = (function () {
  'use strict';

  // ---- 定数 ----
  const AREAS = ['新宿区', '渋谷区', '目黒区', '世田谷区', '中野区', '杉並区'];
  const PLANS = ['1K', '1DK', '1LDK', '2K', '2DK', '2LDK', '3K', '3DK', '3LDK'];
  const ERA_OFFSETS = { '令和': 2018, '平成': 1988, '昭和': 1925, '大正': 1911, '明治': 1867 };
  const CURRENT_YEAR = 2026;

  // キャッシュ
  let _propertiesCache = null;
  let _propertiesPromise = null;

  // ---- データ読み込み（キャッシュ付き） ----
  function loadProperties() {
    if (_propertiesCache) {
      return Promise.resolve(_propertiesCache);
    }
    if (_propertiesPromise) {
      return _propertiesPromise;
    }
    _propertiesPromise = fetch('data/properties.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        // 前処理: building_age, floor_plan_norm を付与
        data.forEach(function (p) {
          p.building_age = parseBuildingAge(p.building_year);
          p.floor_plan_norm = normalizePlan(p.floor_plan);
        });
        _propertiesCache = data;
        return data;
      })
      .catch(function(err) {
        console.error('物件データの読み込みに失敗:', err);
        return [];
      });
    return _propertiesPromise;
  }

  // ---- 和暦 → 築年数 ----
  function parseBuildingAge(yearStr) {
    if (yearStr == null) return null;
    yearStr = String(yearStr).trim();
    if (!yearStr) return null;

    // 純粋な数字
    if (/^\d{4}$/.test(yearStr)) {
      return CURRENT_YEAR - parseInt(yearStr, 10);
    }

    // "2020年" 形式
    var m = yearStr.match(/^(\d{4})\s*年/);
    if (m) {
      return CURRENT_YEAR - parseInt(m[1], 10);
    }

    // 和暦
    for (var era in ERA_OFFSETS) {
      if (yearStr.indexOf(era) !== -1) {
        var numPart = yearStr.replace(era, '').replace(/[^\d元]/g, '');
        var num;
        if (numPart === '元' || numPart === '') {
          num = 1;
        } else {
          var digits = numPart.match(/\d+/);
          num = digits ? parseInt(digits[0], 10) : 1;
        }
        var westernYear = ERA_OFFSETS[era] + num;
        return CURRENT_YEAR - westernYear;
      }
    }
    return null;
  }

  // ---- 間取り正規化 ----
  function normalizePlan(plan) {
    if (!plan) return '';
    plan = plan.trim().toUpperCase();
    // S付きを除去
    plan = plan.replace(/S/g, '');
    // 数字+タイプの基本形に正規化
    var m = plan.match(/(\d+)(K|DK|LDK)/);
    if (m) return m[1] + m[2];
    return plan;
  }

  // ---- 中央値計算 ----
  function median(arr) {
    if (!arr || arr.length === 0) return null;
    var sorted = arr.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  // ---- 平均値計算 ----
  function mean(arr) {
    if (!arr || arr.length === 0) return null;
    var sum = 0;
    for (var i = 0; i < arr.length; i++) sum += arr[i];
    return sum / arr.length;
  }

  // ---- フォントサイズ切替 ----
  var FONT_SIZES = ['small', 'medium', 'large'];
  var currentFontSizeIndex = 1;

  function initFontSize() {
    var saved = localStorage.getItem('font-size');
    if (saved && FONT_SIZES.indexOf(saved) !== -1) {
      currentFontSizeIndex = FONT_SIZES.indexOf(saved);
    }
    document.documentElement.setAttribute('data-font-size', FONT_SIZES[currentFontSizeIndex]);
  }

  function cycleFontSize() {
    currentFontSizeIndex = (currentFontSizeIndex + 1) % FONT_SIZES.length;
    var size = FONT_SIZES[currentFontSizeIndex];
    document.documentElement.setAttribute('data-font-size', size);
    localStorage.setItem('font-size', size);
    // トースト表示
    var toast = document.createElement('div');
    toast.textContent = '文字サイズ: ' + ['小', '中', '大'][currentFontSizeIndex];
    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:8px 20px;border-radius:20px;z-index:9999;font-size:14px;';
    document.body.appendChild(toast);
    setTimeout(function() { toast.remove(); }, 1500);
  }

  // ---- HTML エスケープ ----
  function escapeHtml(str) {
    if (str == null) return '';
    var div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  // ---- 数値フォーマット ----
  function formatMoney(n) {
    if (n == null) return '0';
    return n.toLocaleString();
  }

  // ---- 公開API ----
  return {
    AREAS: AREAS,
    PLANS: PLANS,
    CURRENT_YEAR: CURRENT_YEAR,
    loadProperties: loadProperties,
    parseBuildingAge: parseBuildingAge,
    normalizePlan: normalizePlan,
    median: median,
    mean: mean,
    initFontSize: initFontSize,
    cycleFontSize: cycleFontSize,
    escapeHtml: escapeHtml,
    formatMoney: formatMoney,
  };
})();
