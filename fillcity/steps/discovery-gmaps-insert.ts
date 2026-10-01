// ⚠️ 수정금지(승인필요) 2026-09-29 사장님 결정 = v3 ④ = 이 PC 에서 돈다(시드 = 사용자와 무관 = 빠르고 효과적인 쪽 = 창 5개 · 고친 즉시 실증) = B1 산출표를 R2 {도시}/reports 에 올리고 엔진 insertSeedEntries 1벌을 직접 부른다 = "있음"은 안 열고 그 행에 흡수, 신규만 구글맵으로 7요소 갖춰 넣기 → 병합 행 정리. 정제를 먼저 했으므로 후처리(다시 열기) 없음. 워커 큐 경로 폐기 §19 (정본 §)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { latestVersioned } from "../../worker/lib/services/shared/raw-filename";
import { cityReportKey } from "../../shared/r2-paths";
import {
  codeOf,
  crossKind,
  type NewEntry,
} from "../../worker/lib/services/fill/gmaps-shared";

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
  console.log(`═══ v3 ④ 흡수·신규 입력(이 PC) — city ${cityId} ═══`);
  console.log(`B1 산출표 = ${reportPath} (${report.generatedAt})`);
  const sections = [report.report.landmarks, report.report.restaurants];
  if (!sections.every((s) => Array.isArray(s?.confirm))) {
    console.error(
      `✗ B1 산출표에 confirm 목록 없음(등급 분리 이전 산출표) = discovery-merge-diff.ts 재실행 필요`,
    );
    process.exit(1);
  }
  const 있음: NewEntry[] = sections.flatMap((s) => s.confirm);
  const 신규: NewEntry[] = sections.flatMap((s) => s.new);
  console.log(
    `대상 = 있음 ${있음.length}곳(안 엶 = 그 행에 흡수) · 신규 ${신규.length}곳 → 구글맵 열어 넣음 (유료 API 0)`,
  );
  console.log(
    `\n--- 있음 ${있음.length}곳 = 창고에 이미 있음 = 안 열고 흡수 ---`,
  );
  for (const n of 있음)
    console.log(
      `  [${n.langs}] ${n.name} (${n.cat}) = PSR#${n.psrHint!.psrId} ${n.psrHint!.psrName}${crossKind(n) ? ` (${n.psrHint!.psrCat}) ⏭ 식당·비식당 엇갈림 = 흡수 안 함` : ""}`,
    );
  console.log(
    `\n--- 신규 ${신규.length}곳 = 구글맵 열어 7요소 갖추면 넣음 ---`,
  );
  for (const n of 신규)
    console.log(
      `  [${n.langs}] ${n.name} (${n.cat}, best_rank=${codeOf(n.name, n.langs, n.copies)}, avg€${n.avgPrice ?? "-"})`,
    );
  if (!apply) {
    console.log(`\n=== DRY (쓰기 0) = --apply 로 흡수·입력 ===`);
    return;
  }
  const { uploadToR2 } = await import(
    "../../worker/lib/services/shared/r2-client"
  );
  const reportKey = cityReportKey(cityId, path.basename(reportPath));
  await uploadToR2(
    reportKey,
    Buffer.from(fs.readFileSync(reportPath)),
    "application/json",
  );
  const pg = await import("pg");
  const c = new (pg as any).default.Client({
    connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const { chromium } = await import("playwright");
  const { upsertPlace, purgeMergedRows } = await import(
    "../../worker/lib/services/place-upsert"
  );
  const { insertSeedEntries } = await import(
    "../../worker/lib/services/fill/gmaps-post"
  );
  // ⚠️ 수정금지(승인필요) 2026-10-01 사장님 결정 = 신규 입력 브라우저도 정제와 같은 launchBrowser 1벌(GMAPS_CDP 가 있으면 로그인된 전용 크롬) (정본 §)
  const { launchBrowser } = await import(
    "../../worker/lib/services/fill/gmaps-pid-identity/page-reader"
  );
  const browser = await launchBrowser(chromium);
  try {
    await insertSeedEntries({
      client: c,
      browser,
      cityId,
      report,
      reportKey,
      upsertPlace,
    });
  } finally {
    await browser.close().catch(() => {});
  }
  const purged = await purgeMergedRows(cityId);
  await c.end();
  const { pool } = await import("../../worker/lib/db");
  await pool!.end();
  console.log(
    `\n═══ ④ 끝: 산출표 ${reportKey} · 병합 행 정리 ${purged.purged} ═══`,
  );
})().catch((e) => {
  console.error("ERR", e?.message || e);
  // 종료 코드 3 = 구글맵 제한 보기(채널 막힘) = 워크플로가 이 도시를 멈춘다 (gmaps-preclean EXIT_LIMITED 와 같은 값)
  process.exit(String(e?.message || "").startsWith("제한보기") ? 3 : 1);
});
