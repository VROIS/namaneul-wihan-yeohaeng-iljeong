// ⚠️ 수정금지(승인필요) 2026-06-05 = route-local 미리보기/시뮬 CLI (= 영구 도구, 도시 무관 재사용 --city-id)
// = 읽기전용(SELECT만) / Gemini 0 / DB 쓰기 0 = AG2-DB 동일 기준 풀 → buildRouteLocal → 동선 출력 + pool순 대비 단축률
// = 결정적이므로 = 이 출력 = 라이브 buildRouteLocal 출력 그대로 (= 사용자 SSOT: 시뮬=실제)
// 호출: npx tsx server/services/route/route-local-sim.ts --city-id=19 [--days=3] [--pace=Normal] [--style=Reasonable]
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
process.chdir(ROOT);
// .env 로드 (= fill 스크립트 동일 패턴)
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
  process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? "true"]),
);
const cityId = Number(argv["city-id"] || 19);
const days = Number(argv["days"] || 3);
const pace = String(argv["pace"] || "Normal");
const style = String(argv["style"] || "Reasonable");

// vibe → seed_category (= ag2 VIBE_PRIMARY_CATEGORY 와 1:1 동일 = production 동일 풀 = attraction 은 어느 바이브도 안 뽑음)
const VIBE_PRIMARY: Record<string, string> = { Attraction: "attraction", Healing: "healing", Hotspot: "hotspot", Adventure: "adventure", Shopping: "shopping", Culture: "heritage" };

