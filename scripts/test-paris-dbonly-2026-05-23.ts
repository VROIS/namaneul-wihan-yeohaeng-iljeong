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

  const rest = (
    await c.query(`
    SELECT id, name_en, name_local, price_eur::float8 AS price, google_review_count AS rc,
           (image_url IS NOT NULL AND image_url NOT ILIKE '%wiki%') AS has_img,
           (google_place_id IS NOT NULL) AS has_pid,
           ROW_NUMBER() OVER (ORDER BY google_review_count DESC NULLS LAST) AS rc_rank_all
    FROM place_seed_raw WHERE city_id=19 AND seed_category='restaurant' AND price_eur IS NOT NULL
    ORDER BY google_review_count DESC NULLS LAST`)
  ).rows;
  const bandOf = (p: number) =>
    p <= 24
      ? "Economic"
      : p <= 60
        ? "Reasonable"
        : p <= 180
          ? "Premium"
          : "Luxury";
  const bandRank: Record<string, number> = {};
  const restByDbId = new Map<number, any>();
  for (const r of rest) {
    const b = bandOf(Number(r.price));
    bandRank[b] = (bandRank[b] || 0) + 1;
    r.band = b;
    r.band_rank = bandRank[b];
    restByDbId.set(r.id, r);
  }
  const totalRest = rest.length;
  const bandTotals: Record<string, number> = {};
  for (const r of rest) bandTotals[r.band] = (bandTotals[r.band] || 0) + 1;
  console.log(
    `[PSR] 파리 식당(가격보유) = ${totalRest}곳 / 가격대: ${Object.entries(
      bandTotals,
    )
      .map(([k, v]) => `${k}=${v}`)
      .join(" ")}`,
  );

  const { runPipelineV3 } = await import(
    "../server/services/agents/pipeline-v3.js"
  );
  const STYLES: ("Economic" | "Reasonable" | "Premium")[] = [
    "Economic",
    "Reasonable",
    "Premium",
  ];

  for (const style of STYLES) {
    const formData = {
      destination: "Paris",
      destinationCoords: { lat: 48.8566, lng: 2.3522 },
      startDate: "2026-06-01",
      endDate: "2026-06-03", // = 3일
      startTime: "10:00",
      endTime: "21:00",
      vibes: ["Hotspot"],
      travelPace: "Normal",
      travelStyle: style, // = 예산 3종 루프
      mobilityStyle: "Walking",
      companionType: "Couple",
      companionCount: 2,
      curationFocus: "Everyone",
      birthDate: "1990-01-01",
      language: "ko",
    };
    console.log(`\n══════════ 예산=${style} / 파리 3일 ══════════`);
    const t0 = Date.now();
    try {
      const result: any = await runPipelineV3(formData as any);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      const days = result.days || [];
      console.log(`✅ 완료 (${elapsed}초) / ${days.length}일`);
      for (const d of days) {
        for (const p of d.places || d.scenes || []) {
          const isRest =
            p.type === "restaurant" || p.seedCategory === "restaurant";
          if (!isRest) continue;
          const mId = String(p.place_id || p.id || "").match(/db-(\d+)/);
          const dbId = mId ? Number(mId[1]) : null;
          const row = dbId ? restByDbId.get(dbId) : null;
          const nm =
            p.name_local || p.nameLocal || p.name || p.name_en || "(?)";
          if (row) {
            console.log(
              `  🍽️ Day${d.day} ${nm} | €${row.price} ${row.band} | RC전체 ${row.rc_rank_all}/${totalRest}위 · ${row.band}구간 ${row.band_rank}/${bandTotals[row.band]}위 | ${row.has_img ? "이미지O" : "❌이미지X"} ${row.has_pid ? "" : "❌PIDX"} (RC ${row.rc ?? "NULL"})`,
            );
          } else {
            console.log(
              `  🍽️ Day${d.day} ${nm} | (PSR 매칭 실패 = dbId ${dbId})`,
            );
          }
        }
      }
    } catch (e: any) {
      console.error(`❌ 실패:`, e?.message || e);
    }
  }

  await c.end();
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
