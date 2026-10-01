// ⚠️ 수정금지(승인필요) 2026-10-01 사장님 결정 = 필시티 에이전트 실행 = 최신 명단을 조(AGENT_CHUNK건)로 나눠 동료 에이전트를 AGENT_PARALLEL 명씩 동시에 띄운다 · 전달은 지시문 경로·명단·순서 범위·로그 폴더·결과 폴더뿐(지시문 내용은 한 글자도 넣지 않는다) · 결과는 docs/b1-reports/{도시}/verdict-{시각}/ (정본 §)
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import {
  ROOT,
  AGENT_CHUNK,
  AGENT_PARALLEL,
  latestReport,
  loadEnv,
  parseArgs,
  reportDir,
  stamp,
} from "./common";

loadEnv();
const argv = parseArgs();
const cityId = Number(argv["city-id"] || 0);
const INSTRUCTION = path.join(
  ROOT,
  "fillcity/prompts/04-classify-agent/instruction.txt",
);

function runAgent(prompt: string, outFile: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(
      "claude",
      [
        "-p",
        "--strict-mcp-config",
        "--mcp-config",
        "fillcity/prompts/04-classify-agent/browser-mcp.json",
        "--allowedTools",
        "Read,Write,Glob,Grep,mcp__agentbrowser",
      ],
      { cwd: ROOT, shell: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    const out: Buffer[] = [];
    child.stdout.on("data", (d) => out.push(d));
    child.stderr.on("data", (d) => out.push(d));
    child.on("close", (code) => {
      fs.writeFileSync(outFile, Buffer.concat(out));
      resolve(code ?? 1);
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

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
  const total =
    s.undecided.length + s.nonPlace.length + s.dup.length + s.hotel.length;
  if (!total) {
    console.log(`═══ 에이전트 실행 city ${cityId} = 명단 0건 = 건너뜀 ═══`);
    process.exit(0);
  }
  const verdictDir = path.join(reportDir(cityId), `verdict-${stamp()}`);
  fs.mkdirSync(verdictDir, { recursive: true });
  const jobs = Array.from(
    { length: Math.ceil(total / AGENT_CHUNK) },
    (_, k) => ({
      k: k + 1,
      from: k * AGENT_CHUNK,
      to: Math.min(total - 1, (k + 1) * AGENT_CHUNK - 1),
    }),
  );
  console.log(
    `═══ 에이전트 실행 city ${cityId} = ${total}건 → 에이전트 ${jobs.length}명(${AGENT_CHUNK}건씩, 동시 ${AGENT_PARALLEL}명) → ${path.relative(ROOT, verdictDir)} ═══`,
  );
  const prompt = (j: { k: number; from: number; to: number }) =>
    [
      `${INSTRUCTION} 를 처음부터 끝까지 읽고, 그 지시문대로 일하라.`,
      "",
      `- 명단 파일 = ${inputFile}`,
      `- 네게 배정된 순서 = 명단 항목의 order 값이 ${j.from}부터 ${j.to}까지(끝 번호 포함, 도시 번호 ${cityId}, 조 번호 ${j.k})`,
      `- 구글맵 로그 원본 = ${path.join(ROOT, "docs", "raw", String(cityId))} 안의 *_gmaps-page-read-*.json`,
      `- 결과 폴더(verdict 폴더) = ${verdictDir}`,
    ].join("\n");
  const done = (k: number) =>
    fs
      .readdirSync(verdictDir)
      .some(
        (f) =>
          f.startsWith(`${cityId}-${k}.`) ||
          (f.startsWith(`${cityId}-${k}-`) && f.endsWith(".json")),
      );
  const queue = [...jobs];
  const missing: number[] = [];
  async function worker() {
    for (let j = queue.shift(); j; j = queue.shift()) {
      const out = path.join(verdictDir, `${cityId}-${j.k}-report.txt`);
      let ok = false;
      for (let attempt = 0; attempt < 2 && !ok; attempt++) {
        const code = await runAgent(prompt(j), out);
        ok = code === 0 && done(j.k);
        console.log(
          `  ${ok ? "✅" : "⚠️"} 에이전트 ${j.k}/${jobs.length} (순서 ${j.from}~${j.to}) 종료 ${code}${ok ? "" : attempt === 0 ? " = 한 번 더" : ""}`,
        );
      }
      if (!ok) missing.push(j.k);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(AGENT_PARALLEL, jobs.length) }, worker),
  );
  console.log(
    `═══ 에이전트 실행 끝 = ${jobs.length - missing.length}/${jobs.length}명 결과 파일 있음${missing.length ? ` · 빠진 조 ${missing.sort((a, b) => a - b).join(",")}` : ""} ═══`,
  );
  process.exit(missing.length ? 1 : 0);
})().catch((e) => {
  console.error("✗ 에이전트 실행 실패:", e?.message || e);
  process.exit(1);
});
