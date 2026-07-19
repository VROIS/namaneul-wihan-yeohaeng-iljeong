// ⚠️ 수정금지(승인필요) 2026-06-24 사장님 SSOT = 레포 place-identity.sql 을 라이브 DB 에 트랜잭션 적용 (직접접속 §16·§19).
//   = 레포 SQL = 단일 진본(§19). 이 도구가 그 진본을 BEGIN/COMMIT 으로 라이브에 동기화 = 함수+트리거 1벌.
//   = 적용 후 트리거 events(BEFORE INSERT OR UPDATE) 즉시 확인. 실패 시 ROLLBACK = 라이브 무변경.
//   호출: npx tsx fillcity/apply-dup-trigger.ts
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
  const sqlPath = path.join(ROOT, "server/db/migrations/place-identity.sql");
  const fullSql = fs.readFileSync(sqlPath, "utf-8");
  // ⚠️ 수정금지(승인필요) 2026-06-24 = A 범위 = 함수 + 트리거 바인딩만. UNIQUE INDEX(CREATE UNIQUE INDEX) 는
  //   라이브 미존재 + 기존 name_en 중복 때문에 생성 불가 = A 범위 밖 = 별도 청소 후 승인 작업. 그래서 함수 정의부터 적용.
  const fnStart = fullSql.indexOf("CREATE OR REPLACE FUNCTION");
  if (fnStart < 0) {
    console.error("X 함수 정의 시작점 미발견");
    process.exit(1);
  }
  const sql = fullSql.slice(fnStart);
  const pg = await import("pg");
  const c = new (pg as any).default.Client({
    connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  console.log("=== place-identity.sql 라이브 적용 (트랜잭션) ===");
  try {
    await c.query("BEGIN");
    await c.query(sql);
    await c.query("COMMIT");
    console.log("COMMIT 완료 = 함수+트리거 라이브 동기화.");
  } catch (e: any) {
    await c.query("ROLLBACK");
    console.error("ROLLBACK = 라이브 무변경. 오류:", e.message);
    await c.end();
    process.exit(1);
  }
  const t = (
    await c.query(`
    SELECT tgname AS name,
           CASE WHEN (tgtype & 2)=2 THEN 'BEFORE' ELSE 'AFTER' END AS timing,
           (CASE WHEN (tgtype & 4)=4 THEN 'INSERT' ELSE '' END ||
            CASE WHEN (tgtype & 16)=16 THEN ' UPDATE' ELSE '' END ||
            CASE WHEN (tgtype & 8)=8 THEN ' DELETE' ELSE '' END) AS events
    FROM pg_trigger WHERE tgrelid='public.place_seed_raw'::regclass AND tgname='place_seed_raw_prevent_dup_trigger' AND NOT tgisinternal`)
  ).rows[0];
  console.log(`[확인] ${t?.name} = ${t?.timing} ${t?.events}`);
  await c.end();
})().catch((e) => {
  console.error("ERR", e);
  process.exit(1);
});
