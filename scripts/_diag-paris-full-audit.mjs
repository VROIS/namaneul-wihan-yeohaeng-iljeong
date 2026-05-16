// 1 회용 = 파리 (city_id=19) 전체 장소 = 카테고리별 4 상태 면밀 조사
// 사용자 명시 지시 2026-05-14:
//   1) 카테고리별 전체 개수
//   2) 이미지 없는 곳 (= Google + WK 둘 다 없음)
//   3) PID 있는 곳
//   4) 10 가지 요소 모두 채운 곳

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

// 활성 행만 (= BTS 고정 X, 사고 archive X)
// = collection_phase 가 v3 시드 또는 auto-learn 인 행 (= archived-2026-05 = 자동 부여 = 무시)
const ACTIVE = `
  seed_category NOT IN ('bts_venue','bts_army_zone','bts_merch_store')
  AND NOT ('archived-merge-2026-05-14' = ANY(COALESCE(phase_tags, ARRAY[]::text[])))
  AND NOT ('archived-bad-name-2026-05-14' = ANY(COALESCE(phase_tags, ARRAY[]::text[])))
  AND collection_phase IN ('gemini3-2026-05', 'auto-learn-2026-05')
`;

// ─── 1. 카테고리별 전체 + 4 상태 ───
const r = (await c.query(`
  SELECT
    seed_category AS cat,
    COUNT(*)::int AS total,
    -- 이미지 출처 구분 (= URL 패턴)
    COUNT(*) FILTER (WHERE
      (image_url IS NULL OR image_url = '')
    )::int AS no_image_at_all,
    COUNT(*) FILTER (WHERE
      image_url ILIKE '%wikipedia%' OR image_url ILIKE '%wikimedia%' OR image_url ILIKE '%upload.wikimedia%'
    )::int AS has_wk,
    COUNT(*) FILTER (WHERE
      image_url ILIKE '%place-images%' OR image_url ILIKE '%storage/v1/object%'
    )::int AS has_google_storage,
    COUNT(*) FILTER (WHERE
      image_url IS NOT NULL AND image_url <> ''
      AND image_url NOT ILIKE '%wikipedia%'
      AND image_url NOT ILIKE '%wikimedia%'
      AND image_url NOT ILIKE '%place-images%'
      AND image_url NOT ILIKE '%storage/v1/object%'
    )::int AS has_other,
    -- pid 있는 곳
    COUNT(*) FILTER (WHERE google_place_id IS NOT NULL AND google_place_id <> '')::int AS has_pid,
    -- 가격 있는 곳 (= price_eur > 0)
    COUNT(*) FILTER (WHERE price_eur IS NOT NULL AND price_eur > 0)::int AS has_price,
    COUNT(*) FILTER (WHERE price_eur = 0)::int AS price_zero,
    COUNT(*) FILTER (WHERE price_eur IS NULL)::int AS price_null,
    -- 10 가지 요소 모두 채운 곳
    COUNT(*) FILTER (WHERE
      name_en IS NOT NULL AND name_en <> ''
      AND name_ko IS NOT NULL AND name_ko <> ''
      AND name_local IS NOT NULL AND name_local <> ''
      AND address IS NOT NULL AND address <> ''
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND google_place_id IS NOT NULL AND google_place_id <> ''
      AND image_url IS NOT NULL AND image_url <> ''
      AND summary_ko IS NOT NULL AND summary_ko <> ''
      AND editorial_summary IS NOT NULL AND editorial_summary <> ''
    )::int AS complete_10
  FROM place_seed_raw
  WHERE city_id = 19 AND ${ACTIVE}
  GROUP BY seed_category
  ORDER BY total DESC
`)).rows;

const total = r.reduce((s, x) => s + x.total, 0);
const sumComplete = r.reduce((s, x) => s + x.complete_10, 0);
const sumNoImg = r.reduce((s, x) => s + x.no_image_at_all, 0);
const sumPid = r.reduce((s, x) => s + x.has_pid, 0);
const sumPrice = r.reduce((s, x) => s + x.has_price, 0);
const sumPriceZero = r.reduce((s, x) => s + x.price_zero, 0);
const sumPriceNull = r.reduce((s, x) => s + x.price_null, 0);
const sumWk = r.reduce((s, x) => s + x.has_wk, 0);
const sumGoog = r.reduce((s, x) => s + x.has_google_storage, 0);
const sumOther = r.reduce((s, x) => s + x.has_other, 0);

console.log('═══ Paris (city_id=19) 활성 행 = ' + total + ' 곳 ═══');
console.log('(= BTS 고정 + archived 제외)\n');

console.log('═══ 1. 카테고리별 전체 ═══');
console.table(r.map(x => ({
  카테고리: x.cat,
  전체: x.total,
  '10가지_완성': x.complete_10 + ' (' + Math.round(x.complete_10*100/x.total) + '%)',
  PID_보유: x.has_pid + ' (' + Math.round(x.has_pid*100/x.total) + '%)',
  '가격_보유': x.has_price + ' (' + Math.round(x.has_price*100/x.total) + '%)',
  '이미지_없음': x.no_image_at_all + ' (' + Math.round(x.no_image_at_all*100/x.total) + '%)',
})));

