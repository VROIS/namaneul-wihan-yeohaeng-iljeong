#!/usr/bin/env node
// ⚠️ 영구 컴포넌트 2026-08-02 사장님 승인 = **도시 연결 정리**(여정·TRIPIS ↔ cities).

import "dotenv/config";
import pg from "pg";

const APPLY = process.argv.includes("--apply");
const CONN = process.env.SUPA_URL || process.env.DATABASE_URL;
if (!CONN) {
  console.error("❌ SUPA_URL / DATABASE_URL 미설정");
  process.exit(1);
}

const SQL_MATCH_BY_NAME = `
  SELECT c.id FROM cities c
  WHERE LOWER(TRIM(c.name_en)) = $1
     OR LOWER(TRIM(c.name)) = $1
     OR LOWER(TRIM(c.name_local)) = $1
     OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(c.aliases) AS alias
                WHERE LOWER(TRIM(alias)) = $1)
  LIMIT 1`;

const SQL_NEAREST_BY_COORDS = `
  SELECT c.id, c.name,
         6371*acos(LEAST(1, cos(radians($1))*cos(radians(c.latitude))
              *cos(radians(c.longitude)-radians($2))
              + sin(radians($1))*sin(radians(c.latitude)))) AS km
  FROM cities c ORDER BY km ASC LIMIT 1`;

const db = new pg.Client({
  connectionString: CONN,
  ssl: { rejectUnauthorized: false },
});
await db.connect();

const mode = APPLY ? "🔴 실제 반영(--apply)" : "🟢 드라이런(읽기 전용)";
console.log(`\n도시 연결 정리 — ${mode}\n${"═".repeat(78)}`);

const cityName = new Map(
  (await db.query("SELECT id, name FROM cities")).rows.map((r) => [
    r.id,
    r.name,
  ]),
);
const label = (id) =>
  id == null
    ? "(없음)"
    : cityName.has(id)
      ? `${id} ${cityName.get(id)}`
      : `${id} (없는 도시)`;

