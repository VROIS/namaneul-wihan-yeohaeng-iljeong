// ⚠️ 수정금지(승인필요) — attraction 카테고리 3분리 (shopping/heritage/attraction) + bad row 제거
//
// 목적: 기존 attraction 혼재 (971 rows) 를 세 카테고리로 분리 → 캐릭터 1:1 매칭 정밀화
// 배경: 사용자 2026-04-25 지시 "attraction 을 쇼핑, 문화유적으로 분류"
// Phase C 1:1 매핑 전제조건 (Track 1e)
//
// 처리 순서:
//   Step 1. shopping 재분류 (mall/market/outlet/bazaar/souk/emporium/arcade/department store)
//     ⚠️ "Plaza" 제외 — 스페인어권 = 광장 (shopping 아님)
//   Step 2. heritage 재분류 (museum/historic/palace/temple/castle 등)
//   Step 3. bad row 삭제 (도시명 자체 — e.g., "Doha", "Lyon", "Ankara")
//   Step 4. 각 도시 × 신규 카테고리 rank 재정렬 (UNIQUE 제약 복구)
//   Step 5. 검증
//
// 실행:
//   node scripts/p0-attraction-subcategorize.mjs --dry-run     ← 검증
//   node scripts/p0-attraction-subcategorize.mjs               ← 실제 COMMIT

import pg from 'pg';

const SUPA_URL = 'postgresql://postgres.wxebceflvuythuodemro:Vrois%4075015@aws-1-eu-west-3.pooler.supabase.com:6543/postgres';
const DRY_RUN = process.argv.includes('--dry-run');

// ───── 분류 키워드 (정제 완료) ─────

// shopping: 쇼핑몰/시장/아울렛 (Plaza 제외 — 스페인어 광장)
const SHOPPING_PATTERN = `\\y(mall|market|shopping|outlet|bazaar|souk|emporium|arcade)\\y|department\\s+store`;

// heritage: 박물관/유적/종교시설/기념물
const HERITAGE_PATTERN = `\\y(museum|historic|heritage|palace|temple|castle|cathedral|basilica|chapel|ruin|monument|memorial|ancient|fortress|citadel|tomb|shrine|archaeolog|monastery|abbey|synagogue|mosque|church)\\y`;

