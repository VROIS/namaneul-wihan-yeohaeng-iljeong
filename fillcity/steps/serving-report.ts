// ⚠️ 수정금지(승인필요) 2026-10-01 사장님 결정 = 필시티 검수 = 손님상(서빙 관문 + 분류별 리뷰 상위 20 + 식당 가격대별 하 15·중 25·상 10 + 베스트)이 갖춰졌는지·결손이 없는지 · 제미니 호출 전 기록과 비교 (정본 §)
import fs from "fs";
import path from "path";
import { connectDb, latestReport, loadEnv, parseArgs } from "./common";

loadEnv();
const argv = parseArgs();
const cityId = Number(argv["city-id"] || 0);
const CATS = [
  ["heritage", "유적"],
  ["attraction", "어트랙션"],
  ["adventure", "어드벤처"],
  ["healing", "힐링"],
  ["hotspot", "핫스팟"],
  ["shopping", "쇼핑"],
];
const isBlank = (x: unknown) => x == null || String(x).trim() === "";

(async () => {
  if (!cityId) {
    console.error("Usage: --city-id=<N>");
    process.exit(1);
  }
  const c = await connectDb();
  const name = (
    await c.query("SELECT name_en FROM cities WHERE id=$1", [cityId])
  ).rows[0]?.name_en;
  const rows = (
    await c.query(
      `SELECT id, seed_category AS cat, rank, best_rank, google_review_count AS rc, price_eur::float8 AS p,
              image_url AS img, google_maps_uri AS uri, name_ko, name_local, summary_ko, editorial_summary
         FROM place_seed_raw
        WHERE city_id=$1 AND status='active' AND seed_category NOT LIKE 'bts%' AND seed_category<>'hotel'
          AND (COALESCE(google_review_count,0)>0 OR best_rank IS NOT NULL)
          AND (google_place_id IS NOT NULL OR verify_source LIKE 'gmaps%')
          AND (business_status IS NULL OR business_status NOT IN ('CLOSED_PERMANENTLY','CLOSED_TEMPORARILY'))`,
      [cityId],
    )
  ).rows;
  const sel = new Set<number>();
  const short: string[] = [];
  for (const [cat, ko] of CATS) {
    const rs = rows
      .filter((r: any) => r.cat === cat)
      .sort((a: any, b: any) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
    rs.slice(0, 20).forEach((r: any) => sel.add(r.id));
    if (rs.length < 20) short.push(`${ko} ${rs.length}`);
  }
  const rest = rows.filter((r: any) => r.cat === "restaurant");
  const prices: number[] = (
    await c.query(
      `SELECT price_eur::float8 AS p FROM place_seed_raw
        WHERE city_id=$1 AND seed_category='restaurant' AND status='active'
          AND google_maps_uri LIKE '%cid=%' AND price_eur>0 ORDER BY price_eur`,
      [cityId],
    )
  ).rows.map((r: any) => r.p);
  const at = (f: number) =>
    prices[Math.min(prices.length - 1, Math.floor(prices.length * f))];
  const lo = prices.length >= 5 ? at(0.3) : null;
  const hi = prices.length >= 5 ? at(0.8) : null;
  const top = (a: any[], n: number) =>
    a.sort((x, y) => (x.rank ?? 1e9) - (y.rank ?? 1e9)).slice(0, n);
  const tl = top(
    rest.filter((r: any) => r.p > 0 && lo != null && r.p <= lo),
    15,
  );
  const tm = top(
    rest.filter((r: any) => lo != null && hi != null && r.p > lo && r.p <= hi),
    25,
  );
  const th = top(
    rest.filter((r: any) => hi != null && r.p > hi),
    10,
  );
  [...tl, ...tm, ...th].forEach((r: any) => sel.add(r.id));
  rows
    .filter((r: any) => r.best_rank != null)
    .forEach((r: any) => sel.add(r.id));
  const S = rows.filter((r: any) => sel.has(r.id));
  const def = {
    사진없음: S.filter((r: any) => !r.img).length,
    CID없음: S.filter((r: any) => !/cid=/.test(r.uri || "")).length,
    제미니칸빈: S.filter((r: any) =>
      [r.name_ko, r.name_local, r.summary_ko, r.editorial_summary].some(
        isBlank,
      ),
    ).length,
    체류가격빈: S.filter(
      (r: any) =>
        ["heritage", "attraction", "adventure", "healing"].includes(r.cat) &&
        r.p == null,
    ).length,
    식당가격빈: S.filter((r: any) => r.cat === "restaurant" && r.p == null)
      .length,
  };
  console.log(`═══ 손님상 검수 ${name}(${cityId}) ═══`);
  console.log(
    `손님상 ${S.length}곳 · 베스트 ${S.filter((r: any) => r.best_rank != null).length} · 비식당 6분류 상위 20 ${short.length ? "못 채움 = " + short.join(" · ") : "모두 채움"} · 식당 하 ${tl.length}/15 · 중 ${tm.length}/25 · 상 ${th.length}/10`,
  );
  console.log(
    `결손(손님상 안) = ${Object.entries(def)
      .map(([k, v]) => `${k} ${v}`)
      .join(" · ")}`,
  );
  const before = latestReport(cityId, "gemini-before");
  if (before) {
    const snap = JSON.parse(fs.readFileSync(before, "utf-8"));
    const ids = snap.map((s: any) => s.id);
    const now = new Map<number, any>(
      (
        await c.query(
          `SELECT id, name_ko, name_local, summary_ko, editorial_summary FROM place_seed_raw WHERE id = ANY($1::int[])`,
          [ids],
        )
      ).rows.map((r: any) => [r.id, r]),
    );
    const blank = (r: any) =>
      [r.name_ko, r.name_local, r.summary_ko, r.editorial_summary].some(
        isBlank,
      );
    const b = snap.filter(blank).length;
    const a = [...now.values()].filter(blank).length;
    console.log(
      `제미니 호출 전후(${path.basename(before)}) = 대상 ${snap.length}행 · 칸이 빈 행 ${b} → ${a}`,
    );
  }
  await c.end();
  process.exit(0);
})().catch((e) => {
  console.error("✗ 손님상 검수 실패:", e?.message || e);
  process.exit(1);
});
