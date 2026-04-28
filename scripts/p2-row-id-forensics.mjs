// 39 orphan JPG row_id 추적 (읽기 전용)
// 사용자 2026-04-28: 04-27 첫 cron이 받은 row_id 56741~56927 = DB에 없음
//                    04-28 두 번째 cron 결과만 살아있음 (56978~57051)
//                    → DELETE/INSERT 사고로 ID 재발급 의심

import 'dotenv/config';
import pg from 'pg';

const SUPA_URL = process.env.SUPA_URL || process.env.DATABASE_URL;
if (!SUPA_URL) { console.error('❌ SUPA_URL 미설정'); process.exit(1); }

const ORPHAN_IDS = [
  // restaurant 10
  56771, 56772, 56773, 56774, 56775, 56776, 56777, 56778, 56779, 56780,
  // adventure 5
  56834, 56835, 56836, 56837, 56838,
  // attraction 5
  56741, 56742, 56743, 56744, 56745,
  // healing 5
  56803, 56804, 56805, 56806, 56807,
  // heritage 5
  56898, 56901, 56903, 56907, 56909,
  // hotspot 4
  56871, 56873, 56877, 56878,
  // shopping 5
  56921, 56923, 56925, 56926, 56927,
];

const db = new pg.Client({ connectionString: SUPA_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
console.log('✅ DB 연결 OK\n');

try {
  // 1) 현재 city_id=101 bts2026 살아있는 row 전체 (created_at + updated_at + image_url 상태)
  console.log('━'.repeat(80));
  console.log('1. 현재 place_seed_raw city_id=101 bts2026 (살아있는 row, ID 순)');
  console.log('━'.repeat(80));
  const live = await db.query(`
    SELECT id, seed_category, name_en,
           CASE WHEN image_url IS NULL THEN 'NULL'
                WHEN image_url LIKE '%storage%place-images%' THEN 'GOOGLE_JPG'
                ELSE 'OTHER' END AS img_state,
           created_at, image_updated_at
    FROM place_seed_raw
    WHERE city_id = 101 AND collection_phase = 'bts2026'
    ORDER BY id
  `);
  console.log(`총 ${live.rows.length} row`);
  console.table(live.rows.map(r => ({
    id: r.id,
    cat: r.seed_category,
    name: (r.name_en || '').slice(0, 35),
    img: r.img_state,
    created: r.created_at?.toISOString().slice(5, 16),
    img_upd: r.image_updated_at?.toISOString().slice(5, 16) || '-',
  })));

  // 2) 카테고리별 ID 범위
  console.log('\n━'.repeat(80));
  console.log('2. 카테고리별 ID 범위 (현재 살아있는 row)');
  console.log('━'.repeat(80));
  const ranges = await db.query(`
    SELECT seed_category, MIN(id) AS min_id, MAX(id) AS max_id, COUNT(*) AS cnt,
           MIN(created_at) AS first_created, MAX(created_at) AS last_created
    FROM place_seed_raw
    WHERE city_id = 101 AND collection_phase = 'bts2026'
    GROUP BY seed_category ORDER BY seed_category
  `);
  console.table(ranges.rows.map(r => ({
    category: r.seed_category,
    min_id: r.min_id, max_id: r.max_id, cnt: r.cnt,
    first: r.first_created?.toISOString().slice(5, 16),
    last: r.last_created?.toISOString().slice(5, 16),
  })));

  // 3) 39 orphan ID 가 DB에 존재하는지 확인 (전체 collection_phase 무시)
  console.log('\n━'.repeat(80));
  console.log('3. 39 orphan ID 가 어떤 형태로든 DB에 존재하는지 (전체 phase 검색)');
  console.log('━'.repeat(80));
  const orphanCheck = await db.query(`
    SELECT id, city_id, seed_category, collection_phase, name_en,
           CASE WHEN image_url IS NULL THEN 'NULL' ELSE 'HAS_URL' END AS img,
           created_at, image_updated_at
    FROM place_seed_raw
    WHERE id = ANY($1::int[])
    ORDER BY id
  `, [ORPHAN_IDS]);
  if (orphanCheck.rows.length === 0) {
    console.log(`❌ 39 orphan ID 모두 DB에 없음 (DELETE 후 sequence 재사용 X)`);
    console.log(`   → row_id 자체가 영구 소실 = JPG 파일 → DB 매칭 영구 불가`);
  } else {
    console.log(`⚠️ ${orphanCheck.rows.length} / 39 orphan ID 가 DB 어딘가에 존재:`);
    console.table(orphanCheck.rows);
  }

  // 4) 04-27 시간대 row 검색 (created_at 또는 updated_at 기준)
  console.log('\n━'.repeat(80));
  console.log('4. 04-27 15시대에 생성/수정된 row (city_id=101 한정 안 함)');
  console.log('━'.repeat(80));
  const apr27 = await db.query(`
    SELECT id, city_id, seed_category, collection_phase, name_en,
           created_at, image_updated_at
    FROM place_seed_raw
    WHERE (created_at >= '2026-04-27 15:00:00' AND created_at < '2026-04-27 16:00:00')
       OR (image_updated_at >= '2026-04-27 15:00:00' AND image_updated_at < '2026-04-27 16:00:00')
    ORDER BY created_at, id
    LIMIT 50
  `);
  console.log(`총 ${apr27.rows.length} row`);
  console.table(apr27.rows.map(r => ({
    id: r.id, city: r.city_id, cat: r.seed_category, phase: r.collection_phase,
    name: (r.name_en || '').slice(0, 35),
    created: r.created_at?.toISOString().slice(5, 16),
  })));

  // 5) 39 orphan ID 와 살아있는 row 의 카테고리/이름 매칭 가능성
  console.log('\n━'.repeat(80));
  console.log('5. 살아있는 row 와 04-27 cron 의 카테고리별 정렬 매칭 가능성');
  console.log('━'.repeat(80));
  console.log('파일명 = {row_id}.jpg → row_id 가 사라졌으므로 이름 매칭은 불가능.');
  console.log('대안: 04-27 cron run log (run #25004751231 ?) 에서 어떤 장소를 받았는지 확인 필요.');

  // 6) 최종 진단
  console.log('\n' + '═'.repeat(80));
  console.log('🎯 진단');
  console.log('═'.repeat(80));
  console.log(`현재 살아있는 row : ${live.rows.length}`);
  console.log(`Storage JPG       : 53 (39 orphan + 14 linked)`);
  console.log(`복구 가능성       : ${orphanCheck.rows.length === 0 ? '0% (row_id 영구 소실)' : `${orphanCheck.rows.length}/39 가능`}`);
  console.log('═'.repeat(80));

} catch (e) {
  console.error('❌', e.message);
  process.exit(1);
} finally {
  await db.end();
}
