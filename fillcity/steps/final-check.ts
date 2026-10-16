// ⚠️ 수정금지(승인필요) 2026-10-05 사장님 결정 = v3.2 최적화 (정본 §)
import fs from "fs";
import path from "path";
import {
  ROOT,
  AGENT_WORKERS,
  connectDb,
  loadEnv,
  parseArgs,
  reportDir,
  runAgents,
  shareRanges,
  stamp,
} from "./common";
import { validateRefine } from "./refine-validate";

loadEnv();
const argv = parseArgs();
const cityId = Number(argv["city-id"] || 0);
const INSTRUCTION = path.join(
  ROOT,
  "fillcity/prompts/06-final-check/instruction.txt",
);

(async () => {
  if (!cityId) {
    console.error("Usage: --city-id=<N>");
    process.exit(1);
  }
  const c = await connectDb();
  const items: any[] = (
    await c.query(
      `SELECT id, substring(google_maps_uri from 'cid=([0-9]+)') AS cid, name_en, seed_category, price_eur::float8 AS price_eur
         FROM place_seed_raw WHERE city_id=$1 AND merged_into IS NULL AND seed_category NOT LIKE 'bts%' AND google_maps_uri LIKE '%cid=%'
        ORDER BY id`,
      [cityId],
    )
  ).rows.map((r: any, order: number) => ({ order, ...r }));
  await c.end();
  const dir = path.join(reportDir(cityId), `final-check-${stamp()}`);
  fs.mkdirSync(dir, { recursive: true });
  const inputFile = path.join(dir, "final-input.json");
  fs.writeFileSync(
    inputFile,
    JSON.stringify(
      {
        cityId,
        items: items.map((x) => ({
          order: x.order,
          id: x.id,
          cid: x.cid,
          name_en: x.name_en,
        })),
      },
      null,
      2,
    ),
  );
  const ranges = shareRanges(items.length);
  console.log(
    `═══ 최종 점검 city ${cityId} = PSR ${items.length}행 → 에이전트 ${ranges.length}명(${AGENT_WORKERS}명 고정 균등, 동시) → ${path.relative(ROOT, dir)} ═══`,
  );
  const logs = path.join(ROOT, "docs", "raw", String(cityId));
  await runAgents({
    label: "check",
    instruction: INSTRUCTION,
    ranges,
    promptOf: (j) =>
      [
        `- 명단 파일 = ${inputFile}`,
        `- 네게 배정된 순서 = 명단 항목의 order 값이 ${j.from}부터 ${j.to}까지(끝 번호 포함, 도시 번호 ${cityId}, 조 번호 ${j.k})`,
        `- 로그 폴더 = ${logs} (구글 페이지 읽기 *_gmaps-page-read-N.json · 제미니 *_gemini-*.json)`,
        `- 결과 폴더 = ${dir}`,
      ].join("\n"),
    doneOf: (j) => fs.existsSync(path.join(dir, `verdict-${j.k}.json`)),
    dir,
    readDb: true,
  });
  const v = validateRefine(
    items.map((x) => ({ order: x.order, cid: x.cid, name: x.name_en })),
    dir,
    ["db", "google-log", "gemini-log", "page"],
  );
  const bad = items.filter((x) => v.decided.get(x.cid)?.keep === false);
  console.log(
    `═══ 최종 점검 점검표 = ${items.length}행 · 짝 맞음 ${items.length - bad.length} · 짝 안 맞음 ${bad.length} · 직접 연 판정 ${v.pages} · 검사 오류 ${v.errs.length}건 ═══`,
  );
  for (const e of v.errs.slice(0, 20)) console.log(`  ✘ ${e}`);
  for (const x of bad)
    console.log(
      `  #${x.id} ${x.name_en} [${x.seed_category}] ${x.price_eur == null ? "가격 없음" : `${x.price_eur}€`} | ${v.decided.get(x.cid).source} | ${String(v.decided.get(x.cid).reason).slice(0, 110)}`,
    );
  fs.writeFileSync(
    path.join(dir, "final-table.json"),
    JSON.stringify(
      {
        cityId,
        total: items.length,
        errs: v.errs,
        mismatch: bad.map((x) => ({
          id: x.id,
          name: x.name_en,
          cat: x.seed_category,
          price: x.price_eur,
          ...v.decided.get(x.cid),
        })),
      },
      null,
      2,
    ),
  );
  console.log(
    `점검표 = ${path.join(dir, "final-table.json")} (고치는 일은 하지 않는다 = 사장님과 직접 입력)`,
  );
  process.exit(v.errs.length ? 1 : 0);
})().catch((e) => {
  console.error("✗ 최종 점검 실패:", e?.message || e);
  process.exit(1);
});
