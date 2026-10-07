// ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 필시티 v3.2 목록 입력 = 선별한 곳을 CID 행으로 넣고 후처리가 구글 맵 페이지를 열어 9요소를 확정한다 · DB 접속은 common.ts connectDb 1벌 (정본 §)
import fs from "fs";
import path from "path";
import { connectDb, loadEnv, parseArgs, reportDir } from "./common";
import { GMAPS_WINDOWS } from "../../worker/lib/services/fill/gmaps-pid-identity/page-reader";

loadEnv();
const argv = parseArgs();
const cityId = Number(argv["city-id"] || 0);
const apply = argv["apply"] === "true";
const runPost = argv["post"] !== "false";
// ⚠️ 수정금지(승인필요) 2026-10-06 사장님 결정 = 목록 입력 후처리 창 수 = 한 설정(GMAPS_WINDOWS) (정본 §)
const parallel = Math.max(1, Number(argv["parallel"] || GMAPS_WINDOWS));
const limit = Number(argv["limit"] || 0);
const EXIT_LIMITED = 3;

function latestSelect(): string {
  if (argv["report"]) return path.resolve(String(argv["report"]));
  const dir = reportDir(cityId);
  const f = fs
    .readdirSync(dir)
    .filter((x) => x.endsWith("_lists-select.json"))
    .sort()
    .pop();
  if (!f) {
    console.error(
      `✗ docs/b1-reports/${cityId} 에 선별 보고서 없음 = discovery-lists-select.ts 선행 필요`,
    );
    process.exit(1);
  }
  return path.join(dir, f);
}

(async () => {
  if (!cityId) {
    console.error(
      "Usage: --city-id=<N> [--apply] [--post=false] [--parallel=1] [--limit=N] [--report=<경로>]",
    );
    process.exit(1);
  }
  const reportPath = latestSelect();
  const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
  const picks: any[] = report.picks ?? [];
  console.log(
    `═══ 필시티 v3.2 ④ 목록 입력 — city ${cityId} · ${apply ? "APPLY" : "DRY(쓰기 0)"} ═══`,
  );
  console.log(`선별 보고서 = ${reportPath} (${report.generatedAt})`);
  const byCat: Record<string, number> = {};
  for (const p of picks) byCat[p.cat] = (byCat[p.cat] || 0) + 1;
  console.log(
    `뽑은 ${picks.length}곳 = ${Object.entries(byCat)
      .map(([k, v]) => `${k} ${v}`)
      .join(" · ")}`,
  );
  if (!apply) {
    console.log("\n=== DRY = --apply 로 입력(+후처리) ===");
    return;
  }
  const { cityReportKey } = await import("../../shared/r2-paths");
  const { uploadToR2 } = await import(
    "../../worker/lib/services/shared/r2-client"
  );
  const reportKey = cityReportKey(cityId, path.basename(reportPath));
  await uploadToR2(
    reportKey,
    Buffer.from(fs.readFileSync(reportPath)),
    "application/json",
  );
  const { upsertPlace, purgeMergedRows } = await import(
    "../../worker/lib/services/place-upsert"
  );
  const { zoneForDistanceKm } = await import(
    "../../worker/lib/services/shared/pool-radius"
  );
  const today = new Date().toISOString().slice(0, 10);
  const tally: Record<string, number> = {};
  const c = await connectDb();
  // ⚠️ 수정금지(승인필요) 2026-10-06 사장님 결정 = 이어 읽기 = 사람 인증 뒤 같은 단계를 다시 돌 때 이미 페이지를 읽은 행(구글맵 도장)은 다시 넣지 않는다(다시 넣으면 갱신 시각이 바뀌어 후처리가 그 행을 또 연다 = 마르세유 실측 70행 재열기) (정본 §)
  const done = new Set<string>(
    (
      await c.query(
        "SELECT substring(google_maps_uri from 'cid=([0-9]+)') AS cid FROM place_seed_raw WHERE city_id=$1 AND verify_source LIKE 'gmaps%' AND google_maps_uri LIKE '%cid=%'",
        [cityId],
      )
    ).rows.map((r: any) => String(r.cid)),
  );
  for (const p of picks) {
    if (done.has(String(p.cid))) {
      tally["이미 읽음"] = (tally["이미 읽음"] || 0) + 1;
      continue;
    }
    const r = await upsertPlace({
      cityId,
      seedCategory: p.cat,
      nameEn: p.name,
      latitude: p.lat,
      longitude: p.lng,
      googleMapsUri: `https://maps.google.com/?cid=${p.cid}`,
      googleReviewCount: p.rv,
      categoryTags: p.hotspotTag ? [p.cat, "hotspot"] : [p.cat],
      phaseTags: [`lists-${today}`],
      distanceKmFromCenter: p.km,
      dayZone: p.km != null ? zoneForDistanceKm(p.km) : null,
    });
    const k = `${r.action}${r.matchedBy && r.matchedBy !== "none" ? `(${r.matchedBy})` : ""}`;
    tally[k] = (tally[k] || 0) + 1;
  }
  console.log(
    `입력 결과 = ${Object.entries(tally)
      .map(([k, v]) => `${k} ${v}`)
      .join(" · ")}`,
  );
  if (!runPost) await c.end();
  if (runPost) {
    const { chromium } = await import("playwright");
    const { launchBrowser } = await import(
      "../../worker/lib/services/fill/gmaps-pid-identity/page-reader"
    );
    const { runGmapsPost, r2PrefixOf } = await import(
      "../../worker/lib/services/fill/gmaps-post"
    );
    const browser = await launchBrowser(chromium);
    let limitedStop = false;
    try {
      await runGmapsPost({
        client: c,
        browser,
        cityId,
        r2Prefix: r2PrefixOf(process.env.R2_PUBLIC_URL),
        upsertPlace,
        parallel,
        fill: true,
        limit: limit || undefined,
      });
    } catch (e: any) {
      console.error(`⛔ 후처리 중단 = ${e?.message || e}`);
      limitedStop = /제한보기/.test(String(e?.message));
      if (!limitedStop) throw e;
    } finally {
      await browser.close().catch(() => {});
    }
    const purged = await purgeMergedRows(cityId);
    console.log(`병합 행 정리 ${purged.purged}`);
    await c.end();
    if (limitedStop) {
      const { pool } = await import("../../worker/lib/db");
      await pool!.end();
      process.exit(EXIT_LIMITED);
    }
  }
  const { pool } = await import("../../worker/lib/db");
  await pool!.end();
  console.log(`═══ ④ 끝: 보고서 R2 ${reportKey} ═══`);
})().catch((e) => {
  console.error("ERR", e?.message || e);
  process.exit(1);
});
