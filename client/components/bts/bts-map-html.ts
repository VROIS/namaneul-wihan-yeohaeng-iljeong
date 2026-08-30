// ⚠️ 수정금지(승인필요) — 2026-05-06 BTS Screen 4 카트→지도 WebView HTML 템플릿
// ⚠️ 수정금지(승인필요) 2026-08-15 사장님 승인 = 로딩 문구 다국어(ITINERARY_MAP_HTML과 같은 패턴 §16).
import i18n from "@/lib/i18n";

export type BTSMapPlace = {
  id: number;
  nameEn: string;
  nameKo: string | null;
  seedCategory: string | null;
  latitude: number | null;
  longitude: number | null;
};

export const BTS_MAP_HTML = (
  apiKey: string,
  language: string = "ko",
): string => `<!DOCTYPE html>
<html lang="${language}"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>BTS Place Map</title>
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
  const COLORS = { bts_venue:'#9333ea', heritage:'#92400e', hotspot:'#eab308', attraction:'#f97316', adventure:'#dc2626', healing:'#16a34a', shopping:'#ec4899', restaurant:'#0891b2' };
  const LUCIDE = {
    bts_venue: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
    heritage: '<path d="M10 18v-7"/><path d="M11.12 2.198a2 2 0 0 1 1.76.006l7.866 3.847c.476.233.31.949-.22.949H3.474c-.53 0-.695-.716-.22-.949z"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M3 22h18"/><path d="M6 18v-7"/>',
    hotspot: '<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/>',
    attraction: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',
    adventure: '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>',
    healing: '<path d="M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z"/><path d="M7 16v6"/><path d="M13 19v3"/><path d="M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-1.4 1.5"/>',
    shopping: '<path d="M16 10a4 4 0 0 1-8 0"/><path d="M3.103 6.034h17.794"/><path d="M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z"/>',
    restaurant: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  };

  let map = null;
  let venueMarker = null;
  let venueData = null;
  let venueActive = false;
  const markers = {};   // id -> google.maps.Marker (일반 마커만)
  let placesById = {};  // id -> place object

  function makeIcon(cat, isVenue, isActive) {
    const color = COLORS[cat] || '#666';
    const path = LUCIDE[cat] || '<circle cx="12" cy="12" r="6"/>';
    const size = isVenue ? 56 : 40;
    const iconSize = isVenue ? 28 : 20;
    const off = (size - iconSize) / 2;
    const sc = iconSize / 24;
    let label = '';
    if (isVenue && isActive) {
      label = '<g transform="translate(' + (size / 2) + ',' + (size - 8) + ')"><rect x="-13" y="-7" width="26" height="13" rx="3" fill="white" stroke="' + color + '" stroke-width="1.5"/><text x="0" y="3" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="' + color + '">BTS</text></g>';
    }
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
      '<circle cx="' + (size / 2) + '" cy="' + (size / 2) + '" r="' + (size / 2 - 2) + '" fill="' + color + '" stroke="white" stroke-width="3"/>' +
      '<g transform="translate(' + off + ',' + off + ') scale(' + sc + ')" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + path + '</g>' +
      label +
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

  function renderVenue() {
    if (!map || !venueData || venueData.latitude == null || venueData.longitude == null) return;
    if (venueMarker) venueMarker.setMap(null);
    venueMarker = new google.maps.Marker({
      position: { lat: Number(venueData.latitude), lng: Number(venueData.longitude) },
      map,
      icon: makeIcon(venueData.seedCategory || 'bts_venue', true, venueActive),
      title: venueData.nameEn || '',
      zIndex: 999,
    });
    venueMarker.addListener('click', () => postRN({ type: 'marker', id: venueData.id }));
  }

  function fitBounds() {
    if (!map) return;
    const b = new google.maps.LatLngBounds();
    let count = 0;
    if (venueMarker) { b.extend(venueMarker.getPosition()); count++; }
    for (const m of Object.values(markers)) { b.extend(m.getPosition()); count++; }
    if (count === 0) return;
    if (count === 1) {
      map.setCenter(b.getCenter());
      map.setZoom(13);
      return;
    }
    map.fitBounds(b, { top: 60, right: 60, bottom: 60, left: 60 });
  }

  window.syncPlaces = function(payload) {
    placesById = {};
    for (const p of payload.places || []) placesById[p.id] = p;
    venueData = payload.venue || null;
    renderVenue();
    syncMarkers(payload.selectedIds || []);
  };

  window.syncMarkers = function(selectedIds) {
    const want = new Set(selectedIds || []);
    for (const id of Object.keys(markers)) {
      if (!want.has(Number(id))) {
        markers[id].setMap(null);
        delete markers[id];
      }
    }
    for (const id of selectedIds || []) {
      if (markers[id]) continue;
      const p = placesById[id];
      if (!p || p.latitude == null || p.longitude == null) continue;
      if (venueData && p.id === venueData.id) continue;
      const m = new google.maps.Marker({
        position: { lat: Number(p.latitude), lng: Number(p.longitude) },
        map,
        icon: makeIcon(p.seedCategory || 'attraction', false, false),
        title: p.nameEn || '',
      });
      m.addListener('click', () => postRN({ type: 'marker', id: p.id }));
      markers[id] = m;
    }
    const nextActive = (selectedIds || []).length >= 1;
    if (nextActive !== venueActive) {
      venueActive = nextActive;
      renderVenue();
    }
    fitBounds();
  };

  window.initBTSMap = function() {
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
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#e9d5ff' }] },
        { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#dcfce7' }] },
      ],
    });
    document.getElementById('loading').classList.add('hide');
    postRN({ type: 'ready' });
  };

  const s = document.createElement('script');
  s.src = 'https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initBTSMap&v=quarterly';
  s.async = true;
  s.onerror = () => postRN({ type: 'error', message: 'Google Maps SDK load failed' });
  document.body.appendChild(s);
})();
</script>
</body></html>`;
