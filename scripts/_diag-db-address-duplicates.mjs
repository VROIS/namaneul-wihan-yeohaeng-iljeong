// 1 회용 진단 = DB 통합 = 같은 주소 다른 행 발견 (= 9 도시 전체)
// = 사용자 SSOT 2026-05-14 = DB 통합 우선 = 외부 호출 최후
// = 알고리즘 = 번지수 + 우편번호 + 도로명 핵심 단어 모두 일치 = 같은 장소

import pg from 'pg';
import fs from 'fs';

const raw = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    let v = m[2].trim();
    if (/^['"]/.test(v)) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

const c = new pg.Client({
  connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

// 9 핵심 도시
const cities = (await c.query(`
  SELECT id, name_en
  FROM cities
  WHERE LOWER(name_en) IN ('paris','brussels','busan','las vegas','london','madrid','mexico city','munich','stanford')
  ORDER BY name_en
`)).rows;

// 주소 추출 (= 매칭 알고리즘 동일)
const extractAddrParts = (addr) => {
  if (!addr) return null;
  const a = addr.toLowerCase().replace(/[.,;:!?'"()\[\]{}]/g, ' ').replace(/\s+/g, ' ').trim();
  const number = a.match(/^(\d+(?:[-/]\d+)?)/)?.[1] || null;
  const postal = a.match(/\b(\d{4,5})\b/)?.[1] || null;
  const afterNum = a.replace(/^\d+(?:[-/]\d+)?\s+/, '');
  const street = afterNum.split(',')[0].replace(/\d{4,5}.*/, '').trim();
  return { number, postal, street, raw: a };
};

// ⭐ STRICT SSOT (2026-05-14 사용자 = 가장 엄격)
// = 풀 주소 = 양쪽 번지수 모두 있고 일치 필수
// = 이름 = 도로명/도시명 접두사 제거 후 핵심 2+ 단어 일치 + 첫 단어 일치
// = 좌표 = 5m (= 같은 출입구만)

const STOP_STREET = new Set([
  'rue', 'av', 'avenue', 'bd', 'blvd', 'boulevard', 'place', 'pl', 'square', 'sq',
  'street', 'st', 'road', 'rd', 'lane', 'ln', 'drive', 'dr', 'court', 'ct',
  'calle', 'plaza', 'paseo', 'pza', 'av',
  'strasse', 'straße', 'str', 'platz',
  'via', 'piazza', 'corso',
  'quai', 'pont', 'cours', 'allée', 'allee', 'chemin', 'passage', 'sentier',
  'esplanade', 'promenade', 'jardin', 'parc', 'park', 'garden',
  'de', 'la', 'le', 'du', 'des', 'di', 'del', 'das', 'der',
  'and', 'the', 'an', 'a',
]);
const STOP_CITY = new Set([
  'paris', 'london', 'madrid', 'munich', 'munchen', 'münchen',
  'brussels', 'busan', 'stanford', 'mexico', 'city', 'vegas', 'las',
  'palo', 'alto', 'francisco', 'berlin', 'rome', 'roma', 'florence',
  'france', 'germany', 'spain', 'italy', 'uk', 'usa', 'cdmx',
]);

const addrMatch = (a, b) => {
  const pa = extractAddrParts(a);
  const pb = extractAddrParts(b);
  if (!pa || !pb) return false;
  if (pa.raw === pb.raw) return true;
  // STRICT = 양쪽 번지수 + 우편번호 모두 있어야
  if (!pa.number || !pb.number) return false;
  if (pa.number !== pb.number) return false;
  if (!pa.postal || !pb.postal) return false;
  if (pa.postal !== pb.postal) return false;
  if (!pa.street || !pb.street) return false;
  // 도로명 = 도로 접두사 제거 후 핵심 단어 비교
  const aCore = pa.street.split(/\s+/).filter(w => w.length >= 3 && !STOP_STREET.has(w));
  const bCore = pb.street.split(/\s+/).filter(w => w.length >= 3 && !STOP_STREET.has(w));
  if (aCore.length === 0 || bCore.length === 0) return false;
  // 한 쪽이 다른 쪽 핵심 단어 모두 포함
  if (aCore.length <= bCore.length) {
    return aCore.every(w => bCore.includes(w));
  } else {
    return bCore.every(w => aCore.includes(w));
  }
};

// 원어명 STRICT 매칭
const nameMatch = (a, b) => {
  if (!a || !b) return false;
  const na = a.toLowerCase().trim();
  const nb = b.toLowerCase().trim();
  if (na === nb) return true;
  // 도시명/일반어 제거 후 핵심 단어
  const aCore = na.split(/[\s\-]+/).filter(w => w.length >= 3 && !STOP_CITY.has(w) && !STOP_STREET.has(w));
  const bCore = nb.split(/[\s\-]+/).filter(w => w.length >= 3 && !STOP_CITY.has(w) && !STOP_STREET.has(w));
  if (aCore.length < 2 || bCore.length < 2) return false;
  // 첫 단어 = 정확히 일치 (= "Palais Royal" ↔ "Jardin du Palais-Royal" = 첫 단어 다름 = ⚠️ 케이스)
  // 그래서 = 핵심 단어 2+ 모두 일치 (= 짧은 쪽이 긴 쪽에 모두)
  if (aCore.length <= bCore.length) {
    return aCore.every(w => bCore.includes(w));
  } else {
    return bCore.every(w => aCore.includes(w));
  }
};

// 좌표 5m STRICT
const coordMatch5m = (a, b) => {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return false;
  const R = 6371, toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2;
  const km = 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  return km < 0.005;
};

// ⭐ 사용자 SSOT 2026-05-14 = AND 조건 (= 주소 ✓ AND 이름 ✓ = 같은 장소)
// = 목표: 같은 장소 2-3 행 중복 방지 + pid 있는 행 살리기
// = 안전 우선: 잘못된 병합 = 데이터 손실 = 0 보장
const isSamePlace = (a, b) => {
  const sameAddr = addrMatch(a.address, b.address);
  const sameName =
    nameMatch(a.name_en, b.name_en) ||
    nameMatch(a.name_local, b.name_local) ||
    nameMatch(a.name_en, b.name_local) ||
    nameMatch(a.name_local, b.name_en);
  return sameAddr && sameName;
};

const totals = { dup_groups: 0, dup_rows: 0, cities_with_dups: 0 };
const allGroups = {};

for (const city of cities) {
  const rows = (await c.query(`
    SELECT id, name_en, name_local, name_ko, address, latitude::float AS lat, longitude::float AS lng, google_place_id, image_url, seed_category, collection_phase
    FROM place_seed_raw
    WHERE city_id = $1
      AND seed_category NOT IN ('bts_venue','bts_army_zone','bts_merch_store')
    ORDER BY id
  `, [city.id])).rows;

  // 그룹 빌드 = 3 OR 조건 (= 사용자 SSOT)
  const groups = [];
  const seen = new Set();
  for (let i = 0; i < rows.length; i++) {
    if (seen.has(i)) continue;
    const group = [rows[i]];
    seen.add(i);
    for (let j = i + 1; j < rows.length; j++) {
      if (seen.has(j)) continue;
      if (isSamePlace(rows[i], rows[j])) {
        group.push(rows[j]);
        seen.add(j);
      }
    }
    if (group.length >= 2) groups.push(group);
  }

  console.log(`\n═══ ${city.name_en} (${rows.length} 행) ═══`);
  if (groups.length === 0) {
    console.log('= 중복 0 (= 깨끗)');
    continue;
  }
  totals.cities_with_dups++;
  totals.dup_groups += groups.length;
  for (const g of groups) totals.dup_rows += g.length;
  console.log(`= 중복 그룹 ${groups.length} 개 (= 총 ${groups.reduce((s, g) => s + g.length, 0)} 행)`);

  // 그룹별 상세 (= 처음 3 그룹만) + 대표 행 (= pid 있는 행 우선)
  for (const g of groups.slice(0, 3)) {
    // 대표 행 = pid 있는 행 우선 → 둘 다 있으면 첫 번째 → 둘 다 없으면 첫 번째
    const rep = g.find(r => r.google_place_id) || g[0];
    console.log('\n  [그룹] 대표 = id=' + rep.id + ' (pid=' + (rep.google_place_id ? '✓' : '✗') + ')');
    for (const r of g) {
      const isRep = r.id === rep.id ? '★' : ' ';
      console.log(`    ${isRep} id=${r.id} ${r.name_en} (${r.name_ko || '?'}) | ${r.address?.slice(0, 50)} | pid=${r.google_place_id ? '✓' : '✗'} | img=${r.image_url ? '✓' : '✗'}`);
    }
  }
  if (groups.length > 3) console.log(`  ... 외 ${groups.length - 3} 그룹`);
  allGroups[city.name_en] = groups;
}

console.log('\n\n═══ 전체 요약 ═══');
console.log(`도시 = ${cities.length} (= 9 핵심)`);
console.log(`중복 그룹 = ${totals.dup_groups}`);
console.log(`중복 행 = ${totals.dup_rows}`);
console.log(`병합 후 = ${totals.dup_rows - totals.dup_groups} 행 감소 예상 (= 그룹당 1 행만 남김)`);

// 저장
fs.mkdirSync('backups', { recursive: true });
fs.writeFileSync('backups/db-address-duplicates.json', JSON.stringify(allGroups, null, 2));
console.log('\n💾 저장: backups/db-address-duplicates.json (= 그룹 raw)');

await c.end();
