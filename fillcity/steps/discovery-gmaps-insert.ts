// ⚠️ 수정금지(승인필요) 2026-09-29 사장님 결정 = v3 ④ = 이 PC 에서 돈다(시드 = 사용자와 무관 = 빠르고 효과적인 쪽 = 창 5개 · 고친 즉시 실증) = B1 산출표를 R2 {도시}/reports 에 올리고 엔진 insertSeedEntries 1벌을 직접 부른다 = "있음"은 안 열고 그 행에 흡수, 신규만 구글맵으로 7요소 갖춰 넣기 → 병합 행 정리. 정제를 먼저 했으므로 후처리(다시 열기) 없음. 워커 큐 경로 폐기 §19 (정본 §)
import fs from "fs";
import path from "path";
import { reportDirOf } from "../../worker/lib/services/shared/local-paths";
import { fileURLToPath } from "url";
import { cityReportKey } from "../../shared/r2-paths";
import { crossKind } from "../../worker/lib/services/fill/gmaps-absorb";
import {
  codeOf,
  LIMITED_WHY,
  type NewEntry,
  type Read,
} from "../../worker/lib/services/fill/gmaps-shared";
import {
  EXIT_LIMITED,
  latestReport,
  ledgerKey,
  ledgerPath,
  readLedger,
  type Ledger,
} from "./common";

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
// ⚠️ 수정금지(승인필요) 2026-10-06 사장님 결정 = ④ 판정 장부 = 이 판(--since 뒤)에 넣은 곳은 다시 안 열고, 거부된 곳은 다시 안 열고 일꾼 명단으로, 제한 보기만 다음 판에 다시 연다(푸켓 실측 = 같은 7곳을 재시도마다 또 열어 140번 중 88번이 헛 열기) (정본 §)
const since = argv["since"] ? Date.parse(String(argv["since"])) : 0;
if (!cityId) {
  console.error(
    "Usage: --city-id=<N> [--apply] [--report=<path>] [--since=<ISO 시각>]",
  );
  process.exit(1);
}

function findReportPath(): string {
  if (argv["report"]) return path.resolve(String(argv["report"]));
  const p = latestReport(cityId, "b1-discovery-diff");
  if (!p) {
    console.error(
      `✗ ${reportDirOf(cityId)} 에 B1 산출표 없음 = discovery-merge-diff.ts 선행 필요`,
    );
    process.exit(1);
  }
  return p;
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
  const ledger: Ledger = readLedger(cityId);
  const fresh = (e: Ledger[string]) => Date.parse(e.at) >= since;
  const done = { inserted: [] as string[], rejected: [] as string[] };
  for (const s of sections) {
    s.new = (s.new as NewEntry[]).filter((n) => {
      const e = ledger[ledgerKey(n)];
      if (!e || !fresh(e)) return true;
      if (e.verdict === "inserted")
        done.inserted.push(`${n.name} → #${e.rowId}`);
      else if (e.verdict === "rejected")
        done.rejected.push(`${n.name} (${e.why})`);
      else return true;
      return false;
    });
  }
  const 신규: NewEntry[] = sections.flatMap((s) => s.new);
  console.log(
    `대상 = 있음 ${있음.length}곳(안 엶 = 그 행에 흡수) · 신규 ${신규.length}곳 → 구글맵 열어 넣음 (유료 API 0) · 장부로 뺀 곳 = 이미 넣음 ${done.inserted.length} · 거부(일꾼 명단) ${done.rejected.length}`,
  );
  for (const x of done.inserted) console.log(`  [장부 이미 넣음] ${x}`);
  for (const x of done.rejected) console.log(`  [장부 거부→일꾼] ${x}`);
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
      `  [${n.langs}] ${n.name} (${n.cat}, best_rank=${codeOf(n.name, n.langs, n.copies)}, €${n.price ?? "-"})`,
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
  const saveLedger = () =>
    fs.writeFileSync(ledgerPath(cityId), JSON.stringify(ledger, null, 2));
  // ⚠️ 수정금지(승인필요) 2026-10-23 사장님 결정 = 제한 보기로 못 연 곳이 하나라도 있으면 다음 판으로 미루지 않는다 = 종료 코드 3 → 본체가 인증을 기다렸다가 같은 단계를 다시(장부에 넣음·거부로 적힌 곳은 다시 안 엶 = 못 연 곳만) (정본 §2026-10-23)
  let limited = 0;
  const note = (r: Read) => {
    if (r.why === LIMITED_WHY) limited++;
    const cid = String(r.d?.mapsUri || "").match(/cid=(\d+)/)?.[1] ?? null;
    if (!r.why)
      ledger[ledgerKey(r.n)] = {
        name: r.n.name,
        cat: r.n.cat,
        langs: r.n.langs,
        verdict: "inserted",
        rowId: r.rowId ?? null,
        cid,
        tier: r.tier ?? null,
        at: new Date().toISOString(),
      };
    // ⚠️ 수정금지(승인필요) 2026-10-25 사장님 결정 = 3번 다시 열어도 못 읽은 곳(오류:)도 장부에 거부로 적는다 = 같은 판의 못 찾은 베스트(find-best)가 리서치로 다시 찾는다 = 잃어버리지 않는다 · 제한 보기·동의창은 사람 인증 뒤 이 단계를 다시 돈다 (정본 §2026-10-25)
    else if (r.why !== LIMITED_WHY && r.why !== "동의창")
      ledger[ledgerKey(r.n)] = {
        name: r.n.name,
        cat: r.n.cat,
        langs: r.n.langs,
        verdict: "rejected",
        why: r.why,
        pageName: r.d?.h1 ?? null,
        cid,
        at: new Date().toISOString(),
        entry: r.n,
      };
    else return;
    saveLedger();
  };
  try {
    await insertSeedEntries({
      client: c,
      browser,
      cityId,
      report,
      reportKey,
      upsertPlace,
      onRead: note,
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
  if (limited) {
    console.error(
      `⛔ 제한보기로 못 연 곳 ${limited} = 인증 뒤 이 단계를 다시(못 연 곳만)`,
    );
    process.exit(EXIT_LIMITED);
  }
})().catch((e) => {
  console.error("ERR", e?.message || e);
  process.exit(
    String(e?.message || "").startsWith("제한보기") ? EXIT_LIMITED : 1,
  );
});