(async () => {
  const { PACE_CONFIG, calculateSlotsForDay, MEAL_BUDGET } = await import(
    pathToFileURL(path.join(ROOT, "server/services/agents/types.ts")).href
  );
  const { buildRouteLocal } = await import(
    pathToFileURL(path.join(ROOT, "server/services/route/route-local.ts")).href
  );
  const { haversineKm } = await import(
    pathToFileURL(path.join(ROOT, "server/services/agents/transit-haversine.ts")).href
  );

  const pg = await import("pg");
  const c = new (pg as any).default.Client({
    connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const city = (await c.query("SELECT name_en, latitude, longitude FROM cities WHERE id=$1", [cityId])).rows[0];
  if (!city) { await c.end(); console.error(`✗ city ${cityId} 없음`); process.exit(1); }
  const cityCoords = { lat: parseFloat(city.latitude), lng: parseFloat(city.longitude) };

  // 뼈대 = AG1 동일 규칙 (Normal = 6슬롯/일)
  const slotsPerDay = calculateSlotsForDay("09:00", "21:00", pace);
  const daySlotsConfig = Array.from({ length: days }, (_, i) => ({
    day: i + 1, startTime: "09:00", endTime: "21:00", slots: slotsPerDay,
  }));
  const budget = MEAL_BUDGET[style];

  // 바이브 = --vibes (기본 = 화면값) → vibeWeights + 활동 카테고리 (= ag2 동일 = production 동일 풀)
  const vibeList = String(argv["vibes"] || "Attraction,Healing,Shopping").split(",").map((s) => s.trim()).filter(Boolean);
  const wts = [0.5, 0.3, 0.2];
  const vibeWeights = vibeList.map((v, i) => ({ vibe: v, weight: wts[i] ?? 0.2, percentage: Math.round((wts[i] ?? 0.2) * 100) }));
  const actCats = [...new Set(vibeList.map((v) => VIBE_PRIMARY[v]).filter((cc) => cc && cc !== "restaurant"))];
  if (!actCats.length) actCats.push("hotspot"); // 식당만 고른 경우 fallback

  // 풀 = ag2 동일 = 선택 바이브 카테고리만 (core 다수 + outskirt 후보) / 읽기전용
  const coreN = days * 4;
  const outskirtN = 8;
  const actSelect = (zoneWhere: string) =>
    `SELECT id, name_en, name_ko, name_local, address, latitude::float8 AS lat, longitude::float8 AS lng,
            seed_category, summary_ko, editorial_summary, price_eur, rank, day_zone
     FROM place_seed_raw
     WHERE city_id=$1 AND seed_category = ANY($2::text[]) AND ${zoneWhere}
       AND latitude IS NOT NULL AND longitude IS NOT NULL AND latitude<>0 AND longitude<>0
     ORDER BY rank ASC NULLS LAST LIMIT $3`;
  const coreRows = (await c.query(actSelect("(day_zone='core' OR day_zone IS NULL)"), [cityId, actCats, coreN])).rows;
  const outskirtRows = (await c.query(actSelect("day_zone='outskirt'"), [cityId, actCats, outskirtN])).rows;
  const acts = [...coreRows, ...outskirtRows];
  const rests = (await c.query(
    `SELECT id, name_en, name_ko, name_local, address, latitude::float8 AS lat, longitude::float8 AS lng,
            seed_category, summary_ko, editorial_summary, price_eur, google_review_count
     FROM place_seed_raw
     WHERE city_id=$1 AND seed_category='restaurant'
       AND latitude IS NOT NULL AND longitude IS NOT NULL AND latitude<>0 AND longitude<>0
       AND price_eur BETWEEN $2 AND $3
     ORDER BY google_review_count DESC NULLS LAST LIMIT $4`,
    [cityId, budget.min, budget.max, days * 3],
  )).rows;
  await c.end();

  // PlaceResult 매핑 (= buildRouteLocal 가 읽는 필드)
  const toPR = (r: any) => ({
    id: `db-${r.id}`, name: r.name_en || "", lat: r.lat, lng: r.lng,
    seedCategory: r.seed_category, rank: r.rank ?? undefined, nameKo: r.name_ko, nameLocal: r.name_local, address: r.address,
    summaryKo: r.summary_ko, editorialSummary: r.editorial_summary,
    estimatedPriceEur: r.price_eur != null ? Number(r.price_eur) : undefined,
  });
  const places = [...acts.map(toPR), ...rests.map(toPR)];

  const skeleton: any = {
    formData: { destination: city.name_en, destinationCoords: cityCoords, mobilityStyle: "Moderate", travelStyle: style, travelPace: pace },
    paceConfig: PACE_CONFIG[pace], dayCount: days, daySlotsConfig, companionCount: 1,
    vibeWeights, travelPace: pace, totalRequiredPlaces: slotsPerDay * days, requiredPlaceCount: slotsPerDay * days,
  };

  console.log(`\n[SIM] ${city.name_en} (city ${cityId}) ${days}일/${pace}/${style}/[${vibeList.join("+")}] = 풀 활동 ${acts.length}(core ${coreRows.length} + outskirt ${outskirtRows.length}) + 식당 ${rests.length}`);

  const r = buildRouteLocal(skeleton, places, cityCoords);
  if (!r.ok || !r.response) { console.error("✗ buildRouteLocal 실패"); process.exit(1); }

  // 기준선 = pool 순서(rank순, 미최적) 그대로 방문 시 총거리 = 지그재그 정도
  let poolKm = 0;
  let prev = cityCoords;
  for (const p of acts) { poolKm += haversineKm(prev.lat, prev.lng, p.lat, p.lng); prev = { lat: p.lat, lng: p.lng }; }

  for (const d of r.response.days) {
    console.log(`\n=== Day ${d.day}  (${d.total_distance_km}km) ===`);
    for (const s of d.scenes) {
      const tag = s.type === "restaurant" ? "🍽 " : "📍";
      const price = s.price_per_person_eur != null ? ` €${s.price_per_person_eur}` : "";
      console.log(`  ${s.time} ${tag}${(s.name_local || s.name_en).slice(0, 28).padEnd(28)} +${String(s.distance_from_prev_km).padStart(5)}km ${s.transit_mode.padEnd(13)} ${s.transit_min}분${price}`);
    }
  }
  const dropped = (r.response as any)._dropped || [];
  if (dropped.length) console.log(`\n[이번 트립 미포함 = 가치<거리 제외] ${dropped.map((d: any) => `${d.name}(가치${d.profit})`).join(' / ')}`);

  const nnKm = r.response.total_distance_km;
  const cut = poolKm > 0 ? Math.round((1 - nnKm / poolKm) * 100) : 0;
  console.log(`\n═══ 총거리: NN+Haversine ${nnKm}km  ↔  pool순(미최적) ${Math.round(poolKm)}km  =  ${cut}% 단축 (= 지그재그 제거) ═══`);
  console.log(`총 소요(이동+체류) ≈ ${(r.response.total_duration_sec / 3600).toFixed(1)}시간 · Gemini 0 · 비용 0 · 계산 ${r.elapsedMs}ms`);
})();
