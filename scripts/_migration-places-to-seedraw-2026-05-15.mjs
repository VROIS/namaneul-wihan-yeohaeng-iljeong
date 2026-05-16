// 1 회 마이그 = places 1,881 행 → place_seed_raw 통합 (= 사용자 명시 2026-05-15)
// = upsertPlace() 의 SQL 패턴 그대로 사용 (= 단일 진입점 정신 유지)
// = 4 단계 매칭 + COALESCE 옛 우선 + GREATEST 가격 + UNION tags
// = DRY_RUN=true 면 = SELECT only (= 실제 변경 X) = 결과 카운트만
//
// 마이그 매핑 (= place_seed_raw 컬럼 있는 것만):
//   places.google_place_id   → google_place_id
//   places.name              → name_en
//   places.display_name_ko   → name_ko (= 0 행, 미존재)
//   places.name_local        → name_local (= 0 행)
//   places.address           → address
//   places.latitude/longitude → latitude/longitude
//   places.photo_urls        → photo_urls
//   places.opening_hours     → opening_hours
//   places.editorial_summary → editorial_summary
//   places.user_rating_count → google_review_count
//   places.google_maps_uri   → google_maps_uri
//   places.seed_category     → seed_category (= 매칭 시 안 덮음, 신규 시만)
//   places.buzz_score        → google_rating (= buzz_score/2)

import pg from 'pg';
import fs from 'fs';

const DRY_RUN = process.argv.includes('--dry-run');

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
console.log(`places → place_seed_raw 마이그레이션 (${DRY_RUN ? 'DRY RUN' : 'REAL COMMIT'})`);
console.log('═══════════════════════════════════════════════════════════\n');

