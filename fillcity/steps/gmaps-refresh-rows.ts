// ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = ④ 와 대상만 다르다(제미니 산출표 대신 기존 창고 행). 검색·고르기·읽기·쓰기는 gmaps-shared 1벌을 그대로 쓴다 = 옛 자체 검색(이름+주소 붙여 첫 결과) 폐기 §19.
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import {
  newStat,
  openGmapsTools,
  provenanceTag,
  readAll,
  writeRead,
  type NewEntry,
} from "./gmaps-shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
process.chdir(ROOT);

const envRaw = fs.readFileSync(".env", "utf-8").replace(/^﻿/, "");
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
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
const apply = argv["apply"] === "true";
const limit = Number(argv["limit"] || 100000);
// ⚠️ 수정금지(승인필요) 2026-09-08 사장님 확정 = 특정 행만 지정(기존 도구들과 같은 --ids 표준).
const onlyIds: number[] | null = argv["ids"]
  ? String(argv["ids"])
      .split(",")
      .map((x) => Number(x.trim()))
      .filter(Boolean)
  : null;
if (!cityId) {
  console.error("Usage: --city-id=<N> [--apply] [--ids=1,2] [--limit=N]");
  process.exit(1);
}

(async () => {
  // ⚠️ 수정금지(승인필요) 2026-09-08 사장님 확정 = 대상 = 구글맵으로 확인한 기록(verified_at)이 없는 행 = 한 번 더 검증한다(PID 유무 무관).
  //   같은 이미지면 그대로·틀렸으면 새로·위키면 구글 사진으로 바뀐다 = 검증과 이미지 정리가 한 번에.
  const pg = await import("pg");
  const c = new (pg as any).default.Client({
    connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  console.log(`═══ 구글맵 재확인·최신화 — city ${cityId} ═══`);
  const rows = (
    await c.query(
      `SELECT id, name_en, name_local, name_ko, address, seed_category,
              latitude::float8 AS lat, longitude::float8 AS lng, price_eur
         FROM place_seed_raw
        WHERE city_id = $1
          AND ($3::bigint[] IS NULL OR id = ANY($3::bigint[]))
          AND ($3::bigint[] IS NOT NULL OR verified_at IS NULL)
        ORDER BY rank NULLS LAST, id
        LIMIT $2`,
      [cityId, limit, onlyIds],
    )
  ).rows;
  // ④ 와 같은 모양으로 맞춘다(뒤 처리를 한 글자도 안 바꾸기 위해).
  const tsItems: NewEntry[] = rows.map((r: any) => ({
    name: r.name_en || r.name_local || "",
    nameLocal: r.name_local,
    nameKo: r.name_ko,
    langs: 0,
    cat: r.seed_category,
    avgPrice: r.price_eur,
    avgRank: null,
    copies: [],
    lat: r.lat,
    lng: r.lng,
    address: r.address,
    psrHint: {
      psrId: r.id,
      psrName: r.name_en || "",
      psrCat: r.seed_category,
      by: "warehouse",
    },
  }));
  console.log(`대상 = 창고 행 ${tsItems.length}곳 (유료 API 0)`);

  if (!apply) {
    for (const n of tsItems)
      console.log(`  #${n.psrHint!.psrId} ${n.name} (${n.cat})`);
    console.log(`\n=== DRY (쓰기 0) = --apply 로 실행 ===`);
    await c.end();
    return;
  }

  const city = (
    await c.query("SELECT name_en FROM cities WHERE id=$1", [cityId])
  ).rows[0];
  const { upsertPlace } = await import(
    pathToFileURL(path.join(ROOT, "server/services/place-upsert.ts")).href
  );
  const PROVENANCE_TAG = provenanceTag(new Date().toISOString().slice(0, 10));
  const stat = newStat();

  if (tsItems.length > 0) {
    const rawRows: any[] = [];
    const g = await openGmapsTools(ROOT);
    const reads = await readAll(
      g.browser,
      g.browserUa,
      tsItems,
      {
        readPlacePage: g.readPlacePage,
        listCandidates: g.listCandidates,
        photoMaxWidthPx: g.photoMaxWidthPx,
        uploadToR2: g.uploadToR2,
        cityId,
        cityNameEn: city?.name_en,
        rawRows,
      },
      stat,
    ).finally(() => g.browser.close());

    // ⚠️ 수정금지(승인필요) 2026-09-08 사장님 확정 = 재확인은 그 창고 행에 쓴다(새 행을 만들지 않는다 = 프랑스 가게 4행 사고).
    for (const r of reads)
      await writeRead(
        c,
        upsertPlace,
        r,
        {
          cityId,
          provenanceTag: PROVENANCE_TAG,
          targetRowId: r.n.psrHint!.psrId,
        },
        stat,
      );

    // ⚠️ 수정금지(승인필요) 2026-09-08 사장님 승인 = 발굴 한 판 = 도시별 raw 1파일(§18 saveRaw 관문).
    const { saveRaw } = await import(
      pathToFileURL(path.join(ROOT, "server/services/shared/save-raw.ts")).href
    );
    await saveRaw({
      source: "gmaps",
      contextId: cityId,
      tag: "refresh-rows",
      request: {
        cityId,
        mode: "refresh-existing-rows",
        target: tsItems.length,
      },
      raw: { summary: stat, rows: rawRows },
    });
    console.log(
      `raw 저장 = docs/raw/${cityId}/ + R2 (${rawRows.length}곳 1파일)`,
    );
  }

  await c.end();
  console.log(
    `
═══ 완료: 창고 행 ${tsItems.length}곳 = 힌트행 흡수 ${stat.absorbedHint} / 다른 행 흡수 ${stat.absorbedOther} / 신규행 ${stat.insertedNew} · 못 갖춤 ${stat.noMatch} · 폐업 ${stat.closed} · 쓰기이상 ${stat.skipped} · 페이지 열기 ${stat.pageOpens} ═══`,
  );
})();
