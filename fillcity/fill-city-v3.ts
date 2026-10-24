// ⚠️ 수정금지(승인필요) 2026-10-05 사장님 결정 = v3.2 최적화 (정본 §)
import fs from "fs";
import path from "path";
import { reportDirOf } from "../worker/lib/services/shared/local-paths";
import { fileURLToPath } from "url";
import {
  EXIT_LIMITED,
  runTsx,
  stampOf,
  waitHumanCleared,
} from "./steps/common";
import { LANGS } from "../worker/lib/services/shared/language-instruction";

const SKILL = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SKILL, "..");
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
    .map(([k, ...v]) => [k, v.length ? v.join("=") : "true"]),
);
const cityId = Number(argv["city-id"] || 0);
// ⚠️ 수정금지(승인필요) 2026-10-01 사장님 결정 = --auto=true 한 번 = 쓰기(apply) · 외부 호출 승인(발굴 7콜·제미니 보충) · 에이전트 실행이 전부 들어간다 (정본 §)
const auto = argv["auto"] === "true";
const apply = argv["apply"] === "true" || auto;
// ⚠️ 수정금지(승인필요) 2026-10-01 사장님 결정 = 외부 유료호출은 명시 플래그(--discover · --gemini · --auto) 없이는 실행 금지 (정본 §)
const runDiscover = argv["discover"] === "true" || auto; // ② 제미니 7콜/도시
const geminiFill = argv["gemini-fill"] === "true" || auto; // ⑤ 제미니 보충 호출
const runGemini = argv["gemini"] === "true"; // ⑤ 가격 몰아 묻기(120곳/콜)
const rebestMode = argv["rebest"] === "true";
const onlyGiven = argv["only"]
  ? String(argv["only"])
      .split(",")
      .map((s) => s.trim())
  : null;
// ⚠️ 수정금지(승인필요) 2026-10-24 사장님 결정 = 이어받기 대원칙 = 유료 호출이 있으므로 처음부터 다시 시작은 없다 = 어떤 경우든(끝난 판 · 멈춘 판 · --only) 마지막 판의 시작 시각을 이어받아 그 뒤에 저장된 발굴·2차 응답을 다시 쓴다(이중 호출 0) · 멈춘 판(이 시도 시각 뒤 최종 점검표 없음 · 적은 단계를 다 못 끝냄)을 다시 돌리면 그 판의 단계 목록(--only)과 끝난 단계를 그대로 이어받아 남은 단계부터 = 신호 파일이 죽은 판에 소비돼도 전체로 돌지 않는다 · 진행 장부는 판 시작 때 바로 쓴다(첫 단계에서 죽어도 이어받음) · 보고 폴더 = reportDirOf 1벌 (정본 §2026-10-24)
const REPORT_DIR = reportDirOf(cityId);
const finalTableSince = (runStart: string) =>
  fs.existsSync(REPORT_DIR) &&
  fs
    .readdirSync(REPORT_DIR)
    .some(
      (x) =>
        x.startsWith("final-check-") &&
        x.slice("final-check-".length) >= stampOf(runStart) &&
        fs.existsSync(path.join(REPORT_DIR, x, "final-table.json")),
    );
const prevRun = (() => {
  if (argv["since"] || !fs.existsSync(REPORT_DIR)) return null;
  const f = fs
    .readdirSync(REPORT_DIR)
    .filter((x) => x.endsWith("_progress.json"))
    .sort()
    .pop();
  return f
    ? JSON.parse(fs.readFileSync(path.join(REPORT_DIR, f), "utf-8"))
    : null;
})();
const prevOpen =
  !!prevRun &&
  !prevRun.finished &&
  !finalTableSince(String(prevRun.startedAt ?? prevRun.runStart));
// ⚠️ 수정금지(승인필요) 2026-10-01 사장님 결정 = 이어 읽기 = --since=시각 을 주면 그 시각 뒤에 읽은 행은 건너뛰고 멈춘 자리부터 이어 읽는다 (정본 §)
const RUN_START = argv["since"]
  ? new Date(String(argv["since"])).toISOString()
  : prevRun
    ? String(prevRun.runStart)
    : new Date().toISOString();
const resumeOnly =
  prevOpen && !onlyGiven && Array.isArray(prevRun.only) ? prevRun.only : null;
