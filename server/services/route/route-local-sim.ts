// ⚠️ 수정금지(승인필요) 2026-06-06 = route-local vs Gemini 비교 하네스 (= 읽기전용, 동일 입력)
// = 내 buildRouteLocal(A) ↔ 실제 Gemini handleRouteRequest(B) 나란히 출력 = 사용자 결과 비교용
// 호출: npx tsx server/services/route/route-local-sim.ts --city-id=19 --days=3 --vibes=Attraction,Adventure --pace=Packed [--gemini]
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
process.chdir(ROOT);
const envRaw = fs.readFileSync(".env", "utf-8").replace(/^﻿/, "");
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) { let v = m[2].trim(); if (/^['"]/.test(v)) v = v.slice(1, -1); process.env[m[1]] = v; }
}
const argv = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? "true"]));
const cityId = Number(argv["city-id"] || 19);
const days = Number(argv["days"] || 3);
const pace = String(argv["pace"] || "Packed");
const style = String(argv["style"] || "Reasonable");
const companions = Number(argv["companions"] || 4);
const doGemini = argv["gemini"] === "true";

// = ag2 VIBE_PRIMARY_CATEGORY 동일 (선정 카테고리)
const VIBE_PRIMARY: Record<string, string> = { Attraction: "attraction", Healing: "healing", Hotspot: "hotspot", Adventure: "adventure", Shopping: "shopping", Culture: "heritage" };

function printDays(label: string, resp: any) {
  console.log(`\n━━━ ${label} = 총 ${resp.total_distance_km}km / ${resp.days.length}일 ━━━`);
  for (const d of resp.days) {
    const acts = d.scenes.filter((s: any) => s.type === "activity").length;
    const meals = d.scenes.filter((s: any) => s.type === "restaurant").length;
    console.log(`Day ${d.day} (${d.total_distance_km}km · 활동 ${acts} + 식사 ${meals}):`);
    for (const s of d.scenes) {
      const tag = s.type === "restaurant" ? "🍽" : "📍";
      const price = s.price_per_person_eur != null ? ` €${s.price_per_person_eur}` : "";
      console.log(`  ${s.time} ${tag} ${String(s.name_local || s.name_en || "").slice(0, 26).padEnd(26)} +${String(s.distance_from_prev_km).padStart(5)}km ${String(s.transit_mode || "").padEnd(12)} ${s.transit_min}분${price}`);
    }
  }
}

