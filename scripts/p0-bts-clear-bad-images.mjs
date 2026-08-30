// ⚠️ 수정금지(승인필요) — BTS psr 매칭율 낮은 이미지 제거 (사용자 2026-04-25 승인)

import pg from "pg";

const SUPA_URL =
  "postgresql://postgres.wxebceflvuythuodemro:Vrois%4075015@aws-1-eu-west-3.pooler.supabase.com:6543/postgres";
const DRY_RUN = process.argv.includes("--dry-run");
const THRESHOLD_ARG = process.argv.find((a) => a.startsWith("--threshold="));
const THRESHOLD = THRESHOLD_ARG
  ? parseFloat(THRESHOLD_ARG.split("=")[1])
  : 0.25;

const STOP = new Set([
  "the",
  "of",
  "a",
  "an",
  "and",
  "or",
  "in",
  "on",
  "at",
  "to",
  "for",
  "by",
  "with",
  "from",
  "de",
  "la",
  "le",
  "les",
  "du",
  "des",
  "el",
  "los",
  "las",
  "il",
  "di",
  "da",
  "i",
  "y",
  "von",
  "der",
  "das",
  "die",
  "van",
  "en",
  "og",
  "pa",
  "av",
]);

function tokenize(s) {
  if (!s) return [];
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[\s\-_.,'"()\[\]!?#&%$/\\:;]+/)
    .filter((t) => t && t.length >= 2 && !STOP.has(t));
}

function extractFilename(url) {
  if (!url) return "";
  try {
    const decoded = decodeURIComponent(url);
    const last = decoded.split("/").pop() || "";
    return last
      .replace(/^\d+px-/, "")
      .replace(/\.(jpg|jpeg|png|svg|webp|gif)(\.[a-z]+)?$/i, "");
  } catch {
    return "";
  }
}

function matchRatio(name, url) {
  const nt = tokenize(name);
  if (nt.length === 0) return 0;
  const ft = new Set(tokenize(extractFilename(url)));
  return nt.filter((t) => ft.has(t)).length / nt.length;
}

const db = new pg.Client({ connectionString: SUPA_URL });
await db.connect();

console.log(
  `\n🚀 [BTS Clear Bad Images] ${DRY_RUN ? "DRY-RUN" : "COMMIT"} (threshold=${THRESHOLD})`,
);

const rows = await db.query(`
  SELECT id, city_id, name_en, seed_category, rank, image_url
  FROM place_seed_raw
  WHERE collection_phase = 'bts2026'
    AND city_id IN (SELECT id FROM cities WHERE bts_rank IS NOT NULL AND COALESCE(bts_archived, false) = false)
    AND image_url IS NOT NULL AND image_url != ''
`);
console.log(`전체 대상: ${rows.rows.length} rows`);

const targets = rows.rows.filter(
  (r) => matchRatio(r.name_en, r.image_url) < THRESHOLD,
);
console.log(`<${THRESHOLD * 100}% 매칭 (drop 대상): ${targets.length} rows`);

const cityRes = await db.query(
  `SELECT id, name_en, bts_rank FROM cities WHERE bts_rank IS NOT NULL ORDER BY bts_rank`,
);
const cityMap = new Map(cityRes.rows.map((c) => [c.id, c]));

const matrix = {};
for (const r of targets) {
  const city = cityMap.get(r.city_id);
  if (!city) continue;
  const k = `${city.bts_rank}_${city.name_en}`;
  if (!matrix[k])
    matrix[k] = { rank: city.bts_rank, city: city.name_en, total: 0 };
  matrix[k][r.seed_category] = (matrix[k][r.seed_category] || 0) + 1;
  matrix[k].total++;
}
const matrixRows = Object.values(matrix).sort((a, b) => a.rank - b.rank);
console.log("\n=== 도시별 image_url NULL 처리 영향 ===");
console.table(matrixRows);

const catTotal = {};
for (const r of targets)
  catTotal[r.seed_category] = (catTotal[r.seed_category] || 0) + 1;
console.log("\n=== 카테고리별 합계 ===");
console.table(catTotal);

if (DRY_RUN) {
  console.log("\n🔄 [DRY-RUN] DB 변경 없음. COMMIT 시 영향 위와 동일\n");
  await db.end();
  process.exit(0);
}

console.log(`\n⚙️  실제 UPDATE 시작 (${targets.length} rows)...`);
let done = 0;
const BATCH = 100;
for (let i = 0; i < targets.length; i += BATCH) {
  const ids = targets.slice(i, i + BATCH).map((r) => r.id);
  await db.query(
    `UPDATE place_seed_raw SET image_url = NULL, updated_at = NOW() WHERE id = ANY($1::int[])`,
    [ids],
  );
  done += ids.length;
  if (done % 500 === 0 || done === targets.length)
    console.log(`  ${done}/${targets.length}`);
}

const verify = await db.query(`
  SELECT
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE image_url IS NULL OR image_url = '') AS empty_img
  FROM place_seed_raw
  WHERE collection_phase = 'bts2026'
    AND city_id IN (SELECT id FROM cities WHERE bts_rank IS NOT NULL AND COALESCE(bts_archived, false) = false)
`);
console.log("\n✅ COMMIT 완료. 사후 상태:");
console.table(verify.rows);

await db.end();
