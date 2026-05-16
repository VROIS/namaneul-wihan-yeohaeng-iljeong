// 1 회용 = places 1,881 행 → place_seed_raw 마이그 시뮬레이션 (= 실제 수정 X)
// 사용자 명시 2026-05-15: 우선 검증 스크립트 = 매칭 시뮬 먼저
//
// 4 단계 매칭 (사용자 SSOT § upsertPlace):
//   0순위 = google_place_id 일치 (~100%)
//   1순위 = 풀 주소 100% (= 번지 + 우편번호)
//   2순위 = 좌표 10m (= 0.0001 도 차이)
//   3순위 = 장소명 LOWER+trim
//
// 시뮬 결과 보고:
//   - 매칭 단계별 행 수
//   - 신규 INSERT 예상 행 수
//   - 보존 가치 행 수 (= PID 보유 / 이미지 보유)

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

console.log('═══════════════════════════════════════════════════════════');
console.log('places → place_seed_raw 마이그레이션 시뮬레이션');
console.log('═══════════════════════════════════════════════════════════\n');

// ━━━━━━ 0 순위 = PID 일치 ━━━━━━
console.log('▶ 0순위 = google_place_id 일치 매칭:');
const m0 = await c.query(`
  SELECT
    COUNT(*) FILTER (WHERE p.google_place_id IS NOT NULL) AS places_with_pid,
    COUNT(*) FILTER (WHERE p.google_place_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM place_seed_raw s WHERE s.google_place_id = p.google_place_id
    )) AS pid_matched
  FROM places p;
`);
console.table(m0.rows);

// ━━━━━━ 1 순위 = 풀 주소 매칭 (PID 매칭 안 된 행 중) ━━━━━━
console.log('\n▶ 1순위 = 풀 주소 매칭 (PID 매칭 안 된 행 중):');
const m1 = await c.query(`
  WITH pid_matched_ids AS (
    SELECT p.id FROM places p
    WHERE p.google_place_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM place_seed_raw s WHERE s.google_place_id = p.google_place_id)
  )
  SELECT
    COUNT(*) AS places_remaining,
    COUNT(*) FILTER (WHERE p.address IS NOT NULL AND length(trim(p.address)) > 20) AS with_full_addr,
    COUNT(*) FILTER (
      WHERE p.address IS NOT NULL AND length(trim(p.address)) > 20
        AND EXISTS (
          SELECT 1 FROM place_seed_raw s
          WHERE s.address IS NOT NULL
            AND lower(trim(regexp_replace(s.address, '[\\s,]+', ' ', 'g'))) =
                lower(trim(regexp_replace(p.address, '[\\s,]+', ' ', 'g')))
        )
    ) AS addr_matched
  FROM places p
  WHERE p.id NOT IN (SELECT id FROM pid_matched_ids);
`);
console.table(m1.rows);

// ━━━━━━ 2 순위 = 좌표 10m 매칭 (앞 단계 매칭 안 된 행 중) ━━━━━━
console.log('\n▶ 2순위 = 좌표 10m 매칭 (앞 단계 매칭 안 된 행 중):');
const m2 = await c.query(`
  WITH matched_ids AS (
    SELECT p.id FROM places p
    WHERE (p.google_place_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM place_seed_raw s WHERE s.google_place_id = p.google_place_id))
       OR (p.address IS NOT NULL AND length(trim(p.address)) > 20
          AND EXISTS (
            SELECT 1 FROM place_seed_raw s
            WHERE s.address IS NOT NULL
              AND lower(trim(regexp_replace(s.address, '[\\s,]+', ' ', 'g'))) =
                  lower(trim(regexp_replace(p.address, '[\\s,]+', ' ', 'g')))
          ))
  )
  SELECT
    COUNT(*) AS places_remaining,
    COUNT(*) FILTER (
      WHERE p.latitude IS NOT NULL AND p.longitude IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM place_seed_raw s
          WHERE s.latitude IS NOT NULL AND s.longitude IS NOT NULL
            AND s.city_id = p.city_id
            AND abs(s.latitude - p.latitude) < 0.0001
            AND abs(s.longitude - p.longitude) < 0.0001
        )
    ) AS coord_matched
  FROM places p
  WHERE p.id NOT IN (SELECT id FROM matched_ids);
`);
console.table(m2.rows);

// ━━━━━━ 3 순위 = 이름 LOWER+trim (앞 단계 매칭 안 된 행 중) ━━━━━━
console.log('\n▶ 3순위 = 이름 LOWER+trim 매칭 (앞 단계 매칭 안 된 행 중):');
const m3 = await c.query(`
  WITH matched_ids AS (
    SELECT p.id FROM places p
    WHERE (p.google_place_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM place_seed_raw s WHERE s.google_place_id = p.google_place_id))
       OR (p.address IS NOT NULL AND length(trim(p.address)) > 20
          AND EXISTS (
            SELECT 1 FROM place_seed_raw s
            WHERE s.address IS NOT NULL
              AND lower(trim(regexp_replace(s.address, '[\\s,]+', ' ', 'g'))) =
                  lower(trim(regexp_replace(p.address, '[\\s,]+', ' ', 'g')))
          ))
       OR (p.latitude IS NOT NULL AND p.longitude IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM place_seed_raw s
            WHERE s.latitude IS NOT NULL AND s.longitude IS NOT NULL
              AND s.city_id = p.city_id
              AND abs(s.latitude - p.latitude) < 0.0001
              AND abs(s.longitude - p.longitude) < 0.0001
          ))
  )
  SELECT
    COUNT(*) AS places_remaining,
    COUNT(*) FILTER (
      WHERE p.name IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM place_seed_raw s
          WHERE s.city_id = p.city_id
            AND lower(trim(s.name_en)) = lower(trim(p.name))
        )
    ) AS name_matched
  FROM places p
  WHERE p.id NOT IN (SELECT id FROM matched_ids);
`);
console.table(m3.rows);

