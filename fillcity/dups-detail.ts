// ⚠️ 수정금지(승인필요) 2026-06-24 = PID 중복그룹 keep/loser 필드 비교 (직접접속 §16). 조사 전용 = DELETE/UPDATE 없음.
// 목적: 트리거 우회 없이 청소 가능한지 = loser 가 keep 에 없는 값(흡수필요분)을 가졌는지 그룹별 판정.
// keep 선정 = 사장님 SSOT 우선순위(PID보유 동일전제 → RC 큰쪽 → 최신TS=updated_at 늦은쪽 → id 작은쪽).
// 호출: npx tsx fillcity/dups-detail.ts --city-id=39
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

// 흡수 후보 컬럼 = 결손이면 loser 값으로 채울 수 있는 데이터 컬럼 (식별/시스템 컬럼 제외)
const FILL_COLS = [
  "name_ko",
  "name_en",
  "name_local",
  "image_url",
  "image_attribution",
  "price_eur",
  "editorial_summary",
  "summary_ko",
  "address",
  "latitude",
  "longitude",
  "google_review_count",
  "google_rating",
  "google_maps_uri",
  "google_primary_type",
  "opening_hours",
  "vibe_keywords",
  "phase_tags",
  "category_tags",
  "names_i18n",
  "photo_urls",
  "distance_km_from_center",
  "day_zone",
];

function isEmpty(v: any): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).length === 0;
  return false;
}

(async () => {
  const pg = await import("pg");
  const c = new (pg as any).default.Client({
    connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  console.log(
    `=== city(${cityId}) PID 중복그룹 keep/loser 필드 비교 (직접접속, 조사전용) ===\n`,
  );

  const groups = (
    await c.query(
      `
    SELECT google_place_id AS pid, array_agg(id ORDER BY id) AS ids
    FROM place_seed_raw WHERE city_id=$1 AND seed_category NOT LIKE 'bts%' AND google_place_id IS NOT NULL
    GROUP BY google_place_id HAVING COUNT(*) > 1 ORDER BY MIN(id)`,
      [cityId],
    )
  ).rows;

  let cleanDelete = 0,
    needAbsorb = 0;
  const summary: any[] = [];

  for (const g of groups) {
    const ids: number[] = g.ids;
    const rows = (
      await c.query(`SELECT * FROM place_seed_raw WHERE id = ANY($1::int[])`, [
        ids,
      ])
    ).rows;
    const byId: Record<number, any> = {};
    for (const r of rows) byId[r.id] = r;

    // keep 선정 = RC DESC NULLS LAST → updated_at DESC NULLS LAST → id ASC
    const sorted = [...rows].sort((a, b) => {
      const rcA = a.google_review_count ?? -1,
        rcB = b.google_review_count ?? -1;
      if (rcA !== rcB) return rcB - rcA;
      const uA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const uB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      if (uA !== uB) return uB - uA;
      return a.id - b.id;
    });
    const keep = sorted[0];
    const losers = sorted.slice(1);

    // 각 loser 가 keep 의 빈칸을 채울 수 있는 필드 = 흡수필요분
    const absorbFields: string[] = [];
    for (const loser of losers) {
      for (const col of FILL_COLS) {
        if (isEmpty(keep[col]) && !isEmpty(loser[col])) {
          if (!absorbFields.includes(col)) absorbFields.push(col);
        }
      }
    }

    const klass =
      absorbFields.length === 0 ? "A_DELETE_ONLY" : "B_ABSORB_THEN_DELETE";
    if (absorbFields.length === 0) cleanDelete++;
    else needAbsorb++;

    console.log(`PID=${g.pid}`);
    console.log(`  cat=${keep.seed_category} name="${keep.name_en}"`);
    console.log(
      `  KEEP id=${keep.id} (RC=${keep.google_review_count ?? "null"} upd=${keep.updated_at ? new Date(keep.updated_at).toISOString().slice(0, 10) : "null"})`,
    );
    for (const l of losers) {
      console.log(
        `  LOSER id=${l.id} (RC=${l.google_review_count ?? "null"} upd=${l.updated_at ? new Date(l.updated_at).toISOString().slice(0, 10) : "null"})`,
      );
    }
    console.log(
      `  => ${klass}${absorbFields.length ? " 흡수필요=[" + absorbFields.join(",") + "]" : " (loser 흡수값 0 = 그냥 DELETE)"}\n`,
    );

    summary.push({
      pid: g.pid,
      name: keep.name_en,
      keep: keep.id,
      losers: losers.map((l) => l.id),
      klass,
      absorbFields,
    });
  }

  console.log(`\n===== 분류 요약 =====`);
  console.log(`총 PID그룹 = ${groups.length}`);
  console.log(`A) loser 그냥 DELETE 가능 (흡수값 0) = ${cleanDelete}그룹`);
  console.log(
    `B) 흡수 후 DELETE 필요 (loser 가 keep 빈칸 채움) = ${needAbsorb}그룹`,
  );
  console.log(
    `\n전체 loser id (DELETE 대상) = ${summary.flatMap((s) => s.losers).join(",")}`,
  );
  if (needAbsorb > 0) {
    console.log(`\nB 그룹 상세 (흡수 필요):`);
    for (const s of summary.filter((x) => x.klass === "B_ABSORB_THEN_DELETE")) {
      console.log(
        `  keep=${s.keep} <- loser=${s.losers.join(",")} 필드=[${s.absorbFields.join(",")}]`,
      );
    }
  }
  await c.end();
})();
