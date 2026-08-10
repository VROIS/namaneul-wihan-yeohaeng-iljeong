// ⚠️ 영구 컴포넌트 2026-06-09 = 사용자 SSOT = name_local 결손 행 복구 (FILLCITY_PRD ⓪-pre 정제)
// = PID 있는데 name_local NULL = 옛 경로 잔재. 복구 = 2 경로(내부 우선 → 외부 폴백):
//   ① 내부(무료): source≠wikipedia_api 면 name_en 에 실명이 있음(옛 경로가 displayName 을 name_en 에 오기록) → name_local := name_en.
//   ② TS 폴백(유료 €0.0299/곳): wikipedia_api(name_en=위키쓰레기) = 내부 이름원 없음 = 좌표 searchNearby → PID 매칭 → TS displayName.
// = 쓰기 = upsertPlace(§14, 직접 SQL 금지). 외부 폴백은 내부 소진 후만(사용자 SSOT 2026-06-09: 외부 게으른 기본 금지).
// 호출: npx tsx server/services/fill/ts-name-recover.ts --city-id=37 [--apply] [--lang=es] [--category=restaurant,...]
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
  : [
      "restaurant",
      "heritage",
      "hotspot",
      "attraction",
      "adventure",
      "healing",
      "shopping",
    ];
if (!cityId) {
  console.error(
    "Usage: --city-id=<N> [--apply] [--lang=es] [--category=restaurant,...]",
  );
  process.exit(1);
}

