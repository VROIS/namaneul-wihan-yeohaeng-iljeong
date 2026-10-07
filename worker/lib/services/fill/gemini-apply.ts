// ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 제미니 2차 호출 입력에 우리 시드 분류(seed_category)를 같이 보낸다 = 종류 상상 차단 (정본 §)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { CardPrice } from "./gmaps-pid-identity/page-reader";
import {
  decidePrice,
  FRESH_SQL,
  loadEurPer,
  PAGE_PRICE_FRESH_DAYS,
  pagePriceEur,
} from "../shared/price-eur";

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

type Logged = {
  name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  hp: CardPrice | null;
  adm: CardPrice | null;
  pp: CardPrice | null;
};

// 구글맵 읽기 로그 = 도시 폴더의 *_gmaps-page-read-N.json 전부를 시각순으로 읽어 행마다 가장 나중 것만 남긴다(구글 값의 유일한 증거) · 3개월(PAGE_PRICE_FRESH_DAYS)보다 오래된 로그는 증거가 아니다
function googleLog(city: number): Map<number, Logged> {
  const dir = path.join(ROOT, "docs", "raw", String(city));
  const out = new Map<number, Logged>();
  if (!fs.existsSync(dir)) return out;
  const files = fs
    .readdirSync(dir)
    .filter((f) => /_gmaps-page-read-\d+\.json$/.test(f))
    .sort();
  const since = Date.now() - PAGE_PRICE_FRESH_DAYS * 864e5;
  for (const f of files) {
    if (Date.parse(f.slice(0, 10)) < since) continue;
    const rows = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"))?.raw
      ?.rows;
    for (const r of rows ?? []) {
      const p = r.parsed ?? {};
      out.set(Number(r.id), {
        name: p.name || null,
        address: p.address || null,
        lat: p.lat ?? null,
        lng: p.lng ?? null,
        hp: p.headerPrice ?? null,
        adm: p.admission ?? null,
        pp: p.perPerson ?? null,
      });
    }
  }
  return out;
}

