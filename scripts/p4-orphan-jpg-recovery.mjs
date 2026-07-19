// 39 orphan JPG 복구 (사용자 2026-04-28 승인)
// 04-27 cron run #25002971649 + #25004751231 의 JPG 39장 = DB row 자체 없음
// 04-28 cron 이 같은 장소를 다른 row_id 로 다시 INSERT (sequence 재발급)
// = 이름 매칭으로 storage rename + DB image_url 백필 가능
//
// 사용법:
//   node scripts/p4-orphan-jpg-recovery.mjs --dry-run          # 매칭만 확인
//   node scripts/p4-orphan-jpg-recovery.mjs --commit            # 실제 rename + UPDATE

import "dotenv/config";
import pg from "pg";
import { execSync } from "child_process";

const SUPA_URL = process.env.SUPA_URL || process.env.DATABASE_URL;
if (!SUPA_URL) {
  console.error("❌ SUPA_URL 미설정");
  process.exit(1);
}

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? true];
    }),
);
const COMMIT = !!args.commit;
const DRY_RUN = !COMMIT;

const CITY_ID = 101;
const BUCKET = "place-images";
const RUN_IDS = ["25002971649", "25004751231"]; // 04-27 cron runs

// ━━━━━━ Helper: 이름 정규화 ━━━━━━
const normalize = (s) => (s || "").toLowerCase().trim().replace(/\s+/g, " ");

// ━━━━━━ Storage move via Supabase REST API ━━━━━━
async function storageMove(supabaseUrl, key, sourcePath, destPath) {
  const res = await fetch(`${supabaseUrl}/storage/v1/object/move`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      bucketId: BUCKET,
      sourceKey: sourcePath,
      destinationKey: destPath,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`storage move 실패 ${res.status}: ${t.slice(0, 150)}`);
  }
  return await res.json();
}

// ━━━━━━ Main ━━━━━━
const db = new pg.Client({
  connectionString: SUPA_URL,
  ssl: { rejectUnauthorized: false },
});
await db.connect();
console.log(`🚀 39 orphan JPG 복구 (${DRY_RUN ? "DRY-RUN" : "COMMIT"})\n`);

