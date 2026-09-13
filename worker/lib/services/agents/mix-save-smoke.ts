// ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = MIX 저장 단계 스모크 = 실호출 전에 실제 DB·R2 경로를 그대로 밟아 SQL·연결·창고 오류를 잡는다(유료 0, DB 쓰기 0). 기계검증 5번째 = 이게 빨간불이면 커밋·호출 불가 (정본 §)
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
for (const line of fs
  .readFileSync(path.join(ROOT, ".env"), "utf-8")
  .replace(/^﻿/, "")
  .split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]])
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const cityId = Number(
  process.argv.find((a) => a.startsWith("--city-id="))?.split("=")[1] || 115,
);
const fail = (msg: string): never => {
  console.error("🔴 " + msg);
  process.exit(1);
};
(async () => {
  const t0 = Date.now();
  const { RECOGNIZE_ROWS_SQL, recognizePlace } = await import(
    pathToFileURL(
      path.join(ROOT, "worker/lib/services/shared/recognize-place.ts"),
    ).href
  );
  const { pool, db } = await import(
    pathToFileURL(path.join(ROOT, "worker/lib/db.ts")).href
  );
  const { listR2, isR2Configured } = await import(
    pathToFileURL(path.join(ROOT, "worker/lib/services/shared/r2-client.ts"))
      .href
  );
  const { versionedNameR2, rawHash } = await import(
    pathToFileURL(path.join(ROOT, "worker/lib/services/shared/raw-filename.ts"))
      .href
  );
  const { sql } = await import(
    pathToFileURL(path.join(ROOT, "node_modules/drizzle-orm/index.js")).href
  );

  // ① 알아보는 문 SQL + 판정식 (실제 창고 행)
  const rows = (await pool!.query(RECOGNIZE_ROWS_SQL, [cityId])).rows;
  if (!rows.length) fail(`알아보는 문 SQL: city ${cityId} 행 0`);
  const r0 = rows[0];
  if (!Array.isArray(r0.city_names))
    fail("알아보는 문 SQL: city_names 배열 아님");
  const door = recognizePlace(
    {
      name: r0.name_en,
      nameLocal: r0.name_local,
      nameKo: r0.name_ko,
      address: r0.address,
      lat: r0.lat,
      lng: r0.lng,
      isRestaurant: r0.seed_category === "restaurant",
    },
    rows,
  );
  if (!door || door.row.id !== r0.id)
    fail("판정식: 창고 행 자기 자신을 못 알아봄 #" + r0.id);
  console.log(
    `✅ ① 알아보는 문 = ${rows.length}행 · 자기 자신 인식 #${r0.id} (${door.why})`,
  );

  // ② 저장·장부·번역 SQL 형태 검사 = 트랜잭션 안에서 실행 후 ROLLBACK (쓰기 0)
  const c = await pool!.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.skip_dup_check', 'on', true)");
    const ins = await c.query(
      "INSERT INTO place_seed_raw (city_id, seed_category, name_en, name_local, address, latitude, longitude, status) VALUES ($1,'attraction','__smoke__','__smoke__','__smoke__',0.000001,0.000001,'active') RETURNING id",
      [cityId],
    );
    const id = ins.rows[0].id;
    // ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = 번역행 SQL 은 **엔진이 실제로 쓰는 함수**(place-upsert upsertTranslationWith)를 그대로 태운다. 사본 SQL 을 검사하면 엔진이 바뀌어도 초록불(거짓 통과)이 된다.
    const { upsertTranslationWith } = await import(
      pathToFileURL(path.join(ROOT, "worker/lib/services/place-upsert.ts")).href
    );
    await upsertTranslationWith(
      (text: string, params: unknown[]) => c.query(text, params as any[]),
      id,
      "en",
      "s",
      "e",
    );
    await c.query(
      "INSERT INTO external_calls (provider, sku, city_id, units, tag, response_time_ms, success, error_message) VALUES ('gemini','smoke',$1,1,'smoke',1,true,null)",
      [cityId],
    );
    await c.query("ROLLBACK");
    console.log(
      "✅ ② 창고 INSERT · 번역행 · 장부 SQL = 실행 후 ROLLBACK (쓰기 0)",
    );
  } catch (e: any) {
    await c.query("ROLLBACK").catch(() => {});
    fail("② 저장 SQL: " + e.message);
  } finally {
    c.release();
  }

  // ③ drizzle 경로(엔진이 쓰는 db.execute)
  const chk = await db!.execute(
    sql`SELECT count(*)::int AS n FROM place_seed_raw WHERE city_id = ${cityId}`,
  );
  const n = (chk as any).rows?.[0]?.n ?? (chk as any)[0]?.n;
  if (!(n > 0)) fail("③ drizzle db.execute 결과 없음");
  console.log(`✅ ③ drizzle 경로 = city ${cityId} ${n}행`);

  // ④ R2 = 목록 + raw 순번 판정(읽기만)
  if (!isR2Configured()) fail("④ R2 설정 없음");
  const objs = await listR2(`raw-responses/${cityId}/`);
  const name = await versionedNameR2(
    `raw-responses/${cityId}`,
    `__smoke__.json`,
    rawHash({ smoke: 1 }),
    () => null,
  );
  console.log(
    `✅ ④ R2 = raw-responses/${cityId}/ ${objs.length}개 · 순번 판정 → ${name}`,
  );

  // ⑤ 후처리 엔진 = 모듈 적재 + 대기 행 SQL(읽기만) = 큐 소비자가 부르는 것과 같은 함수
  const { pendingByCity, r2PrefixOf } = await import(
    pathToFileURL(path.join(ROOT, "worker/lib/services/fill/gmaps-post.ts"))
      .href
  );
  const pend = await pendingByCity(
    pool!,
    r2PrefixOf(process.env.R2_PUBLIC_URL),
    cityId,
  );
  console.log(
    `✅ ⑤ 후처리 엔진 = 적재 OK · city ${cityId} 대기 ${pend.reduce((a: number, x: any) => a + x.n, 0)}행`,
  );

  console.log(
    `✅ MIX 저장단계 스모크 통과 (${Date.now() - t0}ms, 유료 0, 쓰기 0)`,
  );
  await pool!.end();
})().catch((e) => fail("스모크 예외: " + (e?.message || e)));
