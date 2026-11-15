// 필시티 v4 = 출발 상태 만들기 = 그 거점 폴더에서 구글 번호(CID)가 없는 활성 행을 지운다(사장님 2026-11-14 결정 = CID 가 있다는 것은 검증이 끝났다는 뜻 → 남은 행은 전부 검증 끝난 행) · 삭제는 사장님 결정 파일(*_boss-fix.json) → llm-review --apply 한 길 · BTS 행은 건드리지 않는다 (정본 2026-11-14)
import fs from "fs";
import path from "path";
import {
  ROOT,
  connectDb,
  loadEnv,
  parseArgs,
  reportDir,
  runTsx,
  stamp,
} from "./common";

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
  const rows: any[] = (
    await c.query(
      `SELECT id, name_en, seed_category, best_rank IS NOT NULL AS best, google_place_id IS NOT NULL AS pid
         FROM place_seed_raw
        WHERE city_id = $1 AND status = 'active' AND merged_into IS NULL
          AND seed_category NOT LIKE 'bts%'
          AND NOT COALESCE(google_maps_uri ~ 'cid=[0-9]+', false)
        ORDER BY id`,
      [cityId],
    )
  ).rows;
  await c.end();
  console.log(
    `═══ 출발 상태 city ${cityId} = 구글 번호(CID) 없는 활성 행 ${rows.length} · ${apply ? "APPLY" : "DRY"} ═══`,
  );
  for (const r of rows)
    console.log(
      `  #${r.id} ${r.seed_category} "${r.name_en}"${r.best ? " · 베스트" : ""}${r.pid ? " · PID 만 있음" : ""}`,
    );
  if (!rows.length || !apply) process.exit(0);
  const f = path.join(reportDir(cityId), `${stamp()}_nocid_boss-fix.json`);
  fs.writeFileSync(
    f,
    JSON.stringify(
      rows.map((r) => ({
        id: r.id,
        reason: "구글 번호(CID) 없는 행 = 출발 전 삭제(사장님 결정 2026-11-14)",
      })),
      null,
      2,
    ),
  );
  const code = await runTsx(path.join(ROOT, "fillcity/steps/llm-review.ts"), [
    `--city-id=${cityId}`,
    `--apply=${f}`,
  ]);
  process.exit(code);
})().catch((e) => {
  console.error("✗ 출발 상태 실패:", e?.message || e);
  process.exit(1);
});
