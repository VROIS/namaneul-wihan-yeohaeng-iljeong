// ⚠️ 수정금지(승인필요) 2026-06-24 = fillCity 중복행 탐지 (직접접속 §16). PSR 중복 진단.
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
  console.log(`=== city(${cityId}) 중복 진단 (직접접속) ===\n`);

  const pidDup = (
    await c.query(
      `
    SELECT google_place_id AS pid, COUNT(*) AS n, array_agg(id ORDER BY id) AS ids, array_agg(name_en ORDER BY id) AS names
    FROM place_seed_raw WHERE city_id=$1 AND seed_category NOT LIKE 'bts%' AND google_place_id IS NOT NULL
    GROUP BY google_place_id HAVING COUNT(*) > 1 ORDER BY n DESC`,
      [cityId],
    )
  ).rows;
  console.log(
    `[1] PID 중복 = ${pidDup.length}그룹 (같은 구글ID 2+행 = 명백 중복):`,
  );
  for (const r of pidDup.slice(0, 20))
    console.log(
      `  PID(${r.n}) ids=${r.ids.join(",")} = ${r.names.join(" / ")}`,
    );

  const nameDup = (
    await c.query(
      `
    SELECT lower(regexp_replace(name_en,'\\s+','','g')) AS norm, COUNT(*) AS n, array_agg(id ORDER BY id) AS ids, array_agg(name_en ORDER BY id) AS names
    FROM place_seed_raw WHERE city_id=$1 AND seed_category NOT LIKE 'bts%' AND name_en IS NOT NULL
    GROUP BY 1 HAVING COUNT(*) > 1 ORDER BY n DESC`,
      [cityId],
    )
  ).rows;
  console.log(`\n[2] 이름 정규화 중복 = ${nameDup.length}그룹:`);
  for (const r of nameDup.slice(0, 20))
    console.log(
      `  "${r.norm}"(${r.n}) ids=${r.ids.join(",")} = ${r.names.join(" / ")}`,
    );

  const tot = (
    await c.query(
      "SELECT COUNT(*)::int AS n FROM place_seed_raw WHERE city_id=$1 AND seed_category NOT LIKE 'bts%'",
      [cityId],
    )
  ).rows[0].n;
  console.log(
    `\n비BTS 총행수 = ${tot} / PID중복 ${pidDup.length}그룹 / 이름중복 ${nameDup.length}그룹`,
  );
  await c.end();
})();
