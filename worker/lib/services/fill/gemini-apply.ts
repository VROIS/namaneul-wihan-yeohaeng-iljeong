// ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 제미니 2차 호출 입력에 우리 시드 분류(seed_category)를 같이 보낸다 = 종류 상상 차단 (정본 §)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
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
    .map(([k, ...v]) => [k, v.length ? v.join("=") : "true"]),
);
const cityId = Number(argv["city-id"] || 0);
const rawFile = String(argv["raw"] || "");
const apply = argv["apply"] === "true";
const part = String(argv["part"] || "");

function placesOf(file: string): any[] {
  const raw = JSON.parse(fs.readFileSync(file, "utf-8")).raw ?? {};
  if (Array.isArray(raw.parsed?.places)) return raw.parsed.places;
  const t = String(raw.text ?? "");
  const s = t.indexOf("{");
  return s < 0
    ? []
    : (JSON.parse(t.slice(s, t.lastIndexOf("}") + 1)).places ?? []);
}

const isBlank = (x: unknown) => x == null || String(x).trim() === "";

(async () => {
  const call = argv["call"] === "true";
  if (!cityId || (!rawFile && !call)) {
    console.error(
      "Usage: --city-id=<N> (--raw=<제미니 원본 JSON 경로> | --call=true --ids-file=<행 번호 JSON>) [--apply]",
    );
    process.exit(1);
  }
  const pg = await import("pg");
  const c = new (pg as any).default.Client({
    connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  let places: any[];
  if (call) {
    const ids: number[] = JSON.parse(
      fs.readFileSync(String(argv["ids-file"]), "utf-8"),
    ).map((x: any) => Number(x?.id ?? x));
    const city = (
      await c.query("SELECT name_en FROM cities WHERE id=$1", [cityId])
    ).rows[0];
    const rows = (
      await c.query(
        `SELECT id, name_en, seed_category, address, latitude::float8 AS lat, longitude::float8 AS lng, substring(google_maps_uri from 'cid=([0-9]+)') AS cid
           FROM place_seed_raw WHERE city_id=$1 AND id = ANY($2::int[]) ORDER BY id`,
        [cityId, ids],
      )
    ).rows;
    const { issueApiKey } = await import("../shared/issue-api-key");
    const apiKey = await issueApiKey(
      c,
      "GEMINI_API_KEY",
      cityId,
      new Date().toISOString().slice(0, 10),
      true,
    );
    if (!apiKey) throw new Error("GEMINI_API_KEY 미발견");
    const { geminiCurate } = await import("../shared/gemini-curate");
    const out = await geminiCurate(
      city.name_en,
      cityId,
      rows.map((r: any) => ({
        id: r.id,
        nameEn: r.name_en,
        address: r.address,
        latitude: r.lat,
        longitude: r.lng,
        googleCid: r.cid,
        seedCategory: r.seed_category,
      })),
      {
        apiKey,
        rawTag: part ? `enrich-after-google-${part}` : "enrich-after-google",
      },
    );
    console.log(`제미니 응답 ${out.length}곳 / 물은 곳 ${rows.length}곳`);
    places = out.map((o) => ({
      id: o.id,
      name_local: o.nameLocal,
      name_ko: o.nameKo,
      summary_ko: o.summaryKo,
      editorial_summary: o.editorialSummary,
      price_eur: o.priceEur,
      address: o.address,
      latitude: o.latitude,
      longitude: o.longitude,
      distance_km_from_center: o.distanceKmFromCenter,
    }));
  } else places = placesOf(rawFile);
  const { upsertPlace } = await import("../place-upsert");
  const tag = `gemini-enrich-${new Date().toISOString().slice(0, 10)}`;
  // ⚠️ 수정금지(승인필요) 2026-10-24 사장님 결정 = 제미니 2차 = 결손 행만 부르고, 응답은 전부 받되 그 행의 빈 칸만 채운다(있는 값 = 정답, 덮지 않는다) · 한 행이 막히면 그 행만 건너뛰고 나머지는 넣는다 (정본 §2026-10-24)
  const FIELDS: [string, string, string][] = [
    ["가격", "price_eur", "priceEur"],
    ["요약", "summary_ko", "selectionReasonKo"],
    ["한줄카피", "editorial_summary", "shortformKo"],
    ["원어이름", "name_local", "nameLocal"],
    ["한국어이름", "name_ko", "nameKo"],
    ["주소", "address", "address"],
    ["위도", "latitude", "latitude"],
    ["경도", "longitude", "longitude"],
    ["도심거리", "distance_km_from_center", "distanceKmFromCenter"],
  ];
  let written = 0,
    notMine = 0,
    filled = 0;
  const skipped: string[] = [];
  for (const g of places) {
    const id = Number(g.id);
    const cur = (
      await c.query(
        `SELECT name_en, seed_category, price_eur::float8 AS price_eur, summary_ko, editorial_summary, name_local, name_ko, address, latitude::float8 AS latitude, longitude::float8 AS longitude, distance_km_from_center::float8 AS distance_km_from_center FROM place_seed_raw WHERE id=$1 AND city_id=$2`,
        [id, cityId],
      )
    ).rows[0];
    if (!cur) {
      notMine++;
      continue;
    }
    const job: any = {
      targetRowId: id,
      cityId,
      seedCategory: cur.seed_category,
      nameEn: cur.name_en,
      phaseTags: [tag],
    };
    const put: string[] = [];
    for (const [label, col, key] of FIELDS)
      if (isBlank(cur[col]) && !isBlank(g[col])) {
        job[key] = g[col];
        put.push(`${label} 없음→${String(g[col]).slice(0, 24)}`);
      }
    console.log(
      `${apply ? "" : "[시험] "}#${id} ${cur.name_en} | 넣음: ${put.join(" · ") || "없음(빈 칸 없음)"}`,
    );
    if (!put.length) continue;
    if (apply) {
      try {
        const r = await upsertPlace(job);
        if (r.action !== "updated")
          throw new Error(`쓰기 안 됨: ${r.reason ?? r.action}`);
      } catch (e: any) {
        const why = String(e?.message || e).slice(0, 120);
        skipped.push(`#${id} ${cur.name_en} = ${why}`);
        console.log(`  ✘ #${id} 건너뜀 = ${why}`);
        continue;
      }
    }
    written++;
    filled += put.length;
  }
  console.log(
    `═══ 제미니 응답 저장 ${apply ? "끝" : "시험(쓰지 않음)"} = 채운 행 ${written} · 채운 칸 ${filled} · 건너뜀 ${skipped.length} · 이 도시 행 아님 ${notMine} ═══`,
  );
  await c.end();
  const { pool } = await import("../../db");
  await pool?.end();
  process.exit(0);
})().catch((e) => {
  console.error("✗ 제미니 응답 저장 실패:", e?.message || e);
  process.exit(1);
});
