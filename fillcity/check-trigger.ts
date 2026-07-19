// ⚠️ 2026-06-24 = 라이브 DB 트리거 점검 (직접접속). place_seed_raw 의 트리거 실제 정의 확인.
// 호출: npx tsx fillcity/check-trigger.ts
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

(async () => {
  const pg = await import("pg");
  const c = new (pg as any).default.Client({
    connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  console.log("=== place_seed_raw 라이브 트리거 점검 (직접접속) ===\n");

  const trigs = (
    await c.query(`
    SELECT tgname AS name,
           CASE WHEN (tgtype & 2)=2 THEN 'BEFORE' ELSE 'AFTER' END AS timing,
           CASE WHEN (tgtype & 4)=4 THEN 'INSERT' ELSE '' END ||
           CASE WHEN (tgtype & 16)=16 THEN ' UPDATE' ELSE '' END ||
           CASE WHEN (tgtype & 8)=8 THEN ' DELETE' ELSE '' END AS events,
           tgenabled AS enabled, p.proname AS func
    FROM pg_trigger t JOIN pg_proc p ON t.tgfoid=p.oid
    WHERE tgrelid = 'public.place_seed_raw'::regclass AND NOT tgisinternal
    ORDER BY tgname`)
  ).rows;
  console.log(`[1] 트리거 ${trigs.length}개:`);
  for (const t of trigs)
    console.log(
      `  ${t.name} = ${t.timing} ${t.events} -> ${t.func}() [${t.enabled === "O" ? "활성" : "상태=" + t.enabled}]`,
    );

  console.log("\n[2] 트리거 함수 본문:");
  for (const t of trigs) {
    const src =
      (await c.query("SELECT pg_get_functiondef($1::regproc) AS def", [t.func]))
        .rows[0]?.def || "";
    console.log(`\n----- ${t.func}() -----`);
    console.log(src.slice(0, 2800));
  }
  await c.end();
})();