const normAddr = (s) => (s || '').toLowerCase().replace(/[.,;:!?'"()\[\]{}]/g, ' ').replace(/\s+/g, ' ').trim();

// places 모든 행 + 보조 컬럼 SELECT
const places = (await c.query(`
  SELECT
    id, city_id, google_place_id, name, display_name_ko, name_local,
    address, latitude, longitude,
    photo_urls, opening_hours, editorial_summary,
    user_rating_count, google_maps_uri, seed_category,
    buzz_score
  FROM places
`)).rows;
console.log(`▶ places 총: ${places.length} 행`);

await c.query('BEGIN');
const startTime = Date.now();
const stats = { updated: 0, inserted: 0, skipped: 0, errors: 0 };
const mappingTable = []; // { places_id, seed_raw_id, action }
let processed = 0;

try {
  for (const p of places) {
    processed++;
    if (processed % 200 === 0) {
      console.log(`  [${processed}/${places.length}] updated=${stats.updated} inserted=${stats.inserted} skipped=${stats.skipped}`);
    }

    if (!p.name || !p.city_id) {
      stats.skipped++;
      continue;
    }

    // 같은 도시 후보 SELECT
    const candidates = (await c.query(`
      SELECT id, google_place_id, address, latitude, longitude, name_en
      FROM place_seed_raw WHERE city_id = $1
    `, [p.city_id])).rows;

    let match = null;
    let matchedBy = 'none';

    // 0순위 PID
    if (p.google_place_id) {
      match = candidates.find((row) => row.google_place_id === p.google_place_id);
      if (match) matchedBy = 'pid';
    }
    // 1순위 풀 주소
    if (!match && p.address) {
      const np = normAddr(p.address);
      if (np.length >= 20) {
        match = candidates.find((row) => row.address && normAddr(row.address) === np);
        if (match) matchedBy = 'address';
      }
    }
    // 2순위 좌표 10m
    if (!match && p.latitude != null && p.longitude != null) {
      match = candidates.find((row) =>
        row.latitude != null && row.longitude != null
        && Math.abs(Number(row.latitude) - Number(p.latitude)) < 0.0001
        && Math.abs(Number(row.longitude) - Number(p.longitude)) < 0.0001
      );
      if (match) matchedBy = 'coords';
    }
    // 3순위 이름
    if (!match && p.name) {
      const pk = p.name.trim().toLowerCase();
      match = candidates.find((row) => row.name_en && row.name_en.trim().toLowerCase() === pk);
      if (match) matchedBy = 'name';
    }

    const googleRating = p.buzz_score ? p.buzz_score / 2 : null;
    const photoUrlsJson = p.photo_urls ? JSON.stringify(p.photo_urls) : null;
    const openingHoursJson = p.opening_hours ? JSON.stringify(p.opening_hours) : null;

    if (match) {
      // UPDATE = COALESCE 옛 우선 (= place_seed_raw 가 NULL 인 곳만 채움)
      if (!DRY_RUN) {
        try {
          await c.query(`
            UPDATE place_seed_raw SET
              google_place_id     = COALESCE(google_place_id, $2),
              name_en             = COALESCE(name_en, $3),
              name_ko             = COALESCE(name_ko, $4),
              name_local          = COALESCE(name_local, $5),
              address             = COALESCE(address, $6),
              latitude            = COALESCE(latitude, $7),
              longitude           = COALESCE(longitude, $8),
              photo_urls          = COALESCE(photo_urls, $9::jsonb),
              opening_hours       = COALESCE(opening_hours, $10::jsonb),
              editorial_summary   = COALESCE(editorial_summary, $11),
              google_review_count = COALESCE(google_review_count, $12),
              google_maps_uri     = COALESCE(google_maps_uri, $13),
              google_rating       = COALESCE(google_rating, $14::real),
              place_id            = COALESCE(place_id, $15)
            WHERE id = $1
          `, [match.id,
            p.google_place_id, p.name, p.display_name_ko, p.name_local,
            p.address, p.latitude, p.longitude,
            photoUrlsJson, openingHoursJson, p.editorial_summary,
            p.user_rating_count, p.google_maps_uri, googleRating, p.id]);
        } catch (e) {
          stats.errors++;
          console.warn(`  ❌ UPDATE 실패 (places.id=${p.id}): ${e.message.slice(0, 80)}`);
          continue;
        }
      }
      stats.updated++;
      mappingTable.push({ places_id: p.id, seed_raw_id: match.id, action: `updated_${matchedBy}` });
    } else {
      // INSERT = 신규 행 (= rank 자동)
      if (!DRY_RUN) {
        try {
          const seedCat = p.seed_category || (p.type === 'restaurant' ? 'restaurant' : 'attraction');
          const rankRow = await c.query(`
            SELECT COALESCE(MAX(rank), 0) + 1 AS next_rank
            FROM place_seed_raw
            WHERE city_id = $1 AND seed_category = $2
          `, [p.city_id, seedCat]);
          const nextRank = rankRow.rows[0].next_rank;

          const inserted = await c.query(`
            INSERT INTO place_seed_raw (
              city_id, seed_category, rank, name_en, name_ko, name_local,
              address, latitude, longitude,
              photo_urls, opening_hours, editorial_summary,
              google_review_count, google_maps_uri, google_rating,
              google_place_id, place_id,
              collection_phase, category_tags, phase_tags,
              evidence_verified, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6,
              $7, $8, $9,
              $10::jsonb, $11::jsonb, $12,
              $13, $14, $15::real,
              $16, $17,
              'places-migration-2026-05-15', $18::text[], ARRAY['places-migration-2026-05-15']::text[],
              false, NOW(), NOW()
            )
            RETURNING id
          `, [p.city_id, seedCat, nextRank, p.name, p.display_name_ko, p.name_local,
            p.address, p.latitude, p.longitude,
            photoUrlsJson, openingHoursJson, p.editorial_summary,
            p.user_rating_count, p.google_maps_uri, googleRating,
            p.google_place_id, p.id,
            [seedCat]]);
          mappingTable.push({ places_id: p.id, seed_raw_id: inserted.rows[0].id, action: 'inserted' });
        } catch (e) {
          stats.errors++;
          console.warn(`  ❌ INSERT 실패 (places.id=${p.id}, name=${p.name}): ${e.message.slice(0, 80)}`);
          continue;
        }
      } else {
        mappingTable.push({ places_id: p.id, seed_raw_id: null, action: 'inserted_dryrun' });
      }
      stats.inserted++;
    }
  }

  if (DRY_RUN) {
    await c.query('ROLLBACK');
    console.log('\n🔵 DRY RUN ROLLBACK (= 실제 변경 0)');
  } else {
    await c.query('COMMIT');
    console.log('\n✅ COMMIT 완료');
  }

  console.log(`\n▶ 결과:`);
  console.log(`  소요: ${((Date.now() - startTime) / 1000).toFixed(1)} 초`);
  console.log(`  UPDATE: ${stats.updated} 행`);
  console.log(`  INSERT: ${stats.inserted} 행`);
  console.log(`  SKIP:   ${stats.skipped} 행`);
  console.log(`  ERRORS: ${stats.errors}`);

  // 매핑 테이블 = 보조 테이블 재연결용 임시 저장
  if (!DRY_RUN && mappingTable.length > 0) {
    await c.query(`DROP TABLE IF EXISTS _places_to_seedraw_mapping`);
    await c.query(`
      CREATE TABLE _places_to_seedraw_mapping (
        places_id integer PRIMARY KEY,
        seed_raw_id integer NOT NULL,
        action text NOT NULL,
        created_at timestamp DEFAULT NOW()
      )
    `);
    // bulk insert
    const values = mappingTable.map((m, i) => `($${i*3+1}, $${i*3+2}, $${i*3+3})`).join(',');
    const params = mappingTable.flatMap((m) => [m.places_id, m.seed_raw_id, m.action]);
    // pg 파라미터 한도 = 65535. 1881 × 3 = 5643 = OK.
    await c.query(`INSERT INTO _places_to_seedraw_mapping (places_id, seed_raw_id, action) VALUES ${values}`, params);
    console.log(`\n📋 매핑 테이블 = _places_to_seedraw_mapping (${mappingTable.length} 행) 생성 (= 보조 테이블 재연결 용)`);
  }
} catch (e) {
  await c.query('ROLLBACK');
  console.error('\n❌ ROLLBACK:', e.message);
  process.exit(1);
}

await c.end();
console.log('\n═══════════════════════════════════════════════════════════');
console.log(`${DRY_RUN ? 'DRY RUN' : 'REAL'} 완료`);
console.log('═══════════════════════════════════════════════════════════');
