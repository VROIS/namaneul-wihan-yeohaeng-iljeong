// ⚠️ 수정금지(승인필요) 2026-08-15 사장님 승인 = WebView HTML 은 React 트리 밖이라 i18n 싱글턴을
import i18n from "@/lib/i18n";

export type ItinMapPlace = {
  id: string;
  name: string;
  seedCategory: string | null;
  lat: number | null;
  lng: number | null;
  slot: number; // 슬롯 번호 (1-base, 마커 라벨)
};

export type ItinMapStart = {
  lat: number;
  lng: number;
  label: string; // "출발: 숙소명" 또는 "출발: 도심"
};

// ⚠️ 수정금지(승인필요) 2026-08-13 사장님 승인 = 지도 배경(구글 SDK 자체 도로명·지명) 다국어 대응.
export const ITINERARY_MAP_HTML = (
  apiKey: string,
  language: string = "ko",
): string => `<!DOCTYPE html>
<html lang="${language}"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>Itinerary Map</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #map { width: 100%; height: 100%; }
body { background: #f8f7fb; font-family: -apple-system, "Segoe UI", "Malgun Gothic", sans-serif; }
#loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #888; font-size: 13px; z-index: 1; pointer-events: none; }
#loading.hide { display: none; }
</style>
</head><body>
<div id="loading">${i18n.t("place.mapLoading", { lng: language })}</div>
<div id="map"></div>
<script>
(function() {
  const COLORS = { start:'#2563eb', heritage:'#92400e', hotspot:'#eab308', attraction:'#f97316', adventure:'#dc2626', healing:'#16a34a', shopping:'#ec4899', restaurant:'#0891b2', culture:'#92400e' };
  const LUCIDE = {
    start: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
    heritage: '<path d="M10 18v-7"/><path d="M11.12 2.198a2 2 0 0 1 1.76.006l7.866 3.847c.476.233.31.949-.22.949H3.474c-.53 0-.695-.716-.22-.949z"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M3 22h18"/><path d="M6 18v-7"/>',
    hotspot: '<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/>',
    attraction: '<circle cx="12" cy="12" r="2"/><path d="M12 2v4"/><path d="m6.8 15-3.5 2"/><path d="m20.7 7-3.5 2"/><path d="M6.8 9 3.3 7"/><path d="m20.7 17-3.5-2"/><path d="m9 22 3-8 3 8"/><path d="M8 22h8"/><path d="M18 18.7a9 9 0 1 0-12 0"/>',
    adventure: '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>',
    healing: '<path d="M12 5a3 3 0 1 1 3 3m-3-3a3 3 0 1 0-3 3m3-3v1M9 8a3 3 0 1 0 3 3M9 8h1m5 0a3 3 0 1 1-3 3m3-3h-1m-2 3v-1"/><circle cx="12" cy="8" r="2"/><path d="M12 10v12"/><path d="M12 22c4.2 0 7-1.667 7-5-4.2 0-7 1.667-7 5Z"/><path d="M12 22c-4.2 0-7-1.667-7-5 4.2 0 7 1.667 7 5Z"/>',
    shopping: '<path d="M16 10a4 4 0 0 1-8 0"/><path d="M3.103 6.034h17.794"/><path d="M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z"/>',
    restaurant: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
    culture: '<path d="M10 18v-7"/><path d="M11.12 2.198a2 2 0 0 1 1.76.006l7.866 3.847c.476.233.31.949-.22.949H3.474c-.53 0-.695-.716-.22-.949z"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M3 22h18"/><path d="M6 18v-7"/>',
  };

  let map = null;
  let startMarker = null;
  let startData = null;
  const markers = {};   // id -> google.maps.Marker
  let placesById = {};
  let selectedId = null;   // 🗺️ 2026-06-28 = 현재 선택 슬롯 id (= 슬롯 본문 터치 → focusSlot)

  function makeIcon(cat, isStart, slot, isSelected) {
    const color = COLORS[cat] || '#666';
    const path = LUCIDE[cat] || '<circle cx="12" cy="12" r="6"/>';
    const size = isStart ? 50 : (isSelected ? 54 : 40);
    const iconSize = isStart ? 26 : (isSelected ? 28 : 20);
    const off = (size - iconSize) / 2;
    const sc = iconSize / 24;
    let badge = '';
    if (!isStart && slot) {
      badge = '<g transform="translate(' + (size - 9) + ',9)"><circle r="8" fill="white" stroke="' + color + '" stroke-width="1.5"/><text x="0" y="3" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="' + color + '">' + slot + '</text></g>';
    }
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
      '<circle cx="' + (size / 2) + '" cy="' + (size / 2) + '" r="' + (size / 2 - 2) + '" fill="' + color + '" stroke="white" stroke-width="3"/>' +
      '<g transform="translate(' + off + ',' + off + ') scale(' + sc + ')" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + path + '</g>' +
      badge +
      '</svg>';
    return {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
      scaledSize: new google.maps.Size(size, size),
      anchor: new google.maps.Point(size / 2, size / 2)
    };
  }

  function postRN(payload) {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      return;
    }
    if (window.parent && window.parent !== window) {
      try { window.parent.postMessage(JSON.stringify(payload), '*'); } catch (e) {}
    }
  }

  function renderStart() {
    if (!map || !startData || startData.lat == null || startData.lng == null) return;
    if (startMarker) startMarker.setMap(null);
    startMarker = new google.maps.Marker({
      position: { lat: Number(startData.lat), lng: Number(startData.lng) },
      map,
      icon: makeIcon('start', true, null, false),
      title: startData.label || '${i18n.t("trip.departure", { lng: language })}',
      zIndex: 999,
    });
  }

  function fitBounds() {
    if (!map) return;
    const b = new google.maps.LatLngBounds();
    let count = 0;
    if (startMarker) { b.extend(startMarker.getPosition()); count++; }
    for (const m of Object.values(markers)) { b.extend(m.getPosition()); count++; }
    if (count === 0) return;
    if (count === 1) { map.setCenter(b.getCenter()); map.setZoom(13); return; }
    map.fitBounds(b, { top: 50, right: 50, bottom: 50, left: 50 });
  }

  window.syncItinerary = function(payload) {
    placesById = {};
    for (const p of payload.places || []) placesById[p.id] = p;
    startData = payload.start || null;
    renderStart();
    for (const id of Object.keys(markers)) { markers[id].setMap(null); delete markers[id]; }
    for (const p of payload.places || []) {
      if (p.lat == null || p.lng == null) continue;
      const m = new google.maps.Marker({
        position: { lat: Number(p.lat), lng: Number(p.lng) },
        map,
        icon: makeIcon(p.seedCategory || 'attraction', false, p.slot, p.id === selectedId),
        title: p.name || '',
      });
      m.addListener('click', (function(pid) { return function() { postRN({ type: 'marker', id: pid }); }; })(p.id));
      markers[p.id] = m;
    }
    fitBounds();
  };

  window.focusSlot = function(id) {
    if (selectedId && selectedId !== id && markers[selectedId]) {
      const prev = placesById[selectedId];
      if (prev) markers[selectedId].setIcon(makeIcon(prev.seedCategory || 'attraction', false, prev.slot, false));
    }
    selectedId = id;
    if (!id || !markers[id]) return;
    const cur = placesById[id];
    if (cur) markers[id].setIcon(makeIcon(cur.seedCategory || 'attraction', false, cur.slot, true));
    map.panTo(markers[id].getPosition());
    if (map.getZoom() < 14) map.setZoom(15);
  };

  window.initItinMap = function() {
    map = new google.maps.Map(document.getElementById('map'), {
      center: { lat: 48.85, lng: 2.35 },
      zoom: 11,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: 'greedy',
      clickableIcons: false,
      styles: [
        { elementType: 'geometry', stylers: [{ color: '#f8f7fb' }] },
        { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
        { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
        { featureType: 'transit', stylers: [{ visibility: 'off' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#e9e6f0' }] },
        { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#cfe8ff' }] },
        { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#dcfce7' }] },
      ],
    });
    var loading = document.getElementById('loading');
    if (loading) loading.classList.add('hide');
    postRN({ type: 'ready' });
  };

  var s = document.createElement('script');
  s.src = 'https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initItinMap&v=quarterly&language=${language}';
  s.async = true;
  s.onerror = function() { postRN({ type: 'error', message: 'SDK load failed' }); };
  document.body.appendChild(s);
})();
</script>
</body></html>`;
