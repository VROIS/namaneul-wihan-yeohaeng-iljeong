// ⚠️ 수정금지(승인필요) — place_seed_raw → places 동기화 파이프라인 (사용자 2026-04-25 승인)
//
// 목적: BTS 미니앱에서 Wikipedia 로 수집한 place_seed_raw 데이터를 메인앱 places 테이블로 동기화
//       → 이미지 공유 (psr.image_url → places.photo_urls[0])
//       → 장소 풀 확장 (psr-only 장소를 places 에 신규 INSERT)
//
// 처리 순서 (도시별):
//   Step 1. psr ↔ places 매칭 (이름 LOWER 정확 + 좌표 500m 이내)
//   Step 2. 이미지 주입: 공통 rows.places.photo_urls 배열 맨 앞에 psr.image_url prepend (중복 방지)
//   Step 3. 신규 INSERT: psr 에만 존재하는 장소를 places 에 생성
//   Step 4. 검증 쿼리: places rows + with_photo 카운트
//
// type 매핑 (places.type USER-DEFINED enum: attraction/cafe/restaurant/landmark/hotel):
//   restaurant → 'restaurant'
//   heritage/shopping/healing/hotspot/adventure/attraction → 'attraction' (기존 places 패턴 준수)
//
// 모드:
//   --dry-run        : 트랜잭션 롤백, 시뮬레이션만
//   --verify-only    : 읽기 전용, 현재 상태 조회
//   --city-id=<n>    : 특정 도시만 처리 (예: 107 = Foxborough)
//   --all-cities     : BTS 34 도시 전체 (bts_rank IS NOT NULL, bts_archived=false)
//   (기본)            : COMMIT (실제 반영)
//
// 실행 예시:
//   node scripts/p0-psr-to-places-sync.mjs --dry-run --city-id=107
//   node scripts/p0-psr-to-places-sync.mjs --city-id=107
//   node scripts/p0-psr-to-places-sync.mjs --all-cities --dry-run
//   node scripts/p0-psr-to-places-sync.mjs --all-cities

import pg from "pg";

const SUPA_URL =
  "postgresql://postgres.wxebceflvuythuodemro:Vrois%4075015@aws-1-eu-west-3.pooler.supabase.com:6543/postgres";

const DRY_RUN = process.argv.includes("--dry-run");
const VERIFY_ONLY = process.argv.includes("--verify-only");
const ALL_CITIES = process.argv.includes("--all-cities");
const CITY_ID_ARG = process.argv.find((a) => a.startsWith("--city-id="));
const CITY_ID = CITY_ID_ARG ? parseInt(CITY_ID_ARG.split("=")[1], 10) : null;

const COORD_THRESHOLD_KM = 0.5;

// seed_category → places.type (기존 places 데이터 패턴 준수)
const CATEGORY_TO_TYPE = {
  restaurant: "restaurant",
  heritage: "attraction",
  shopping: "attraction",
  healing: "attraction",
  hotspot: "attraction",
  adventure: "attraction",
  attraction: "attraction",
};

// Haversine 거리 (km)
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getTargetCities(db) {
  if (CITY_ID) {
    const r = await db.query(
      "SELECT id, name_en, bts_rank FROM cities WHERE id = $1",
      [CITY_ID],
    );
    if (r.rows.length === 0)
      throw new Error(`city_id ${CITY_ID} 존재하지 않음`);
    return r.rows;
  }
  if (ALL_CITIES) {
    const r = await db.query(`
      SELECT id, name_en, bts_rank FROM cities
        WHERE bts_rank IS NOT NULL
          AND COALESCE(bts_archived, false) = false
        ORDER BY bts_rank ASC
    `);
    return r.rows;
  }
  throw new Error("--city-id=<n> 또는 --all-cities 중 하나를 지정해야 합니다.");
}

