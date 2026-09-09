// ⚠️ 수정금지(승인필요) 2026-09-08 사장님 확정 = v3 ④ = v2 통째 복사 후 TS → 구글맵 공개페이지로만 교체(유료 0). 나머지는 v2 검증본 그대로.
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { latestVersioned } from "../../server/services/shared/raw-filename";
// ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = 구글맵으로 채우는 방법(검색·고르기·읽기·쓰기) = gmaps-shared.ts 1벌(§16). 재확인 도구도 같은 파일을 쓴다.
import {
  codeOf,
  newStat,
  openGmapsTools,
  provenanceTag,
  readAll,
  writeRead,
  type NewEntry,
} from "./gmaps-shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
process.chdir(ROOT);

const envRaw = fs.readFileSync(".env", "utf-8").replace(/^﻿/, "");
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    let v = m[2].trim();
    if (/^['"]/.test(v)) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

const argv = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a) => a.replace(/^--/, "").split("="))
    .map(([k, v]) => [k, v ?? "true"]),
);
const cityId = Number(argv["city-id"] || 0);
const apply = argv["apply"] === "true";
// ⚠️ 수정금지(승인필요) 2026-09-04 사장님 확정 = 모든 기준 = PID = B1 이 걸러준 confirm·new 전부 TS 1콜 → PID 로 판정(A등급 직행 merge 삭제 §19).
if (!cityId) {
  console.error("Usage: --city-id=<N> [--apply] [--report=<path>]");
  process.exit(1);
}

// ⚠️ 수정금지(승인필요) 2026-09-08 사장님 확정 = 산출표는 b1-discovery-diff 이름만 읽는다(오늘 같은 폴더의 gmaps-pid-identity 보고서를 잘못 집은 사고).
function findReportPath(): string {
  if (argv["report"]) return path.resolve(String(argv["report"]));
  const dir = path.join(ROOT, "docs", "b1-reports", String(cityId));
  const files = fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => /_b1-discovery-diff(_\d+)?\.json$/.test(f))
    : [];
  if (!files.length) {
    console.error(
      `✗ docs/b1-reports/${cityId} 에 B1 산출표 없음 = discovery-merge-diff.ts 선행 필요`,
    );
    process.exit(1);
  }
  const latestFile = files.sort().reverse()[0];
  const stem = latestFile.replace(/_\d+\.json$/, ".json");
  const chosen = latestVersioned(dir, stem) || latestFile;
  return path.join(dir, chosen);
}