try {
  // 1) Storage 의 모든 orphan 파일 + 대응 DB row 상태
  const sf = await db.query(
    `
    SELECT
      o.name AS storage_path,
      split_part(o.name, '/', 2) AS category,
      split_part(split_part(o.name, '/', 3), '.', 1)::int AS old_row_id,
      p.id AS db_match
    FROM storage.objects o
    LEFT JOIN place_seed_raw p ON p.id = split_part(split_part(o.name, '/', 3), '.', 1)::int
      AND p.city_id = $1 AND p.collection_phase = 'bts2026'
    WHERE o.bucket_id = $2 AND o.name LIKE $3
  `,
    [CITY_ID, BUCKET, `${CITY_ID}/%`],
  );

  const orphans = sf.rows.filter((r) => r.db_match === null);
  console.log(
    `📦 Storage 총: ${sf.rows.length} 파일 / Orphan (DB row 없음): ${orphans.length}\n`,
  );
  if (orphans.length === 0) {
    console.log("✅ Orphan 0건 — 작업 종료");
    process.exit(0);
  }

  // 2) 04-27 cron run 로그 추출 (gh CLI)
  console.log(`📥 04-27 cron run 로그 추출 (${RUN_IDS.join(", ")})`);
  const oldRowToName = new Map(); // 56741 → "Franklin Mountains State Park"
  for (const runId of RUN_IDS) {
    let logText = "";
    try {
      logText = execSync(`gh run view ${runId} --log`, {
        encoding: "utf8",
        maxBuffer: 50 * 1024 * 1024,
      });
    } catch (e) {
      console.error(
        `   ❌ run ${runId} 로그 추출 실패: ${e.message.slice(0, 100)}`,
      );
      continue;
    }
    // 파싱: 📍 #56741 [attraction] Franklin Mountains State Park
    const re = /📍\s+#(\d+)\s+\[(\w+)\]\s+(.+?)$/gm;
    let m,
      count = 0;
    while ((m = re.exec(logText)) !== null) {
      const [, rowId, cat, name] = m;
      // ANSI escape + 시간 prefix 제거
      const cleanName = name.replace(/\x1b\[[0-9;]*m/g, "").trim();
      oldRowToName.set(parseInt(rowId, 10), { category: cat, name: cleanName });
      count++;
    }
    console.log(`   ✓ run ${runId}: ${count} row 추출`);
  }
  console.log(`   = 총 추출: ${oldRowToName.size} row\n`);

  // 3) 살아있는 163 row name_en 로딩 (정규화 → row_id 맵)
  const live = await db.query(
    `
    SELECT id, seed_category, name_en
    FROM place_seed_raw
    WHERE city_id = $1 AND collection_phase = 'bts2026'
  `,
    [CITY_ID],
  );
  const liveByNameCat = new Map(); // "${cat}\t${normalized_name}" → row_id
  for (const r of live.rows) {
    const key = `${r.seed_category}\t${normalize(r.name_en)}`;
    liveByNameCat.set(key, r.id);
  }
  console.log(`📊 살아있는 row: ${live.rows.length}\n`);

  // 4) Storage 이동 준비 (anon key)
  let supabaseAnonKey = null,
    supabasePublicUrl = null;
  if (COMMIT) {
    const k1 = await db.query(
      "SELECT key_value FROM api_keys WHERE key_name='SUPABASE_ANON_KEY' AND is_active=true LIMIT 1",
    );
    supabaseAnonKey = k1.rows[0]?.key_value;
    if (!supabaseAnonKey) throw new Error("SUPABASE_ANON_KEY 없음");
    // SUPABASE URL 추출
    const m =
      SUPA_URL.match(/db\.([a-z0-9]+)\.supabase\.co/) ||
      SUPA_URL.match(/postgres\.([a-z0-9]+):/);
    if (!m) throw new Error("SUPABASE_URL 추정 실패");
    supabasePublicUrl = `https://${m[1]}.supabase.co`;
    console.log(`🔑 Storage API ready (${supabasePublicUrl})\n`);
  }

  // 5) 매칭 + (DRY/COMMIT) 작업
  console.log("🔍 매칭 시도:");
  console.log("─".repeat(80));
  const matched = [],
    unmatched = [];

  for (const orphan of orphans) {
    const oldInfo = oldRowToName.get(orphan.old_row_id);
    if (!oldInfo) {
      unmatched.push({ ...orphan, reason: "04-27 로그에 없음" });
      continue;
    }
    const matchKey = `${oldInfo.category}\t${normalize(oldInfo.name)}`;
    const newRowId = liveByNameCat.get(matchKey);
    if (!newRowId) {
      unmatched.push({
        ...orphan,
        reason: `살아있는 row 없음 ("${oldInfo.name}")`,
      });
      continue;
    }
    matched.push({
      old_path: orphan.storage_path,
      new_path: `${CITY_ID}/${orphan.category}/${newRowId}.jpg`,
      old_row_id: orphan.old_row_id,
      new_row_id: newRowId,
      category: orphan.category,
      name: oldInfo.name,
    });
  }
  console.log(`매칭 성공: ${matched.length} / 실패: ${unmatched.length}\n`);

  // 6) 매칭 성공 처리
  if (matched.length > 0) {
    console.log("✅ 매칭 성공 (" + matched.length + "건):");
    let success = 0,
      failed = 0;
    for (const m of matched) {
      console.log(`   ${m.old_path} → ${m.new_path}  (${m.name})`);
      if (DRY_RUN) continue;

      try {
        // Storage move
        await storageMove(
          supabasePublicUrl,
          supabaseAnonKey,
          m.old_path,
          m.new_path,
        );

        // DB UPDATE
        const newUrl = `${supabasePublicUrl}/storage/v1/object/public/${BUCKET}/${m.new_path}`;
        const attribution = `Photo via Google Places (recovered from 04-27 cron)`;
        await db.query(
          `
          UPDATE place_seed_raw
          SET image_url = COALESCE(image_url, $1),
              image_attribution = COALESCE(image_attribution, $2),
              image_updated_at = COALESCE(image_updated_at, NOW())
          WHERE id = $3 AND (image_url IS NULL OR image_url = '')
        `,
          [newUrl, attribution, m.new_row_id],
        );
        success++;
      } catch (e) {
        console.error(`     ❌ 실패: ${e.message.slice(0, 100)}`);
        failed++;
      }
    }
    if (COMMIT)
      console.log(`\n   COMMIT 결과: 성공 ${success} / 실패 ${failed}`);
  }

  // 7) 매칭 실패 보고
  if (unmatched.length > 0) {
    console.log("\n⚠️ 매칭 실패 (" + unmatched.length + "건, NULL 유지):");
    for (const u of unmatched) {
      console.log(`   ${u.storage_path}  ─  ${u.reason}`);
    }
  }

  // 8) 종합
  console.log("\n" + "═".repeat(80));
  console.log("🎯 최종 결과");
  console.log("═".repeat(80));
  console.log(`Storage 총                : ${sf.rows.length} 파일`);
  console.log(`Orphan (DB row 없음)      : ${orphans.length}`);
  console.log(`매칭 성공 (복구 대상)     : ${matched.length}`);
  console.log(`매칭 실패 (NULL 유지)     : ${unmatched.length}`);
  console.log(
    `모드                      : ${DRY_RUN ? "DRY-RUN (DB/Storage 변경 X)" : "COMMIT 완료"}`,
  );
  console.log("═".repeat(80));

  if (DRY_RUN && matched.length > 0) {
    console.log(
      `\n→ 검토 OK 면 --commit 으로 재실행하여 ${matched.length}건 복구`,
    );
  }
} catch (e) {
  console.error("❌", e.message);
  process.exit(1);
} finally {
  await db.end();
}