function placesOf(file: string): any[] {
  const raw = JSON.parse(fs.readFileSync(file, "utf-8")).raw ?? {};
  if (Array.isArray(raw.parsed?.places)) return raw.parsed.places;
  const t = String(raw.text ?? "");
  const s = t.indexOf("{");
  return s < 0
    ? []
    : (JSON.parse(t.slice(s, t.lastIndexOf("}") + 1)).places ?? []);
}

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
  const logs = googleLog(cityId);
  const eurPer = await loadEurPer(c, argv["fx"]);
  const cc = (
    await c.query("SELECT country_code FROM cities WHERE id=$1", [cityId])
  ).rows[0]?.country_code;
  let places: any[];
  if (call) {
    // 🔴 유료 = 제미니 1콜(120곳 배치) · 응답 원본은 호출 관문이 도시 폴더에 자동 저장한다
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
      name_en: o.nameEn,
      name_ko: o.nameKo,
      address: o.address,
      latitude: o.latitude,
      longitude: o.longitude,
      summary_ko: o.summaryKo,
      editorial_summary: o.editorialSummary,
      price_eur: o.priceEur,
      distance_km_from_center: o.distanceKmFromCenter,
    }));
  } else places = placesOf(rawFile);
  const { upsertPlace } = await import("../place-upsert");
  const tag = `gemini-enrich-${new Date().toISOString().slice(0, 10)}`;
  let written = 0,
    skipped = 0,
    totalChanged = 0,
    totalBlocked = 0;
  for (const g of places) {
    const id = Number(g.id);
    const cur = (
      await c.query(
        `SELECT name_en, seed_category, distance_km_from_center::float8 AS dist, address, latitude::float8 AS lat, price_eur::float8 AS price, name_local, name_ko, summary_ko, editorial_summary, (verified_at IS NOT NULL) AS stamped, ${FRESH_SQL} AS fresh FROM place_seed_raw WHERE id=$1 AND city_id=$2`,
        [id, cityId],
      )
    ).rows[0];
    if (!cur) {
      skipped++;
      continue;
    }
    const L = logs.get(id);
    const put: string[] = [];
    const keep: string[] = [];
    const job: any = {
      targetRowId: id,
      cityId,
      seedCategory: cur.seed_category,
      nameEn: cur.name_en,
      phaseTags: [tag],
    };
    // 구글 값 칸 = 구글 페이지를 읽은(스탬프) 행이면 지키고, 아니면 제미니 값으로 채운다
    const fill = (label: string, guarded: boolean, apply: () => void) =>
      guarded ? keep.push(label) : (apply(), put.push(label));
    if (g.name_en)
      fill("영어이름", cur.stamped, () => (job.nameEn = g.name_en));
    if (g.address) fill("주소", cur.stamped, () => (job.address = g.address));
    if (g.latitude != null && g.longitude != null)
      fill("좌표", cur.stamped, () => {
        job.latitude = g.latitude;
        job.longitude = g.longitude;
      });
    // ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 가격 = 가격 결정 1벌(decidePrice) = 3개월 안 페이지 값(pagePriceEur 1벌) > 제미니(0 = 무료 그대로) > 옛 값 · 페이지를 열었는데 가격이 없고 제미니도 없으면 옛 값은 비운다(NULL = 모름) (정본 §)
    const pagePrice = L
      ? pagePriceEur(
          cur.seed_category,
          { price: L.hp, perPerson: L.pp, admission: L.adm },
          cc,
          eurPer,
          cur.price ?? null,
        )
      : null;
    const pd = decidePrice({
      pagePrice,
      geminiPrice: g.price_eur ?? null,
      oldPrice: cur.price ?? null,
      oldFromPage: !!cur.fresh,
      pageOpened: !!L,
    });
    const priceFromGoogle = pd.source === "page" || pd.source === "old-page";
    const priceNew = pd.price;
    const priceSame =
      pd.price == null || cur.price == null
        ? pd.price === (cur.price ?? null)
        : Math.abs(pd.price - cur.price) < 1e-6; // real 컬럼의 부동소수 꼬리(2.7999999)는 같은 값
    if (!priceSame) {
      job.priceEur = pd.price;
      job.clearPriceEur = pd.clear;
      put.push("가격");
    }
    if (g.distance_km_from_center != null)
      fill("도심거리", cur.dist != null, () => {
        job.distanceKmFromCenter = g.distance_km_from_center;
      });
    // 제미니 전용 칸 = 구글이 원래 안 주는 칸
    if (g.name_local) ((job.nameLocal = g.name_local), put.push("원어이름"));
    if (g.name_ko) ((job.nameKo = g.name_ko), put.push("한국어이름"));
    if (g.summary_ko)
      ((job.selectionReasonKo = g.summary_ko), put.push("요약"));
    if (g.editorial_summary)
      ((job.shortformKo = g.editorial_summary), put.push("한줄카피"));
    // 변화 = 쓰려는 값이 지금 행 값과 실제로 다른 칸 / 막음 = 제미니 값이 구글 값과 달라서 막은 칸(막지 않았다면 오염)
    const short = (v: unknown) => String(v ?? "없음").slice(0, 24);
    const pairs: [string, unknown, unknown, boolean][] = [
      ["영어이름", cur.name_en, g.name_en, cur.stamped],
      ["주소", cur.address, g.address, cur.stamped],
      ["원어이름", cur.name_local, g.name_local, false],
      ["한국어이름", cur.name_ko, g.name_ko, false],
      ["요약", cur.summary_ko, g.summary_ko, false],
      ["한줄카피", cur.editorial_summary, g.editorial_summary, false],
    ];
    const changed = pairs
      .filter(
        ([l, a, b, guard]) =>
          !guard && b != null && b !== "" && a !== b && put.includes(l),
      )
      .map(([l, a, b]) => `${l} ${short(a)}→${short(b)}`);
    if (put.includes("가격"))
      changed.push(`가격 ${short(cur.price)}→${short(priceNew)}(${pd.source})`);
    const blocked = pairs
      .filter(([, a, b, guard]) => guard && b != null && b !== "" && a !== b)
      .map(([l, a, b]) => `${l} 구글 ${short(a)}≠제미니 ${short(b)}`);
    if (priceFromGoogle && g.price_eur != null && g.price_eur !== priceNew)
      blocked.push(`가격 구글 ${priceNew}≠제미니 ${g.price_eur}`);
    totalChanged += changed.length;
    totalBlocked += blocked.length;
    console.log(
      `${apply ? "" : "[시험] "}#${id} ${cur.name_en} | 바뀜: ${changed.join(" · ") || "없음"} | 오염 막음: ${blocked.join(" · ") || "없음"}${L ? "" : " | 구글 로그 없음"}`,
    );
    if (apply) {
      const r = await upsertPlace(job);
      if (r.action !== "updated")
        throw new Error(`쓰기 안 됨 #${id}: ${r.reason ?? r.action}`);
    }
    written++;
  }
  console.log(
    `═══ 제미니 응답 저장 ${apply ? "끝" : "시험(쓰지 않음)"} = 행 ${written} · 바뀐 칸 ${totalChanged} · 막은 오염 칸 ${totalBlocked} · 건너뜀(이 도시 행 아님) ${skipped} ═══`,
  );
  await c.end();
  const { pool } = await import("../../db");
  await pool?.end();
  process.exit(0);
})().catch((e) => {
  console.error("✗ 제미니 응답 저장 실패:", e?.message || e);
  process.exit(1);
});
