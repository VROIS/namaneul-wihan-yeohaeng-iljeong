// ⚠️ 수정금지(승인필요) 2026-06-04 = fill/ts-backfill = PID 없는 행 TS 재검증·보강 (= 06 method 의 관문판, 융합)
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
const cityId = Number(argv["city-id"] || 0);
const apply = argv["apply"] === "true";
// ⚠️ 수정금지(승인필요) — languageCode 제거(2026-06-17 사장님 SSOT) = --lang 명시 시에만 사용, 미지정 = undefined(ts-client 가 키 생략 = 한국어 강제 안 함)
const lang = argv["lang"] ? String(argv["lang"]) : undefined;
const cats = argv["category"]
  ? String(argv["category"])
      .split(",")
      .map((s) => s.trim())
  : ["heritage", "hotspot", "attraction", "adventure", "healing", "shopping"];
const ids = argv["ids"]
  ? String(argv["ids"])
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
  : null;
if (!cityId) {
  console.error(
    "Usage: --city-id=<N> [--apply] [--lang=fr] [--category=heritage,...] [--ids=1,2,3]",
  );
  process.exit(1);
}

// ⚠️ 수정금지(승인필요) 2026-06-23 사장님 SSOT = 좌표 앵커 = 무조건 10m (= 매칭기준 10m 동일 = 도심밀집 환각차단). 옛 100m="실용앵커" AI임의 폐기(§19).
const ANCHOR_M = 10;
const hkm = (a: any, b: any) => {
  const R = 6371,
    dLat = ((b.lat - a.lat) * Math.PI) / 180,
    dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

(async () => {
  const { tsSearch } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/ts-client.ts")).href
  );
  const { upsertPlace } = await import(
    pathToFileURL(path.join(ROOT, "server/services/place-upsert.ts")).href
  );
  const pg = await import("pg");
  const c = new (pg as any).default.Client({
    connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const city = (
    await c.query("SELECT name_en, country_code FROM cities WHERE id=$1", [
      cityId,
    ])
  ).rows[0];
  if (!city) {
    await c.end();
    console.error(
      `✗ city ${cityId} 미존재 = 중단 (잘못된 city-id 가 FR 기본값으로 오염되는 것 방지)`,
    );
    process.exit(1);
  }
  // ⚠️ 2026-06-18 사장님 SSOT = 출입증 관문 issue_api_key() 경유 (§19). TS 재검증·보강 = 채움 = 도시 있음 + 행 있음(true).
  const today = new Date().toISOString().slice(0, 10);
  const { issueApiKey } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/issue-api-key.ts"))
      .href
  );
  const KEY = await issueApiKey(c, "GOOGLE_MAPS_API_KEY", cityId, today, true);
  if (!KEY) {
    await c.end();
    console.error("Google key 미존재");
    process.exit(1);
  }

  // ⚠️ 수정금지(승인필요) 2026-08-26 사장님 승인 = --ids 지목 행은 PID 유무 무관 재검증(사장님이 행을 지목 = 의심 PID 포함).
  const rows = (
    await c.query(
      `SELECT id, seed_category, name_en, name_local, address, latitude::float8 AS lat, longitude::float8 AS lng, google_review_count AS rc
     FROM place_seed_raw
     WHERE city_id=$1 AND seed_category = ANY($2::text[])
     ${ids ? "AND id = ANY($3::int[])" : "AND google_place_id IS NULL"}
     ORDER BY seed_category, google_review_count DESC NULLS LAST`,
      ids ? [cityId, cats, ids] : [cityId, cats],
    )
  ).rows;

  console.log(
    `═══ ts-backfill (city ${cityId} ${city?.name_en}) = PID 없는 ${rows.length}곳 ═══`,
  );
  if (!apply) {
    console.log(
      `[대상]\n  ${rows.map((r: any) => `${r.name_local || r.name_en} (${r.seed_category}, RC ${r.rc ?? "?"}, ${r.lat != null ? "좌표O" : "좌표X"})`).join("\n  ")}`,
    );
    // 2026-08-23 사장님 = 실행 전 시뮬 = 이달 TS 잔량 + 진행 시 추가과금(€)
    const { simulateCost } = await import("../shared/external-call-log");
    const sim = await simulateCost("ts", rows.length);
    console.log(
      `[시뮬] TS 이달 ${sim.used}/${sim.cap} 잔량 ${sim.remaining} · 계획 ${sim.planned} → 추가과금 €${sim.extraEur}`,
    );
    console.log(`\n=== DRY (--apply 로 실행) ===`);
    await c.end();
    return;
  }

  // ⚠️ 2026-08-23 사장님 승인 = 관리자 배치 무료잔량 게이트 = 이달 TS 무료(1,000) 잔량 안에서만 실행(--force-quota = 승인 시)
  const { gateBatch } = await import("../shared/external-call-log");
  await gateBatch("ts", rows.length, { force: argv["force-quota"] === "true" });

  let upd = 0,
    noMatch = 0,
    closed = 0,
    far = 0,
    twinSkip = 0; // 2026-08-26 = --ids 직행 시 PID 가 타행에 이미 있어 기록 안 한 수
  const report: string[] = [];
  for (const row of rows) {
    try {
      const ts = await tsSearch({
        apiKey: KEY,
        method: "searchText",
        regionCode: city?.country_code || "FR",
        languageCode: lang,
        cityId,
        rawTag: `backfill-${row.name_en || row.id}`,
        nameLocal: row.name_local || row.name_en,
        address: row.address,
        latitude: row.lat ?? null,
        longitude: row.lng ?? null,
        anchorRadiusM: row.lat != null ? ANCHOR_M : undefined,
        maxResults: 1,
      });
      const top = ts[0];
      if (!top) {
        noMatch++;
        report.push(`  ✗ no_match: ${row.name_en}`);
        continue;
      }
      if (top.businessStatus && top.businessStatus !== "OPERATIONAL") {
        closed++;
        report.push(`  🚫 ${top.businessStatus}: ${row.name_en}`);
        continue;
      }
      const dist =
        row.lat != null && top.latitude != null
          ? Math.round(
              hkm(
                { lat: row.lat, lng: row.lng },
                { lat: top.latitude, lng: top.longitude },
              ) * 1000,
            ) / 1000
          : null;
      const suspicious = dist != null && dist > 2;
      // ⚠️ 수정금지(승인필요) 2026-08-26 사장님 승인 = --ids 지정 = 대상 행이 이미 확정 → targetRowId 직행 + 정식 면제(ag3 TS 직행 동형).
      if (ids && top.googlePlaceId) {
        const twin = (
          await c.query(
            `SELECT id, name_en FROM place_seed_raw WHERE google_place_id = $1 AND id <> $2 LIMIT 1`,
            [top.googlePlaceId, row.id],
          )
        ).rows[0];
        if (twin) {
          twinSkip++;
          report.push(
            `  ⚠️ PID중복 ${row.name_en}: TS PID 가 이미 #${twin.id} ${twin.name_en} 에 있음 = 기록 안 함(병합 판단 = 사장님)`,
          );
          continue;
        }
      }
      const r = await upsertPlace({
        ...(ids ? { targetRowId: row.id, followTriggerDup: true } : {}),
        cityId,
        seedCategory: row.seed_category,
        // ⚠️ 수정금지(승인필요) — TS displayName→name_en (2026-06-17 사장님 SSOT) = name_local은 Gemini전용
        nameEn: top.nameEn || row.name_en,
        nameLocal: null,
        address: top.address || row.address,
        latitude: top.latitude,
        longitude: top.longitude,
        googlePlaceId: top.googlePlaceId,
        googleMapsUri: top.googleMapsUri,
        googleReviewCount: top.googleReviewCount,
        // ⚠️ 수정금지(승인필요) 2026-08-10 사장님 확정 = **가격 칸의 주인은 제미니 하나**(SSOT:583).
        //   버리는 게 아니다 = TS 가격은 §18 raw 에 그대로 남는다.
        priceEur: null,
      });
      if (r.action === "updated" || r.action === "inserted") upd++;
      if (suspicious) far++;
      // ⚠️ 수정금지(승인필요) — TS displayName→name_en (2026-06-17 사장님 SSOT) = name_local은 Gemini전용
      report.push(
        `  ${suspicious ? "⚠️원거리" : "✓"} ${row.name_en} → ${top.nameEn} | RC ${row.rc ?? "?"}→${top.googleReviewCount} | ${dist ?? "?"}km | ${r.action}(${r.matchedBy})`,
      );
    } catch (e: any) {
      report.push(`  ✗ ERR ${row.name_en}: ${e.message}`);
    }
  }
  await c.end();
  console.log(report.join("\n"));
  console.log(
    `\n═══ 결과 = 보강 ${upd} / no_match ${noMatch} / 폐업 ${closed} / ⚠️원거리>2km ${far}(검토대상)${ids ? ` / PID중복 보류 ${twinSkip}` : ""} ═══`,
  );
})();