(async () => {
  const reportPath = findReportPath();
  const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
  console.log(`═══ v3 ④ 구글맵 확정·입력 — city ${cityId} ═══`);
  console.log(`B1 산출표 = ${reportPath} (${report.generatedAt})`);

  const sections = [report.report.landmarks, report.report.restaurants];
  if (!sections.every((s) => Array.isArray(s?.confirm))) {
    console.error(
      `✗ B1 산출표에 confirm 목록 없음(등급 분리 이전 산출표) = discovery-merge-diff.ts 재실행 필요`,
    );
    process.exit(1);
  }
  // ⚠️ 수정금지(승인필요) 2026-09-04 사장님 결정 = 낡은 B1 산출표 기계 차단.
  //   B1 은 창고를 실시간으로 읽지만 B2 는 그 산출표 파일을 읽는다 = 그 사이 창고가 바뀌면
  //   이미 들어온 행(에펠탑·산타모니카 피어)을 신규로 오판해 TS 를 또 친다(실측 파리 36→11·LA 64→31).
  {
    const pg0 = await import("pg");
    const c0 = new (pg0 as any).default.Client({
      connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    await c0.connect();
    const nowCount = Number(
      (
        await c0.query(
          "SELECT count(*)::int AS n FROM place_seed_raw WHERE city_id=$1",
          [cityId],
        )
      ).rows[0].n,
    );
    await c0.end();
    const then = Number(report.psrCountBefore ?? -1);
    if (then !== nowCount) {
      console.error(
        `✗ B1 산출표가 낡음 = 창고 ${then}행 시점 판정인데 지금 ${nowCount}행 → discovery-merge-diff.ts 재실행 필요(무료·DB 쓰기 0).`,
      );
      process.exit(1);
    }
  }

  // ⚠️ 수정금지(승인필요) 2026-09-08 사장님 확정 = 창고 대조 결과 "있음"은 열지 않는다. "신규"만 밖에서 구글맵으로 완벽하게 만든 뒤 넣는다.
  const 있음: NewEntry[] = sections.flatMap((s) => s.confirm);
  const 신규: NewEntry[] = sections.flatMap((s) => s.new);
  const tsItems: NewEntry[] = 신규;

  console.log(
    `대상 = 있음 ${있음.length}곳(안 엶) · 신규 ${신규.length}곳 → 구글맵 열기 ${tsItems.length}곳 (유료 API 0)`,
  );

  if (!apply) {
    console.log(`\n--- 있음 ${있음.length}곳 = 창고에 이미 있음 = 안 엶 ---`);
    for (const n of 있음)
      console.log(
        `  [${n.langs}] ${n.name} (${n.cat}) = PSR#${n.psrHint!.psrId} ${n.psrHint!.psrName}`,
      );
    console.log(
      `\n--- 신규 ${신규.length}곳 = 구글맵 열어 7요소 갖추면 넣음 ---`,
    );
    for (const n of 신규)
      console.log(
        `  [${n.langs}] ${n.name} (${n.cat}, best_rank=${codeOf(n.name, n.langs, n.copies)}, avg€${n.avgPrice ?? "-"})`,
      );
    console.log(`\n=== DRY (쓰기 0) = --apply 로 실행 ===`);
    return;
  }

  const pg = await import("pg");
  const c = new (pg as any).default.Client({
    connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const city = (
    await c.query("SELECT country_code, name_en FROM cities WHERE id=$1", [
      cityId,
    ])
  ).rows[0];

  const { upsertPlace } = await import(
    pathToFileURL(path.join(ROOT, "server/services/place-upsert.ts")).href
  );

  const PROVENANCE_TAG = provenanceTag(new Date().toISOString().slice(0, 10));
  const stat = newStat();
  if (tsItems.length > 0) {
    // ⚠️ 수정금지(승인필요) 2026-09-08 사장님 확정 = TS 자리 = 구글맵 공개페이지 1벌 = 유료 0. 검색·고르기·읽기 = gmaps-shared 1벌.
    const rawRows: any[] = [];
    const g = await openGmapsTools(ROOT);
    const reads = await readAll(
      g.browser,
      g.browserUa,
      tsItems,
      {
        readPlacePage: g.readPlacePage,
        listCandidates: g.listCandidates,
        photoMaxWidthPx: g.photoMaxWidthPx,
        uploadToR2: g.uploadToR2,
        cityId,
        cityNameEn: city?.name_en,
        rawRows,
      },
      stat,
    ).finally(() => g.browser.close());

    for (const r of reads)
      await writeRead(
        c,
        upsertPlace,
        r,
        { cityId, provenanceTag: PROVENANCE_TAG },
        stat,
      );
    // ⚠️ 수정금지(승인필요) 2026-09-08 사장님 승인 = 발굴 한 판 = 도시별 raw 1파일(§18 saveRaw 관문).
    const { saveRaw } = await import(
      pathToFileURL(path.join(ROOT, "server/services/shared/save-raw.ts")).href
    );
    await saveRaw({
      source: "gmaps",
      contextId: cityId,
      tag: "discovery-insert",
      request: {
        cityId,
        reportFile: path.basename(reportPath),
        generatedAt: report.generatedAt,
        restaurantMinLangs: report.restaurantMinLangs ?? null,
        landmarkMinLangs: report.landmarkMinLangs ?? null,
      },
      raw: { summary: stat, report: report.report, rows: rawRows },
    });
    console.log(
      `raw 저장 = docs/raw/${cityId}/ + R2 (${rawRows.length}곳 1파일)`,
    );
  }

  await c.end();
  console.log(
    `
═══ 완료: 있음 ${있음.length}(안 엶) · 신규 ${tsItems.length} → 확인·입력 ${stat.insertedNew + stat.absorbedHint + stat.absorbedOther}(신규행 ${stat.insertedNew} / 흡수 ${stat.absorbedHint + stat.absorbedOther}) · 못 갖춤 ${stat.noMatch} · 폐업·휴업 ${stat.closed} · 쓰기이상 ${stat.skipped} · 페이지 열기 ${stat.pageOpens} ═══`,
  );
})();
