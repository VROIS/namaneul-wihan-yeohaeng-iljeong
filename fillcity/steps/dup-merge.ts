// ⚠️ 수정금지(승인필요) 2026-10-01 사장님 결정 = 필시티 같은 장소 병합 = 에이전트의 keep/drop 판정을 기존 병합 길에 태운다(진 행의 태그를 원행에 합집합 → 진 행에 병합 표시 → 병합 행 정리가 번역·베스트·가이드·도시 대표·여정 번호를 원행으로 옮기고 삭제) (정본 §)
import fs from "fs";
import { connectDb, loadEnv, parseArgs } from "./common";

loadEnv();
const argv = parseArgs();
const cityId = Number(argv["city-id"] || 0);
const file = String(argv["apply"] || "");

(async () => {
  if (!cityId || !file || file === "true") {
    console.error("Usage: --city-id=<N> --apply=<병합 JSON>");
    process.exit(1);
  }
  const pairs: { keep: number; drop: number; reason: string }[] = JSON.parse(
    fs.readFileSync(file, "utf-8"),
  );
  const c = await connectDb();
  const { upsertPlace, purgeMergedRows } = await import(
    "../../worker/lib/services/place-upsert"
  );
  let merged = 0;
  for (const p of pairs) {
    const rows = (
      await c.query(
        `SELECT id, name_en, seed_category, category_tags FROM place_seed_raw
          WHERE city_id=$1 AND id = ANY($2::int[]) AND status='active' AND seed_category NOT LIKE 'bts_%'`,
        [cityId, [p.keep, p.drop]],
      )
    ).rows;
    const keep = rows.find((r: any) => r.id === Number(p.keep));
    const drop = rows.find((r: any) => r.id === Number(p.drop));
    if (!keep || !drop || keep.id === drop.id) {
      console.log(
        `  ⏭ #${p.keep} ← #${p.drop} 이 도시의 살아 있는 두 행 아님`,
      );
      continue;
    }
    const r = await upsertPlace({
      targetRowId: keep.id,
      cityId,
      seedCategory: keep.seed_category,
      nameEn: keep.name_en,
      categoryTags: drop.category_tags ?? [],
    });
    if (r.action !== "updated")
      throw new Error(`태그 합치기 안 됨 #${keep.id}: ${r.reason ?? r.action}`);
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.skip_dup_check','on', true)`);
    await c.query(
      `UPDATE place_seed_raw SET status='merged', merged_into=$1 WHERE id=$2`,
      [keep.id, drop.id],
    );
    await c.query("RESET app.skip_dup_check");
    await c.query("COMMIT");
    merged++;
    console.log(
      `  🧲 #${keep.id} ${keep.name_en} ← #${drop.id} ${drop.name_en} 병합 = ${p.reason}`,
    );
  }
  const purged = await purgeMergedRows(cityId);
  console.log(
    `═══ 같은 장소 병합 city ${cityId} = 병합 ${merged}쌍 · 진 행 삭제 ${purged.purged}행(${purged.ids.join(",")}) ═══`,
  );
  await c.end();
  const { pool } = await import("../../worker/lib/db");
  await pool?.end();
  process.exit(0);
})().catch((e) => {
  console.error("✗ 같은 장소 병합 실패:", e?.message || e);
  process.exit(1);
});
