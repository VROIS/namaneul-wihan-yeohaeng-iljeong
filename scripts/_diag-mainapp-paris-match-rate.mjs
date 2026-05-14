// 1 회용 검증 = 메인앱 v3 시뮬 결과 (Paris 18 곳) → DB 매칭률 실측
// = 사용자 가설 = "우리 사전 시드가 많은 장소 알고 있다 = 신규 거의 없음"
// = 검증 = 행정주소 > 장소명 (= 사용자 SSOT 매칭 순서) 적용

import fs from 'fs';
import pg from 'pg';

const raw = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    let v = m[2].trim();
    if (/^['"]/.test(v)) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

// 시뮬 결과 로드 = 최종 v3 (2026-05-14)
const sim = JSON.parse(fs.readFileSync('docs/raw/mainapp-paris-v3.json', 'utf-8'));
const places = [];
for (const day of sim.parsed.days) {
  for (const p of day.places) places.push({ ...p, day: day.day });
}
console.log(`═══ 시뮬 결과 = ${places.length} 곳 (Paris, gemini-3-flash-preview) ═══\n`);

// DB 매칭 시도
const c = new pg.Client({
  connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

// Paris city_id
const cityRow = (await c.query("SELECT id FROM cities WHERE LOWER(name_en) = 'paris' OR LOWER(name) = '파리'")).rows[0];
const PARIS_ID = cityRow.id;
console.log(`Paris city_id = ${PARIS_ID}`);

// 기존 행 SELECT = 오늘 archived 모두 제외 (= 운영 시 노출 대상)
const existRows = (await c.query(`
  SELECT id, name_en, name_local, address, latitude::float AS lat, longitude::float AS lng, image_url, google_place_id, seed_category, collection_phase
  FROM place_seed_raw
  WHERE city_id = $1 AND seed_category NOT IN ('bts_venue','bts_army_zone','bts_merch_store')
    AND NOT ('archived-merge-2026-05-14' = ANY(COALESCE(phase_tags, ARRAY[]::text[])))
    AND NOT ('archived-bad-name-2026-05-14' = ANY(COALESCE(phase_tags, ARRAY[]::text[])))
`, [PARIS_ID])).rows;
console.log(`기존 행 = ${existRows.length} (= Paris 비-BTS)\n`);

// 매칭 함수 (= 사용자 SSOT = 1순위 행정주소 = 번지수+도로명+우편번호 3 요소 검증)
const extractAddrParts = (addr) => {
  if (!addr) return null;
  const a = addr.toLowerCase().replace(/[.,;:!?'"()\[\]{}]/g, ' ').replace(/\s+/g, ' ').trim();
  const number = a.match(/^(\d+(?:[-/]\d+)?)/)?.[1] || null;
  const postal = a.match(/\b(\d{4,5})\b/)?.[1] || null;
  const afterNum = a.replace(/^\d+(?:[-/]\d+)?\s+/, '');
  const street = afterNum.split(',')[0].replace(/\d{4,5}.*/, '').trim();
  return { number, postal, street, raw: a };
};
const addrMatch = (a, b) => {
  const pa = extractAddrParts(a);
  const pb = extractAddrParts(b);
  if (!pa || !pb) return false;
  if (pa.raw === pb.raw) return true;
  // 우편번호 = 양쪽 있으면 = 일치 필수 (= 한쪽 없으면 = 비교 skip = 흔치 않음)
  if (pa.postal && pb.postal && pa.postal !== pb.postal) return false;
  // 번지수 = ⚠️ 사용자 SSOT 2026-05-14 = 한쪽만 있으면 매칭 X (= 도로명만 = 잘못 매칭)
  if ((pa.number && !pb.number) || (!pa.number && pb.number)) return false;
  if (pa.number && pb.number && pa.number !== pb.number) return false;
  // 도로명 = 핵심 단어 (≥3자) = 짧은 쪽이 긴 쪽에 모두 포함
  if (!pa.street || !pb.street) return false;
  const aWords = pa.street.split(/\s+/).filter(w => w.length >= 3);
  const bWords = pb.street.split(/\s+/).filter(w => w.length >= 3);
  if (aWords.length === 0 || bWords.length === 0) return false;
  const [shortWords, longStreet] = aWords.length <= bWords.length ? [aWords, pb.street] : [bWords, pa.street];
  if (!shortWords.every(w => longStreet.includes(w))) return false;
  return true;
};
const dKm = (a, b) => {
  const R = 6371, toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

// 단어 단위 매칭 (= 사용자 SSOT 강화)
const wordMatch = (pName, dbName) => {
  if (!pName || !dbName) return false;
  const p = pName.toLowerCase().trim();
  const d = dbName.toLowerCase().trim();
  if (p === d) return true;
  // pName 의 의미 단어 (≥3자) 모두 dbName 에 포함
  const pWords = p.split(/\s+/).filter(w => w.length >= 3);
  if (pWords.length >= 2 && pWords.every(w => d.includes(w))) return true;
  // 반대 = dbName 의 의미 단어 모두 pName 에 포함 (= 약칭 vs 풀명칭)
  const dWords = d.split(/\s+/).filter(w => w.length >= 3);
  if (dWords.length >= 2 && dWords.every(w => p.includes(w))) return true;
  return false;
};

const results = [];
let byAddr = 0, byName = 0, byWord = 0, byCoord = 0, unmatched = 0;
for (const p of places) {
  const nameKey = (p.name_en || '').trim().toLowerCase();
  const nameLocalKey = (p.name_local || '').trim().toLowerCase();
  let match = null, by = null;

  // 1순위 행정주소
  match = existRows.find(e => addrMatch(e.address, p.address));
  if (match) { by = '주소'; byAddr++; }

  // 2순위 장소명 정확 일치
  if (!match) {
    match = existRows.find(e =>
      (nameKey && e.name_en && e.name_en.trim().toLowerCase() === nameKey) ||
      (nameLocalKey && e.name_local && e.name_local.trim().toLowerCase() === nameLocalKey)
    );
    if (match) { by = '이름정확'; byName++; }
  }

  // 2.5 순위 = 단어 단위 매칭 (= "Palais Royal" ↔ "Jardin du Palais-Royal")
  if (!match) {
    match = existRows.find(e =>
      wordMatch(p.name_en, e.name_en) ||
      wordMatch(p.name_en, e.name_local) ||
      wordMatch(p.name_local, e.name_en) ||
      wordMatch(p.name_local, e.name_local)
    );
    if (match) { by = '단어'; byWord++; }
  }

  // 3순위 좌표 10m (= 도심 밀집 = 100m 너무 넓음 = 사용자 SSOT 2026-05-14)
  if (!match && p.lat && p.lng) {
    match = existRows.find(e => e.lat != null && e.lng != null && dKm({lat: e.lat, lng: e.lng}, {lat: p.lat, lng: p.lng}) < 0.01);
    if (match) { by = '좌표'; byCoord++; }
  }

  if (!match) { by = '미매칭'; unmatched++; }

  results.push({
    name_en: p.name_en,
    name_ko: p.name_ko,
    day: p.day,
    matched_by: by,
    db_name: match?.name_en || null,
    db_id: match?.id || null,
    has_image: match?.image_url ? 'YES' : 'NO',
    has_pid: match?.google_place_id ? 'YES' : 'NO',
  });
}

// 표 출력
console.log('═══ 곳별 매칭 결과 ═══');
console.table(results);

// 요약
console.log('\n═══ 매칭률 요약 ═══');
console.log(`총 ${places.length} 곳:`);
console.log(`  1순위 행정주소: ${byAddr} (${(byAddr*100/places.length).toFixed(0)}%)`);
console.log(`  2순위 장소명 정확: ${byName} (${(byName*100/places.length).toFixed(0)}%)`);
console.log(`  2.5 순위 단어 단위: ${byWord} (${(byWord*100/places.length).toFixed(0)}%)`);
console.log(`  3순위 좌표: ${byCoord} (${(byCoord*100/places.length).toFixed(0)}%)`);
console.log(`  미매칭: ${unmatched} (${(unmatched*100/places.length).toFixed(0)}%) ← TS+PM 호출 필요`);

const totalMatched = byAddr + byName + byWord + byCoord;
console.log(`\n매칭 합계 = ${totalMatched}/${places.length} = ${(totalMatched*100/places.length).toFixed(0)}%`);
console.log(`TS+PM 호출 수 = ${unmatched} × 2 호출 (TS + PM) = ${unmatched * 2}`);
console.log(`예상 시간 (병렬) = ${(unmatched * 1.5).toFixed(1)} 초 (= 미매칭당 1.5초 가정)`);

// 미매칭 행 = 어떤 곳?
if (unmatched > 0) {
  console.log('\n═══ 미매칭 행 = TS+PM 대상 ═══');
  for (const r of results.filter(x => x.matched_by === '미매칭')) {
    console.log(`  - Day ${r.day}: ${r.name_en} (${r.name_ko})`);
  }
}

await c.end();
