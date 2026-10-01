// ⚠️ 수정금지(승인필요) 2026-09-30 사장님 결정 = ⑤ 후처리 = 정제·발굴·입력이 끝나고도 가격이 없거나 튀는 식당만 우리 번호를 달아 120곳씩 제미니 1콜(#07 prompt.txt = geminiCurate 1벌, 유료 = --gemini=true 명시) · 가격 한 칸만 씀 · 어사이드 답(--apply-json) 넣기는 채널 ③ 몫으로 여기 둔다 · 옛 price-check(구글맵 카드 다시 열기) 폐기 §19 (정본 §)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { cardPrice, priceText } from "./gmaps-pid-identity/page-reader";
import {
  keepsExisting,
  loadEurPer,
  priceLabel,
  toEur,
} from "../shared/price-eur";
import { fileStamp } from "../../../../shared/r2-paths";

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
    .map(([k, ...v]) => [k, v.length ? v.join("=") : "true"]),
);
const cityId = Number(argv["city-id"] || 0);
const apply = argv["apply"] === "true";
// ⚠️ 수정금지(승인필요) 2026-08-30 사장님 SSOT = 외부 유료호출은 별도 명시 플래그 없이는 실행 금지.
const useGemini = argv["gemini"] === "true";
const SUSPECT_X = 3;
const CID_PRICED = `city_id=$1 AND status='active' AND seed_category='restaurant' AND google_maps_uri LIKE '%cid=%'`;

