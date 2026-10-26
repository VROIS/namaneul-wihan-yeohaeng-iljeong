// ⚠️ 수정금지(승인필요) 2026-10-05 사장님 결정 = v3.2 최적화 (정본 §)
import fs from "fs";
import path from "path";
import {
  lastGoogleLogs,
  rawDirOf,
} from "../../worker/lib/services/shared/local-paths";
import {
  ROOT,
  AGENT_WORKERS,
  connectDb,
  latestReport,
  loadEnv,
  parseArgs,
  reportDir,
  runAgents,
  shareRanges,
  stamp,
} from "./common";
import { insertNewRows } from "./new-rows";
import {
  type AuditResult,
  auditWithRetry,
  checkCheckRow,
  missedShops,
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
  // --resume=<이 판 결과 폴더> = 일꾼 첫 몫은 다시 돌리지 않고 검문·되돌림·새 식당 넣기부터(최종 점검과 같은 길)
  const verdictDir = argv["resume"]
    ? path.resolve(String(argv["resume"]))
    : path.join(reportDir(cityId), `verdict-${stamp()}`);
  fs.mkdirSync(verdictDir, { recursive: true });
  const jobs = shareRanges(total);
  console.log(
    `═══ 에이전트 실행 city ${cityId} = ${total}건 → 에이전트 ${jobs.length}명(${AGENT_WORKERS}명 고정 균등, 동시) → ${path.relative(ROOT, verdictDir)} ═══`,
  );
  // ⚠️ 수정금지(승인필요) 2026-10-24 사장님 결정 = 배정된 모든 행은 단계 파일({도시}-{조}-steps.json)에 판단 순서를 남기고 기계가 지시문 양식대로 채웠는지만 검문한다(방문 기록 대조 없음) · 어긴 행의 판정은 결과·mismatch 파일에서 빼고 그 행만 이유와 함께 한 번 되돌림 · 못 한 행(인증·중단)은 인증이 풀린 뒤 다 할 때까지(최대 3번) 다시 맡긴다 (정본 §2026-10-24)
  const stepsOf = (k: number) =>
    path.join(verdictDir, `${cityId}-${k}-steps.json`);
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
          `- 구글맵 로그 원본 = ${rawDirOf(cityId)} 안의 *_gmaps-page-read-*.json`,
          `- 결과 폴더(verdict 폴더) = ${verdictDir}`,
        ].join("\n"),
      doneOf: (j) => fs.existsSync(stepsOf(j.k)),
      dir: verdictDir,
    });
  const results = argv["resume"]
    ? jobs.map((j) => ({ k: j.k, ok: fs.existsSync(stepsOf(j.k)) }))
    : await run(jobs);
  const missing = results.filter((r) => !r.ok).map((r) => r.k);
  const items: any[] = [...s.undecided, ...s.nonPlace, ...s.hotel];
  const readJson = (f: string): any[] => {
    try {
      const a = JSON.parse(fs.readFileSync(f, "utf-8"));
      return Array.isArray(a) ? a : [];
    } catch {
      return [];
    }
  };
  const logs = lastGoogleLogs(cityId);
  const audit = (): AuditResult => {
    const steps = new Map<number, any>();
    const files = fs.readdirSync(verdictDir);
    for (const f of files
      .filter((x) => new RegExp(`^${cityId}-\\d+-steps\\.json$`).test(x))
      .sort((a, b) => Number(a.split("-")[1]) - Number(b.split("-")[1])))
      for (const v of readJson(path.join(verdictDir, f)))
        if (Number.isInteger(v?.order)) steps.set(v.order, v);
    const bad = new Map<number, string[]>();
    const missing = new Set<number>();
    // ⚠️ 수정금지(승인필요) 2026-10-26 사장님 결정 = 로그 "At this place" 에 이름이 나온 식당을 new-rows 에 안 적은 시설 행은 받지 않는다(규칙 10 · 되돌림) (정본 §2026-10-26)
    const written: string[] = [];
    const catOf = new Map<number, string>();
    for (const f of files) {
      if (/^new-rows-\d+\.json$/.test(f))
        for (const n of readJson(path.join(verdictDir, f)))
          written.push(String(n?.["이름"] ?? ""));
      if (new RegExp(`^${cityId}-\\d+\\.json$`).test(f))
        for (const x of readJson(path.join(verdictDir, f)))
          if (x?.fix?.seed_category)
            catOf.set(Number(x.id), x.fix.seed_category);
    }
    for (const it of items) {
      const v = steps.get(it.order);
      if (!v) {
        missing.add(it.order);
        continue;
      }
      const why = checkCheckRow(v);
      const missed = missedShops(
        logs.get(Number(it.id))?.rawText,
        catOf.get(Number(it.id)) ?? it.cat,
        written,
      );
      if (missed.length)
        why.push(
          `로그 "At this place" 에 이름이 나온 식당을 new-rows 에 적지 않았다 = ${missed.join(", ")} (규칙 10)`,
        );
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
    return { bad, missing };
  };
  const rejected = await auditWithRetry({
    audit,
    retry: run,
    dir: verdictDir,
    nextK: jobs.length + 1,
  });
  for (const [o, why] of rejected)
    console.log(`  ✘ order ${o}: 끝내 못 받은 행 = ${why.join(" · ")}`);
  // ⚠️ 수정금지(승인필요) 2026-10-26 사장님 결정 = 분류 일꾼이 찾은 시설 안 새 식당은 이 단계에서 바로 넣는다(넣기 1벌 = new-rows.ts) (정본 §2026-10-26)
  const db = await connectDb();
  await insertNewRows(db, cityId, verdictDir, "분류 일꾼 새 식당 후보");
  await db.end();
  console.log(
    `═══ 에이전트 실행 끝 = ${jobs.length - missing.length}/${jobs.length}명 단계 파일 있음${missing.length ? ` · 빠진 조 ${missing.sort((a, b) => a - b).join(",")}` : ""} · 두 번 어긴 행 ${rejected.size} ═══`,
  );
  process.exit(missing.length || rejected.size ? 1 : 0);
})().catch((e) => {
  console.error("✗ 에이전트 실행 실패:", e?.message || e);
  process.exit(1);
});