console.log('\n═══ 1-b. 가격 (price_eur) 상세 ═══');
console.table(r.map(x => ({
  카테고리: x.cat,
  전체: x.total,
  '가격>0': x.has_price,
  '가격=0(무료)': x.price_zero,
  'NULL': x.price_null,
})));

console.log('\n═══ 2. 이미지 출처 분포 ═══');
console.table(r.map(x => ({
  카테고리: x.cat,
  전체: x.total,
  WK: x.has_wk,
  'Google/Storage': x.has_google_storage,
  기타: x.has_other,
  '없음(둘다X)': x.no_image_at_all,
})));

console.log('\n═══ 3. 합계 ═══');
console.log('  전체 활성 행:         ' + total);
console.log('  10 가지 모두 채움:    ' + sumComplete + ' (' + Math.round(sumComplete*100/total) + '%)');
console.log('  PID 보유:             ' + sumPid + ' (' + Math.round(sumPid*100/total) + '%)');
console.log('  가격(price_eur>0):    ' + sumPrice + ' (' + Math.round(sumPrice*100/total) + '%)');
console.log('  가격=0 (무료):        ' + sumPriceZero + ' (' + Math.round(sumPriceZero*100/total) + '%)');
console.log('  가격 NULL (미정):     ' + sumPriceNull + ' (' + Math.round(sumPriceNull*100/total) + '%)');
console.log('  WK 이미지:            ' + sumWk + ' (' + Math.round(sumWk*100/total) + '%)');
console.log('  Google/Storage:       ' + sumGoog + ' (' + Math.round(sumGoog*100/total) + '%)');
console.log('  기타 이미지:          ' + sumOther + ' (' + Math.round(sumOther*100/total) + '%)');
console.log('  이미지 없음(둘 다 X): ' + sumNoImg + ' (' + Math.round(sumNoImg*100/total) + '%)');

// ─── 4. 이미지 없는 행 = 카테고리별 샘플 5 (= 사용자 수동 확인용) ───
console.log('\n═══ 4. 이미지 없는 행 = 카테고리별 샘플 5 ═══');
const noImg = (await c.query(`
  SELECT id, seed_category, name_en, name_ko,
    LEFT(address, 60) AS address,
    google_place_id IS NOT NULL AS has_pid,
    collection_phase
  FROM place_seed_raw
  WHERE city_id = 19 AND ${ACTIVE}
    AND (image_url IS NULL OR image_url = '')
  ORDER BY seed_category, id
  LIMIT 50
`)).rows;
let prevCat = '';
let catCount = 0;
for (const r of noImg) {
  if (r.seed_category !== prevCat) {
    if (prevCat) console.log('');
    console.log('[' + r.seed_category + ']');
    prevCat = r.seed_category;
    catCount = 0;
  }
  if (catCount++ < 5) {
    console.log('  id=' + r.id + ' | ' + r.name_en + ' (' + (r.name_ko || 'NULL') + ') | pid=' + (r.has_pid ? '✓' : '✗') + ' | phase=' + r.collection_phase);
    console.log('    addr: ' + (r.address || 'NULL'));
  }
}

// ─── 5. 10 가지 모두 채운 행 = 카테고리별 샘플 3 ───
console.log('\n═══ 5. 10 가지 모두 채운 행 = 카테고리별 샘플 3 ═══');
const cats = ['heritage', 'hotspot', 'attraction', 'adventure', 'healing', 'shopping', 'restaurant'];
for (const cat of cats) {
  const complete = (await c.query(`
    SELECT id, name_en, name_ko, name_local,
      LEFT(summary_ko, 40) AS summary_ko,
      LEFT(editorial_summary, 40) AS editorial,
      collection_phase
    FROM place_seed_raw
    WHERE city_id = 19 AND ${ACTIVE}
      AND seed_category = $1
      AND name_en IS NOT NULL AND name_en <> ''
      AND name_ko IS NOT NULL AND name_ko <> ''
      AND name_local IS NOT NULL AND name_local <> ''
      AND address IS NOT NULL AND address <> ''
      AND latitude IS NOT NULL AND longitude IS NOT NULL
      AND google_place_id IS NOT NULL AND google_place_id <> ''
      AND image_url IS NOT NULL AND image_url <> ''
      AND summary_ko IS NOT NULL AND summary_ko <> ''
      AND editorial_summary IS NOT NULL AND editorial_summary <> ''
    ORDER BY id
    LIMIT 3
  `, [cat])).rows;
  if (complete.length === 0) { console.log(`[${cat}] 10 가지 모두 채운 행 = 0`); continue; }
  console.log(`[${cat}] 10 가지 모두 채운 행 = 위 ${complete.length} 행 샘플:`);
  for (const r of complete) {
    console.log('  id=' + r.id + ' | ' + r.name_en + ' (' + r.name_ko + ') [' + (r.name_local || '') + ']');
    console.log('    FOMO: ' + (r.summary_ko || '') + '...');
    console.log('    위트: ' + (r.editorial || '') + '...');
  }
}

await c.end();