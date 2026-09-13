// ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = v3 ④ = 이 PC 는 B1 산출표를 R2 에 올리고 클라우드플레어 워커의 후처리 큐에 넣는 것까지만 한다. 구글맵 열기·7요소·입력·raw 저장·병합 행 정리는 워커 엔진(gmaps-post insertSeedEntries → runGmapsPost) 1벌이 Browser Run 으로 돈다 = MIX 후처리와 같은 길·같은 환경. 옛 "이 PC Playwright 로 직접 입력" 폐기 §19 (정본 §)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { latestVersioned } from "../../worker/lib/services/shared/raw-filename";
import {
  codeOf,
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
  console.log(`═══ v3 ④ 구글맵 확정·입력(워커 큐) — city ${cityId} ═══`);
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
    `대상 = 있음 ${있음.length}곳(안 엶) · 신규 ${신규.length}곳 → 워커가 구글맵 열어 넣음 (유료 API 0)`,
  );
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
  if (!apply) {
    console.log(`\n=== DRY (쓰기 0) = --apply 로 큐 등록 ===`);
    return;
  }
  const { uploadToR2 } = await import(
    "../../worker/lib/services/shared/r2-client"
  );
  const reportKey = `b1-reports/${cityId}/${path.basename(reportPath)}`;
  await uploadToR2(
    reportKey,
    Buffer.from(fs.readFileSync(reportPath)),
    "application/json",
  );
  const { enqueueViaWorker } = await import(
    "../../worker/lib/services/fill/enqueue-client"
  );
  const res = await enqueueViaWorker({ cityId, reportKey });
  const { pool } = await import("../../worker/lib/db");
  await pool!.end();
  console.log(
    `\n═══ 큐 등록 완료: ${reportKey} → 워커 소비자가 신규 ${신규.length}곳 구글맵 확정·입력 + 후처리 + 병합 행 정리 (응답 ${JSON.stringify(res).slice(0, 120)}) ═══`,
  );
})().catch((e) => {
  console.error("ERR", e?.message || e);
  process.exit(1);
});
