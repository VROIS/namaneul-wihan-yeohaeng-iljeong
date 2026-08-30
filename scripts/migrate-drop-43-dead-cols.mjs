import "dotenv/config";
import pg from "pg";

function convertToPoolerUrl(u) {
  const m = u.match(
    /postgresql:\/\/postgres:([^@]+)@db\.([^.]+)\.supabase\.co:5432\/postgres/,
  );
  if (m)
    return `postgresql://postgres.${m[2]}:${m[1]}@aws-1-eu-west-3.pooler.supabase.com:6543/postgres`;
  return u;
}

const DRY = !process.argv.includes("--apply");
const FORCE = process.argv.includes("--force"); // 백업 후 강제 DROP
console.log(
  `Mode: ${DRY ? "DRY RUN" : "🔴 APPLY"} ${FORCE ? "(FORCE = 백업 후 강제)" : ""}\n`,
);

if (FORCE && !DRY) {
  const fs = await import("fs");
  const today = new Date().toISOString().slice(0, 10);
  const backupPath = `backups/place_seed_raw_pre_drop43_${today}.json`;
  if (!fs.existsSync(backupPath)) {
    console.error(`❌ 백업 파일 없음: ${backupPath}`);
    console.error(
      `   먼저 = node scripts/backup-place-seed-raw-43-cols.mjs 실행`,
    );
    process.exit(1);
  }
  const stat = fs.statSync(backupPath);
  console.log(
    `✅ 백업 확인: ${backupPath} (${(stat.size / 1024).toFixed(1)} KB)\n`,
  );
}

const DEAD_COLS = [
  "delivery",
  "dine_in",
  "takeout",
  "curbside_pickup",
  "reservable",
  "serves_beer",
  "serves_wine",
  "serves_breakfast",
  "serves_brunch",
  "serves_lunch",
  "serves_dinner",
  "serves_vegetarian_food",
  "serves_coffee",
  "serves_dessert",
  "good_for_children",
  "good_for_groups",
  "good_for_watching_sports",
  "live_music",
  "outdoor_seating",
  "restroom",
  "menu_for_children",
  "allows_dogs",
  "accessibility_options",
  "parking_options",
  "payment_options",
  "instagram_photo_urls",
  "instagram_hashtags",
  "instagram_post_count",
  "celeb_mention",
  "names_i18n",
  "type",
  "cuisine_type",
  "cuisine_origin_country",
  "short_address",
  "display_name_ko",
  "aliases",
  "price_fetched_at",
  "last_data_sync",
  "price_level",
  "business_status",
  "website_uri",
  "phone_number",
  "google_maps_uri",
];

console.log(`삭제 대상: ${DEAD_COLS.length} 컬럼`);

const c = new pg.Client({
  connectionString: convertToPoolerUrl(process.env.DATABASE_URL),
  ssl: { rejectUnauthorized: false },
});
await c.connect();

console.log("\n[사전 검증]");
const before = await c.query(`SELECT COUNT(*) as n FROM place_seed_raw`);
const colsBefore = await c.query(
  `SELECT COUNT(*) as n FROM information_schema.columns WHERE table_name='place_seed_raw'`,
);
console.log(`  row 수: ${before.rows[0].n}`);
console.log(`  컬럼 수: ${colsBefore.rows[0].n}`);

console.log("\n[데드 검증 = 정말 0 % 채움?]");
let allDead = true;
for (const col of DEAD_COLS) {
  try {
    const r = await c.query(
      `SELECT COUNT(*) FILTER (WHERE ${col} IS NOT NULL) AS n FROM place_seed_raw`,
    );
    const n = parseInt(r.rows[0].n);
    if (n > 0) {
      console.log(`  ⚠️ ${col} = ${n} row 채워짐 = SKIP!`);
      allDead = false;
    }
  } catch (e) {
    console.log(`  ⚠️ ${col} = 컬럼 미존재 = SKIP`);
  }
}

if (!allDead && !FORCE) {
  console.log("\n❌ 데드 아님 = 일부 컬럼 데이터 보유 = 실행 중단");
  console.log("   = 백업 후 --force 옵션으로 강제 실행 가능");
  await c.end();
  process.exit(1);
}
if (!allDead && FORCE) {
  console.log("  ⚠️ 일부 데이터 있음 = FORCE 모드 = 백업 후 강제 진행");
} else {
  console.log("  ✅ 모두 0% 확인 = 안전");
}

if (DRY) {
  console.log("\n[DRY RUN] 실행 X. 실제 적용 = --apply");
  console.log(`\n예정 SQL:`);
  console.log(`BEGIN;`);
  DEAD_COLS.forEach((c) =>
    console.log(`  ALTER TABLE place_seed_raw DROP COLUMN IF EXISTS ${c};`),
  );
  console.log(`COMMIT;`);
  await c.end();
  process.exit(0);
}

console.log("\n[실행 = 트랜잭션 BEGIN]");
try {
  await c.query("BEGIN");

  for (const col of DEAD_COLS) {
    await c.query(`ALTER TABLE place_seed_raw DROP COLUMN IF EXISTS ${col}`);
    console.log(`  ✅ DROP ${col}`);
  }

  const after = await c.query(`SELECT COUNT(*) as n FROM place_seed_raw`);
  if (after.rows[0].n !== before.rows[0].n) {
    throw new Error(`row 수 변화: ${before.rows[0].n} → ${after.rows[0].n}`);
  }

  const colsAfter = await c.query(
    `SELECT COUNT(*) as n FROM information_schema.columns WHERE table_name='place_seed_raw'`,
  );
  console.log(`\n[검증]`);
  console.log(`  row 수: ${after.rows[0].n} (= 변화 없음 ✅)`);
  console.log(
    `  컬럼 수: ${colsBefore.rows[0].n} → ${colsAfter.rows[0].n} (= ${colsBefore.rows[0].n - colsAfter.rows[0].n} 삭제)`,
  );

  await c.query("COMMIT");
  console.log("\n✅ COMMIT 완료");
} catch (e) {
  await c.query("ROLLBACK");
  console.error(`\n❌ ROLLBACK: ${e.message}`);
  process.exit(1);
}

await c.end();
