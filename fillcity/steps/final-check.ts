// ⚠️ 수정금지(승인필요) 2026-10-05 사장님 결정 = v3.2 최적화 (정본 §)
import fs from "fs";
import path from "path";
import {
  ROOT,
  AGENT_WORKERS,
  connectDb,
  lastGoogleLogs,
  loadEnv,
  parseArgs,
  reportDir,
  runAgents,
  shareRanges,
  stamp,
} from "./common";
import { validateRefine } from "./refine-validate";
import {
  auditWithRetry,
  checkCheckRow,
  chromeVisits,
  pagePriceOf,
} from "./procedure-check";

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
  const dir = argv["resume"]
    ? path.resolve(String(argv["resume"]))
    : path.join(reportDir(cityId), `final-check-${stamp()}`);
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
  // ⚠️ 수정금지(승인필요) 2026-10-23 사장님 결정 = 일꾼 4명 = 전체 행을 정확히 4등분(shareRanges) 동시에 · 판단 순서 검문(procedure-check)을 통과 못 한 행은 결과로 받지 않고 그 행만 이유와 함께 한 번 되돌린다 · 두 번째도 어기면 단계 실패 (정본 §)
  const jobs = shareRanges(items.length);
  console.log(
    `═══ 최종 점검 city ${cityId} = PSR ${items.length}행 → 에이전트 ${jobs.length}명(${AGENT_WORKERS}명 고정 균등, 동시) → ${path.relative(ROOT, dir)} ═══`,
  );
  const logs = path.join(ROOT, "docs", "raw", String(cityId));
  const t0 = argv["resume"] ? fs.statSync(dir).birthtimeMs : Date.now();
  const run = async (
    list: { k: number; from: number; to: number }[],
    retryFile?: string,
  ) =>
    runAgents({
      label: "check",
      instruction: INSTRUCTION,
      ranges: list,
      promptOf: (j) =>
        [
          `- 명단 파일 = ${inputFile}`,
          retryFile
            ? `- 네 몫 = ${retryFile} 의 "${j.k}" 목록(order 값). 이 행들은 아래 이유로 받지 않았다 = 이유를 읽고 지시문 순서대로 다시 한다(도시 번호 ${cityId}, 조 번호 ${j.k})`
            : `- 네게 배정된 순서 = 명단 항목의 order 값이 ${j.from}부터 ${j.to}까지(끝 번호 포함, 도시 번호 ${cityId}, 조 번호 ${j.k})`,
          `- 로그 폴더 = ${logs} (구글 페이지 읽기 *_gmaps-page-read-N.json · 제미니 *_gemini-*.json)`,
          `- 결과 폴더 = ${dir}`,
        ].join("\n"),
      doneOf: (j) => fs.existsSync(path.join(dir, `verdict-${j.k}.json`)),
      dir,
      readDb: true,
    });
  // --resume=<이 판 결과 폴더> = 일꾼 첫 몫은 다시 돌리지 않고 검문·되돌림부터(유료 0)
  if (!argv["resume"]) await run(jobs);
  const google = lastGoogleLogs(cityId);
  const byCid = new Map(items.map((x) => [String(x.cid), x]));
  // 검문 = 위반 행은 판정 파일에서 빼고(받지 않음) rejected-{k}.json 에 이유와 남긴다
  const audit = (): Map<number, string[]> => {
    const visits = chromeVisits(t0 - 60_000, Date.now());
    const bad = new Map<number, string[]>();
    for (const f of fs
      .readdirSync(dir)
      .filter((x) => /^verdict-\d+\.json$/.test(x))) {
      let arr: any[] = [];
      try {
        arr = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
      } catch {
        continue;
      }
      const keep: any[] = [];
      const out: any[] = [];
      for (const v of Array.isArray(arr) ? arr : []) {
        const it = byCid.get(String(v?.cid ?? ""));
        if (!it) {
          keep.push(v);
          continue;
        }
        const why = checkCheckRow(
          v,
          {
            cid: String(it.cid),
            seed_category: it.seed_category,
            pagePrice: pagePriceOf(google.get(Number(it.id))),
          },
          visits,
        );
        if (why.length) {
          bad.set(it.order, why);
          out.push({ ...v, 받지않은이유: why });
        } else keep.push(v);
      }
      if (out.length) {
        fs.writeFileSync(path.join(dir, f), JSON.stringify(keep, null, 2));
        fs.writeFileSync(
          path.join(dir, f.replace("verdict-", "rejected-")),
          JSON.stringify(out, null, 2),
        );
      }
    }
    return bad;
  };
  const rejected = await auditWithRetry({
    audit,
    retry: run,
    dir,
    nextK: jobs.length + 1,
  });
  const v = validateRefine(
    items.map((x) => ({ order: x.order, cid: x.cid, name: x.name_en })),
    dir,
    ["db", "google-log", "gemini-log", "page"],
  );
  for (const [o, why] of rejected)
    v.errs.push(
      `order ${o} ${items[o]?.name_en}: 판단 순서 위반 2번 = ${why.join(" · ")}`,
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
