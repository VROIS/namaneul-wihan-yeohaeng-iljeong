// ⚠️ 수정금지(승인필요) 2026-10-23 사장님 결정 = 베스트 순위 = 필시티가 매 도시 베스트를 넣은 뒤 그 도시 최신 산출표(제미니 산출본) 순서로 best_rank 앞자리를 쓴다 = 동의 언어 수 많은 순 → 제미니 평균 등수 → 이름 · 볼거리·식당 따로 1번부터 · 두 목록에 다 있는 행은 자기 분류 쪽 번호 · 산출표 항목 → 행 = 있음은 짝 힌트 행 · 신규는 장부 행 (정본 §2026-10-23)
import path from "path";
import { ROOT, connectDb, loadEnv, parseArgs } from "./common";
import { readBestOutput } from "./best-output";
import { inTxn } from "../../worker/lib/services/fill/gmaps-shared";
import {
  bestRankOrdinal,
  writeBestRankOrdinal,
} from "../../worker/lib/services/shared/best-rank";

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
  const out = await readBestOutput(c, cityId);
  if (!out) {
    console.error(`✗ 도시 ${cityId} 베스트 산출본(산출표) 없음`);
    process.exit(1);
  }
  const { reportPath, items } = out;
  const want = new Map<
    number,
    { section: string; ordinal: number; name: string }[]
  >();
  const unmapped: string[] = [];
  for (const x of items) {
    if (!x.rowId) {
      unmapped.push(
        `${x.section} ${x.ordinal}위 [${x.entry.langs}] ${x.entry.name} (${x.state})`,
      );
      continue;
    }
    want.set(x.rowId, [
      ...(want.get(x.rowId) ?? []),
      { section: x.section, ordinal: x.ordinal, name: x.entry.name },
    ]);
  }
  const rows = new Map<number, any>(
    items.filter((x) => x.row).map((x) => [x.rowId!, x.row]),
  );
  // 필시티 v4 = 한 번 붙은 장소는 다른 거점이 등수를 쓰지 않는다 = 이 거점 폴더의 행에만 쓴다 (정본 2026-11-14)
  const mine = new Set<number>(
    (
      await c.query(
        "SELECT id FROM place_seed_raw WHERE id = ANY($1::int[]) AND city_id = $2",
        [[...rows.keys()], cityId],
      )
    ).rows.map((r: any) => r.id),
  );
  console.log(
    `═══ 베스트 순위 city ${cityId} = 산출표 ${path.relative(ROOT, reportPath)} · 짝 행 ${want.size} · 짝 없음 ${unmapped.length} · ${apply ? "APPLY" : "DRY"} ═══`,
  );
  // 필시티 v4 = 등수는 실제로 쓸 행끼리 1부터 빈 번호 없이 매긴다(못 찾은 항목 · 한 행에 모인 여러 항목 · 다른 거점 행이 번호를 차지해 화면 등수에 구멍이 나지 않게) (정본 2026-11-14)
  const dense = new Map<number, number>();
  for (const sec of ["landmarks", "restaurants"]) {
    const list: { rowId: number; ordinal: number }[] = [];
    for (const [rowId, cands] of want) {
      const r = rows.get(rowId);
      if (!r || !mine.has(rowId) || r.merged_into || r.best_rank == null)
        continue;
      const own =
        r.seed_category === "restaurant" ? "restaurants" : "landmarks";
      if (own !== sec) continue;
      const pick =
        cands.find((x) => x.section === own) ??
        cands.reduce((a, b) => (a.ordinal <= b.ordinal ? a : b));
      list.push({ rowId, ordinal: pick.ordinal });
    }
    list
      .sort((a, b) => a.ordinal - b.ordinal)
      .forEach((x, i) => dense.set(x.rowId, i + 1));
  }
  let written = 0;
  const skipped: string[] = [];
  const run = async () => {
    for (const [rowId, cands] of want) {
      const r = rows.get(rowId);
      if (r && !mine.has(rowId)) {
        skipped.push(
          `#${rowId} ${cands[0].name} = 다른 거점 폴더의 행 = 등수 안 씀`,
        );
        continue;
      }
      if (!r || r.merged_into || r.best_rank == null) {
        skipped.push(
          `#${rowId} ${cands[0].name} = ${!r ? "행 없음" : r.merged_into ? `병합됨 → #${r.merged_into}` : "베스트 아님"}`,
        );
        continue;
      }
      const own =
        r.seed_category === "restaurant" ? "restaurants" : "landmarks";
      const pick0 =
        cands.find((x) => x.section === own) ??
        cands.reduce((a, b) => (a.ordinal <= b.ordinal ? a : b));
      const pick = { ...pick0, ordinal: dense.get(rowId) ?? pick0.ordinal };
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
  // 필시티 v4 = 이번 산출표에 없는 이 거점 행의 옛 등수는 지운다(언어 코드는 그대로 · 등수 없음 = 목록 맨 뒤) = 지난 판 등수가 남아 새 등수와 섞이지 않게 (정본 2026-11-14)
  const stale: any[] = (
    await c.query(
      "SELECT id, name_en, best_rank FROM place_seed_raw WHERE city_id = $1 AND status <> 'merged' AND best_rank >= $2 AND NOT (id = ANY($3::int[])) ORDER BY best_rank",
      [cityId, 10_000_000, [...want.keys()]],
    )
  ).rows;
  const clearStale = async () => {
    for (const r of stale) {
      if (apply) await writeBestRankOrdinal(c, r.id, 0);
      console.log(
        `  ⌫ 옛 등수 지움 #${r.id} ${r.name_en} · 순위 ${bestRankOrdinal(r.best_rank)} → 없음`,
      );
    }
  };
  if (apply)
    await inTxn(c, async () => {
      await run();
      await clearStale();
    });
  else {
    await run();
    await clearStale();
  }
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
