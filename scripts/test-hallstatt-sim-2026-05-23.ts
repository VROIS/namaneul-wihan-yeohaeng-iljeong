import fs from "fs";
import pg from "pg";

async function main() {
  const env = fs.readFileSync(".env", "utf-8").replace(/^﻿/, "");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      let v = m[2].trim();
      if (/^['"]/.test(v)) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }

  const c = new pg.Client({
    connectionString: process.env.SUPA_URL || process.env.SUPABASE_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const keys = await c.query(
    `SELECT key_name, key_value FROM api_keys WHERE is_active=true`,
  );
  for (const r of keys.rows) {
    if (!process.env[r.key_name]) process.env[r.key_name] = r.key_value;
  }
  console.log(
    `✅ API keys 주입: ${keys.rows.map((r: any) => r.key_name).join(", ")}`,
  );

  const before = await c.query(
    `SELECT COUNT(*)::int n FROM cities WHERE LOWER(name_en) = 'hallstatt'`,
  );
  console.log(`\n[BEFORE] cities Hallstatt 행 = ${before.rows[0].n}`);

  const { runPipelineV3 } = await import(
    "../server/services/agents/pipeline-v3.js"
  );

  const formData = {
    destination: "Hallstatt",
    destinationCoords: { lat: 47.5622, lng: 13.6493 }, // 할슈타트 좌표 (= AG2-DB cityId 매칭 후 자동 = 미사용)
    startDate: "2026-06-15",
    endDate: "2026-06-16", // 2 일
    startTime: "10:00",
    endTime: "21:00",
    vibes: ["Adventure", "Hotspot"], // 모험 최우선 + 핫스팟 우선
    travelPace: "Packed",
    travelStyle: "Reasonable", // 합리적
    mobilityStyle: "Walking", // 많이 걷기
    companionType: "Family",
    companionCount: 4,
    curationFocus: "Everyone",
    birthDate: "1985-01-01",
    companionAges: "30s_40s_kids",
    language: "ko",
  };

  console.log(`\n${"=".repeat(60)}`);
  console.log(
    `▶ Hallstatt 시뮬: 한국인 가족 4인 / 2일 / Adventure+Hotspot / 빡빡 / 합리적 / 도보`,
  );
  console.log(`${"=".repeat(60)}`);

  const t0 = Date.now();
  try {
    const result = await runPipelineV3(formData as any);
    const elapsed = Date.now() - t0;
    console.log(`\n✅ 파이프라인 완료 (${(elapsed / 1000).toFixed(1)}초)`);

    const outDir = `docs/newcity-sim-${new Date().toISOString().slice(0, 10)}`;
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      `${outDir}/hallstatt-result.json`,
      JSON.stringify(result, null, 2),
    );
    console.log(`✅ 결과 저장: ${outDir}/hallstatt-result.json`);

    const places = result.places || [];
    console.log(`\n총 장소 = ${places.length}`);
    const sourceCounts: Record<string, number> = {};
    for (const p of places) {
      const src = p.sourceType || "unknown";
      sourceCounts[src] = (sourceCounts[src] || 0) + 1;
    }
    console.log(`sourceType:`, sourceCounts);
  } catch (e: any) {
    console.error(`❌ 파이프라인 실패:`, e?.message || e);
  }

  console.log(`\n⏳ 백그라운드 saveNewPlacesToDB 완료 대기 (90초)...`);
  await new Promise((r) => setTimeout(r, 90000));

  const after = await c.query(
    `SELECT id, name, name_en, name_local, latitude, longitude FROM cities WHERE LOWER(name_en) = 'hallstatt'`,
  );
  console.log(`\n[AFTER] cities Hallstatt 행 = ${after.rows.length}`);
  for (const r of after.rows) {
    console.log(
      `  cityId=${r.id} name="${r.name}" nameEn="${r.name_en}" 좌표=(${r.latitude}, ${r.longitude})`,
    );
  }

  if (after.rows.length > 0) {
    const cityId = after.rows[0].id;
    const psrAfter = await c.query(
      `
      SELECT id, name_en, name_ko, seed_category, phase_tags,
             image_url IS NOT NULL AS has_img,
             summary_ko IS NOT NULL AS has_sum,
             google_place_id, price_eur, created_at
      FROM place_seed_raw WHERE city_id = $1 ORDER BY id DESC
    `,
      [cityId],
    );
    console.log(
      `\n[AFTER] PSR Hallstatt (cityId=${cityId}) 행 = ${psrAfter.rows.length}`,
    );
    for (const r of psrAfter.rows) {
      const cd = r.created_at?.toISOString?.()?.slice(0, 16) || "?";
      console.log(
        `  id=${r.id} cat=${r.seed_category.padEnd(11)} img=${r.has_img ? "O" : "X"} sum=${r.has_sum ? "O" : "X"} pid=${r.google_place_id ? "O" : "X"} price=€${r.price_eur || 0} tags=${JSON.stringify(r.phase_tags)} "${r.name_en}" [${cd}]`,
      );
    }
  }

  await c.end();
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
