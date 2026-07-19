// ⚠️ 수정금지(승인필요) — BTS 중복 도시 Hard 병합 + 중복 장소 제거 (사용자 2026-04-25 승인)
//
// 목적: 한 도시 = 한 cities row 원칙 복원. place_seed_raw 통합 집결지 정리.
// 아키텍처 철학: 프론트 1회 쿼리 = 혼동 제로. 전세계 확대 기반.
//
// 처리 대상 3 쌍:
//   1. LA 다운타운 (id 112) → LA 잉글우드 (id 124) [SoFi Stadium 실제 위치]
//   2. Bogotá (id 113) → Bogota (id 125) [78% 중복, 공연 날짜 있는 Bogota 가 master]
//   3. São Paulo (id 117) → Sao Paulo (id 126) [87% 중복, 공연 날짜 있는 Sao Paulo 가 master]
//
// 실행:
//   node scripts/p0-bts-dedupe-cities.mjs --dry-run     ← 트랜잭션 롤백, 검증
//   node scripts/p0-bts-dedupe-cities.mjs               ← 실제 커밋
//   node scripts/p0-bts-dedupe-cities.mjs --verify-only ← 현재 상태 조회
//
// 처리 순서:
//   Step 1. place_seed_raw 중복 장소 삭제 (master 에 이미 있는 name 제거)
//   Step 2. 남은 고유 장소를 master cityId 로 이동 (rank offset 으로 UNIQUE 회피)
//   Step 3. 이동된 rows 의 rank 재정렬 (seed_category 별 1~N 연속)
//   Step 4. weather_cache, weather_forecast 중복 삭제
//   Step 5. cities 중복 rows 삭제 (id 112, 113, 117)
//   Step 6. (옵션) bts_rank 재매핑 — Bogota 26→21, Sao Paulo 30→25
//   Step 7. 검증 쿼리

import pg from "pg";

const SUPA_URL =
  "postgresql://postgres.wxebceflvuythuodemro:Vrois%4075015@aws-1-eu-west-3.pooler.supabase.com:6543/postgres";

const DRY_RUN = process.argv.includes("--dry-run");
const VERIFY_ONLY = process.argv.includes("--verify-only");
const SKIP_RANK_REMAP = process.argv.includes("--skip-rank-remap");

const DEDUPE_PAIRS = [
  {
    remove: 112,
    keep: 124,
    removeName: "LA 다운타운 (Los Angeles id=112)",
    keepName: "LA 잉글우드 (Los Angeles id=124, SoFi Stadium)",
  },
  {
    remove: 113,
    keep: 125,
    removeName: "Bogotá (id=113)",
    keepName: "Bogota (id=125, 공연 10/2-3)",
  },
  {
    remove: 117,
    keep: 126,
    removeName: "São Paulo (id=117)",
    keepName: "Sao Paulo (id=126, 공연 10/28, 30, 31)",
  },
];

// 옵션: bts_rank 재매핑 (연속 번호)
const RANK_REMAP = [
  { cityName: "Bogota", newRank: 21, oldRank: 26 },
  { cityName: "Sao Paulo", newRank: 25, oldRank: 30 },
];

