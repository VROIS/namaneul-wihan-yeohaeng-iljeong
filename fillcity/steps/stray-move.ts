// 필시티 v4 = 한 장소는 가장 가까운 거점 하나에만 = 이 거점 폴더의 행 중 다른 완비 거점(readyCities 1벌)이 더 가까운 행을 그 거점 폴더로 옮긴다(내보내기만 · 남의 폴더에서 끌어오지 않는다 = 완성된 도시는 건드리지 않는다) · 이동은 기존 이동 도구(wrongcity-quarantine --ids --to) 한 길 (정본 2026-11-14)
import path from "path";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../../shared/schema";
import { ROOT, connectDb, loadEnv, parseArgs, runTsx } from "./common";
import { nearestHub } from "./ballot-common";
import { readyCities } from "../../worker/best-itinerary/city-resolver";

loadEnv();
const argv = parseArgs();
const cityId = Number(argv["city-id"] || 0);
const apply = argv["apply"] === "true";
(async () => {
  if (!cityId) {
    console.error("Usage: --city-id=<N> [--apply]");
    process.exit(1);
  }
  const c = await connectDb();
  const readyIds: number[] = (
    await readyCities(drizzle(c, { schema }) as any)
  ).map((r: any) => r.id);
  const hubs = (
    await c.query(
      "SELECT id, name, latitude::float8 lat, longitude::float8 lng FROM cities WHERE id = ANY($1::int[]) AND latitude IS NOT NULL",
      [[...new Set([cityId, ...readyIds])]],
    )
  ).rows;
  const rows: any[] = (
    await c.query(
      `SELECT id, name_en, seed_category, best_rank IS NOT NULL AS best, latitude::float8 lat, longitude::float8 lng
         FROM place_seed_raw
        WHERE city_id = $1 AND status <> 'merged' AND seed_category NOT LIKE 'bts%'
          AND latitude IS NOT NULL AND longitude IS NOT NULL AND latitude <> 0 AND longitude <> 0`,
      [cityId],
    )
  ).rows;
  await c.end();
  const plan = new Map<number, any[]>();
  for (const r of rows) {
    const h = nearestHub(hubs, r.lat, r.lng);
    if (h !== cityId) plan.set(h, [...(plan.get(h) ?? []), r]);
  }
  const total = [...plan.values()].reduce((s, a) => s + a.length, 0);
  console.log(
    `═══ 가까운 거점으로 내보내기 city ${cityId} = 좌표 있는 행 ${rows.length} 중 다른 거점이 더 가까운 행 ${total} · ${apply ? "APPLY" : "DRY"} ═══`,
  );
  let failed = 0;
  for (const [h, list] of plan) {
    const name = hubs.find((x: any) => x.id === h)?.name;
    console.log(
      `  → ${name}(${h}) ${list.length}행 = ${list.map((r) => `#${r.id} ${r.name_en}${r.best ? "(베스트)" : ""}`).join(" | ")}`,
    );
    if (!apply) continue;
    const ids = list.map((r) => r.id);
    for (let i = 0; i < ids.length; i += 150) {
      const code = await runTsx(
        path.join(ROOT, "worker/lib/services/fill/wrongcity-quarantine.ts"),
        [`--ids=${ids.slice(i, i + 150).join(",")}`, `--to=${h}`, "--apply"],
      );
      if (code !== 0) failed++;
    }
  }
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("✗ 가까운 거점으로 내보내기 실패:", e?.message || e);
  process.exit(1);
});
