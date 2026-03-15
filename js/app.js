/* ============================
   物件マップ PWA - メインアプリ
   ============================ */
(function () {
  'use strict';

  // ---- 定数 ----
  const DEFAULT_CENTER = [35.66, 139.68]; // 東京23区西部
  const DEFAULT_ZOOM = 13;
  const RENT_COLORS = [
    { min: 0,  max: 12, cls: 'rent-blue',   hex: '#3b82f6' },
    { min: 12, max: 16, cls: 'rent-green',  hex: '#22c55e' },
    { min: 16, max: 20, cls: 'rent-yellow', hex: '#eab308' },
    { min: 20, max: Infinity, cls: 'rent-red', hex: '#ef4444' }
  ];

  // 駅名リスト (#2)
  const STATION_LIST = [
    { name: '新宿', lat: 35.6896, lng: 139.7006 },
    { name: '渋谷', lat: 35.6580, lng: 139.7016 },
    { name: '下北沢', lat: 35.6613, lng: 139.6680 },
    { name: '中目黒', lat: 35.6440, lng: 139.6987 },
    { name: '三軒茶屋', lat: 35.6437, lng: 139.6700 },
    { name: '高円寺', lat: 35.7054, lng: 139.6494 },
    { name: '荻窪', lat: 35.7040, lng: 139.6201 },
    { name: '中野', lat: 35.7074, lng: 139.6659 },
    { name: '明大前', lat: 35.6684, lng: 139.6497 },
    { name: '笹塚', lat: 35.6746, lng: 139.6677 },
    { name: '代々木上原', lat: 35.6684, lng: 139.6794 },
    { name: '駒場東大前', lat: 35.6600, lng: 139.6835 },
    { name: '池ノ上', lat: 35.6620, lng: 139.6733 },
    { name: '代田橋', lat: 35.6679, lng: 139.6569 },
    { name: '経堂', lat: 35.6481, lng: 139.6367 },
    { name: '千歳船橋', lat: 35.6469, lng: 139.6265 },
    { name: '祖師ヶ谷大蔵', lat: 35.6453, lng: 139.6147 },
    { name: '学芸大学', lat: 35.6284, lng: 139.6851 },
    { name: '都立大学', lat: 35.6185, lng: 139.6821 },
    { name: '吉祥寺', lat: 35.7032, lng: 139.5794 }
  ];

  // チュートリアルステップ
  const TUTORIAL_STEPS = [
    { icon: '\uD83D\uDDFA\uFE0F', text: '地図で物件を探せます。ピンをタップすると詳細が見られます' },
    { icon: '\uD83D\uDD0D', text: 'フィルターで家賃・間取り・エリアを絞り込めます' },
    { icon: '\uD83D\uDCF7', text: 'カメラで建物の看板を撮影すると物件情報が分かります' }
  ];

  // ---- 状態 ----
  let allProperties = [];
  let filteredProperties = [];
  let map, clusterGroup, heatLayer;
  let currentLocationMarker = null;
  let currentLocation = null;
  let radiusCircle = null;
  let heatmapVisible = false;
  let selectedRadius = 0;

  // フォントサイズ状態 (#8) - shared.jsで管理

  // 周辺施設の状態
  let poiLayerGroup = null;
  let poiVisible = true;
  let poiCache = {}; // { "lat,lng": elements }

  // ---- 初期化 ----
  function init() {
    initFontSize();
    initMap();
    initUI();
    initStationSearch();
    initFavorites();
    initTutorial();
    loadProperties();
    registerSW();
  }

  // ---- フォントサイズ初期化 (#8 shared.js使用) ----
  const S = window.BukkenShared;

  function initFontSize() {
    S.initFontSize();
  }

  function cycleFontSize() {
    S.cycleFontSize();
  }

  // ---- 地図初期化 (#10 preferCanvas) ----
  function initMap() {
    map = L.map('map', {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    // Leafletのズームコントロールを右上に移動
    map.zoomControl.setPosition('topright');

    // クラスターグループ
    clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      disableClusteringAtZoom: 17
    });
    map.addLayer(clusterGroup);

    // 周辺施設レイヤーグループ
    poiLayerGroup = L.layerGroup().addTo(map);
  }

  // ---- 物件データ読み込み (shared.js使用) ----
  function loadProperties() {
    S.loadProperties()
      .then(data => {
        allProperties = data;
        applyFilters();
        // 現在地取得
        locateUser(false);
      })
      .catch(err => {
        console.error('物件データの読み込みに失敗:', err);
        document.getElementById('stats').textContent = '読込エラー';
      });
  }

  // ---- マーカー描画 ----
  function renderMarkers(properties) {
    clusterGroup.clearLayers();

    properties.forEach(p => {
      const rentMan = p.rent_man;
      const color = RENT_COLORS.find(c => rentMan >= c.min && rentMan < c.max) || RENT_COLORS[3];

      const icon = L.divIcon({
        className: 'rent-marker ' + color.cls,
        iconSize: [12, 12]
      });

      const marker = L.marker([p.latitude, p.longitude], { icon: icon });
      marker.bindPopup(() => buildPopup(p), { maxWidth: 300, minWidth: 240 });

      // ポップアップを開いた時に周辺施設を取得
      marker.on('popupopen', () => {
        if (poiVisible) {
          loadNearbyPOI(p.latitude, p.longitude, 500);
        }
        // ポップアップ内のボタンにイベントをバインド
        setTimeout(() => bindPopupActions(p), 50);
      });

      clusterGroup.addLayer(marker);
    });
  }

  // ---- ポップアップHTML生成 (#4 情報設計改善 + お気に入り・共有ボタン) ----
  function buildPopup(p) {
    const feeStr = p.management_fee && p.management_fee > 0 ? `(管理費 ${formatMoney(p.management_fee)}円)` : '(管理費なし)';
    const areaStr = p.total_floor_area ? p.total_floor_area + 'm\u00B2' : '';
    const floorPlanStr = p.floor_plan || '';
    const walkStr = p.station_distance_min ? `徒歩${p.station_distance_min}分` : '';
    const stationStr = p.station_name || '';
    const buildingYear = p.building_year || '';

    // 2行目: 間取り + 面積
    const line2Parts = [floorPlanStr, areaStr].filter(Boolean);
    const line2 = line2Parts.length > 0 ? line2Parts.join(' / ') : '-';

    // 3行目: 駅名・徒歩
    const line3Parts = [stationStr ? stationStr + '駅' : '', walkStr].filter(Boolean);
    const line3 = line3Parts.length > 0 ? line3Parts.join(' ') : '-';

    // 4行目: 築年数
    const line4 = buildingYear || '-';

    // お気に入り状態チェック
    const isSaved = isFavorite(p.id);
    const favLabel = isSaved ? '\u2605 保存済み' : '\u2605 保存';
    const favClass = isSaved ? 'popup-btn-fav saved' : 'popup-btn-fav';

    // 詳細リンクボタン
    let detailBtnHtml = '';
    if (p.detail_url) {
      const isSuumo = p.detail_url.includes('suumo');
      const linkLabel = isSuumo ? 'SUUMOで見る' : '詳細を見る';
      detailBtnHtml = `<button class="popup-btn-detail" data-url="${escapeHtml(p.detail_url)}">${linkLabel}</button>`;
    }

    return `
      <div class="popup-card">
        <div class="popup-name">${escapeHtml(p.property_name || '物件名なし')}</div>
        <div class="popup-rent">
          ${p.rent_man}<span class="unit">万円</span>
          <span class="fee">${feeStr}</span>
        </div>
        <div class="popup-info-line">${escapeHtml(line2)}</div>
        <div class="popup-info-line">${escapeHtml(line3)}</div>
        <div class="popup-info-line"><span class="label">築年:</span>${escapeHtml(line4)}</div>
        <div class="popup-actions">
          ${detailBtnHtml}
          <button class="${favClass}" data-property-id="${p.id}">${favLabel}</button>
          <button class="popup-btn-share" data-property-id="${p.id}">\u2197 共有</button>
        </div>
      </div>
    `;
  }

  // ---- ポップアップ内ボタンのイベントバインド ----
  function bindPopupActions(p) {
    // 詳細ボタン
    const detailBtn = document.querySelector('.popup-btn-detail');
    if (detailBtn) {
      detailBtn.addEventListener('click', () => {
        window.open(detailBtn.dataset.url, '_blank', 'noopener');
      });
    }

    // お気に入りボタン
    const favBtn = document.querySelector('.popup-btn-fav');
    if (favBtn) {
      favBtn.addEventListener('click', () => {
        toggleFavorite(p);
        // ボタン表示を更新
        if (isFavorite(p.id)) {
          favBtn.classList.add('saved');
          favBtn.textContent = '\u2605 保存済み';
        } else {
          favBtn.classList.remove('saved');
          favBtn.textContent = '\u2605 保存';
        }
        updateFavButton();
      });
    }

    // 共有ボタン
    const shareBtn = document.querySelector('.popup-btn-share');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        shareProperty(p);
      });
    }
  }

  // ==============================
  // 修正2: お気に入り保存機能
  // ==============================
  const FAV_STORAGE_KEY = 'bukken-favorites';

  function getFavorites() {
    try {
      return JSON.parse(localStorage.getItem(FAV_STORAGE_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveFavorites(favs) {
    localStorage.setItem(FAV_STORAGE_KEY, JSON.stringify(favs));
  }

  function isFavorite(propertyId) {
    return getFavorites().includes(propertyId);
  }

  function toggleFavorite(property) {
    let favs = getFavorites();
    const idx = favs.indexOf(property.id);
    if (idx >= 0) {
      favs.splice(idx, 1);
    } else {
      favs.push(property.id);
    }
    saveFavorites(favs);
  }

  function updateFavButton() {
    const btn = document.getElementById('btn-favorites');
    if (!btn) return;
    const count = getFavorites().length;
    btn.innerHTML = `\u2605 お気に入り（${count}件）`;
  }

  function initFavorites() {
    const btn = document.getElementById('btn-favorites');
    const modal = document.getElementById('fav-modal');
    const modalOverlay = document.getElementById('fav-modal-overlay');
    const closeBtn = document.getElementById('fav-modal-close');
    const clearAllBtn = document.getElementById('fav-clear-all');

    if (!btn) return;

    updateFavButton();

    btn.addEventListener('click', () => {
      openFavModal();
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', closeFavModal);
    }
    if (modalOverlay) {
      modalOverlay.addEventListener('click', closeFavModal);
    }
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', () => {
        if (confirm('全てのお気に入りを削除しますか？')) {
          saveFavorites([]);
          updateFavButton();
          renderFavList();
        }
      });
    }
  }

  function openFavModal() {
    const modal = document.getElementById('fav-modal');
    const overlay = document.getElementById('fav-modal-overlay');
    if (modal) modal.classList.add('open');
    if (overlay) overlay.classList.add('visible');
    renderFavList();
  }

  function closeFavModal() {
    const modal = document.getElementById('fav-modal');
    const overlay = document.getElementById('fav-modal-overlay');
    if (modal) modal.classList.remove('open');
    if (overlay) overlay.classList.remove('visible');
  }

  function renderFavList() {
    const body = document.getElementById('fav-modal-body');
    const title = document.getElementById('fav-modal-title');
    const favIds = getFavorites();

    if (title) {
      title.innerHTML = `\u2605 お気に入り（${favIds.length}件）`;
    }

    if (!body) return;

    if (favIds.length === 0) {
      body.innerHTML = '<div class="fav-modal-empty">お気に入りがありません</div>';
      return;
    }

    const favProperties = allProperties.filter(p => favIds.includes(p.id));

    if (favProperties.length === 0) {
      body.innerHTML = '<div class="fav-modal-empty">お気に入りがありません</div>';
      return;
    }

    body.innerHTML = favProperties.map(p => {
      const areaStr = p.total_floor_area ? p.total_floor_area + 'm\u00B2' : '';
      const detail = [p.rent_man + '万円', p.floor_plan || '', areaStr].filter(Boolean).join(' / ');
      return `
        <div class="fav-item" data-id="${p.id}">
          <div class="fav-item-info">
            <div class="fav-item-name">${escapeHtml(p.property_name || '物件名なし')}</div>
            <div class="fav-item-detail">${escapeHtml(detail)}</div>
          </div>
          <button class="fav-item-delete" data-id="${p.id}">削除</button>
        </div>
      `;
    }).join('');

    // 削除ボタンのイベント
    body.querySelectorAll('.fav-item-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id, 10);
        let favs = getFavorites();
        favs = favs.filter(f => f !== id);
        saveFavorites(favs);
        updateFavButton();
        renderFavList();
      });
    });
  }

  // ==============================
  // 修正3: 物件共有機能
  // ==============================
  function shareProperty(p) {
    const shareText = `${p.property_name || '物件'} ${p.rent_man}万円 ${p.floor_plan || ''}`;
    const shareUrl = p.detail_url || window.location.href;

    if (navigator.share) {
      navigator.share({
        title: p.property_name || '物件情報',
        text: shareText,
        url: shareUrl
      }).catch(err => {
        // ユーザーがキャンセルした場合は無視
        if (err.name !== 'AbortError') {
          console.warn('共有エラー:', err);
        }
      });
    } else {
      // フォールバック: URLをクリップボードにコピー
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareUrl).then(() => {
          alert('URLをコピーしました');
        }).catch(() => {
          fallbackCopy(shareUrl);
        });
      } else {
        fallbackCopy(shareUrl);
      }
    }
  }

  function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      alert('URLをコピーしました');
    } catch (e) {
      alert('コピーに失敗しました。URLを手動でコピーしてください: ' + text);
    }
    document.body.removeChild(textarea);
  }

  // ==============================
  // 修正4: 初回チュートリアル
  // ==============================
  const TUTORIAL_DONE_KEY = 'bukken-tutorial-done';

  function initTutorial() {
    if (localStorage.getItem(TUTORIAL_DONE_KEY)) return;

    const overlay = document.getElementById('tutorial-overlay');
    if (!overlay) return;

    let currentStep = 0;

    function renderStep() {
      const step = TUTORIAL_STEPS[currentStep];
      const dotsEl = document.getElementById('tutorial-dots');
      const iconEl = document.getElementById('tutorial-icon');
      const textEl = document.getElementById('tutorial-text');
      const nextBtn = document.getElementById('tutorial-next');

      // ドットインジケーター
      dotsEl.innerHTML = TUTORIAL_STEPS.map((_, i) =>
        `<div class="tutorial-dot${i === currentStep ? ' active' : ''}"></div>`
      ).join('');

      iconEl.textContent = step.icon;
      textEl.textContent = step.text;

      // 最終ステップは「はじめる」に変更
      if (currentStep === TUTORIAL_STEPS.length - 1) {
        nextBtn.textContent = 'はじめる';
      } else {
        nextBtn.textContent = '次へ';
      }
    }

    function closeTutorial() {
      overlay.classList.remove('visible');
      localStorage.setItem(TUTORIAL_DONE_KEY, '1');
      // 少し待ってからDOMから非表示
      setTimeout(() => { overlay.style.display = 'none'; }, 300);
    }

    // 次へボタン
    document.getElementById('tutorial-next').addEventListener('click', () => {
      currentStep++;
      if (currentStep >= TUTORIAL_STEPS.length) {
        closeTutorial();
      } else {
        renderStep();
      }
    });

    // スキップボタン
    document.getElementById('tutorial-skip').addEventListener('click', closeTutorial);

    // 初回表示
    renderStep();
    // 少し遅延させて表示（地図ロード後に）
    setTimeout(() => { overlay.classList.add('visible'); }, 500);
  }

  // ==============================
  // 修正5: 周辺施設表示（Overpass API）
  // ==============================
  async function loadNearbyPOI(lat, lng, radius) {
    if (!poiVisible) return;

    const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (poiCache[cacheKey]) {
      renderPOI(poiCache[cacheKey]);
      return;
    }

    const query = `[out:json];(
      node["shop"="supermarket"](around:${radius},${lat},${lng});
      node["shop"="convenience"](around:${radius},${lat},${lng});
    );out body;`;

    try {
      const resp = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query)
      });
      const data = await resp.json();
      poiCache[cacheKey] = data.elements || [];
      renderPOI(poiCache[cacheKey]);
    } catch (err) {
      console.warn('周辺施設の取得に失敗:', err);
    }
  }

  function renderPOI(elements) {
    if (!poiLayerGroup) return;
    poiLayerGroup.clearLayers();

    elements.forEach(el => {
      if (!el.lat || !el.lon) return;
      const shopType = el.tags && el.tags.shop;
      let emoji = '\uD83C\uDFEA'; // 🏪 コンビニ
      let label = 'コンビニ';
      if (shopType === 'supermarket') {
        emoji = '\uD83D\uDED2'; // 🛒 スーパー
        label = 'スーパー';
      }

      const name = (el.tags && el.tags.name) || label;

      const icon = L.divIcon({
        className: 'poi-marker',
        html: emoji,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const marker = L.marker([el.lat, el.lon], { icon: icon });
      marker.bindPopup(`<b>${escapeHtml(name)}</b><br><small>${label}</small>`, {
        maxWidth: 200,
        minWidth: 100
      });
      poiLayerGroup.addLayer(marker);
    });
  }

  function togglePOI() {
    poiVisible = !poiVisible;
    const btn = document.getElementById('btn-poi-toggle');
    if (poiVisible) {
      btn.classList.add('active');
      if (poiLayerGroup) map.addLayer(poiLayerGroup);
    } else {
      btn.classList.remove('active');
      if (poiLayerGroup) {
        poiLayerGroup.clearLayers();
        map.removeLayer(poiLayerGroup);
      }
    }
  }

  // ---- ヒートマップ (#9 凡例対応) ----
  function toggleHeatmap() {
    heatmapVisible = !heatmapVisible;
    const btn = document.getElementById('btn-heatmap');
    const legend = document.getElementById('heatmap-legend');

    if (heatmapVisible) {
      btn.classList.add('active');
      const maxRent = filteredProperties.reduce((max, p) => Math.max(max, p.rent_man || 0), 1);
      const points = filteredProperties.map(p => [p.latitude, p.longitude, p.rent_man / maxRent]);
      if (heatLayer) map.removeLayer(heatLayer);
      heatLayer = L.heatLayer(points, {
        radius: 25,
        blur: 20,
        maxZoom: 16,
        max: 1.0,
        gradient: {
          0.1: '#440154',
          0.3: '#31688e',
          0.5: '#35b779',
          0.7: '#90d743',
          1.0: '#fde725'
        }
      }).addTo(map);
      if (legend) legend.classList.add('visible');
    } else {
      btn.classList.remove('active');
      if (heatLayer) {
        map.removeLayer(heatLayer);
        heatLayer = null;
      }
      if (legend) legend.classList.remove('visible');
    }
  }

  // ---- 現在地取得 ----
  function locateUser(centerMap) {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      pos => {
        currentLocation = [pos.coords.latitude, pos.coords.longitude];

        if (currentLocationMarker) map.removeLayer(currentLocationMarker);
        currentLocationMarker = L.marker(currentLocation, {
          icon: L.divIcon({ className: 'current-location-marker', iconSize: [16, 16] })
        }).addTo(map).bindPopup('現在地');

        if (centerMap !== false) {
          map.setView(currentLocation, 15);
        }

        // 半径描画を更新
        if (selectedRadius > 0) drawRadius(selectedRadius);
      },
      err => {
        console.warn('位置情報取得エラー:', err.message);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  // ---- 半径円表示 ----
  function drawRadius(meters) {
    if (radiusCircle) {
      map.removeLayer(radiusCircle);
      radiusCircle = null;
    }
    if (!currentLocation || meters <= 0) return;

    radiusCircle = L.circle(currentLocation, {
      radius: meters,
      color: '#1976D2',
      fillColor: '#1976D2',
      fillOpacity: 0.08,
      weight: 2,
      dashArray: '6, 4'
    }).addTo(map);
  }

  // ---- フィルター適用 ----
  function applyFilters() {
    const rentMin = parseFloat(document.getElementById('rent-min').value);
    const rentMax = parseFloat(document.getElementById('rent-max').value);
    const walkMax = parseInt(document.getElementById('walk-max').value, 10);

    const checkedPlans = getCheckedValues('floor-plan-grid');
    const checkedAreas = getCheckedValues('area-grid');

    filteredProperties = allProperties.filter(p => {
      if (p.rent_man < rentMin || p.rent_man > rentMax) return false;
      if (p.station_distance_min !== null && p.station_distance_min > walkMax) return false;
      if (checkedPlans.length > 0 && !checkedPlans.includes(p.floor_plan_norm || p.floor_plan)) return false;
      if (checkedAreas.length > 0 && !checkedAreas.includes(p.municipality)) return false;

      // 半径フィルター
      if (selectedRadius > 0 && currentLocation) {
        const dist = haversine(currentLocation[0], currentLocation[1], p.latitude, p.longitude);
        if (dist > selectedRadius) return false;
      }

      return true;
    });

    renderMarkers(filteredProperties);
    updateStats();
    updateCountBadge();

    // ヒートマップも再描画
    if (heatmapVisible) {
      heatmapVisible = false;
      toggleHeatmap();
    }
  }

  // ---- 件数バッジ更新 (#3) ----
  function updateCountBadge() {
    const badge = document.getElementById('count-badge');
    const text = document.getElementById('count-badge-text');
    if (badge && text) {
      text.textContent = `${filteredProperties.length}件表示中`;
    }
  }

  // ---- UI初期化 ----
  function initUI() {
    const panel = document.getElementById('filter-panel');
    const overlay = document.getElementById('filter-overlay');
    const btnFilter = document.getElementById('btn-filter');
    const btnApply = document.getElementById('btn-apply');
    const btnReset = document.getElementById('btn-reset');
    const btnHeatmap = document.getElementById('btn-heatmap');
    const fabLocate = document.getElementById('fab-locate');
    const btnFontSize = document.getElementById('btn-font-size');
    const countBadgeReset = document.getElementById('count-badge-reset');
    const btnPoiToggle = document.getElementById('btn-poi-toggle');

    // フィルター開閉
    btnFilter.addEventListener('click', () => togglePanel(true));
    overlay.addEventListener('click', () => togglePanel(false));

    // 適用
    btnApply.addEventListener('click', () => {
      applyFilters();
      togglePanel(false);
    });

    // リセット
    btnReset.addEventListener('click', resetFilters);

    // 件数バッジのリセットボタン (#3)
    if (countBadgeReset) {
      countBadgeReset.addEventListener('click', () => {
        resetFilters();
        togglePanel(false);
      });
    }

    // ヒートマップ
    btnHeatmap.addEventListener('click', toggleHeatmap);

    // 現在地
    fabLocate.addEventListener('click', () => locateUser(true));

    // フォントサイズ切替 (#8)
    if (btnFontSize) {
      btnFontSize.addEventListener('click', cycleFontSize);
    }

    // 周辺施設トグル
    if (btnPoiToggle) {
      btnPoiToggle.classList.add('active');
      btnPoiToggle.addEventListener('click', togglePOI);
    }

    // スライダーのリアルタイムラベル更新
    document.getElementById('rent-min').addEventListener('input', updateRentLabel);
    document.getElementById('rent-max').addEventListener('input', updateRentLabel);
    document.getElementById('walk-max').addEventListener('input', updateWalkLabel);

    // 半径ボタン
    document.querySelectorAll('.radius-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.radius-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedRadius = parseInt(btn.dataset.radius, 10);
        drawRadius(selectedRadius);
      });
    });

    // スワイプ対応 (#5)
    initSwipeGesture(panel);
  }

  // ---- 駅名検索 (#2) ----
  function initStationSearch() {
    const input = document.getElementById('station-search');
    const suggestionsEl = document.getElementById('station-suggestions');
    if (!input || !suggestionsEl) return;

    input.addEventListener('input', () => {
      const query = input.value.trim();
      if (query.length === 0) {
        suggestionsEl.classList.remove('visible');
        suggestionsEl.innerHTML = '';
        return;
      }

      const matched = STATION_LIST.filter(s => s.name.includes(query));
      if (matched.length === 0) {
        suggestionsEl.classList.remove('visible');
        suggestionsEl.innerHTML = '';
        return;
      }

      suggestionsEl.innerHTML = matched.map(s =>
        `<div class="station-suggestion-item" data-lat="${s.lat}" data-lng="${s.lng}">${s.name}駅</div>`
      ).join('');
      suggestionsEl.classList.add('visible');
    });

    input.addEventListener('focus', () => {
      if (input.value.trim().length === 0) {
        // 初期状態では全駅を表示
        suggestionsEl.innerHTML = STATION_LIST.map(s =>
          `<div class="station-suggestion-item" data-lat="${s.lat}" data-lng="${s.lng}">${s.name}駅</div>`
        ).join('');
        suggestionsEl.classList.add('visible');
      }
    });

    suggestionsEl.addEventListener('click', (e) => {
      const item = e.target.closest('.station-suggestion-item');
      if (!item) return;
      const lat = parseFloat(item.dataset.lat);
      const lng = parseFloat(item.dataset.lng);
      input.value = item.textContent.replace('駅', '');
      suggestionsEl.classList.remove('visible');
      map.setView([lat, lng], 15);
    });

    // 外部クリックで閉じる
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.station-search-wrapper')) {
        suggestionsEl.classList.remove('visible');
      }
    });
  }

  function togglePanel(open) {
    const panel = document.getElementById('filter-panel');
    const overlay = document.getElementById('filter-overlay');
    if (open) {
      panel.classList.add('open');
      overlay.classList.add('visible');
    } else {
      panel.classList.remove('open');
      overlay.classList.remove('visible');
    }
  }

  function resetFilters() {
    document.getElementById('rent-min').value = 8;
    document.getElementById('rent-max').value = 25;
    document.getElementById('walk-max').value = 20;
    updateRentLabel();
    updateWalkLabel();

    document.querySelectorAll('#floor-plan-grid input, #area-grid input').forEach(cb => {
      cb.checked = true;
    });

    document.querySelectorAll('.radius-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.radius-btn[data-radius="0"]').classList.add('active');
    selectedRadius = 0;
    drawRadius(0);

    applyFilters();
  }

  function updateRentLabel() {
    const min = document.getElementById('rent-min').value;
    const max = document.getElementById('rent-max').value;
    document.getElementById('rent-range-label').textContent = `${min}万 〜 ${max}万`;
  }

  function updateWalkLabel() {
    const val = document.getElementById('walk-max').value;
    document.getElementById('walk-label').textContent = `${val}分以内`;
  }

  function updateStats() {
    document.getElementById('stats').textContent =
      `${filteredProperties.length} / ${allProperties.length}件`;
  }

  // ---- スワイプジェスチャー (#5) ----
  function initSwipeGesture(panel) {
    let startY = 0;
    let currentY = 0;
    let isDragging = false;

    const handle = panel.querySelector('.filter-handle');

    handle.addEventListener('touchstart', e => {
      startY = e.touches[0].clientY;
      isDragging = true;
      panel.style.transition = 'none';
    }, { passive: true });

    handle.addEventListener('touchmove', e => {
      if (!isDragging) return;
      currentY = e.touches[0].clientY;
      const diff = currentY - startY;
      if (diff > 0) {
        panel.style.transform = `translateY(${diff}px)`;
      }
    }, { passive: true });

    handle.addEventListener('touchend', () => {
      isDragging = false;
      panel.style.transition = '';
      const diff = currentY - startY;
      if (diff > 80) {
        togglePanel(false);
      }
      panel.style.transform = '';
      if (panel.classList.contains('open')) {
        panel.style.transform = 'translateY(0)';
      }
    });

    // タップでも開閉 (#5)
    handle.addEventListener('click', () => {
      if (panel.classList.contains('open')) {
        togglePanel(false);
      }
    });
  }

  // ---- ユーティリティ ----
  function getCheckedValues(gridId) {
    return Array.from(document.querySelectorAll(`#${gridId} input:checked`)).map(cb => cb.value);
  }

  function escapeHtml(str) {
    return S.escapeHtml(str);
  }

  function formatMoney(n) {
    return S.formatMoney(n);
  }

  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ---- Service Worker登録 ----
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(err => {
        console.warn('SW登録失敗:', err);
      });
    }
  }

  // ---- 起動 ----
  document.addEventListener('DOMContentLoaded', init);
})();