async function run() {
  const db = new pg.Client({ connectionString: SUPA_URL });
  await db.connect();

  const mode = VERIFY_ONLY ? "VERIFY-ONLY" : DRY_RUN ? "DRY-RUN" : "COMMIT";
  console.log(`\n🚀 [BTS-Dedupe] 시작 (${mode})\n`);

  if (VERIFY_ONLY) {
    await verify(db);
    await db.end();
    return;
  }

  try {
    await db.query("BEGIN");

    // 사전 상태 저장 (통계용)
    const preStats = await collectStats(db);
    console.log("[사전 상태]");
    console.table(preStats);

    // Step 1~3. 각 중복 쌍 처리
    for (const pair of DEDUPE_PAIRS) {
      await processPair(db, pair);
    }

    // Step 4. weather 중복 삭제
    console.log("\n[Step 4] weather_cache + weather_forecast 중복 삭제");
    const removeIds = DEDUPE_PAIRS.map((p) => p.remove);
    const wcDel = await db.query(
      `DELETE FROM weather_cache WHERE city_id = ANY($1::int[])`,
      [removeIds],
    );
    console.log(`  weather_cache 삭제: ${wcDel.rowCount} rows`);
    const wfDel = await db.query(
      `DELETE FROM weather_forecast WHERE city_id = ANY($1::int[])`,
      [removeIds],
    );
    console.log(`  weather_forecast 삭제: ${wfDel.rowCount} rows`);

    // Step 5. cities 중복 rows 삭제
    console.log("\n[Step 5] cities 중복 rows 삭제");
    const citiesDel = await db.query(
      `DELETE FROM cities WHERE id = ANY($1::int[])`,
      [removeIds],
    );
    console.log(
      `  cities 삭제: ${citiesDel.rowCount} rows (id=${removeIds.join(",")})`,
    );

    // Step 6. bts_rank 재매핑 (옵션)
    if (!SKIP_RANK_REMAP) {
      console.log("\n[Step 6] bts_rank 재매핑");
      for (const remap of RANK_REMAP) {
        const r = await db.query(
          `UPDATE cities SET bts_rank = $1 WHERE name_en = $2 AND bts_rank = $3`,
          [remap.newRank, remap.cityName, remap.oldRank],
        );
        console.log(
          `  ${remap.cityName}: ${remap.oldRank} → ${remap.newRank} (rows: ${r.rowCount})`,
        );
      }
    } else {
      console.log("\n[Step 6] bts_rank 재매핑 SKIP (--skip-rank-remap)");
    }

    // 사후 상태
    const postStats = await collectStats(db);
    console.log("\n[사후 상태]");
    console.table(postStats);

    if (DRY_RUN) {
      await db.query("ROLLBACK");
      console.log("\n🔄 [DRY-RUN] 모든 변경사항 롤백됨\n");
    } else {
      await db.query("COMMIT");
      console.log("\n✅ [COMMIT] 변경사항 영구 저장\n");
    }

    // 최종 검증
    await verify(db);
  } catch (err) {
    await db.query("ROLLBACK").catch(() => {});
    console.error("\n❌ 오류 발생, 롤백:", err.message);
    console.error(err.stack);
    throw err;
  } finally {
    await db.end();
  }
}