try {
  const guidesHasCity = (
    await db.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='guides' AND column_name='city_id'`,
    )
  ).rowCount;
  // 🏷️ 2026-08-02 사장님 승인 = **해설 창고 열쇠**(guides.place_id) + 찾기용 색인.
  const guidesHasPlace = (
    await db.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='guides' AND column_name='place_id'`,
    )
  ).rowCount;
  const guidesHasPlaceIdx = (
    await db.query(
      `SELECT 1 FROM pg_indexes
       WHERE schemaname='public' AND tablename='guides' AND indexname='guides_place_lang_idx'`,
    )
  ).rowCount;
  const itinNotNull =
    (
      await db.query(
        `SELECT is_nullable FROM information_schema.columns
         WHERE table_schema='public' AND table_name='itineraries' AND column_name='city_id'`,
      )
    ).rows[0]?.is_nullable === "NO";

  console.log("\n[1] 표 구조");
  console.log(
    `  guides.city_id 칸        : ${guidesHasCity ? "이미 있음 = 그대로" : "없음 → 새로 만듦"}`,
  );
  console.log(
    `  guides.place_id 칸       : ${guidesHasPlace ? "이미 있음 = 그대로" : "없음 → 새로 만듦"}`,
  );
  console.log(
    `  창고 찾기 색인           : ${guidesHasPlaceIdx ? "이미 있음 = 그대로" : "없음 → 새로 만듦 (place_id, language)"}`,
  );
  console.log(
    `  itineraries.city_id 비움 : ${itinNotNull ? "지금은 불가(NOT NULL) → 풀어야 함" : "이미 가능 = 그대로"}`,
  );

  if (APPLY) {
    if (!guidesHasCity) {
      await db.query(
        `ALTER TABLE public.guides ADD COLUMN city_id integer REFERENCES public.cities(id)`,
      );
      console.log("  ✅ guides.city_id 생성");
    }
    if (!guidesHasPlace) {
      await db.query(`ALTER TABLE public.guides ADD COLUMN place_id integer`);
      console.log("  ✅ guides.place_id 생성");
    }
    if (!guidesHasPlaceIdx) {
      await db.query(
        `CREATE INDEX IF NOT EXISTS guides_place_lang_idx
           ON public.guides (place_id, language) WHERE place_id IS NOT NULL`,
      );
      console.log("  ✅ 창고 찾기 색인 생성 (place_id, language)");
    }
    if (itinNotNull) {
      await db.query(
        `ALTER TABLE public.itineraries ALTER COLUMN city_id DROP NOT NULL`,
      );
      console.log("  ✅ itineraries.city_id 비움 허용");
    }
  }

  const gRows = (
    await db.query(
      `SELECT id, location_name, latitude, longitude${guidesHasCity ? ", city_id" : ", NULL::int AS city_id"}
       FROM guides ORDER BY created_at`,
    )
  ).rows;

  const gPlan = [];
  let gNoCoord = 0;
  for (const g of gRows) {
    if (g.latitude == null || g.longitude == null) {
      gNoCoord++;
      continue;
    }
    const hit = (
      await db.query(SQL_NEAREST_BY_COORDS, [
        Number(g.latitude),
        Number(g.longitude),
      ])
    ).rows[0];
    if (!hit) continue;
    if (g.city_id === hit.id) continue; // 이미 맞음 = 건드리지 않음
    gPlan.push({
      id: g.id,
      장소: g.location_name || "(이름 없음)",
      현재: label(g.city_id),
      바뀔값: `${hit.id} ${hit.name}`,
      거리km: Number(hit.km).toFixed(1),
    });
  }

  console.log(`\n[2] TRIPIS(guides) 도시 잇기 — 전체 ${gRows.length}건`);
  console.log(
    `  좌표 없어 못 채움 : ${gNoCoord}건 (사장님이 나중에 지정 = 추측 금지)`,
  );
  console.log(`  채우거나 고칠 것  : ${gPlan.length}건`);
  if (gPlan.length) console.table(gPlan);

  const iRows = (
    await db.query(
      `SELECT id, city_id, raw_data->>'destination' AS dest FROM itineraries ORDER BY id`,
    )
  ).rows;

  const iPlan = [];
  const iClear = [];
  const iStuck = [];
  for (const it of iRows) {
    // ⚠️ 2026-08-02 사장님 승인 = "파리, 프랑스" 처럼 나라를 붙여 입력한 것도 도시로 잡는다.
    const dest = String(it.dest || "")
      .split(",")[0]
      .trim()
      .toLowerCase();
    const hit = dest
      ? (await db.query(SQL_MATCH_BY_NAME, [dest])).rows[0]
      : null;
    if (hit) {
      if (it.city_id !== hit.id) {
        iPlan.push({
          여정번호: it.id,
          목적지: it.dest,
          현재: label(it.city_id),
          바뀔값: label(hit.id),
        });
      }
      continue;
    }
    if (it.city_id != null && !cityName.has(it.city_id)) {
      iClear.push({
        여정번호: it.id,
        목적지: it.dest || "(비어 있음)",
        현재: label(it.city_id),
        바뀔값: "(비움)",
      });
    } else {
      iStuck.push({
        여정번호: it.id,
        목적지: it.dest || "(비어 있음)",
        현재: label(it.city_id),
      });
    }
  }

  console.log(`\n[3] 여정(itineraries) 도시 교정 — 전체 ${iRows.length}건`);
  console.log(`  이름으로 찾아 고칠 것 : ${iPlan.length}건`);
  console.log(`  없는 도시 번호 → 비움 : ${iClear.length}건`);
  console.log(
    `  판단 못 함 → 그대로 둠 : ${iStuck.length}건 (사장님이 직접 지정)`,
  );
  if (iPlan.length) console.table(iPlan);
  if (iClear.length) console.table(iClear);
  if (iStuck.length) console.table(iStuck);

  if (APPLY) {
    for (const g of gPlan) {
      await db.query("UPDATE guides SET city_id=$1 WHERE id=$2", [
        Number(g.바뀔값.split(" ")[0]),
        g.id,
      ]);
    }
    for (const it of iPlan) {
      await db.query("UPDATE itineraries SET city_id=$1 WHERE id=$2", [
        Number(it.바뀔값.split(" ")[0]),
        it.여정번호,
      ]);
    }
    for (const it of iClear) {
      await db.query("UPDATE itineraries SET city_id=NULL WHERE id=$1", [
        it.여정번호,
      ]);
    }
    console.log(
      `\n✅ 반영 완료 — TRIPIS ${gPlan.length}건 / 여정 교정 ${iPlan.length}건 + 비움 ${iClear.length}건 (여정 번호는 그대로)`,
    );
  } else {
    console.log(
      `\n🟢 드라이런 = DB 를 하나도 안 바꿨습니다. 실제 반영은 --apply.`,
    );
  }
} finally {
  await db.end();
}
