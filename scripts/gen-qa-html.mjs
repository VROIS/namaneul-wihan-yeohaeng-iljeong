// 도시 v3 7 카테고리 → 시각 QA HTML 생성기 (Google Maps Embed + 7 카테고리 카드 그리드)
// 사용법: node scripts/gen-qa-html.mjs <city_slug>
// 입력: scripts/{slug}-{cat}-30-v3.json × 7
// 출력: scripts/{slug}-qa.html
import fs from 'fs';

const CITY_SLUG = process.argv[2] || 'elpaso';
const CITY_NAME = process.argv[3] || 'El Paso';
const CATEGORIES = [
  { key: 'attraction', label: '명소', emoji: '🗿' },
  { key: 'restaurant', label: '맛집', emoji: '🍽️' },
  { key: 'healing', label: '힐링', emoji: '🌿' },
  { key: 'adventure', label: '모험', emoji: '⛰️' },
  { key: 'hotspot', label: '핫스팟', emoji: '✨' },
  { key: 'heritage', label: '역사', emoji: '🏛️' },
  { key: 'shopping', label: '쇼핑', emoji: '🛍️' }
];

// v3 JSON 7 개 로드
const allRows = [];
let cityCenter = { lat: 31.7587, lng: -106.4869 }; // El Paso default

for (const cat of CATEGORIES) {
  const f = `scripts/${CITY_SLUG}-${cat.key}-30-v3.json`;
  if (!fs.existsSync(f)) {
    console.log(`⚠️  Missing: ${f}`);
    cat.rows = [];
    continue;
  }
  const data = JSON.parse(fs.readFileSync(f, 'utf8'));
  cat.rows = data.rows || [];
  for (const r of cat.rows) {
    if (r.latitude && r.longitude) {
      allRows.push({ ...r, _category: cat.key, _emoji: cat.emoji, _label: cat.label });
    }
  }
}

const totalRows = allRows.length;
console.log(`📊 Total rows with coords: ${totalRows}`);

// 카드 HTML
const cardHtml = (r, cat) => {
  const lat = r.latitude?.toFixed?.(6) ?? '—';
  const lng = r.longitude?.toFixed?.(6) ?? '—';
  return `<div class="card">
  <div class="rank">#${r.rank}</div>
  <div class="name-en">${cat.emoji} ${escapeHtml(r.nameEn || '')}</div>
  <div class="name-ko">${escapeHtml(r.nameKo || '')}</div>
  <div class="meta">
    <span class="src ${r.coordSource || ''}">${r.coordSource || '?'}</span>
    <a class="evid" href="${escapeHtml(r.evidenceUrl || '#')}" target="_blank" rel="noopener">출처</a>
    <span class="coord">${lat}, ${lng}</span>
  </div>
  ${r.googleReviewCountNote ? `<div class="note">📝 ${escapeHtml(r.googleReviewCountNote)}</div>` : ''}
</div>`;
};

const escapeHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// pins JS array
const pinsJS = JSON.stringify(allRows.map(r => ({
  lat: r.latitude,
  lng: r.longitude,
  title: r.nameEn,
  cat: r._category,
  emoji: r._emoji,
  rank: r.rank
})));

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${CITY_NAME} BTS 시드 v3 QA</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, "Segoe UI", "Malgun Gothic", sans-serif; background: #f5f5f5; padding: 16px; color: #222; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .meta-top { color: #666; font-size: 12px; margin-bottom: 16px; }
  .summary-bar { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
  .pill { background: white; border-radius: 16px; padding: 6px 12px; font-size: 12px; border: 1px solid #ddd; }
  #map { width: 100%; height: 480px; border-radius: 12px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  .cat-section { background: white; border-radius: 12px; padding: 16px; margin-bottom: 16px; box-shadow: 0 2px 6px rgba(0,0,0,0.06); }
  .cat-header { font-size: 16px; font-weight: 600; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #eee; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
  .card { background: #fafafa; border: 1px solid #e5e5e5; border-radius: 8px; padding: 12px; font-size: 13px; }
  .rank { display: inline-block; background: #d4af37; color: white; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: bold; margin-bottom: 6px; }
  .name-en { font-weight: 600; font-size: 14px; margin-bottom: 2px; }
  .name-ko { color: #555; font-size: 12px; margin-bottom: 8px; }
  .meta { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; font-size: 11px; }
  .src { background: #4caf50; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold; }
  .src.T2 { background: #ff9800; }
  .src.T3 { background: #2196f3; }
  .evid { color: #1976d2; text-decoration: none; }
  .evid:hover { text-decoration: underline; }
  .coord { color: #888; font-family: monospace; font-size: 10px; }
  .note { margin-top: 6px; color: #666; font-size: 11px; }
</style>
</head>
<body>
  <h1>📍 ${CITY_NAME} BTS 시드 v3 QA</h1>
  <p class="meta-top">${new Date().toISOString().slice(0, 10)} · 7 카테고리 통합 · Pass 1+2 검증 완료</p>
  <div class="summary-bar">
    ${CATEGORIES.map(c => `<span class="pill">${c.emoji} ${c.label}: ${c.rows.length}</span>`).join('')}
    <span class="pill">총 ${totalRows} 핀</span>
  </div>

  <div id="map"></div>

  ${CATEGORIES.map(cat => cat.rows.length === 0 ? '' : `
  <div class="cat-section">
    <div class="cat-header">${cat.emoji} ${cat.label} (${cat.key}) — ${cat.rows.length} 곳</div>
    <div class="grid">
      ${cat.rows.map(r => cardHtml(r, cat)).join('')}
    </div>
  </div>`).join('')}

  <script>
    const pins = ${pinsJS};
    const center = { lat: ${cityCenter.lat}, lng: ${cityCenter.lng} };

    // 간단한 OpenStreetMap iframe (key 불필요)
    const minLat = Math.min(...pins.map(p => p.lat)), maxLat = Math.max(...pins.map(p => p.lat));
    const minLng = Math.min(...pins.map(p => p.lng)), maxLng = Math.max(...pins.map(p => p.lng));
    const padding = 0.05;
    const bbox = [minLng - padding, minLat - padding, maxLng + padding, maxLat + padding].join(',');
    const markers = pins.map(p => p.lat + ',' + p.lng).join('|').slice(0, 5000);
    document.getElementById('map').innerHTML = '<iframe width="100%" height="100%" frameborder="0" style="border:0;border-radius:12px" src="https://www.openstreetmap.org/export/embed.html?bbox=' + bbox + '&layer=mapnik" allowfullscreen></iframe>';

    // 콘솔에 핀 dump (디버깅)
    console.log('📍 ' + pins.length + ' pins:', pins);
  </script>
</body>
</html>`;

const outFile = `scripts/${CITY_SLUG}-qa.html`;
fs.writeFileSync(outFile, html);
console.log(`💾 ${outFile} (${html.length} bytes)`);