async function processPair(db, { remove, keep, removeName, keepName }) {
  console.log(`\n[Pair] ${removeName} → ${keepName}`);

  // Step 1: 중복 장소 삭제 (master 에 이미 있는 name)
  const dupDel = await db.query(
    `
    DELETE FROM place_seed_raw
    WHERE city_id = $1
      AND LOWER(name_en) IN (
        SELECT LOWER(name_en) FROM place_seed_raw WHERE city_id = $2
      )
  `,
    [remove, keep],
  );
  console.log(
    `  Step 1. 중복 장소 삭제 (master 에 이미 있음): ${dupDel.rowCount} rows`,
  );

  // Step 2: 고유 장소 이동 + rank offset (UNIQUE 제약 회피)
  // master 의 각 seed_category 최대 rank 찾아 그 이상으로 재할당
  const moveRes = await db.query(
    `
    WITH master_max AS (
      SELECT seed_category, COALESCE(MAX(rank), 0) AS max_rank
      FROM place_seed_raw WHERE city_id = $2
      GROUP BY seed_category
    ),
    to_move AS (
      SELECT
        psr.id,
        psr.seed_category,
        ROW_NUMBER() OVER (PARTITION BY psr.seed_category ORDER BY psr.rank) AS offset_n
      FROM place_seed_raw psr
      WHERE psr.city_id = $1
    )
    UPDATE place_seed_raw psr
    SET
      city_id = $2,
      rank = COALESCE((SELECT max_rank FROM master_max WHERE seed_category = psr.seed_category), 0) + tm.offset_n
    FROM to_move tm
    WHERE psr.id = tm.id
  `,
    [remove, keep],
  );
  console.log(
    `  Step 2. 고유 장소 이동 (rank 재할당): ${moveRes.rowCount} rows`,
  );

  // Step 3: 전체 master city 의 rank 연속화 (옵션 — 단일 쿼리로 깔끔하게)
  const remapRes = await db.query(
    `
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (PARTITION BY seed_category ORDER BY rank, id) AS new_rank
      FROM place_seed_raw
      WHERE city_id = $1
    )
    UPDATE place_seed_raw psr
    SET rank = ranked.new_rank
    FROM ranked
    WHERE psr.id = ranked.id
      AND psr.rank != ranked.new_rank
  `,
    [keep],
  );
  console.log(
    `  Step 3. master city 전체 rank 재정렬: ${remapRes.rowCount} rows`,
  );

  // 통계 (병합 후 seed_category 분포)
  const dist = await db.query(
    `SELECT seed_category, COUNT(*) AS n FROM place_seed_raw
      WHERE city_id = $1 AND collection_phase = 'bts2026'
      GROUP BY seed_category ORDER BY seed_category`,
    [keep],
  );
  console.log(`  병합 후 카테고리 분포:`);
  dist.rows.forEach((r) =>
    console.log(`    ${r.seed_category.padEnd(12)} ${r.n}`),
  );
  const total = dist.rows.reduce((s, r) => s + parseInt(r.n), 0);
  console.log(`    합계: ${total}`);
}

async function collectStats(db) {
  const ids = [112, 113, 117, 124, 125, 126];
  const stats = {};
  for (const id of ids) {
    const r = await db.query(
      `SELECT
        (SELECT COUNT(*) FROM place_seed_raw WHERE city_id = $1 AND collection_phase = 'bts2026') AS psr_bts,
        (SELECT COUNT(*) FROM cities WHERE id = $1) AS city_exists,
        (SELECT COUNT(*) FROM weather_cache WHERE city_id = $1) AS wc,
        (SELECT COUNT(*) FROM weather_forecast WHERE city_id = $1) AS wf
      `,
      [id],
    );
    stats[`city_${id}`] = r.rows[0];
  }
  return stats;
}

async function verify(db) {
  console.log("🔍 [Verify] 최종 상태 검증\n");
  const { rows } = await db.query(`
    SELECT
      c.id, c.bts_rank, c.name_en, c.name,
      (SELECT COUNT(*) FROM place_seed_raw WHERE city_id = c.id AND collection_phase = 'bts2026') AS psr_bts
    FROM cities c WHERE c.bts_rank IS NOT NULL
    ORDER BY c.bts_rank, c.name_en
  `);
  console.table(rows);

  // 중복 rank 확인
  const dupRanks = await db.query(`
    SELECT bts_rank, COUNT(*) AS n, STRING_AGG(name_en, ', ') AS names
    FROM cities WHERE bts_rank IS NOT NULL
    GROUP BY bts_rank HAVING COUNT(*) > 1
    ORDER BY bts_rank
  `);
  if (dupRanks.rows.length > 0) {
    console.log("\n⚠️ 여전히 중복 rank 존재:");
    console.table(dupRanks.rows);
  } else {
    console.log("\n✅ bts_rank 중복 없음 — 34 도시 단일 row");
  }

  // 병합 대상 cities 잔존 확인
  const residual = await db.query(
    `SELECT id, name_en FROM cities WHERE id IN (112, 113, 117)`,
  );
  if (residual.rows.length > 0) {
    console.log("\n⚠️ 삭제 대상 cities 아직 존재:");
    console.table(residual.rows);
  } else {
    console.log("✅ 중복 cities (112, 113, 117) 모두 삭제됨");
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
