// ⚠️ 수정금지(승인필요) 2026-10-05 사장님 결정 = v3.2 최적화 (정본 §)
import fs from "fs";
import path from "path";
import {
  ROOT,
  AGENT_WORKERS,
  connectDb,
  lastGoogleLogs,
  latestReport,
  loadEnv,
  parseArgs,
  reportDir,
  runAgents,
  shareRanges,
  stamp,
} from "./common";
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
  "fillcity/prompts/04-classify-agent/instruction.txt",
);

(async () => {
  if (!cityId) {
    console.error("Usage: --city-id=<N>  (먼저 agent-export)");
    process.exit(1);
  }
  const inputFile = latestReport(cityId, "agent-input");
  if (!inputFile) {
    console.error("✗ 에이전트 명단이 없다 = agent-export 를 먼저");
    process.exit(1);
  }
  const s = JSON.parse(fs.readFileSync(inputFile, "utf-8")).sections;
  // ⚠️ 수정금지(승인필요) 2026-10-15 사장님 결정 = 명단 구역 = 표가 못 정하는 행·장소 아님 남음·호텔 페이지 3개(같은 장소 쌍 없음 = CID 가 다르면 다른 장소) (정본 §)
  const total = s.undecided.length + s.nonPlace.length + s.hotel.length;
  if (!total) {
    console.log(`═══ 에이전트 실행 city ${cityId} = 명단 0건 = 건너뜀 ═══`);
    process.exit(0);
  }
  const verdictDir = path.join(reportDir(cityId), `verdict-${stamp()}`);
  fs.mkdirSync(verdictDir, { recursive: true });
  const jobs = shareRanges(total);
  console.log(
    `═══ 에이전트 실행 city ${cityId} = ${total}건 → 에이전트 ${jobs.length}명(${AGENT_WORKERS}명 고정 균등, 동시) → ${path.relative(ROOT, verdictDir)} ═══`,
  );
  // ⚠️ 수정금지(승인필요) 2026-10-23 사장님 결정 = 배정된 모든 행은 단계 파일({도시}-{조}-steps.json)에 판단 순서를 남기고 기계가 크롬 방문 기록과 대조한다 · 어긴 행의 판정은 결과·mismatch 파일에서 빼고 그 행만 이유와 함께 한 번 되돌림 · 두 번째도 어기면 단계 실패 (정본 §2026-10-23)
  const stepsOf = (k: number) =>
    path.join(verdictDir, `${cityId}-${k}-steps.json`);
  const t0 = Date.now();
  const run = (
    list: { k: number; from: number; to: number }[],
    retryFile?: string,
  ) =>
    runAgents({
      label: "classify",
      instruction: INSTRUCTION,
      ranges: list,
      promptOf: (j) =>
        [
          `- 명단 파일 = ${inputFile}`,
          retryFile
            ? `- 네 몫 = ${retryFile} 의 "${j.k}" 목록(order 값). 이 행들은 아래 이유로 받지 않았다 = 이유를 읽고 지시문 순서대로 다시 한다(도시 번호 ${cityId}, 조 번호 ${j.k})`
            : `- 네게 배정된 순서 = 명단 항목의 order 값이 ${j.from}부터 ${j.to}까지(끝 번호 포함, 도시 번호 ${cityId}, 조 번호 ${j.k})`,
          `- 구글맵 로그 원본 = ${path.join(ROOT, "docs", "raw", String(cityId))} 안의 *_gmaps-page-read-*.json`,
          `- 결과 폴더(verdict 폴더) = ${verdictDir}`,
        ].join("\n"),
      doneOf: (j) => fs.existsSync(stepsOf(j.k)),
      dir: verdictDir,
    });
  const results = await run(jobs);
  const missing = results.filter((r) => !r.ok).map((r) => r.k);
  const items: any[] = [...s.undecided, ...s.nonPlace, ...s.hotel];
  const c = await connectDb();
  const meta = new Map<number, any>(
    (
      await c.query(
        `SELECT id, substring(google_maps_uri from 'cid=([0-9]+)') AS cid, seed_category FROM place_seed_raw WHERE id = ANY($1::int[])`,
        [items.map((x) => x.id)],
      )
    ).rows.map((r: any) => [r.id, r]),
  );
  await c.end();
  const google = lastGoogleLogs(cityId);
  const readJson = (f: string): any[] => {
    try {
      const a = JSON.parse(fs.readFileSync(f, "utf-8"));
      return Array.isArray(a) ? a : [];
    } catch {
      return [];
    }
  };
  const audit = (): Map<number, string[]> => {
    const visits = chromeVisits(t0 - 60_000, Date.now());
    const steps = new Map<number, any>();
    const files = fs.readdirSync(verdictDir);
    for (const f of files
      .filter((x) => new RegExp(`^${cityId}-\\d+-steps\\.json$`).test(x))
      .sort((a, b) => Number(a.split("-")[1]) - Number(b.split("-")[1])))
      for (const v of readJson(path.join(verdictDir, f)))
        if (Number.isInteger(v?.order)) steps.set(v.order, v);
    const bad = new Map<number, string[]>();
    for (const it of items) {
      const m = meta.get(it.id);
      const v = steps.get(it.order);
      const why = v
        ? checkCheckRow(
            v,
            {
              cid: String(m?.cid ?? ""),
              seed_category: m?.seed_category ?? it.cat,
              pagePrice: pagePriceOf(google.get(Number(it.id))),
            },
            visits,
            false,
          )
        : ["단계 파일에 이 행이 없다"];
      if (why.length) bad.set(it.order, why);
    }
    const badIds = new Set(
      items.filter((x) => bad.has(x.order)).map((x) => x.id),
    );
    for (const f of files.filter((x) =>
      new RegExp(`^${cityId}-\\d+(-mismatch)?\\.json$`).test(x),
    )) {
      const arr = readJson(path.join(verdictDir, f));
      const keep = arr.filter((v) => !badIds.has(Number(v?.id)));
      if (keep.length !== arr.length)
        fs.writeFileSync(
          path.join(verdictDir, f),
          JSON.stringify(keep, null, 2),
        );
    }
    fs.writeFileSync(
      path.join(verdictDir, "rejected.json"),
      JSON.stringify(
        items
          .filter((x) => bad.has(x.order))
          .map((x) => ({
            order: x.order,
            id: x.id,
            받지않은이유: bad.get(x.order),
          })),
        null,
        2,
      ),
    );
    return bad;
  };
  const rejected = await auditWithRetry({
    audit,
    retry: run,
    dir: verdictDir,
    nextK: jobs.length + 1,
  });
  for (const [o, why] of rejected)
    console.log(`  ✘ order ${o}: 판단 순서 위반 2번 = ${why.join(" · ")}`);
  console.log(
    `═══ 에이전트 실행 끝 = ${jobs.length - missing.length}/${jobs.length}명 단계 파일 있음${missing.length ? ` · 빠진 조 ${missing.sort((a, b) => a - b).join(",")}` : ""} · 두 번 어긴 행 ${rejected.size} ═══`,
  );
  process.exit(missing.length || rejected.size ? 1 : 0);
})().catch((e) => {
  console.error("✗ 에이전트 실행 실패:", e?.message || e);
  process.exit(1);
});
