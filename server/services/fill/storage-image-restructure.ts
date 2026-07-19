// ⚠️ 영구 컴포넌트 2026-06-15 사장님 SSOT = place-images 옛 경로({cityId}/{rowId}-{ts}.jpg) → 표준({cityId}/{category}/{PID}.jpg) 통일.
//   = 이유: PID 결정적 경로여야 row 바뀌어도(merge/rename) relink 가 항상 찾음 = 고아 0 = Storage↔DB image_url 도일화 (사장님 SSOT).
//   = 옛 #06 이 {rowId}-{ts} 로 저장하던 흔적(코드는 이미 PID경로로 수정됨, 잔존 파일만 정리). 작업도시(파리·마드리드)만 존재.
//   = 동작: 옛파일 다운 → 표준경로 PUT(x-upsert) → DB image_url 갱신(upsertPlace, PID매칭) → 옛파일 삭제. (raw 와 달리 DB 갱신 동반.)
//   = PID 없는 행 = 표준경로 불가(= 구글이미지 자격 미달) = 건드리지 않음(보고만). best-effort 개별.
// 호출: npx tsx server/services/fill/storage-image-restructure.ts [--city-id=19] [--apply]   (없으면 DRY)
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
process.chdir(ROOT);
const envRaw = fs.readFileSync(".env", "utf-8").replace(/^﻿/, "");
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    let v = m[2].trim();
    if (/^['"]/.test(v)) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}
const argv = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a) => a.replace(/^--/, "").split("="))
    .map(([k, v]) => [k, v ?? "true"]),
);
const onlyCity = argv["city-id"] ? Number(argv["city-id"]) : null;
const apply = argv["apply"] === "true";
const BUCKET = "place-images";

(async () => {
  const pg = await import("pg");
  const c = new (pg as any).default.Client({
    connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  // 옛 형식 객체 = {cityId}/{rowId}-{ts}.jpg → rowId 추출해 행과 조인 (PID·category·현재 image_url 확보)
  const rows = (
    await c.query(
      `
    WITH oldimg AS (
      SELECT o.name,
        split_part(o.name,'/',1)::int AS city_id,
        (regexp_match(split_part(o.name,'/',2), '^([0-9]+)-'))[1]::int AS row_id
      FROM storage.objects o
      WHERE o.bucket_id=$1 AND o.name ~ '^[0-9]+/[0-9]+-[0-9]+\\.(jpg|jpeg|png|webp)$'
    )
    SELECT oi.name AS old_obj, oi.city_id, oi.row_id,
           p.seed_category AS cat, p.name_en, p.google_place_id AS pid, p.image_url
    FROM oldimg oi LEFT JOIN place_seed_raw p ON p.id = oi.row_id
    ${onlyCity ? "WHERE oi.city_id = " + onlyCity : ""}
    ORDER BY oi.city_id, oi.row_id`,
      [BUCKET],
    )
  ).rows;

  const SUPA =
    process.env.SUPABASE_PUBLIC_URL ||
    "https://wxebceflvuythuodemro.supabase.co";
  const KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_KEY;
  const stdObj = (r: any) => `${r.city_id}/${r.cat}/${r.pid}.jpg`;
  const stdUrl = (r: any) =>
    `${SUPA}/storage/v1/object/public/${BUCKET}/${stdObj(r)}`;

  const movable = rows.filter((r: any) => r.row_id && r.cat && r.pid); // PID 보유 = 표준경로 가능
  const skipNoPid = rows.filter((r: any) => !r.pid || !r.cat); // PID 없음 = 자격 미달

  console.log(
    `═══ storage-image-restructure ${apply ? "(APPLY)" : "(DRY)"} = 옛형식 ${rows.length} (${onlyCity ? "city " + onlyCity : "전 도시"}) ═══`,
  );
  console.log(
    `표준화 가능(PID有) ${movable.length} / 건너뜀(PID無) ${skipNoPid.length}`,
  );
  const byCity: Record<string, number> = {};
  for (const r of movable) byCity[r.city_id] = (byCity[r.city_id] || 0) + 1;
  console.log(
    `도시별 = ${Object.entries(byCity)
      .map(([k, v]) => `${k}:${v}`)
      .join(" / ")}`,
  );
  console.log("\n[표준화 매핑 샘플]");
  movable
    .slice(0, 5)
    .forEach((r: any) =>
      console.log(`  ${r.old_obj} → ${stdObj(r)} (${r.name_en})`),
    );
  if (skipNoPid.length) {
    console.log("\n[PID無 건너뜀]");
    skipNoPid.forEach((r: any) =>
      console.log(`  ${r.old_obj} (row ${r.row_id} ${r.name_en || "row없음"})`),
    );
  }

  if (!apply) {
    await c.end();
    console.log("\n=== DRY 완료 (--apply 로 이동+DB갱신) ===");
    return;
  }
  if (!KEY) {
    await c.end();
    console.error("✗ Storage KEY 미비");
    return;
  }

  const { upsertPlace } = await import(
    pathToFileURL(path.join(ROOT, "server/services/place-upsert.ts")).href
  );
  let moved = 0,
    dbUpd = 0,
    err = 0;
  for (const r of movable) {
    try {
      // 표준경로에 이미 같은 파일 있으면 다운로드 생략(중복 방지) — 없으면 옛것 복사
      const dst = stdObj(r);
      const head = await fetch(
        `${SUPA}/storage/v1/object/info/${BUCKET}/${encodeURI(dst)}`,
        {
          headers: { Authorization: `Bearer ${KEY}` },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!head.ok) {
        const body = Buffer.from(
          await (
            await fetch(
              `${SUPA}/storage/v1/object/${BUCKET}/${encodeURI(r.old_obj)}`,
              {
                headers: { Authorization: `Bearer ${KEY}` },
                signal: AbortSignal.timeout(20000),
              },
            )
          ).arrayBuffer(),
        );
        const put = await fetch(
          `${SUPA}/storage/v1/object/${BUCKET}/${encodeURI(dst)}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${KEY}`,
              "Content-Type": "image/jpeg",
              "x-upsert": "true",
            },
            body,
            signal: AbortSignal.timeout(20000),
          },
        );
        if (!put.ok) {
          err++;
          console.error(`  ✗ PUT ${dst}: ${put.status}`);
          continue;
        }
      }
      // DB image_url = 표준 URL 로 갱신 (upsertPlace = PID 매칭 = 기존행 UPDATE)
      const res = await upsertPlace({
        cityId: r.city_id,
        seedCategory: r.cat,
        nameEn: r.name_en,
        googlePlaceId: r.pid,
        imageUrl: stdUrl(r),
      });
      if (res.action === "updated" || res.action === "inserted") dbUpd++;
      // 옛 파일 삭제
      const del = await fetch(
        `${SUPA}/storage/v1/object/${BUCKET}/${encodeURI(r.old_obj)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${KEY}` },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (del.ok) moved++;
      else
        console.error(
          `  ⚠️ 표준PUT+DB ok but 옛삭제 실패 ${r.old_obj}: ${del.status}`,
        );
    } catch (e: any) {
      err++;
      console.error(`  ✗ ${r.old_obj}: ${e.message}`);
    }
  }
  await c.end();
  console.log(
    `\n═══ 이동 ${moved} / DB갱신 ${dbUpd} / 실패 ${err} (PID無 건너뜀 ${skipNoPid.length}) ═══`,
  );
})();