// ━━━━━━ 신규 INSERT 예상 (= 모든 매칭 실패 행) ━━━━━━
console.log('\n▶ 신규 INSERT 예상 (= 4 단계 모두 매칭 실패):');
const m4 = await c.query(`
  WITH matched_ids AS (
    SELECT p.id FROM places p
    WHERE (p.google_place_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM place_seed_raw s WHERE s.google_place_id = p.google_place_id))
       OR (p.address IS NOT NULL AND length(trim(p.address)) > 20
          AND EXISTS (
            SELECT 1 FROM place_seed_raw s
            WHERE s.address IS NOT NULL
              AND lower(trim(regexp_replace(s.address, '[\\s,]+', ' ', 'g'))) =
                  lower(trim(regexp_replace(p.address, '[\\s,]+', ' ', 'g')))
          ))
       OR (p.latitude IS NOT NULL AND p.longitude IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM place_seed_raw s
            WHERE s.latitude IS NOT NULL AND s.longitude IS NOT NULL
              AND s.city_id = p.city_id
              AND abs(s.latitude - p.latitude) < 0.0001
              AND abs(s.longitude - p.longitude) < 0.0001
          ))
       OR (p.name IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM place_seed_raw s
            WHERE s.city_id = p.city_id
              AND lower(trim(s.name_en)) = lower(trim(p.name))
          ))
  )
  SELECT
    COUNT(*) AS new_insert_candidates,
    COUNT(*) FILTER (WHERE p.google_place_id IS NOT NULL) AS unmatched_with_pid,
    COUNT(*) FILTER (WHERE p.photo_urls IS NOT NULL AND jsonb_array_length(p.photo_urls) > 0) AS unmatched_with_photos,
    COUNT(*) FILTER (WHERE p.latitude IS NOT NULL) AS unmatched_with_coords,
    COUNT(*) FILTER (WHERE p.display_name_ko IS NOT NULL) AS unmatched_with_name_ko
  FROM places p
  WHERE p.id NOT IN (SELECT id FROM matched_ids);
`);
console.table(m4.rows);

// ━━━━━━ 보존 가치 = 매칭 행에 보강될 데이터 ━━━━━━
console.log('\n▶ 보존 가치 = 매칭 행의 보강 가능 데이터 (= COALESCE 옛 우선):');
const m5 = await c.query(`
  SELECT
    COUNT(*) AS total_places,
    COUNT(*) FILTER (WHERE google_place_id IS NOT NULL) AS with_pid,
    COUNT(*) FILTER (WHERE photo_urls IS NOT NULL AND jsonb_array_length(photo_urls) > 0) AS with_photos,
    COUNT(*) FILTER (WHERE display_name_ko IS NOT NULL) AS with_name_ko,
    COUNT(*) FILTER (WHERE editorial_summary IS NOT NULL) AS with_editorial,
    COUNT(*) FILTER (WHERE buzz_score IS NOT NULL) AS with_buzz_score,
    COUNT(*) FILTER (WHERE user_rating_count IS NOT NULL) AS with_rating_count,
    COUNT(*) FILTER (WHERE address IS NOT NULL) AS with_address,
    COUNT(*) FILTER (WHERE opening_hours IS NOT NULL) AS with_hours
  FROM places;
`);
console.table(m5.rows);

// ━━━━━━ Atmosphere 필드 보유 (= §16 마이그 제외) ━━━━━━
console.log('\n▶ Atmosphere 필드 보유 (= §16 마이그 제외 대상):');
const m6 = await c.query(`
  SELECT
    COUNT(*) FILTER (WHERE delivery IS NOT NULL) AS with_delivery,
    COUNT(*) FILTER (WHERE dine_in IS NOT NULL) AS with_dine_in,
    COUNT(*) FILTER (WHERE serves_dinner IS NOT NULL) AS with_serves_dinner,
    COUNT(*) FILTER (WHERE good_for_groups IS NOT NULL) AS with_good_for_groups,
    COUNT(*) FILTER (WHERE outdoor_seating IS NOT NULL) AS with_outdoor_seating
  FROM places;
`);
console.table(m6.rows);

await c.end();
console.log('\n═══════════════════════════════════════════════════════════');
console.log('시뮬 완료. SELECT only. DB 변경 0.');
console.log('═══════════════════════════════════════════════════════════');
