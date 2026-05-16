// 1 회용 = docs/raw/paris.json (= 시드 응답) vs DB 비교
// 사용자 통찰 2026-05-14: "시드 = JSON 봤다, INSERT 안 한 AI 허위 보고 의심"
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

const j = JSON.parse(fs.readFileSync('docs/raw/paris.json', 'utf-8'));

const c = new pg.Client({
  connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

// DB 전체 Paris (= 모든 phase, BTS 제외)
const dbAll = (await c.query(`
  SELECT id, seed_category, name_en, name_ko, collection_phase, rank,
    phase_tags, category_tags
  FROM place_seed_raw
  WHERE city_id = 19 AND seed_category NOT IN ('bts_venue','bts_army_zone','bts_merch_store')
`)).rows;

console.log('═══ docs/raw/paris.json = 7 카테고리 × 20 = 140 곳 ═══');
console.log('═══ DB Paris 전체 (= BTS 제외) = ' + dbAll.length + ' 행 ═══\n');

// 정규화 함수 = LOWER + trim + 공백 제거
const norm = s => (s || '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '').trim();

// DB 인덱스: name_en (정규화) + seed_category → 행
const dbByName = new Map();
for (const r of dbAll) {
  const key = norm(r.name_en);
  if (!key) continue;
  if (!dbByName.has(key)) dbByName.set(key, []);
  dbByName.get(key).push(r);
}

console.log('═══ JSON 카테고리별 = DB 매칭 분석 ═══\n');

const cats = ['heritage', 'hotspot', 'attraction', 'adventure', 'healing', 'shopping', 'restaurant'];
for (const cat of cats) {
  const jsonPlaces = (j.results || {})[cat] || [];
  if (jsonPlaces.length === 0) continue;

  let matched = 0;
  let archivedBadName = 0;
  let archivedOld = 0;
  let activeGemini3 = 0;
  let activeOther = 0;
  let notFound = 0;
  const notFoundList = [];

  for (const p of jsonPlaces) {
    const key = norm(p.name_en);
    const dbRows = dbByName.get(key) || [];
    if (dbRows.length === 0) {
      notFound++;
      notFoundList.push(p.name_en);
      continue;
    }
    matched++;
    // 가장 우선 = 활성 gemini3
    const isBad = dbRows.some(r => r.phase_tags && r.phase_tags.includes('archived-bad-name-2026-05-14'));
    const isOld = dbRows.some(r => r.phase_tags && r.phase_tags.includes('archived-2026-05'));
    const hasGemini3 = dbRows.some(r => r.collection_phase === 'gemini3-2026-05' && !isBad && !isOld);

    if (hasGemini3) activeGemini3++;
    else if (isBad) archivedBadName++;
    else if (isOld) archivedOld++;
    else activeOther++;
  }

  console.log(`[${cat}] JSON = ${jsonPlaces.length} 곳`);
  console.log(`  ✅ DB 활성 gemini3-2026-05: ${activeGemini3}`);
  console.log(`  ⚠️ DB 활성 다른 phase:      ${activeOther}`);
  console.log(`  🗑️ archived-bad-name:        ${archivedBadName}`);
  console.log(`  🗑️ archived-2026-05 (옛):    ${archivedOld}`);
  console.log(`  ❌ DB 미발견 (= INSERT 실패): ${notFound}`);
  if (notFoundList.length > 0 && notFoundList.length <= 10) {
    console.log(`     누락 이름: ${notFoundList.join(' / ')}`);
  } else if (notFoundList.length > 10) {
    console.log(`     누락 ${notFoundList.length} 곳 (상위 5): ${notFoundList.slice(0, 5).join(' / ')} ...`);
  }
  console.log('');
}

// 합계
let totalJson = 0;
let totalMatched = 0;
let totalNotFound = 0;
for (const cat of cats) {
  const list = (j.results || {})[cat] || [];
  totalJson += list.length;
  for (const p of list) {
    if (dbByName.has(norm(p.name_en))) totalMatched++;
    else totalNotFound++;
  }
}
console.log('═══ 합계 ═══');
console.log('  JSON 전체:        ' + totalJson + ' 곳');
console.log('  DB 매칭됨:        ' + totalMatched + ' 곳');
console.log('  DB 미발견 (= 사고): ' + totalNotFound + ' 곳');
console.log('  매칭률:           ' + Math.round(totalMatched * 100 / totalJson) + '%');

await c.end();
