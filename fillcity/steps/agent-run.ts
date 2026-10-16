// ⚠️ 수정금지(승인필요) 2026-10-05 사장님 결정 = v3.2 최적화 (정본 §)
import fs from "fs";
import path from "path";
import {
  ROOT,
  AGENT_WORKERS,
  latestReport,
  loadEnv,
  parseArgs,
  reportDir,
  runAgents,
  shareRanges,
  stamp,
} from "./common";

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
  const done = (k: number) =>
    fs
      .readdirSync(verdictDir)
      .some(
        (f) =>
          f.startsWith(`${cityId}-${k}.`) ||
          (f.startsWith(`${cityId}-${k}-`) && f.endsWith(".json")),
      );
  const results = await runAgents({
    label: "classify",
    instruction: INSTRUCTION,
    ranges: jobs,
    promptOf: (j) =>
      [
        `- 명단 파일 = ${inputFile}`,
        `- 네게 배정된 순서 = 명단 항목의 order 값이 ${j.from}부터 ${j.to}까지(끝 번호 포함, 도시 번호 ${cityId}, 조 번호 ${j.k})`,
        `- 구글맵 로그 원본 = ${path.join(ROOT, "docs", "raw", String(cityId))} 안의 *_gmaps-page-read-*.json`,
        `- 결과 폴더(verdict 폴더) = ${verdictDir}`,
      ].join("\n"),
    doneOf: (j) => done(j.k),
    dir: verdictDir,
  });
  const missing = results.filter((r) => !r.ok).map((r) => r.k);
  console.log(
    `═══ 에이전트 실행 끝 = ${jobs.length - missing.length}/${jobs.length}명 결과 파일 있음${missing.length ? ` · 빠진 조 ${missing.sort((a, b) => a - b).join(",")}` : ""} ═══`,
  );
  process.exit(missing.length ? 1 : 0);
})().catch((e) => {
  console.error("✗ 에이전트 실행 실패:", e?.message || e);
  process.exit(1);
});