async function run() {
  const db = new pg.Client({ connectionString: SUPA_URL });
  await db.connect();
  const mode = DRY_RUN ? 'DRY-RUN' : 'COMMIT';
  console.log(`\n🚀 [BTS-Attraction-Subcategorize] 시작 (${mode})\n`);

  // 사전 상태
  const preStats = await db.query(`
    SELECT seed_category, COUNT(*) AS n FROM place_seed_raw
    WHERE collection_phase = 'bts2026'
      AND city_id IN (SELECT id FROM cities WHERE bts_rank IS NOT NULL)
    GROUP BY seed_category ORDER BY seed_category
  `);
  console.log('[사전 상태]');
  console.table(preStats.rows);

  try {
    await db.query('BEGIN');

    // Step 1. shopping 재분류
    const shopUpdate = await db.query(
      `
      UPDATE place_seed_raw
      SET seed_category = 'shopping'
      WHERE seed_category = 'attraction'
        AND collection_phase = 'bts2026'
        AND city_id IN (SELECT id FROM cities WHERE bts_rank IS NOT NULL)
        AND name_en ~* $1
    `,
      [SHOPPING_PATTERN]
    );
    console.log(`\n[Step 1] shopping 재분류: ${shopUpdate.rowCount} rows`);

    // Step 2. heritage 재분류 (shopping 으로 이동 안 된 attraction 중에서)
    const herUpdate = await db.query(
      `
      UPDATE place_seed_raw
      SET seed_category = 'heritage'
      WHERE seed_category = 'attraction'
        AND collection_phase = 'bts2026'
        AND city_id IN (SELECT id FROM cities WHERE bts_rank IS NOT NULL)
        AND name_en ~* $1
    `,
      [HERITAGE_PATTERN]
    );
    console.log(`[Step 2] heritage 재분류: ${herUpdate.rowCount} rows`);

    // Step 3. bad row 삭제 (도시명 자체 — 정확 일치)
    const badDel = await db.query(`
      DELETE FROM place_seed_raw psr
      WHERE psr.seed_category IN ('attraction', 'shopping', 'heritage')
        AND psr.collection_phase = 'bts2026'
        AND psr.city_id IN (SELECT id FROM cities WHERE bts_rank IS NOT NULL)
        AND EXISTS (
          SELECT 1 FROM cities c
          WHERE LOWER(TRIM(psr.name_en)) = LOWER(TRIM(c.name_en))
             OR LOWER(TRIM(psr.name_en)) = LOWER(TRIM(c.name))
        )
    `);
    console.log(`[Step 3] bad row (도시명 자체) 삭제: ${badDel.rowCount} rows`);

    // Step 4. 각 도시 × 신규 카테고리 rank 재정렬 (Two-phase UNIQUE 제약 회피)
    // Phase 4a: 모든 rank 를 임시 큰 offset 으로 (UNIQUE 충돌 없음)
    const shiftResult = await db.query(`
      UPDATE place_seed_raw
      SET rank = rank + 100000
      WHERE collection_phase = 'bts2026'
        AND city_id IN (SELECT id FROM cities WHERE bts_rank IS NOT NULL)
    `);
    console.log(`[Step 4a] rank 임시 shift (+100000): ${shiftResult.rowCount} rows`);

    // Phase 4b: 최종 rank 재할당 (ROW_NUMBER 1~N per city×category)
    const rankRemap = await db.query(`
      WITH ranked AS (
        SELECT id,
          ROW_NUMBER() OVER (
            PARTITION BY city_id, seed_category
            ORDER BY rank, id
          ) AS new_rank
        FROM place_seed_raw
        WHERE collection_phase = 'bts2026'
          AND city_id IN (SELECT id FROM cities WHERE bts_rank IS NOT NULL)
      )
      UPDATE place_seed_raw psr
      SET rank = ranked.new_rank
      FROM ranked
      WHERE psr.id = ranked.id
    `);
    console.log(`[Step 4b] rank 최종 재정렬: ${rankRemap.rowCount} rows`);

    if (DRY_RUN) {
      await db.query('ROLLBACK');
      console.log('\n🔄 [DRY-RUN] 롤백\n');
    } else {
      await db.query('COMMIT');
      console.log('\n✅ [COMMIT] 영구 저장\n');
    }

    // 사후 상태
    const postStats = await db.query(`
      SELECT seed_category, COUNT(*) AS n FROM place_seed_raw
      WHERE collection_phase = 'bts2026'
        AND city_id IN (SELECT id FROM cities WHERE bts_rank IS NOT NULL)
      GROUP BY seed_category ORDER BY seed_category
    `);
    console.log('[사후 상태]');
    console.table(postStats.rows);

    // 도시별 카테고리 매트릭스
    const matrix = await db.query(`
      SELECT
        c.bts_rank, c.name_en AS city,
        COUNT(*) FILTER (WHERE psr.seed_category = 'attraction') AS attraction,
        COUNT(*) FILTER (WHERE psr.seed_category = 'shopping') AS shopping,
        COUNT(*) FILTER (WHERE psr.seed_category = 'heritage') AS heritage,
        COUNT(*) FILTER (WHERE psr.seed_category = 'restaurant') AS restaurant,
        COUNT(*) FILTER (WHERE psr.seed_category = 'healing') AS healing,
        COUNT(*) FILTER (WHERE psr.seed_category = 'hotspot') AS hotspot,
        COUNT(*) FILTER (WHERE psr.seed_category = 'adventure') AS adventure
      FROM cities c
      LEFT JOIN place_seed_raw psr ON psr.city_id = c.id AND psr.collection_phase = 'bts2026'
      WHERE c.bts_rank IS NOT NULL
      GROUP BY c.bts_rank, c.name_en
      ORDER BY c.bts_rank
    `);
    console.log('\n[도시 × 7 카테고리 매트릭스]');
    console.table(matrix.rows);
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('❌ 오류, 롤백:', err.message);
    throw err;
  } finally {
    await db.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