const onlyArg: string[] | null = onlyGiven ?? resumeOnly;
const done = new Set<string>(prevOpen && !onlyGiven ? prevRun.done : []);
const STARTED: string = prevOpen
  ? String(prevRun.startedAt ?? RUN_START)
  : new Date().toISOString();
const PROGRESS = path.join(REPORT_DIR, `${stampOf(RUN_START)}_progress.json`);
const saveProgress = (finished = false) => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(
    PROGRESS,
    JSON.stringify(
      {
        cityId,
        runStart: RUN_START,
        startedAt: STARTED,
        only: onlyArg,
        done: [...done],
        finished,
      },
      null,
      2,
    ),
  );
};
const langs: string[] = argv["langs"]
  ? String(argv["langs"])
      .split(",")
      .map((s) => s.trim())
  : [...LANGS];

if (!cityId) {
  console.error(
    "Usage: --city-id=<N> [--auto=true = 한 번에 전부(쓰기·외부 호출·에이전트)] [--apply] [--review-apply=<판정 JSON>] [--drop-ids=1,2,3] [--rebest=true] [--discover=true] [--gemini=true] [--only=review,clean,lists,select,refine,lists-insert,align,discover,merge-diff,insert,find-best,best-ordinal,read2,scan,agent,gtarget,price,final-check,report,verify] [--fx=KES:0.0068] [--langs=ko,en,...]",
  );
  process.exit(1);
}

// ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 필시티 버전 표기 = v3 를 튜닝하면 3.x(날짜와 함께), 처음부터 새로 쓰면 4 · 이 판 = v3.2 완성본 (정본 §)
const VERSION = "v3.2 완성본 (2026-10-06)";
const P = (rel: string) => path.join(ROOT, rel);
const failures: string[] = [];
const runOnce = (script: string, args: string[]) => runTsx(P(script), args);
// ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 단계 실행 = 공용 runTsx 1벌 + 재시도 + 사람 인증 대기 (정본 §)
async function run(
  label: string,
  script: string,
  args: string[],
  retries = 2,
  refresh?: { script: string; args: string[] },
): Promise<boolean> {
  console.log(`\n━━━━━━ ${label} ━━━━━━`);
  let unheld = 0;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) console.log(`  ↻ 재시도 ${attempt}/${retries} (${label})`);
    const code = await runOnce(script, args);
    if (code === 0) return true;
    if (code === EXIT_LIMITED) {
      // ⚠️ 수정금지(승인필요) 2026-10-23 사장님 결정 = 사람 인증이 뜨면 전용 크롬을 화면 앞에 띄우고 알림 → 풀릴 때까지 기다린다(waitHumanCleared 1벌) → 같은 단계를 남은 행부터 다시 = 판을 멈추지 않고 그 자리에서 이어받는다 · 구글이 안 막혔는데 또 제한 보기면(그 장소만 막힘) 3번째부터 보통 재시도로 센다 (정본 §2026-10-23)
      if (await waitHumanCleared(label)) {
        unheld = 0;
        attempt--;
      } else if (++unheld < 3) attempt--;
      if (refresh) await runOnce(refresh.script, refresh.args);
    }
  }
  console.error(`✗ ${label} = ${retries}회 재시도 후 실패 = 건너뜀`);
  failures.push(label);
  return false;
}

const only = (name: string) =>
  (!onlyArg || onlyArg.includes(name)) && !done.has(name);
// ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 단계 완료 판정 = 그 단계 자기 실행 결과(run 의 참·거짓)로만 = 동시에 도는 다른 트랙의 실패에 영향받지 않는다(끝난 유료 발굴이 "안 끝남"으로 남아 다시 도는 이중과금 차단) (정본 §)
const runSeq = async (...jobs: (() => Promise<boolean>)[]) => {
  let ok = true;
  for (const j of jobs) ok = (await j()) && ok;
  return ok;
};
const step = async (name: string, fn: () => Promise<boolean | void>) => {
  if (!only(name)) return;
  if ((await fn()) !== false) {
    done.add(name);
    saveProgress();
  }
};
const asked = (name: string) => auto || !!onlyArg?.includes(name);
const applyArg = apply ? ["--apply"] : [];
const fxArg = argv["fx"] ? [`--fx=${argv["fx"]}`] : [];

