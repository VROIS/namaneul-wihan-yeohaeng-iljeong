// ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = MIX 저장 단계가 끊긴 실행을 "이미 돈 낸 Gemini raw" 로 되살린다 = 유료호출 0. 알아보는 문으로 창고 행 연결 → 없는 곳은 구글맵 페이지(이름·주소 검색)로 행+사진 → 여정 슬롯에 행·사진 연결. 결과는 순번 파일로 남김(덮어쓰기 0) (정본 §)
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
process.chdir(ROOT);
for (const line of fs
  .readFileSync(".env", "utf-8")
  .replace(/^﻿/, "")
  .split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]])
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const argv = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a) => a.replace(/^--/, "").split("="))
    .map(([k, v]) => [k, v ?? "true"]),
);
const cityId = Number(argv["city-id"] || 0);
const itineraryId = Number(argv["itinerary-id"] || 0);
const rawKey = String(argv["raw"] || "");
const apply = argv["apply"] === "true";
if (!cityId || !itineraryId || !rawKey) {
  console.error(
    "Usage: --city-id=<N> --itinerary-id=<N> --raw=<raw-responses/…/2026-09-13_90-mix-gemini_step1_1.json> [--apply]",
  );
  process.exit(1);
}

(async () => {
  const { RECOGNIZE_ROWS_SQL, recognizePlace } = await import(
    pathToFileURL(
      path.join(ROOT, "worker/lib/services/shared/recognize-place.ts"),
    ).href
  );
  const { getFromR2 } = await import(
    pathToFileURL(path.join(ROOT, "worker/lib/services/shared/r2-client.ts"))
      .href
  );
  const { saveVersionedReport, rawDate } = await import(
    pathToFileURL(path.join(ROOT, "worker/lib/services/shared/raw-filename.ts"))
      .href
  );
  const gm = await import(
    pathToFileURL(path.join(ROOT, "worker/lib/services/fill/gmaps-shared.ts"))
      .href
  );
  const { upsertPlace } = await import(
    pathToFileURL(path.join(ROOT, "worker/lib/services/place-upsert.ts")).href
  );
  // ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = DB 접속은 db.ts 1벌(엔진·필시티 공용) = 자체 pg.Client 2벌 폐기 §19. 같은 실행의 upsertPlace 와 같은 풀을 쓴다.
  const { pool } = await import(
    pathToFileURL(path.join(ROOT, "worker/lib/db.ts")).href
  );
  const c = await pool!.connect();

  const buf = await getFromR2(rawKey);
  if (!buf) throw new Error("raw 없음: " + rawKey);
  const raw = JSON.parse(buf.toString("utf8"));
  const places: any[] = raw.parsedPlaces || [];
  const lang = /[가-힣]/.test(places.map((p) => p.nameKo || "").join(""))
    ? "ko"
    : "en";
  const city = (
    await c.query("SELECT name_en FROM cities WHERE id=$1", [cityId])
  ).rows[0];
  console.log(
    `═══ MIX 재투입 — city ${cityId} · 여정 ${itineraryId} · raw ${rawKey} · Gemini ${places.length}곳 · 문구 언어 ${lang} · ${apply ? "APPLY" : "DRY"} ═══`,
  );

  const loadRows = async () =>
    (await c.query(RECOGNIZE_ROWS_SQL, [cityId])).rows;
  let rows = await loadRows();
  const linkOf = new Map<number, any>();
  const gemOf = (p: any) => ({
    name: p.name,
    nameLocal: p.nameLocal,
    nameKo: p.nameKo,
    address: p.address ?? null,
    lat: p.latitude,
    lng: p.longitude,
    isRestaurant: p.seed_category === "restaurant",
  });
  const unmatched: any[] = [];
  places.forEach((p, i) => {
    const door = recognizePlace(gemOf(p), rows);
    if (door) linkOf.set(i, { row: door.row, why: door.why });
    else unmatched.push({ i, p });
  });
  console.log(
    `① 알아보는 문: 창고 행 있음 ${linkOf.size} / 없음 ${unmatched.length}`,
  );
  for (const [i, l] of linkOf)
    console.log(
      `   ✓ ${places[i].name} → #${l.row.id} ${l.row.name_en} (${l.why})`,
    );
  for (const u of unmatched)
    console.log(`   ✗ ${u.p.name} / ${u.p.nameLocal || ""} → 없음`);

  const stat = gm.newStat();
  if (apply && unmatched.length) {
    const entries = unmatched.map(({ p }) => ({
      name: p.name,
      nameLocal: p.nameLocal || null,
      nameKo: p.nameKo || null,
      langs: 1,
      cat: p.seed_category || "attraction",
      avgPrice: p.price_eur ?? null,
      avgRank: null,
      copies: [
        {
          lang,
          summary: p.selection_reason_ko || null,
          editorial: p.shortform_ko || null,
        },
      ],
      lat: p.latitude ?? null,
      lng: p.longitude ?? null,
      address: p.address || null,
    }));
    const g = await gm.openGmapsTools(ROOT);
    const rawRows: any[] = [];
    const reads = await gm
      .readAll(
        g.browser,
        g.browserUa,
        entries,
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
      )
      .finally(() => g.browser.close());
    for (const r of reads)
      await gm.writeRead(
        c,
        upsertPlace,
        r,
        { cityId, provenanceTag: `mix-replay-${rawDate()}` },
        stat,
      );
    console.log(`② 구글맵 페이지 입력: ${JSON.stringify(stat)}`);
    rows = await loadRows();
    for (const u of unmatched) {
      const door = recognizePlace(gemOf(u.p), rows);
      if (door) linkOf.set(u.i, { row: door.row, why: "입력 후 " + door.why });
    }
  }

  // 여정 슬롯 연결 = 행 번호·사진·PID·맵 주소
  const it = (
    await c.query("SELECT raw_data d FROM itineraries WHERE id=$1", [
      itineraryId,
    ])
  ).rows[0];
  const d = it.d;
  const norm = (s: any) =>
    String(s ?? "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  const byName = new Map<string, any>();
  places.forEach((p, i) => {
    const l = linkOf.get(i);
    if (l) {
      byName.set(norm(p.name), l.row);
      if (p.nameLocal) byName.set(norm(p.nameLocal), l.row);
    }
  });
  const fullRows = new Map<number, any>(
    (
      await c.query(
        "SELECT id,image_url,google_place_id,google_maps_uri FROM place_seed_raw WHERE city_id=$1",
        [cityId],
      )
    ).rows.map((r: any) => [r.id, r]),
  );
  let linked = 0,
    withImg = 0,
    total = 0;
  for (const day of d.days || [])
    for (const s of day.places || []) {
      total++;
      const row = byName.get(norm(s.name)) || byName.get(norm(s.nameLocal));
      if (!row) continue;
      const fr = fullRows.get(row.id) || {};
      s.id = `db-${row.id}`;
      s.psrRowId = row.id;
      if (fr.image_url) {
        s.image = fr.image_url;
        withImg++;
      }
      if (fr.google_place_id) s.googlePlaceId = fr.google_place_id;
      if (fr.google_maps_uri) {
        s.googleMapsUri = fr.google_maps_uri;
        s.googleMapsUrl = fr.google_maps_uri;
      }
      linked++;
    }
  const beforeImg = (d.days || [])
    .flatMap((x: any) => x.places || [])
    .filter((s: any) => s.image).length;
  console.log(
    `③ 여정 ${itineraryId}: 슬롯 ${total} · 창고 행 연결 ${linked} · 사진 있음 ${beforeImg}`,
  );
  if (apply) {
    await c.query(
      "UPDATE itineraries SET raw_data=$1, updated_at=now() WHERE id=$2",
      [JSON.stringify(d), itineraryId],
    );
    console.log(
      "   → 여정 저장(덮어쓰기 = 같은 여정의 슬롯 연결만, raw 는 별도 파일 유지)",
    );
  }
  const report = {
    generatedAt: new Date().toISOString(),
    cityId,
    itineraryId,
    rawKey,
    lang,
    places: places.length,
    matched: linkOf.size,
    gmapsInsert: stat,
    slots: total,
    linked,
    withImage: beforeImg,
    apply,
  };
  const outDir = path.join(ROOT, "docs", "b1-reports", String(cityId));
  const saved = saveVersionedReport(
    outDir,
    `${rawDate()}_mix-replay_${itineraryId}.json`,
    report,
  );
  console.log("   산출표 =", saved);
  c.release();
  await pool!.end();
})().catch((e) => {
  console.error("ERR", e?.message || e);
  process.exit(1);
});
