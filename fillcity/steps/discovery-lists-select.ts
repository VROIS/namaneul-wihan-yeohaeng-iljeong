// ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 필시티 v3.2 목록 선별 = 우리 분류표에 있는 라벨만 가져온다(식당은 예외), 분류마다 모자란 만큼만 뽑는다 · 거리는 geo-distance 1벌 · 목록 원본 읽기는 lists-common 1벌 (정본 §)
import fs from "fs";
import path from "path";
import { rawDirOf } from "../../worker/lib/services/shared/local-paths";
import { connectDb, loadEnv, parseArgs, reportDir, stamp } from "./common";
import { labelOfLine, readListRaws } from "./lists-common";
import {
  distanceKmFromCoords,
  CITY_RANGE_KM,
} from "../../worker/lib/services/shared/geo-distance";

loadEnv();
const argv = parseArgs();
const cityId = Number(argv["city-id"] || 0);
const PER_CAT = Math.max(1, Number(argv["per-cat"] || 20));
const REST_TARGET = Math.max(1, Number(argv["rest-target"] || 50));
const RADIUS_KM = Number(argv["radius-km"] || CITY_RANGE_KM);
const SIGHTS = [
  "heritage",
  "attraction",
  "adventure",
  "healing",
  "photospot",
  "shopping",
];

function latestLists(): Map<string, { file: string; json: any }> {
  const out = new Map<string, { file: string; json: any }>();
  for (const x of readListRaws(cityId)) out.set(String(x.json.request?.key), x);
  return out;
}