async function trackA() {
  await step("review", () => {
    if (argv["review-apply"])
      return run("① LLM 삭제(판정 적용)", "fillcity/steps/llm-review.ts", [
        `--city-id=${cityId}`,
        `--apply=${argv["review-apply"]}`,
      ]);
    if (asked("review"))
      // ⚠️ 수정금지(승인필요) 2026-10-06 사장님 결정 = ① LLM 검토 = 일꾼 4명이 명단만 보고 판정해 바로 적용(행 0 이면 건너뜀 = 신도시와 옛 도시가 한 길) (정본 §)
      return run(
        "① LLM 검토(일꾼 4명 판정 → 삭제·고침 적용)",
        "fillcity/steps/llm-review.ts",
        [`--city-id=${cityId}`, "--judge", ...(apply ? ["--write=true"] : [])],
        0,
      );
    return run("① LLM 검토 명단 내보내기", "fillcity/steps/llm-review.ts", [
      `--city-id=${cityId}`,
      "--export",
    ]);
  });

  await step("clean", () =>
    runSeq(
      () =>
        run(
          "① 사전 정제(구글맵 열기·9요소·장소 아님 삭제)",
          "worker/lib/services/fill/gmaps-preclean.ts",
          [
            `--city-id=${cityId}`,
            ...applyArg,
            ...fxArg,
            `--since=${RUN_START}`,
            ...(argv["parallel"] ? [`--parallel=${argv["parallel"]}`] : []),
            ...(argv["drop-ids"] ? [`--drop-ids=${argv["drop-ids"]}`] : []),
          ],
        ),
      () =>
        run(
          "① 소속오염 이동",
          "worker/lib/services/fill/wrongcity-quarantine.ts",
          [`--city-id=${cityId}`, ...applyArg],
        ),
      () =>
        run("① 상태규칙 백필", "worker/lib/services/fill/status-backfill.ts", [
          `--city-id=${cityId}`,
          ...applyArg,
        ]),
      () =>
        run("① 병합 행 정리", "worker/lib/services/fill/purge-merged-rows.ts", [
          `--city-id=${cityId}`,
          ...applyArg,
        ]),
    ),
  );
  await step("lists", () =>
    run("② 구글 검색어 목록 읽기", "fillcity/steps/discovery-lists.ts", [
      `--city-id=${cityId}`,
    ]),
  );
  await step("select", () =>
    run(
      "② 목록 선별(분류마다 모자란 만큼)",
      "fillcity/steps/discovery-lists-select.ts",
      [`--city-id=${cityId}`],
    ),
  );
  await step("refine", async () => {
    if (!asked("refine")) {
      console.log(
        "\n⏭️ ② 목록 정제 건너뜀(에이전트 단계 = --auto=true 이거나 --only 에 refine 을 직접 적어야 돈다)",
      );
      return false;
    }
    return run(
      "② 목록 정제(에이전트 4명)",
      "fillcity/steps/lists-refine.ts",
      [`--city-id=${cityId}`, ...applyArg],
      0,
    );
  });
  await step("lists-insert", () =>
    run(
      "② 목록 입력(+ 후처리 9요소 확정)",
      "fillcity/steps/discovery-lists-insert.ts",
      [
        `--city-id=${cityId}`,
        ...applyArg,
        ...(argv["parallel"] ? [`--parallel=${argv["parallel"]}`] : []),
      ],
    ),
  );
}

async function trackB() {
  await step("discover", async () => {
    if (!runDiscover) {
      console.log(
        "\n━━━━━━ ② 7개국어 발굴 ━━━━━━\n⏭️ 건너뜀(🔴 유료 = Gemini 최대 7콜/도시) — 실행하려면 --discover=true 명시",
      );
      return false;
    }
    return run(
      "② 7개국어 발굴(동시)",
      "fillcity/steps/discover-parallel.ts",
      [
        `--city-id=${cityId}`,
        `--langs=${langs.join(",")}`,
        `--since=${RUN_START}`, // ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 이어 돌기 = 이 판 시작 뒤 이미 받은 언어는 다시 부르지 않는다 (정본 §)
      ],
      0, // ⚠️ 유료 호출은 재시도 0(성공 후 저장 실패해도 재호출 = 이중과금, §9·§18)
    );
  });
}