(async () => {
  const { PACE_CONFIG, calculateSlotsForDay, MEAL_BUDGET } = await import(pathToFileURL(path.join(ROOT, "server/services/agents/types.ts")).href);
  const { buildRouteLocal } = await import(pathToFileURL(path.join(ROOT, "server/services/route/route-local.ts")).href);

  const pg = await import("pg");
  const c = new (pg as any).default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const city = (await c.query("SELECT name_en, latitude, longitude, country_code FROM cities WHERE id=$1", [cityId])).rows[0];
  if (!city) { await c.end(); console.error("city 없음"); process.exit(1); }
  const cityCoords = { lat: parseFloat(city.latitude), lng: parseFloat(city.longitude) };

  const vibeList = String(argv["vibes"] || "Attraction,Adventure").split(",").map((s) => s.trim()).filter(Boolean);
  const wts = vibeList.length === 1 ? [1] : vibeList.length === 2 ? [0.6, 0.4] : [0.5, 0.3, 0.2];
  const vibeWeights = vibeList.map((v, i) => ({ vibe: v, weight: wts[i] ?? 0.2, percentage: Math.round((wts[i] ?? 0.2) * 100) }));
  const actCats = [...new Set(vibeList.map((v) => VIBE_PRIMARY[v]).filter(Boolean))];
  if (!actCats.length) actCats.push("hotspot");
  const slots = calculateSlotsForDay("09:00", "21:00", pace);
  const daySlotsConfig = Array.from({ length: days }, (_, i) => ({ day: i + 1, startTime: "09:00", endTime: "21:00", slots }));
  const budget = MEAL_BUDGET[style];

  // 활동 = 바이브 카테고리 rank순 (= 충분)
  const acts = (await c.query(
    `SELECT id,name_en,name_ko,name_local,address,latitude::float8 AS lat,longitude::float8 AS lng,seed_category,summary_ko,editorial_summary,price_eur,rank
     FROM place_seed_raw WHERE city_id=$1 AND seed_category=ANY($2::text[]) AND latitude IS NOT NULL AND latitude<>0
     ORDER BY rank ASC NULLS LAST LIMIT $3`, [cityId, actCats, days * 8])).rows;
  // 식당 = 넉넉히 = 예산내 40, RC순 (= route-local 이 각 날 인근 선택 가능 = ag2 가 넉넉히 줘야 함의 입증)
  const rests = (await c.query(
    `SELECT id,name_en,name_ko,name_local,address,latitude::float8 AS lat,longitude::float8 AS lng,seed_category,summary_ko,editorial_summary,price_eur
     FROM place_seed_raw WHERE city_id=$1 AND seed_category='restaurant' AND price_eur BETWEEN $2 AND $3 AND latitude IS NOT NULL AND latitude<>0
     ORDER BY google_review_count DESC NULLS LAST LIMIT 40`, [cityId, budget.min, budget.max])).rows;

  let geminiKey: string | null = null;
  if (doGemini) {
    const k = (await c.query(`SELECT key_value FROM api_keys WHERE key_name='GEMINI_API_KEY' AND is_active=true LIMIT 1`)).rows[0];
    geminiKey = k?.key_value || null;
    if (geminiKey) process.env.GEMINI_API_KEY = geminiKey;
  }
  await c.end();

  const toPR = (r: any) => ({ id: `db-${r.id}`, name: r.name_en || "", lat: r.lat, lng: r.lng, seedCategory: r.seed_category, rank: r.rank ?? undefined, nameKo: r.name_ko, nameLocal: r.name_local, address: r.address, summaryKo: r.summary_ko, editorialSummary: r.editorial_summary, estimatedPriceEur: r.price_eur != null ? Number(r.price_eur) : undefined });
  const activities = acts.map(toPR);
  const places = [...activities, ...rests.map(toPR)];
  const skeleton: any = {
    formData: { destination: city.name_en, destinationCoords: cityCoords, startDate: "2026-06-06", endDate: "2026-06-08", startTime: "09:00", endTime: "21:00", vibes: vibeList, travelStyle: style, travelPace: pace, mobilityStyle: "Moderate", curationFocus: "Everyone", companionType: companions >= 4 ? "Family" : "Single", companionCount: companions, companionAges: "", birthDate: "1990-01-01" },
    paceConfig: PACE_CONFIG[pace], dayCount: days, daySlotsConfig, companionCount: companions, vibeWeights, travelPace: pace, totalRequiredPlaces: slots * days, requiredPlaceCount: slots * days,
  };

  console.log(`[비교] ${city.name_en} ${days}일/${pace}/${style}/${companions}인/[${vibeList.join("+")}] = 활동 ${activities.length} + 식당풀 ${rests.length}`);

  // A = 내 코드 (route-local)
  const A = buildRouteLocal(skeleton, places, cityCoords);
  if (A.ok && A.response) printDays(`A. route-local (NN+Haversine · ${A.elapsedMs}ms · $0)`, A.response);
  else console.log("[A] buildRouteLocal 실패");

  // B = 실제 Gemini 호출
  if (doGemini) {
    if (!geminiKey) { console.log("\n[B] GEMINI_API_KEY(api_keys) 없음 = Gemini 생략"); return; }
    const { handleRouteRequest } = await import(pathToFileURL(path.join(ROOT, "server/services/route/route-handler.ts")).href);
    console.log("\n[B] Gemini 호출 중...(수 초~수십초)");
    const B = await handleRouteRequest(skeleton, activities, cityCoords);
    if (B.ok && B.response) printDays(`B. Gemini (${B.elapsedMs}ms)`, B.response);
    else console.log(`[B] Gemini 실패: ${B.parseError || B.finishReason}`);
  } else {
    console.log("\n(= Gemini 비교는 --gemini 플래그)");
  }
})();
