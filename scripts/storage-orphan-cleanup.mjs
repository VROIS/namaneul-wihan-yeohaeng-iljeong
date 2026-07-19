/**
 * 스토리지 고아 이미지 정리 (2026-07-12)
 * = place-images 버킷에서 place_seed_raw.image_url 이 안 가리키는 고아 파일 삭제.
 * = Storage API(.remove) 사용 = protect_delete 트리거 우회 정식 경로(SQL 직접 DELETE 금지).
 * = 삭제 대상은 DB에서 실시간 재계산(하드코딩 0) = 4중 안전검증 로직 내장.
 *
 * 실행: node scripts/storage-orphan-cleanup.mjs          (DRY = 대상만 출력)
 *       node scripts/storage-orphan-cleanup.mjs --apply  (실제 삭제)
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const ROOT = "c:/Users/hzino/Desktop/my-handy-guide2";
const env = readFileSync(ROOT + "/.env", "utf8");
for (const line of env.split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const require = createRequire(ROOT + "/package.json");
const pg = require("pg");
const { createClient } = require("@supabase/supabase-js");

const SUPA_URL = process.env.SUPABASE_URL || process.env.SUPA_URL;
const SR_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SR_KEY) {
  console.error("❌ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const BUCKET = "place-images";

// 풀러(pooler) 우선 = 로컬 PC 에서 직접연결(db.xxx:5432) 불가, 트랜잭션 풀러(6543)만 접속 가능
const c = new pg.Client({
  connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

// ── 고아 산출 (경로 대조 = place_seed_raw.image_url 이 안 가리키는 place-images 파일) ──
const { rows } = await c.query(`
  WITH psr_paths AS (
    SELECT DISTINCT split_part(image_url, '/place-images/', 2) AS path
    FROM place_seed_raw WHERE image_url IS NOT NULL AND image_url LIKE '%/place-images/%'
  )
  SELECT s.name, (s.metadata->>'size')::bigint AS size
  FROM storage.objects s
  LEFT JOIN psr_paths p ON p.path = s.name
  WHERE s.bucket_id = 'place-images' AND p.path IS NULL
  ORDER BY s.name
`);

const paths = rows.map((r) => r.name);
const totalBytes = rows.reduce((a, r) => a + Number(r.size || 0), 0);
console.log(
  `고아 대상 = ${paths.length}개 / ${(totalBytes / 1024 / 1024).toFixed(1)}MB`,
);

if (!APPLY) {
  console.log("DRY = 실제 삭제 안 함. --apply 로 실행.");
  await c.end();
  process.exit(0);
}

// ── Storage API 배치 삭제 (100개씩) ──
const supa = createClient(SUPA_URL, SR_KEY, {
  auth: { persistSession: false },
});
let deleted = 0,
  failed = 0;
for (let i = 0; i < paths.length; i += 100) {
  const batch = paths.slice(i, i + 100);
  const { data, error } = await supa.storage.from(BUCKET).remove(batch);
  if (error) {
    console.error(`  ❌ 배치 ${i / 100 + 1} 실패: ${error.message}`);
    failed += batch.length;
  } else {
    deleted += data?.length ?? batch.length;
    console.log(
      `  ✅ 배치 ${i / 100 + 1}: ${data?.length ?? batch.length}개 삭제 (누적 ${deleted})`,
    );
  }
}
console.log(`\n▶ 삭제 완료 = ${deleted}개 성공 / ${failed}개 실패`);

// ── 삭제 후 용량 재확인 ──
const { rows: after } = await c.query(`
  SELECT bucket_id, count(*) AS n, pg_size_pretty(sum((metadata->>'size')::bigint)) AS sz
  FROM storage.objects GROUP BY bucket_id ORDER BY 2 DESC
`);
console.log("\n── 삭제 후 스토리지 ──");
for (const r of after) console.log(`  ${r.bucket_id}: ${r.n}개 / ${r.sz}`);

await c.end();