(async () => {
  if (!cityId) {
    console.error(
      "Usage: --city-id=<N> [--per-cat=20] [--rest-target=50] [--radius-km=100]",
    );
    process.exit(1);
  }
  const lists = latestLists();
  if (!lists.size) {
    console.error(
      `✗ ${rawDirOf(cityId)} 에 목록 원본 없음 = discovery-lists.ts 선행 필요`,
    );
    process.exit(1);
  }
  const { cardPrice } = await import(
    "../../worker/lib/services/fill/gmaps-pid-identity/page-reader"
  );
  const { finalCategory, categoriesOfLabel } = await import(
    "../../worker/lib/services/shared/place-category-map"
  );
  const c = await connectDb();
  const city = (
    await c.query(
      "SELECT name_en, latitude::float8 AS lat, longitude::float8 AS lng FROM cities WHERE id=$1",
      [cityId],
    )
  ).rows[0];
  const wh: any[] = (
    await c.query(
      `SELECT id, seed_category, status, google_maps_uri FROM place_seed_raw
        WHERE city_id=$1 AND merged_into IS NULL AND seed_category NOT LIKE 'bts%' AND seed_category <> 'hotel'`,
      [cityId],
    )
  ).rows;
  await c.end();
  const whCid = new Map<string, any>();
  for (const w of wh) {
    const m = String(w.google_maps_uri || "").match(/cid=(\d+)/);
    if (m) whCid.set(m[1], w);
  }

  const drop = {
    sponsored: 0,
    noCid: 0,
    far: 0,
    notPlace: 0,
    notInTable: 0,
    inList: 0,
  };
  const items = new Map<string, any>();
  for (const [key, { json }] of lists) {
    for (const e of json.raw?.entries ?? []) {
      if (e.sponsored) {
        drop.sponsored++;
        continue;
      }
      if (!e.cid) {
        drop.noCid++;
        continue;
      }
      const label = labelOfLine(e.line);
      const known = categoriesOfLabel(label).length > 0;
      const foodByPrice =
        !known && !!cardPrice(String(e.line).replace(/[-]/g, ""));
      const intended = foodByPrice ? "restaurant" : json.request.intended;
      if (!known && !foodByPrice && intended !== "restaurant") {
        drop.notInTable++;
        continue;
      }
      const it = items.get(e.cid) ?? { ...e, label, srcs: [] as any[] };
      if (items.has(e.cid)) drop.inList++;
      it.srcs.push({ key, intended });
      items.set(e.cid, it);
    }
  }
  type Pick = {
    cat: string;
    name: string;
    cid: string;
    lat: number | null;
    lng: number | null;
    rv: number;
    label: string | null;
    srcs: string[];
    photospotTag: boolean;
    unknownLabel: boolean;
    km: number | null;
    inWarehouse: boolean;
  };
  const pool: Pick[] = [];
  for (const it of items.values()) {
    const km =
      it.lat != null && it.lng != null
        ? distanceKmFromCoords(city.lat, city.lng, it.lat, it.lng)
        : null;
    if (km != null && km > RADIUS_KM) {
      drop.far++;
      continue;
    }
    let best: any = null;
    for (const s of it.srcs) {
      // ⚠️ 수정금지(승인필요) 2026-10-12 사장님 결정 = 분류 확정에 이름도 넘긴다 = 이름에 식당이 든 와이너리는 식당 유지 (정본 §)
      const fc = finalCategory(
        s.intended,
        it.label,
        { reviewCount: it.rv },
        it.name,
      );
      if (!best || (best.changed && !fc.changed)) best = fc;
    }
    if (best.notPlace) {
      drop.notPlace++;
      continue;
    }
    pool.push({
      cat: best.cat,
      name: it.name,
      cid: it.cid,
      lat: it.lat,
      lng: it.lng,
      rv: it.rv ?? 0,
      label: it.label ?? null,
      srcs: it.srcs.map((s: any) => s.key),
      photospotTag: !!best.photospotTag,
      unknownLabel: !!best.unknownLabel,
      km: km == null ? null : Math.round(km * 10) / 10,
      inWarehouse: whCid.has(it.cid),
    });
  }

  const haveBy = (cat: string) =>
    wh.filter((w) => w.seed_category === cat && w.status === "active").length;
  const picks: Pick[] = [];
  const stats: any[] = [];
  const plan = [
    ...SIGHTS.map((cat) => ({ cat, target: PER_CAT })),
    { cat: "restaurant", target: REST_TARGET },
  ];
  for (const { cat, target } of plan) {
    const cands = pool
      .filter((p) => p.cat === cat && !p.inWarehouse)
      .sort((a, b) => b.rv - a.rv || a.name.localeCompare(b.name));
    const have = haveBy(cat);
    const need = Math.max(0, target - have);
    const take = cands.slice(0, need);
    picks.push(...take);
    stats.push({
      cat,
      target,
      have,
      candidates: cands.length,
      pick: take.length,
      lastRv: take.length ? take[take.length - 1].rv : null,
      short: need - take.length,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    cityId,
    params: { perCat: PER_CAT, restTarget: REST_TARGET, radiusKm: RADIUS_KM },
    sources: [...lists.entries()].map(([key, v]) => ({
      key,
      file: v.file,
      total: v.json.raw?.total ?? null,
    })),
    drop,
    stats,
    picks,
    pool: pool.map((p) => ({ cat: p.cat, cid: p.cid, rv: p.rv })),
  };
  const out = path.join(reportDir(cityId), `${stamp()}_lists-select.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2));

  console.log(
    `═══ 필시티 v3.2 ③ 목록 선별 — city ${cityId} ${city.name_en} · 분류당 ${PER_CAT} · 식당 ${REST_TARGET} · 반경 ${RADIUS_KM}km ═══`,
  );
  console.log(
    `원본 ${lists.size}개 문장 → 서로 다른 CID ${items.size}곳 (겹침 ${drop.inList} · 스폰서 ${drop.sponsored} · CID 없음 ${drop.noCid} · 반경 밖 ${drop.far} · 장소 아님 ${drop.notPlace} · 표에 없는 라벨 ${drop.notInTable})`,
  );
  console.log(
    "분류          목표  창고  후보  이번에 뽑음  마지막 리뷰  못 채움",
  );
  for (const s of stats)
    console.log(
      `${s.cat.padEnd(12)} ${String(s.target).padStart(4)} ${String(s.have).padStart(5)} ${String(s.candidates).padStart(5)} ${String(s.pick).padStart(9)} ${String(s.lastRv ?? "-").padStart(11)} ${String(s.short).padStart(7)}`,
    );
  const unknown = picks.filter((p) => p.unknownLabel);
  console.log(
    `\n뽑은 ${picks.length}곳 중 표에 없는 라벨(페이지 열 때 판정) ${unknown.length}곳 · 포토스팟 태그 ${picks.filter((p) => p.photospotTag).length}곳`,
  );
  console.log(`보고서 = ${out}`);
})().catch((e) => {
  console.error("ERR", e?.message || e);
  process.exit(1);
});