(async () => {
  if (!cityId) {
    console.error(
      "Usage: --city-id=<N> [--apply] [--gemini=true] [--ids=1,2] [--fx=KES:0.0068] [--apply-json=<[{id, price:'KES 5,000+'} | {id, prices:[...]} | {id, priceEur}]>]",
    );
    process.exit(1);
  }
  const pg = await import("pg");
  const c = new (pg as any).default.Client({
    connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const { upsertPlace } = await import("../place-upsert");
  const city = (
    await c.query("SELECT name_en, country_code FROM cities WHERE id=$1", [
      cityId,
    ])
  ).rows[0];
  const eurPer = await loadEurPer(c, argv["fx"]);
  const write = async (id: number, name: string, eur: number, tag: string) => {
    const r = await upsertPlace({
      targetRowId: id,
      cityId,
      seedCategory: "restaurant",
      nameEn: name,
      priceEur: eur,
      phaseTags: [tag],
    });
    if (r.action !== "updated")
      throw new Error(`쓰기 안 됨 #${id}: ${r.reason ?? r.action}`);
  };
  const finish = async (code = 0) => {
    await c.end();
    const { pool } = await import("../../db");
    await pool?.end();
    process.exit(code);
  };

  // 채널 ③ 어사이드 답 넣기 = [{ id, price: 카드·페이지 머리 글자 } | { id, prices: 리뷰 "1인당 가격" 여러 건 } | { id, priceEur }]
  if (argv["apply-json"]) {
    const answers: {
      id: number;
      price?: string;
      prices?: string[];
      priceEur?: number;
    }[] = JSON.parse(fs.readFileSync(String(argv["apply-json"]), "utf-8"));
    const mine = new Map<number, { name: string; before: number | null }>(
      (
        await c.query(
          "SELECT id, name_en, price_eur::float AS p FROM place_seed_raw WHERE city_id=$1 AND id = ANY($2::int[])",
          [cityId, answers.map((a) => a.id)],
        )
      ).rows.map((r: any) => [r.id, { name: r.name_en, before: r.p }]),
    );
    let n = 0;
    for (const a of answers.filter((x) => mine.has(x.id))) {
      const cp = !a.price
        ? null
        : /\d[.,]\d\s*(?:\(|·)/.test(a.price)
          ? cardPrice(a.price)
          : priceText(a.price);
      const reviews = (a.prices ?? [])
        .map((s) => priceText(s))
        .map((p) => (p ? toEur(p, city.country_code, eurPer) : {}))
        .filter((v) => v.eur != null);
      const fromReviews = reviews.map((v) => v.eur!).sort((x, y) => x - y);
      const r = cp
        ? toEur(cp, city.country_code, eurPer)
        : fromReviews.length
          ? {
              eur: fromReviews[Math.floor((fromReviews.length - 1) / 2)],
              open: reviews.filter((v) => v.open).length * 2 >= reviews.length,
            }
          : a.priceEur
            ? { eur: a.priceEur }
            : {};
      const row = mine.get(a.id)!;
      if (keepsExisting(row.before, r)) {
        console.log(
          `  = #${a.id} €${row.before} 그대로(증거 €${r.eur} 이상과 맞음)`,
        );
        continue;
      }
      if (r.eur == null) {
        console.log(`  ? #${a.id} = ${r.why ?? "가격 없음"}`);
        continue;
      }
      if (apply) await write(a.id, row.name, Math.round(r.eur), "price-aside");
      n++;
      console.log(
        `  ✎ #${a.id} = €${Math.round(r.eur)}${cp ? ` (${priceLabel(cp)})` : fromReviews.length ? ` (리뷰 ${fromReviews.length}건 가운데값)` : ""}`,
      );
    }
    console.log(
      `═══ 어사이드 가격 ${n}/${answers.length}행 ${apply ? "APPLY" : "DRY"} ═══`,
    );
    await finish();
  }

  const median = Number(
    (
      await c.query(
        `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY price_eur) AS m FROM place_seed_raw WHERE ${CID_PRICED} AND price_eur > 0`,
        [cityId],
      )
    ).rows[0]?.m ?? 0,
  );
  const above = median > 0 ? median * SUSPECT_X : Number.POSITIVE_INFINITY;
  const ids = String(argv["ids"] || "")
    .split(",")
    .map(Number)
    .filter(Boolean);
  const targets: {
    id: number;
    name_en: string;
    cid: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
    price_eur: number | null;
  }[] = (
    await c.query(
      `SELECT id, name_en, substring(google_maps_uri from 'cid=([0-9]+)') AS cid, address, latitude::float8 AS lat, longitude::float8 AS lng, price_eur::float AS price_eur
         FROM place_seed_raw WHERE ${CID_PRICED}
          AND ${ids.length ? "id = ANY($2::int[])" : "(price_eur IS NULL OR price_eur <= 0 OR price_eur > $2)"}
        ORDER BY id`,
      ids.length ? [cityId, ids] : [cityId, above],
    )
  ).rows;
  console.log(
    `═══ ⑤ 후처리 가격 city ${cityId} ${city.name_en} = 식당 가운데값 €${median.toFixed(1)} · 의심 기준 €${Number.isFinite(above) ? above.toFixed(0) : "-"} 초과 · 대상 ${targets.length}행 · ${useGemini ? (apply ? "GEMINI APPLY" : "GEMINI DRY(호출 0)") : "명단만(--gemini=true 로 호출)"} ═══`,
  );
  for (const t of targets)
    console.log(`  #${t.id} ${t.name_en} €${t.price_eur ?? "-"}`);

  const fixed: any[] = [];
  const left: any[] = [];
  if (useGemini && apply && targets.length) {
    const { issueApiKey } = await import("../shared/issue-api-key");
    const today = new Date().toISOString().slice(0, 10);
    const apiKey = await issueApiKey(c, "GEMINI_API_KEY", cityId, today, false);
    if (!apiKey) throw new Error("GEMINI_API_KEY 미발견");
    const { geminiCurate } = await import("../shared/gemini-curate");
    const out = await geminiCurate(
      city.name_en,
      cityId,
      targets.map((t) => ({
        id: t.id,
        nameEn: t.name_en,
        address: t.address,
        latitude: t.lat,
        longitude: t.lng,
        googleCid: t.cid,
      })),
      { apiKey, rawTag: "price-gemini" },
    );
    const byId = new Map(out.map((o) => [o.id, o]));
    for (const t of targets) {
      const o = byId.get(t.id);
      const eur = o?.priceEur != null ? Math.round(Number(o.priceEur)) : null;
      if (eur != null && eur > 0) {
        await write(t.id, t.name_en, eur, "price-gemini");
        fixed.push({ id: t.id, name: t.name_en, before: t.price_eur, eur });
        console.log(
          `  ✎ #${t.id} ${t.name_en} €${t.price_eur ?? "-"} → €${eur}`,
        );
      } else {
        left.push({
          id: t.id,
          name: t.name_en,
          before: t.price_eur,
          why: o ? "제미니 가격 없음" : "응답에 없음",
        });
        console.log(
          `  ? #${t.id} ${t.name_en} = ${o ? "제미니 가격 없음" : "응답에 없음"}`,
        );
      }
    }
  } else
    left.push(
      ...targets.map((t) => ({
        id: t.id,
        name: t.name_en,
        before: t.price_eur,
        why: "미호출",
      })),
    );

  const dir = path.join(ROOT, "docs", "b1-reports", String(cityId));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${fileStamp()}_price-gemini.json`);
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        cityId,
        city: city.name_en,
        median,
        suspectAbove: above,
        gemini: useGemini && apply,
        fixed,
        unresolved: left,
      },
      null,
      2,
    ),
  );
  console.log(
    `═══ 끝 = 고침 ${fixed.length} · 남음 ${left.length} · 산출표 ${path.relative(ROOT, file)} ═══`,
  );
  await finish();
})().catch((e) => {
  console.error("✗ 가격 후처리 실패:", e?.message || e);
  process.exit(1);
});
