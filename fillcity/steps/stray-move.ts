// ⚠️ 수정금지(승인필요) 2026-11-21 사장님 결정 = 필시티 v4.1 = 한 장소는 붙을 거점(nearestHub 1벌) 하나 = 이 거점 폴더에서 다른 거점이 붙을 곳인 행은 내보내고 · 다른 거점 폴더에서 이 거점이 붙을 곳인 행은 끌어온다 · 거점 = 깃발(hubCities 1벌) · 이동은 기존 이동 도구(wrongcity-quarantine --ids --to = 행에 딸린 것 전부 이사) 한 길 (정본 2026-11-21)
import path from "path";
import { ROOT, connectDb, loadEnv, parseArgs, runTsx } from "./common";
import { countryOfAddress, hubCities, nearestHub } from "./ballot-common";

loadEnv();
const argv = parseArgs();
const cityId = Number(argv["city-id"] || 0);
const apply = argv["apply"] === "true";
const pullOnly = argv["pull-only"] === "true";
(async () => {
  if (!cityId) {
    console.error("Usage: --city-id=<N> [--pull-only=true] [--apply]");
    process.exit(1);
  }
  const c = await connectDb();
  const hubs = await hubCities(c, [cityId]);
  const rows: any[] = (
    await c.query(
      `SELECT id, city_id, name_en, address, verified_at IS NOT NULL AS read, best_rank IS NOT NULL AS best, latitude::float8 lat, longitude::float8 lng
         FROM place_seed_raw
        WHERE city_id = ANY($1::int[]) AND status <> 'merged' AND seed_category NOT LIKE 'bts%'
          AND latitude IS NOT NULL AND longitude IS NOT NULL AND latitude <> 0 AND longitude <> 0`,
      [hubs.map((h: any) => h.id)],
    )
  ).rows;
  await c.end();
  const plan = new Map<number, any[]>();
  for (const r of rows) {
    const h = nearestHub(
      hubs,
      r.lat,
      r.lng,
      countryOfAddress(r.address, r.read),
    );
    if (
      h !== r.city_id &&
      ((r.city_id === cityId && !pullOnly) || h === cityId)
    )
      plan.set(h, [...(plan.get(h) ?? []), r]);
  }
  const out = [...plan].filter(([h]) => h !== cityId);
  const pull = plan.get(cityId) ?? [];
  const nameOf = (id: number) => hubs.find((x: any) => x.id === id)?.name;
  console.log(
    `═══ 가까운 거점 정리 city ${cityId} = 내보낼 행 ${out.reduce((s, [, a]) => s + a.length, 0)} · 끌어올 행 ${pull.length} · ${apply ? "APPLY" : "DRY"} ═══`,
  );
  const show = (list: any[]) =>
    list
      .map((r) => `#${r.id} ${r.name_en}${r.best ? "(베스트)" : ""}`)
      .join(" | ");
  for (const [h, list] of out)
    console.log(`  → ${nameOf(h)}(${h}) ${list.length}행 = ${show(list)}`);
  for (const f of [...new Set(pull.map((r) => r.city_id))]) {
    const list = pull.filter((r) => r.city_id === f);
    console.log(`  ← ${nameOf(f)}(${f}) ${list.length}행 = ${show(list)}`);
  }
  if (!apply) process.exit(0);
  let failed = 0;
  for (const [h, list] of plan) {
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
  console.error("✗ 가까운 거점 정리 실패:", e?.message || e);
  process.exit(1);
});
