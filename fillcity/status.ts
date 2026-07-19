// ⚠️ 수정금지(승인필요) 2026-06-23 사장님 SSOT = fillCity 도시 상태 조회 (= MCP 금지 직접접속 §16 영구도구).
// = WF 실행 전/후 비교용 = 카테고리별 행수·완비율(pid/coord/rc/price/img/sumko) + 식당 band + 결손.
// 호출: npx tsx fillcity/status.ts --city-id=39
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);
const env = fs.readFileSync(".env", "utf-8").replace(/^﻿/, "");
for (const l of env.split(/\r?\n/)) {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
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
if (!cityId) {
  console.error("Usage: --city-id=<N>");
  process.exit(1);
}

(async () => {
  const pg = await import("pg");
  const c = new (pg as any).default.Client({
    connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const city = (
    await c.query("SELECT name_en FROM cities WHERE id=$1", [cityId])
  ).rows[0];
  console.log(
    `=== ${city?.name_en || "?"}(${cityId}) 현재 상태 (직접접속) ===\n`,
  );

  const cat = (
    await c.query(
      `
    SELECT seed_category AS cat, COUNT(*) AS n,
      COUNT(*) FILTER (WHERE google_place_id IS NOT NULL) AS pid,
      COUNT(*) FILTER (WHERE latitude IS NOT NULL) AS coord,
      COUNT(*) FILTER (WHERE google_review_count IS NOT NULL) AS rc,
      COUNT(*) FILTER (WHERE price_eur IS NOT NULL) AS price,
      COUNT(*) FILTER (WHERE image_url LIKE '%place-images%') AS img,
      COUNT(*) FILTER (WHERE summary_ko IS NOT NULL AND summary_ko<>'') AS sumko
    FROM place_seed_raw WHERE city_id=$1 AND seed_category NOT LIKE 'bts%'
    GROUP BY seed_category ORDER BY seed_category`,
      [cityId],
    )
  ).rows;
  console.log(
    [
      "cat".padEnd(12),
      "n".padStart(4),
      "pid".padStart(5),
      "coord".padStart(6),
      "rc".padStart(4),
      "price".padStart(6),
      "img".padStart(5),
      "sumko".padStart(6),
    ].join(" "),
  );
  let tot = 0;
  for (const r of cat) {
    tot += Number(r.n);
    console.log(
      [
        String(r.cat).padEnd(12),
        String(r.n).padStart(4),
        String(r.pid).padStart(5),
        String(r.coord).padStart(6),
        String(r.rc).padStart(4),
        String(r.price).padStart(6),
        String(r.img).padStart(5),
        String(r.sumko).padStart(6),
      ].join(" "),
    );
  }
  console.log(`\n비BTS 총행수 = ${tot} (>=120 = 변형 갈래 / <120 = 풀 갈래)`);

  const band = (
    await c.query(
      `
    SELECT CASE WHEN price_eur<=24 THEN 'eco' WHEN price_eur<=60 THEN 'reason' ELSE 'premium' END AS band, COUNT(*) AS n
    FROM place_seed_raw WHERE city_id=$1 AND seed_category='restaurant' AND price_eur IS NOT NULL GROUP BY 1 ORDER BY 1`,
      [cityId],
    )
  ).rows;
  console.log(
    "식당 band:",
    band.map((b: any) => `${b.band} ${b.n}`).join(" / ") || "(식당 가격 없음)",
  );

  const def = (
    await c.query(
      `
    SELECT COUNT(*) FILTER (WHERE google_place_id IS NULL) AS no_pid,
           COUNT(*) FILTER (WHERE image_url IS NULL OR image_url NOT LIKE '%place-images%') AS no_img,
           COUNT(*) FILTER (WHERE google_review_count IS NULL) AS no_rc,
           COUNT(*) FILTER (WHERE price_eur IS NULL) AS no_price
    FROM place_seed_raw WHERE city_id=$1 AND seed_category NOT LIKE 'bts%'`,
      [cityId],
    )
  ).rows[0];
  console.log(
    `결손: PID없음 ${def.no_pid} / 이미지없음 ${def.no_img} / RC없음 ${def.no_rc} / 가격없음 ${def.no_price}`,
  );
  await c.end();
})();