const RADIUS_M = 60; // 행 좌표 = 그 장소 좌표 → 60m searchNearby = PID 매칭 확실
const TYPE_OF: Record<string, string> = { restaurant: "restaurant" };
// ⚠️ 2026-06-11 = name_en 존재만 판정 (§19)
const isInternal = (r: any) => r.name_en && r.name_en.trim() !== "";

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
    console.error(`✗ city ${cityId} 미존재`);
    process.exit(1);
  }
  // ⚠️ 2026-06-18 사장님 SSOT = 출입증 관문 issue_api_key() 경유 (§19). name_local 채움 = 채움 = 도시 있음 + 행 있음(true).
  // = 출입증(키이름·도시id·날짜·행있음) 검문 통과해야만 키 발급. 미달 = throw = 외부호출 불가.
  const today = new Date().toISOString().slice(0, 10);
  const { issueApiKey } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/issue-api-key.ts"))
      .href
  );
  const KEY = await issueApiKey(c, "GOOGLE_MAPS_API_KEY", cityId, today, true);

  const rows = (
    await c.query(
      `SELECT id, seed_category, name_en, latitude::float8 AS lat, longitude::float8 AS lng, google_place_id AS pid
     FROM place_seed_raw
     WHERE city_id=$1 AND seed_category = ANY($2::text[])
       AND google_place_id IS NOT NULL AND google_place_id <> ''
       AND (name_local IS NULL OR name_local = '')
       AND latitude IS NOT NULL AND longitude IS NOT NULL
     ORDER BY seed_category, id`,
      [cityId, cats],
    )
  ).rows;
  const internalRows = rows.filter(isInternal);
  const tsRows = rows.filter((r: any) => !isInternal(r));

  console.log(
    `═══ ts-name-recover (city ${cityId} ${city.name_en}) = 내부 ${internalRows.length} / TS폴백 ${tsRows.length}(€${(tsRows.length * 0.0299).toFixed(2)}) ═══`,
  );
  if (!apply) {
    console.log(
      `[내부=무료] ${internalRows.map((r: any) => r.name_en).join(" / ") || "없음"}`,
    );
    console.log(
      `[TS폴백=유료] ${tsRows.map((r: any) => r.name_en).join(" / ") || "없음"}`,
    );
    console.log(`\n=== DRY (--apply 로 실행) ===`);
    await c.end();
    return;
  }

  let internalFixed = 0,
    tsFixed = 0,
    noMatch = 0,
    err = 0;
  const report: string[] = [];
  for (const row of internalRows) {
    try {
      // ⚠️ 2026-07-18 = 매칭 폐기(트리거 단일) 후 = 고칠 행(row.id) 이미 알므로 targetRowId 직행 UPDATE. 옛 matchedBy==='pid' 판정(매칭 UPDATE 전제) 폐기 §19.
      const r = await upsertPlace({
        cityId,
        seedCategory: row.seed_category,
        targetRowId: row.id,
        googlePlaceId: row.pid,
        nameEn: row.name_en,
        nameLocal: row.name_en,
      });
      if (r.action === "updated") {
        internalFixed++;
        report.push(`  ✓[내부] name_local := "${row.name_en}"`);
      } else {
        err++;
        report.push(
          `  ⚠️[내부] ${row.name_en} = ${r.action}(${r.reason || ""})`,
        );
      }
    } catch (e: any) {
      err++;
      report.push(`  ✗[내부] ${row.name_en}: ${e.message}`);
    }
  }
  for (const row of tsRows) {
    try {
      const ts = await tsSearch({
        apiKey: KEY,
        method: "searchNearby",
        regionCode: city.country_code || "ES",
        languageCode: lang,
        cityId,
        rawTag: `namerecover-${row.name_en || row.id}`,
        includedTypes: TYPE_OF[row.seed_category]
          ? [TYPE_OF[row.seed_category]]
          : undefined,
        latitude: row.lat,
        longitude: row.lng,
        circleRadiusM: RADIUS_M,
        maxResults: 20,
      });
      const match = ts.find((t: any) => t.googlePlaceId === row.pid);
      // ⚠️ 수정금지(승인필요) — TS displayName→name_en (2026-06-17 사장님 SSOT) = name_local은 Gemini전용
      if (!match || !match.nameEn) {
        noMatch++;
        report.push(`  ✗[TS] PID 미매칭: ${row.name_en}`);
        continue;
      }
      const r = await upsertPlace({
        // ⚠️ 2026-07-18 = 고칠 행(row.id) 직행 UPDATE(매칭 폐기, 트리거 단일). TS displayName→name_en (2026-06-17 사장님 SSOT) = name_local은 Gemini전용.
        cityId,
        seedCategory: row.seed_category,
        targetRowId: row.id,
        googlePlaceId: row.pid,
        nameEn: match.nameEn,
        nameLocal: null,
        address: match.address,
        latitude: match.latitude ?? row.lat,
        longitude: match.longitude ?? row.lng,
        googleMapsUri: match.googleMapsUri,
        googleReviewCount: match.googleReviewCount,
        // ⚠️ 수정금지(승인필요) 2026-08-10 사장님 확정 = **가격 칸의 주인은 제미니 하나**(SSOT:583).
        //   구글 priceRange 는 그 나라 통화(케냐 KES 5,000 ≈ €35)라 price_eur 로 쓰면 €5,000 이 박힌다.
        //   ag3(생성)·reinsert 와 **같은 규칙** = 여기서도 안 쓴다(§20 = 같은 PSR 로 모이는 경로는 규칙 하나).
        //   버리는 게 아니다 = TS 가격은 §18 raw 에 그대로 남는다.
        priceEur: null,
      });
      if (r.action === "updated") {
        tsFixed++;
        report.push(`  ✓[TS] "${row.name_en}" → "${match.nameEn}"`);
      } else {
        err++;
        report.push(`  ⚠️[TS] ${row.name_en} = ${r.action}(${r.reason || ""})`);
      }
    } catch (e: any) {
      err++;
      report.push(`  ✗[TS] ${row.name_en}: ${e.message}`);
    }
  }
  await c.end();
  console.log(report.join("\n"));
  console.log(
    `\n═══ 결과 = 내부복구 ${internalFixed} / TS복구 ${tsFixed} / PID미매칭 ${noMatch} / 오류 ${err} ═══`,
  );
})();
