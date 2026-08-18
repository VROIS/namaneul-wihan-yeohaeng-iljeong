// ⚠️ 수정금지(승인필요) 2026-08-18 사장님 승인 = 05-restaurant-lean 후처리 + DB INSERT (03 post-process 표준 계승 §16)
// = docs/raw/{city_id}/{date}_05-restaurant-lean_{tier}.json 3 tier 읽음 → upsertPlace() INSERT
//
// 호출:
//   npx tsx fillcity/prompts/05-restaurant-lean/post-process.ts --city-id=111 --date=2026-08-18 [--dry]
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
process.chdir(ROOT);

const argv = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a) => a.replace(/^--/, "").split("="))
    .map(([k, v]) => [k, v ?? "true"]),
);
const cityId = Number(argv["city-id"] || 0);
const date = String(argv["date"] || new Date().toISOString().slice(0, 10));
const dryRun = argv["dry"] === "true";
if (!cityId) {
  console.error("Usage: --city-id=<N> --date=<YYYY-MM-DD> [--dry]");
  process.exit(1);
}

(async () => {
  const envRaw = fs.readFileSync(".env", "utf-8").replace(/^﻿/, "");
  for (const line of envRaw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      let v = m[2].trim();
      if (/^['"]/.test(v)) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }

  const rawDir = path.join(ROOT, "docs", "raw", String(cityId));
  const { rawName, latestVersioned } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/raw-filename.ts"))
      .href
  );
  const tiers = ["economic", "reasonable", "premium_luxury"] as const;

  function parseTier(text: string, key: string): any[] {
    const start = text.indexOf("{");
    if (start < 0) return [];
    try {
      return (
        JSON.parse(text.slice(start, text.lastIndexOf("}") + 1)).results?.[
          key
        ] || []
      );
    } catch {
      return [];
    }
  }

  const all: { tier: string; place: any }[] = [];
  for (const tier of tiers) {
    const latest = latestVersioned(
      rawDir,
      rawName(5, "restaurant-lean", tier, date),
    );
    const p = latest
      ? path.join(rawDir, latest)
      : path.join(rawDir, rawName(5, "restaurant-lean", tier, date));
    if (!fs.existsSync(p)) {
      console.error(`✗ ${p} 미존재 = run.ts 먼저 실행`);
      process.exit(1);
    }
    const j = JSON.parse(fs.readFileSync(p, "utf-8"));
    const list = parseTier(j.raw_text, tier);
    console.log(`[${tier}] = ${list.length}`);
    all.push(...list.map((place) => ({ tier, place })));
  }
  console.log(`═══ 05-restaurant-lean post-process ═══`);
  console.log(`city_id = ${cityId}, date = ${date}, 합계 = ${all.length}/60`);

  // 검증 = 통합 50km 반경(프롬프트 계약)
  const bad = all.filter((x) => !(x.place.distance_km_from_center <= 50));
  if (bad.length)
    console.error(`✗ distance>50 위반 = ${bad.length}행 (입고는 진행, 참고)`);

  if (dryRun) {
    console.log("\n=== DRY-RUN === sample:", all.slice(0, 3));
    process.exit(0);
  }

  const { upsertPlace } = await import(
    pathToFileURL(path.join(ROOT, "server/services/place-upsert.ts")).href
  );
  // ⚠️ 2026-08-18 = core/outskirt 판정 = shared/pool-radius 단일 SSOT(§16, 판단3종 지적 반영 = 인라인 삼항식 폐기 §19)
  const { zoneForDistanceKm } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/pool-radius.ts")).href
  );
  const today = new Date().toISOString().slice(0, 10);
  let inserted = 0,
    updated = 0,
    skipped = 0,
    errors = 0;

  for (const { place: p } of all) {
    try {
      const r = await upsertPlace({
        cityId,
        seedCategory: "restaurant",
        nameEn: p.name_en,
        nameLocal: p.name_local || null,
        nameKo: p.name_ko || null,
        address: p.address || null,
        latitude: null,
        longitude: null,
        selectionReasonKo: p.summary_ko ?? null,
        shortformKo: p.editorial_summary ?? null,
        priceEur: p.price_eur ?? null,
        // day_zone = 프롬프트 계약값 우선, 없으면 zoneForDistanceKm 1벌(100km 상한 포함 = 오염 재도입 차단).
        dayZone:
          p.day_zone === "core" || p.day_zone === "outskirt"
            ? p.day_zone
            : p.distance_km_from_center != null
              ? zoneForDistanceKm(p.distance_km_from_center)
              : null,
        distanceKmFromCenter: p.distance_km_from_center ?? null,
        phaseTags: ["restaurant-lean", `restaurant-lean-${today}`],
      });
      if (r.action === "inserted") inserted++;
      else if (r.action === "updated") updated++;
      else skipped++;
    } catch (e: any) {
      errors++;
      console.error(`  ✗ ${p.name_en}: ${e.message}`);
    }
  }
  console.log(
    `\n═══ 결과 = inserted ${inserted} / updated ${updated} / skipped ${skipped} / errors ${errors} ═══`,
  );
})();
