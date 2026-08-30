// ⚠️ 수정금지(승인필요) 2026-06-24 사장님 SSOT = A 트리거(BEFORE INSERT OR UPDATE) 동작 검증 (직접접속 §16).
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
const cityId = Number(argv["city-id"] || 39);

(async () => {
  const pg = await import("pg");
  const c = new (pg as any).default.Client({
    connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  console.log(
    `=== A 트리거 검증 (city ${cityId}, 전부 ROLLBACK = DB 무변경) ===\n`,
  );

  const single = (
    await c.query(
      `SELECT id, google_place_id AS pid, name_en FROM place_seed_raw WHERE city_id=$1 AND google_place_id IS NOT NULL AND google_place_id<>'' ORDER BY id LIMIT 1`,
      [cityId],
    )
  ).rows[0];
  const dupPair = (
    await c.query(
      `
    SELECT a.id AS id_a, b.id AS id_b, a.google_place_id AS pid
    FROM place_seed_raw a JOIN place_seed_raw b ON a.city_id=b.city_id AND a.google_place_id=b.google_place_id AND a.id<>b.id
    WHERE a.city_id=$1 AND a.google_place_id IS NOT NULL AND a.google_place_id<>'' ORDER BY a.id LIMIT 1`,
      [cityId],
    )
  ).rows[0];

  async function tx(
    label: string,
    fn: () => Promise<void>,
    expectFail: boolean,
  ) {
    await c.query("BEGIN");
    let failed = false,
      msg = "";
    try {
      await fn();
    } catch (e: any) {
      failed = true;
      msg = e.message;
    }
    await c.query("ROLLBACK");
    const ok = failed === expectFail;
    console.log(
      `${ok ? "PASS" : "FAIL"} ${label} = ${failed ? "EXCEPTION(" + msg.slice(0, 60) + ")" : "통과(무예외)"} / 기대=${expectFail ? "차단" : "통과"}`,
    );
    return ok;
  }

  const r: boolean[] = [];
  r.push(
    await tx(
      `T1 정상 자기행 PID 재설정 id=${single.id}`,
      async () => {
        await c.query(
          `UPDATE place_seed_raw SET google_place_id=$2, updated_at=NOW() WHERE id=$1`,
          [single.id, single.pid],
        );
      },
      false,
    ),
  );
  r.push(
    await tx(
      `T2 자기행 updated_at UPDATE id=${single.id}`,
      async () => {
        await c.query(
          `UPDATE place_seed_raw SET updated_at=NOW() WHERE id=$1`,
          [single.id],
        );
      },
      false,
    ),
  );
  r.push(
    await tx(
      `T3 기존 PID 로 새 행 INSERT (pid=${single.pid})`,
      async () => {
        await c.query(
          `INSERT INTO place_seed_raw (city_id, seed_category, name_en, google_place_id, rank) VALUES ($1,'attraction','__verify_dup__',$2, 99999)`,
          [cityId, single.pid],
        );
      },
      true,
    ),
  );
  if (dupPair) {
    r.push(
      await tx(
        `T4 다른행 PID 를 id=${dupPair.id_b} 에 직행 UPDATE (pid=${dupPair.pid}=id=${dupPair.id_a} 보유)`,
        async () => {
          await c.query(
            `UPDATE place_seed_raw SET google_place_id=$2 WHERE id=$1`,
            [dupPair.id_b, dupPair.pid],
          );
        },
        true,
      ),
    );
  } else {
    console.log("T4 = 중복쌍 없음 = 스킵");
  }

  console.log(
    `\n=== 검증 결과 = ${r.filter(Boolean).length}/${r.length} PASS (전부 ROLLBACK = DB 무변경) ===`,
  );
  await c.end();
  if (r.some((x) => !x)) process.exit(1);
})().catch((e) => {
  console.error("ERR", e);
  process.exit(1);
});