async function processCity(db, city) {
  console.log(
    `\n🏙 [${city.name_en} (id=${city.id}, bts_rank=${city.bts_rank})]`,
  );

  const psrRes = await db.query(
    `SELECT id, name_en, latitude, longitude, seed_category, rank, image_url
       FROM place_seed_raw
      WHERE city_id = $1 AND collection_phase = 'bts2026'`,
    [city.id],
  );
  const plRes = await db.query(
    `SELECT id, name, latitude, longitude, type, photo_urls
       FROM places
      WHERE city_id = $1`,
    [city.id],
  );
  console.log(`  psr: ${psrRes.rows.length} / places: ${plRes.rows.length}`);

  // 매칭: 이름 lower + 좌표 500m 이내
  const matched = new Map();
  for (const psr of psrRes.rows) {
    for (const pl of plRes.rows) {
      if (psr.name_en.toLowerCase() !== pl.name.toLowerCase()) continue;
      if (psr.latitude && psr.longitude && pl.latitude && pl.longitude) {
        const dKm = haversineKm(
          psr.latitude,
          psr.longitude,
          pl.latitude,
          pl.longitude,
        );
        if (dKm > COORD_THRESHOLD_KM) {
          console.log(
            `  ⚠️  이름 일치하나 좌표 ${dKm.toFixed(2)}km > ${COORD_THRESHOLD_KM}km: ${psr.name_en}`,
          );
          continue;
        }
      }
      matched.set(psr.id, pl.id);
      break;
    }
  }
  console.log(`  🔗 매칭: ${matched.size}`);

  // 이미지 주입 (matched rows)
  let imageInjected = 0,
    imageSkipped = 0;
  for (const [psrId, placeId] of matched.entries()) {
    const psr = psrRes.rows.find((r) => r.id === psrId);
    const pl = plRes.rows.find((r) => r.id === placeId);
    if (!psr.image_url) {
      imageSkipped++;
      continue;
    }
    const existing = Array.isArray(pl.photo_urls) ? pl.photo_urls : [];
    if (existing.some((u) => u === psr.image_url)) {
      imageSkipped++;
      continue;
    }
    const newUrls = [psr.image_url, ...existing];
    await db.query(
      `UPDATE places SET photo_urls = $1::jsonb, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(newUrls), placeId],
    );
    imageInjected++;
  }
  console.log(
    `  📷 이미지 주입: ${imageInjected} (중복/URL없음 skip: ${imageSkipped})`,
  );

  // 신규 INSERT (psr only)
  let inserted = 0,
    coordSkipped = 0;
  for (const psr of psrRes.rows) {
    if (matched.has(psr.id)) continue;
    if (psr.latitude == null || psr.longitude == null) {
      coordSkipped++;
      continue;
    }
    const type = CATEGORY_TO_TYPE[psr.seed_category] || "attraction";
    await db.query(
      `INSERT INTO places (city_id, name, type, latitude, longitude, photo_urls, aliases, seed_category, vibe_score, is_verified)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, 7, false)`,
      [
        city.id,
        psr.name_en,
        type,
        psr.latitude,
        psr.longitude,
        JSON.stringify(psr.image_url ? [psr.image_url] : []),
        JSON.stringify([psr.name_en]),
        psr.seed_category,
      ],
    );
    inserted++;
  }
  console.log(
    `  ➕ 신규 INSERT: ${inserted} (좌표 없어 skip: ${coordSkipped})`,
  );

  return {
    matched: matched.size,
    imageInjected,
    imageSkipped,
    inserted,
    coordSkipped,
  };
}

async function verify(db, cities) {
  console.log("\n🔍 [Verify] 도시별 places 상태");
  const rows = [];
  for (const city of cities) {
    const r = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM places WHERE city_id = $1) AS places_total,
         (SELECT COUNT(*) FROM places WHERE city_id = $1 AND photo_urls IS NOT NULL AND photo_urls != '[]'::jsonb) AS with_photo,
         (SELECT COUNT(*) FROM place_seed_raw WHERE city_id = $1 AND collection_phase = 'bts2026') AS psr_count`,
      [city.id],
    );
    rows.push({
      bts_rank: city.bts_rank,
      name: city.name_en,
      places: r.rows[0].places_total,
      with_photo: r.rows[0].with_photo,
      psr: r.rows[0].psr_count,
    });
  }
  console.table(rows);

  // 샘플 첫 photo_url HEAD 체크용 출력 (최대 5개)
  if (cities.length <= 3) {
    for (const city of cities) {
      const r = await db.query(
        `SELECT id, name, (photo_urls->>0) AS first_photo
           FROM places WHERE city_id = $1
           ORDER BY id DESC LIMIT 5`,
        [city.id],
      );
      console.log(`\n  [${city.name_en}] 최근 5 places photo_urls[0]:`);
      console.table(r.rows);
    }
  }
}

async function run() {
  const db = new pg.Client({ connectionString: SUPA_URL });
  await db.connect();

  const mode = VERIFY_ONLY ? "VERIFY-ONLY" : DRY_RUN ? "DRY-RUN" : "COMMIT";
  console.log(`\n🚀 [PSR→Places Sync] 시작 (${mode})`);

  try {
    const cities = await getTargetCities(db);
    console.log(`대상 도시: ${cities.length}`);

    if (VERIFY_ONLY) {
      await verify(db, cities);
      await db.end();
      return;
    }

    await db.query("BEGIN");

    const totals = {
      matched: 0,
      imageInjected: 0,
      imageSkipped: 0,
      inserted: 0,
      coordSkipped: 0,
    };
    for (const city of cities) {
      const s = await processCity(db, city);
      totals.matched += s.matched;
      totals.imageInjected += s.imageInjected;
      totals.imageSkipped += s.imageSkipped;
      totals.inserted += s.inserted;
      totals.coordSkipped += s.coordSkipped;
    }

    console.log(`\n=== 전체 합계 ===`);
    console.log(`매칭: ${totals.matched}`);
    console.log(
      `이미지 주입: ${totals.imageInjected} (skip: ${totals.imageSkipped})`,
    );
    console.log(
      `신규 INSERT: ${totals.inserted} (좌표 없어 skip: ${totals.coordSkipped})`,
    );

    if (DRY_RUN) {
      await db.query("ROLLBACK");
      console.log("\n🔄 [DRY-RUN] 롤백 완료\n");
    } else {
      await db.query("COMMIT");
      console.log("\n✅ [COMMIT] 영구 저장\n");
    }

    await verify(db, cities);
  } catch (err) {
    await db.query("ROLLBACK").catch(() => {});
    console.error("\n❌ 오류, 롤백:", err.message);
    console.error(err.stack);
    throw err;
  } finally {
    await db.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