(async () => {
  console.log(
    `═══ 필시티 ${VERSION} — city ${cityId} · apply=${apply} · discover(유료)=${runDiscover} · gemini 가격(유료)=${runGemini} ═══`,
  );
  if (prevRun)
    console.log(
      `↪ 이어받기 = 마지막 판 시작 ${RUN_START} 뒤에 저장된 유료 응답은 다시 쓴다(이중 호출 0)${prevOpen && !onlyGiven ? ` · 멈춘 판(${STARTED}) 이어 돌기${resumeOnly ? ` = 그 판의 단계 목록 ${resumeOnly.join(",")}` : ""} · 끝난 단계 ${done.size}개 건너뜀 = ${[...done].join(",") || "없음"} → 남은 단계부터` : ""}`,
    );
  saveProgress();

  // ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 한 판 도는 동안 전용 크롬(GMAPS_CDP)에 닻 창 1개를 화면 밖에 열어 두고(사람 인증 창이 유일한 창이라 사장님이 닫으면 크롬 자체가 꺼지던 것, 스트라스부르 실측) 판이 끝나면 그 닻 창을 닫는다(판마다 창이 쌓이지 않게) (정본 §)
  let anchor: { close: () => Promise<unknown> } | null = null;
  if (process.env.GMAPS_CDP) {
    const { chromium } = await import("playwright");
    const { launchBrowser, openWindow } = await import(
      "../worker/lib/services/fill/gmaps-pid-identity/page-reader"
    );
    const browser = await launchBrowser(chromium);
    const win = await openWindow(browser);
    anchor = {
      close: async () => {
        await win.close();
        await browser.close().catch(() => {});
      },
    };
  }

  // ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 환율표 갱신은 --only 와 상관없이 항상 먼저 돈다 = 하루 한 번 갱신된 표가 따라다닌다 (정본 §)
  await run(
    "⓪ 환율표 갱신(무료 API, 0원)",
    "worker/lib/services/fill/exchange-rates.ts",
    applyArg,
    1,
  );

  await Promise.all([trackA(), trackB()]);

  await step("merge-diff", () => {
    const rebest = (name: string) => () =>
      run(`③ 다시 정제(${name})`, "fillcity/steps/discovery-rebest.ts", [
        `--city-id=${cityId}`,
        `--step=${name}`,
        ...applyArg,
      ]);
    return runSeq(
      ...(rebestMode ? [rebest("reset")] : []),
      () =>
        run(
          "③ 선처리(B1 문지기 매칭)",
          "fillcity/steps/discovery-merge-diff.ts",
          [`--city-id=${cityId}`],
        ),
      ...(rebestMode ? [rebest("clean-tr")] : []),
    );
  });

  await step("insert", () =>
    run(
      "④ 흡수·신규 입력(이 PC)",
      "fillcity/steps/discovery-gmaps-insert.ts",
      [`--city-id=${cityId}`, ...applyArg, `--since=${RUN_START}`],
      2,
      {
        script: "fillcity/steps/discovery-merge-diff.ts",
        args: [`--city-id=${cityId}`],
      },
    ),
  );

  // ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = ④ 뒤 = 코드가 못 찾은 베스트(장부의 거부)를 일꾼 4명이 제미니 힌트로 사람처럼 찾아 CID 로 넣는다(그 행만 1번 열어 9요소) · 이어 돌기 장부 단계 (정본 §)
  await step("find-best", async () => {
    if (!asked("find-best")) {
      console.log(
        "\n⏭️ ④ 못 찾은 베스트 건너뜀(에이전트 단계 = --auto=true 이거나 --only 에 find-best 를 직접 적어야 돈다)",
      );
      return false;
    }
    return run(
      "④ 못 찾은 베스트(일꾼 4명 · CID 직접 입력)",
      "fillcity/steps/find-best.ts",
      [`--city-id=${cityId}`, `--since=${RUN_START}`, ...applyArg],
      0,
    );
  });

  // ⚠️ 수정금지(승인필요) 2026-10-23 사장님 결정 = 필시티가 끝나면 베스트 순위까지 나온다 = 베스트를 넣는 두 단계(④ 입력 · 못 찾은 베스트) 뒤에 그 도시 최신 산출표 등수로 best_rank 앞자리를 쓴다 (정본 §2026-10-23)
  await step("best-ordinal", () =>
    run(
      "④ 베스트 순위(산출표 등수 → best_rank 앞자리)",
      "fillcity/steps/best-ordinal.ts",
      [`--city-id=${cityId}`, ...applyArg],
    ),
  );

  await step("read2", () =>
    runSeq(
      () =>
        run(
          "④ 읽기 2차(로그 없는 행)",
          "worker/lib/services/fill/gmaps-preclean.ts",
          [
            `--city-id=${cityId}`,
            ...applyArg,
            ...fxArg,
            "--missing-log=true",
            `--since=${RUN_START}`, // ⚠️ 수정금지(승인필요) 2026-10-06 사장님 결정 = 이번 실행에서 이미 페이지를 연 행(④·사전 정제)은 다시 열지 않는다 (정본 §)
          ],
        ),
      () =>
        run(
          "④ 소속오염 이동",
          "worker/lib/services/fill/wrongcity-quarantine.ts",
          [`--city-id=${cityId}`, ...applyArg],
        ),
      () =>
        run("④ 상태규칙 백필", "worker/lib/services/fill/status-backfill.ts", [
          `--city-id=${cityId}`,
          ...applyArg,
        ]),
      () =>
        run("④ 병합 행 정리", "worker/lib/services/fill/purge-merged-rows.ts", [
          `--city-id=${cityId}`,
          ...applyArg,
        ]),
    ),
  );
  await step("align", () =>
    run("④ 분류 정렬", "worker/lib/services/fill/category-align.ts", [
      `--city-id=${cityId}`,
      ...applyArg,
    ]),
  );

  // ⚠️ 수정금지(승인필요) 2026-10-15 사장님 결정 = ⑤ 읽은 뒤 = 탐지 → 에이전트(분류·호텔·삭제·제미니 호출 명단, 판정 = 적용 · 같은 장소 병합 없음 = CID 가 다르면 다른 장소) → 제미니 호출(🔴 호출 = --gemini-fill=true 일 때만) · 이어 돌기 장부 단계 (정본 §)
  await step("scan", () =>
    run("⑤ 읽은 뒤 탐지", "fillcity/steps/post-read-scan.ts", [
      `--city-id=${cityId}`,
    ]),
  );
  const files = (key: string) =>
    String(argv[key] || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  let agentStart = Number.MAX_SAFE_INTEGER;
  const verdictFiles = (re: RegExp): string[] => {
    const base = REPORT_DIR;
    if (!fs.existsSync(base)) return [];
    const dir = fs
      .readdirSync(base)
      .filter(
        (d) =>
          d.startsWith("verdict-") &&
          fs.statSync(path.join(base, d)).mtimeMs >= agentStart,
      )
      .sort()
      .pop();
    return dir
      ? fs
          .readdirSync(path.join(base, dir))
          .filter((f) => re.test(f))
          .sort()
          .map((f) => path.join(base, dir, f))
      : [];
  };
  const pick = (key: string, re: RegExp) =>
    files(key).length ? files(key) : auto ? verdictFiles(re) : [];
  await step("agent", async () => {
    let ok = await run("⑤ 에이전트 명단", "fillcity/steps/agent-export.ts", [
      `--city-id=${cityId}`,
    ]);
    if (auto) {
      agentStart = Date.now();
      ok =
        (await run(
          "⑤ 에이전트 실행(4명 동시)",
          "fillcity/steps/agent-run.ts",
          [`--city-id=${cityId}`],
          0,
        )) && ok;
    }
    for (const f of pick("classify-apply", /^\d+-\d+\.json$/))
      ok =
        (await run(
          "⑤ 에이전트 판정 적용(분류·호텔·삭제)",
          "fillcity/steps/llm-review.ts",
          [`--city-id=${cityId}`, `--apply=${f}`],
        )) && ok;
    return ok;
  });
  await step("gtarget", () => {
    const mismatch = pick("mismatch", /-mismatch\.json$/);
    return run(
      "⑤ 제미니 호출 대상(2차, 4분할 동시)",
      "fillcity/steps/gemini-targets.ts",
      [
        `--city-id=${cityId}`,
        `--since=${RUN_START}`, // ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 이어 돌기 = 이 판 시작 뒤 제미니가 이미 답한 행은 다시 묻지 않는다 (정본 §)
        ...(mismatch.length ? [`--mismatch=${mismatch.join(",")}`] : []),
        ...(geminiFill ? ["--call=true"] : []),
      ],
      0,
    );
  });

  await step("price", () =>
    run(
      "⑤ 후처리 가격(제미니 몰아 묻기)",
      "worker/lib/services/fill/price-gemini.ts",
      [
        `--city-id=${cityId}`,
        ...applyArg,
        ...fxArg,
        ...(runGemini ? ["--gemini=true"] : []),
      ],
      0,
    ),
  );

  await step("final-check", async () => {
    if (!asked("final-check")) {
      console.log(
        "\n⏭️ ⑤ 최종 점검 건너뜀(에이전트 단계 = --auto=true 이거나 --only 에 final-check 를 직접 적어야 돈다)",
      );
      return false;
    }
    return run(
      "⑤ 최종 점검(에이전트 4명, 점검표까지)",
      "fillcity/steps/final-check.ts",
      [`--city-id=${cityId}`, ...applyArg],
      0,
    );
  });

  // ⚠️ 수정금지(승인필요) 2026-10-24 사장님 결정 = 사장님 결정값(보고 폴더 *_boss-fix.json)이 정답 = 일꾼·제미니·페이지 다시 읽기 누가 덮어도 판정 전에 다시 넣는다 (정본 §2026-10-24)
  if (apply && fs.existsSync(REPORT_DIR))
    for (const f of fs
      .readdirSync(REPORT_DIR)
      .filter((x) => x.endsWith("_boss-fix.json"))
      .sort())
      await run(
        `⑥ 사장님 결정값 다시 넣기 = ${f}`,
        "fillcity/steps/llm-review.ts",
        [`--city-id=${cityId}`, `--apply=${path.join(REPORT_DIR, f)}`],
        0,
      );

  await step("report", () =>
    run("⑥ 손님상 검수", "fillcity/steps/serving-report.ts", [
      `--city-id=${cityId}`,
    ]),
  );
  // ⚠️ 수정금지(승인필요) 2026-10-06 사장님 결정 = ⑥ 검수 = 한 도시의 마침표 판정(--judge=true, 불통과 = 단계 실패, 재시도 없음) (정본 §)
  await step("verify", () =>
    run(
      "⑥ 검수(status · 마침표 판정)",
      "fillcity/status.ts",
      [`--city-id=${cityId}`, "--judge=true"],
      0,
    ),
  );

  // ⚠️ 수정금지(승인필요) 2026-10-06 사장님 결정 = 깔때기 숫자는 손으로 세지 않고 이 판의 파일로 자동 출력(실행 창 = RUN_START~지금) (정본 §)
  await run(
    "⑥ 깔때기",
    "fillcity/steps/funnel-report.ts",
    [`--city-id=${cityId}`, `--from=${RUN_START}`],
    0,
  );

  // ⚠️ 수정금지(승인필요) 2026-10-24 사장님 결정 = 장부 닫기 = 이 시도 뒤 최종 점검표가 나왔거나 · 최종 점검을 안 묻는 판이거나 · 적은 단계(--only)를 다 끝냈으면 끝 = 판정 불통과·일꾼 검사 오류는 결과이지 중단이 아니다 (정본 §2026-10-24)
  saveProgress(
    !asked("final-check") ||
      finalTableSince(STARTED) ||
      (!!onlyArg && onlyArg.every((n) => done.has(n))),
  );
  await anchor?.close();
  if (failures.length) {
    console.log(`\n⚠️ 실패한 단계(재시도 후) = ${failures.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("\n✅ 전 단계 완료(건너뛴 유료 단계 제외)");
  }
  // ⚠️ 수정금지(승인필요) 2026-10-24 사장님 결정 = ⑦ 최종 검수 = 최종 보고 → 승인 명령 → 손으로 채움 = 최종 완성 (정본 §2026-10-24)
  console.log(
    [
      "",
      "━━━━━━ ⑦ 최종 검수 = 최종 보고 → 승인 명령 → 손으로 채움 = 최종 완성 ━━━━━━",
      "지시문 = fillcity/prompts/09-ai-final-review/instruction.txt — 처음부터 끝까지 읽고 그대로 한다.",
      `최종 점검표 = ${reportDirOf(cityId)}/final-check-*/final-table.json · 넣은 기록 = ${reportDirOf(cityId)}/*_llm-review-deleted.json · 사장님 결정값 = ${reportDirOf(cityId)}/*_boss-fix.json`,
      `끝 = 채운 뒤 npx tsx fillcity/status.ts --city-id=${cityId} --judge=true "통과". 이 단계 없이 "끝났다"고 하면 거짓 보고다.`,
    ].join("\n"),
  );
})();
