// ⚠️ 수정금지(승인필요) 2026-10-23 사장님 결정 = 베스트 순위 = 필시티가 매 도시 베스트를 넣은 뒤 그 도시 최신 산출표(제미니 산출본) 순서로 best_rank 앞자리를 쓴다 = 동의 언어 수 많은 순 → 제미니 평균 등수 → 이름 · 볼거리·식당 따로 1번부터 · 두 목록에 다 있는 행은 자기 분류 쪽 번호 · 산출표 항목 → 행 = 있음은 짝 힌트 행 · 신규는 장부 행 (정본 §2026-10-23)
import fs from "fs";
import path from "path";
import { reportDirOf } from "../../worker/lib/services/shared/local-paths";
import {
  DIFF_SECTIONS,
  ROOT,
  connectDb,
  diffSectionItems,
  latestReport,
  ledgerKey,
  loadEnv,
  parseArgs,
  readLedger,
} from "./common";
import { crossKind } from "../../worker/lib/services/fill/gmaps-absorb";
import {
  inTxn,
  type NewEntry,
} from "../../worker/lib/services/fill/gmaps-shared";
import {
  bestRankOrdinal,
  writeBestRankOrdinal,
} from "../../worker/lib/services/shared/best-rank";

loadEnv();
const argv = parseArgs();
const cityId = Number(argv["city-id"] || 0);
const apply = argv["apply"] === "true";
const PLACED = new Set(["inserted", "worker-inserted", "worker-absorbed"]);

(async () => {
  if (!cityId) {
    console.error("Usage: --city-id=<N> [--apply]");
    process.exit(1);
  }
  const reportPath = latestReport(cityId, "b1-discovery-diff");
  if (!reportPath) {
    console.error(`✗ ${reportDirOf(cityId)} 에 산출표 없음`);
    process.exit(1);
  }
  const report = JSON.parse(fs.readFileSync(reportPath, "utf-8")).report;
  const ledger = readLedger(cityId);
  const want = new Map<
    number,
    { section: string; ordinal: number; name: string }[]
  >();
  const unmapped: string[] = [];
  for (const section of DIFF_SECTIONS) {
    const items: NewEntry[] = diffSectionItems(report, section).sort(
      (a, b) =>
        b.langs - a.langs ||
        (a.avgRank ?? Number.MAX_SAFE_INTEGER) -
          (b.avgRank ?? Number.MAX_SAFE_INTEGER) ||
        String(a.name).localeCompare(String(b.name)),
    );
    items.forEach((n, i) => {
      const e = ledger[ledgerKey(n)];
      const rowId =
        n.psrHint && !crossKind(n)
          ? n.psrHint.psrId
          : e?.rowId && PLACED.has(e.verdict)
            ? e.rowId
            : null;
      if (!rowId) {
        unmapped.push(
          `${section} ${i + 1}위 [${n.langs}] ${n.name} (${e?.verdict ?? "장부 없음"})`,
        );
        return;
      }
      want.set(rowId, [
        ...(want.get(rowId) ?? []),
        { section, ordinal: i + 1, name: n.name },
      ]);
    });
  }
  const c = await connectDb();
  const rows = new Map<number, any>(
    (
      await c.query(
        `SELECT id, name_en, seed_category, best_rank, merged_into FROM place_seed_raw WHERE id = ANY($1::int[])`,
        [[...want.keys()]],
      )
    ).rows.map((r: any) => [r.id, r]),
  );
  console.log(
    `═══ 베스트 순위 city ${cityId} = 산출표 ${path.relative(ROOT, reportPath)} · 짝 행 ${want.size} · 짝 없음 ${unmapped.length} · ${apply ? "APPLY" : "DRY"} ═══`,
  );
  let written = 0;
  const skipped: string[] = [];
  const run = async () => {
    for (const [rowId, cands] of want) {
      const r = rows.get(rowId);
      if (!r || r.merged_into || r.best_rank == null) {
        skipped.push(
          `#${rowId} ${cands[0].name} = ${!r ? "행 없음" : r.merged_into ? `병합됨 → #${r.merged_into}` : "베스트 아님"}`,
        );
        continue;
      }
      const own =
        r.seed_category === "restaurant" ? "restaurants" : "landmarks";
      const pick =
        cands.find((x) => x.section === own) ??
        cands.reduce((a, b) => (a.ordinal <= b.ordinal ? a : b));
      const before = bestRankOrdinal(r.best_rank);
      const res = apply
        ? await writeBestRankOrdinal(c, rowId, pick.ordinal)
        : { cur: r.best_rank, result: null };
      if (before !== pick.ordinal) written++;
      console.log(
        `  ${pick.section === "restaurants" ? "식당" : "볼거리"} ${String(pick.ordinal).padStart(2)}위 #${rowId} ${r.name_en} · 순위 ${before ?? "-"} → ${pick.ordinal}${apply ? ` · best_rank ${res.cur} → ${res.result}` : ""}`,
      );
    }
  };
  if (apply) await inTxn(c, run);
  else await run();
  for (const x of skipped) console.log(`  ⏭ ${x}`);
  for (const x of unmapped) console.log(`  ✘ 짝 없음 ${x}`);
  await c.end();
  console.log(
    `═══ 베스트 순위 끝 = ${apply ? "바뀜" : "바뀔 것"} ${written} · 건너뜀 ${skipped.length} · 짝 없음 ${unmapped.length} ═══`,
  );
  process.exit(0);
})().catch((e) => {
  console.error("✗ 베스트 순위 실패:", e?.message || e);
  process.exit(1);
});
