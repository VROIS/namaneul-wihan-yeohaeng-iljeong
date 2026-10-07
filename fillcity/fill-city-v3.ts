// ⚠️ 수정금지(승인필요) 2026-10-05 사장님 결정 = v3.2 최적화 (정본 §)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { EXIT_LIMITED, notifyHuman, runTsx, stampOf } from "./steps/common";
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
const onlyArg = argv["only"]
  ? String(argv["only"])
      .split(",")
      .map((s) => s.trim())
  : null;
// ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 이어 돌기 = 판이 죽은 뒤 `/fillcity N` 을 다시 치면 처음부터가 아니라 멈춘 단계부터 = 진행 장부(docs/b1-reports/{도시}/{시작시각}_progress.json)에 끝난 단계만 적고, 안 끝난 장부가 있으면 같은 시작시각으로 남은 단계만 돈다(유료 발굴·읽은 페이지 재호출 0). 인증은 판이 살아 있는 한 그 자리에서 1분마다 이어받는다 (정본 §)
const REPORT_DIR = path.join(ROOT, "docs", "b1-reports", String(cityId));
const prevRun = (() => {
  if (argv["since"] || onlyArg || !fs.existsSync(REPORT_DIR)) return null;
  const f = fs
    .readdirSync(REPORT_DIR)
    .filter((x) => x.endsWith("_progress.json"))
    .sort()
    .pop();
  if (!f) return null;
  const j = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, f), "utf-8"));
  return j.finished ? null : j;
})();
// ⚠️ 수정금지(승인필요) 2026-10-01 사장님 결정 = 이어 읽기 = --since=시각 을 주면 그 시각 뒤에 읽은 행은 건너뛰고 멈춘 자리부터 이어 읽는다 (정본 §)
const RUN_START = argv["since"]
  ? new Date(String(argv["since"])).toISOString()
  : prevRun
    ? String(prevRun.runStart)
    : new Date().toISOString();
const done = new Set<string>(prevRun?.done ?? []);
const PROGRESS = path.join(REPORT_DIR, `${stampOf(RUN_START)}_progress.json`);
const saveProgress = (finished = false) => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(
    PROGRESS,
    JSON.stringify(
      { cityId, runStart: RUN_START, done: [...done], finished },
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
const WAIT_MIN = Math.max(1, Number(argv["wait-min"] || 1)); // ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 인증 대기 1분(사람이 풀어야 하니 더 기다릴 이유가 없다) (정본 §)

if (!cityId) {
  console.error(
    "Usage: --city-id=<N> [--auto=true = 한 번에 전부(쓰기·외부 호출·에이전트)] [--apply] [--review-apply=<판정 JSON>] [--drop-ids=1,2,3] [--rebest=true] [--discover=true] [--gemini=true] [--only=review,clean,lists,select,refine,lists-insert,align,discover,merge-diff,insert,find-best,read2,scan,agent,gtarget,price,final-check,report,verify] [--fx=KES:0.0068] [--langs=ko,en,...]",
  );
  process.exit(1);
}

// ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 필시티 버전 표기 = v3 를 튜닝하면 3.x(날짜와 함께), 처음부터 새로 쓰면 4 · 이 판 = v3.2 완성본 (정본 §)
const VERSION = "v3.2 완성본 (2026-10-06)";
const P = (rel: string) => path.join(ROOT, rel);
const failures: string[] = [];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
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
  let waitedMin = 0;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) console.log(`  ↻ 재시도 ${attempt}/${retries} (${label})`);
    const code = await runOnce(script, args);
    if (code === 0) return true;
    if (code === EXIT_LIMITED) {
      // ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 사람 인증이 뜨면 이 PC 알림(토스트 + 소리) → 1분 기다려 같은 단계를 남은 행만 다시 시도 → 아직 안 풀렸으면 알림을 다시 보내고 또 기다린다 = 사장님이 풀어 줄 때까지 판을 멈추지 않고 그 자리에서 이어받는다(리옹 실측 2026-10-06: 사람이 안 풀면 재시도는 안 뚫리고, 풀면 남은 행만 이어 읽힌다) (정본 §)
      waitedMin += WAIT_MIN;
      console.error(
        `⛔ 사람 인증 필요 — ${label} = 구글맵 제한 보기 = 크롬에서 인증을 풀어 주시면 ${WAIT_MIN}분 안에 같은 단계가 남은 행부터 이어서 돈다(기다린 지 ${waitedMin}분)`,
      );
      notifyHuman(
        "필시티: 구글 사람 인증 필요",
        `${label} — 화면에 띄운 구글맵 창에서 "로봇이 아닙니다"를 풀어 주세요. 풀면 ${WAIT_MIN}분 안에 남은 행부터 이어서 돕니다(기다린 지 ${waitedMin}분).`,
      );
      await sleep(WAIT_MIN * 60000);
      if (refresh) await runOnce(refresh.script, refresh.args);
      attempt--;
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
      [`--city-id=${cityId}`, `--langs=${langs.join(",")}`],
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
      `↪ 이어 돌기 = 안 끝난 판(시작 ${RUN_START})의 장부에서 끝난 단계 ${done.size}개 건너뜀 = ${[...done].join(",") || "없음"} → 남은 단계부터`,
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

  // ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = ⑤ 읽은 뒤 = 탐지 → 에이전트(분류·호텔·삭제·병합·제미니 호출 명단, 판정 = 적용) → 제미니 호출(🔴 호출 = --gemini-fill=true 일 때만) · 이어 돌기 장부 단계 (정본 §)
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
    for (const f of pick("dup-apply", /-dup\.json$/))
      ok =
        (await run(
          "⑤ 에이전트 판정 적용(같은 장소 병합)",
          "fillcity/steps/dup-merge.ts",
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
      [`--city-id=${cityId}`],
      0,
    );
  });

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

  // ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 판이 끝까지 돌면 실패 단계가 있어도 장부는 "끝남" = 다음 /fillcity 는 새 판 · 이어 돌기(남은 단계만)는 판이 죽었을 때만 (정본 §)
  saveProgress(true);
  await anchor?.close();
  if (failures.length) {
    console.log(`\n⚠️ 실패한 단계(재시도 후) = ${failures.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("\n✅ 전 단계 완료(건너뛴 유료 단계 제외)");
  }
  // ⚠️ 수정금지(승인필요) 2026-10-06 사장님 결정 = ⑦ AI 최종 검수 = 의무 단계 = 이 판을 돌린 AI 가 지시문대로 페이지를 직접 열어 걸린 행을 채우고 판정 통과를 본 뒤에만 보고한다(지시문 = 자연어지만 코드와 같다) (정본 §)
  console.log(
    [
      "",
      "━━━━━━ ⑦ AI 최종 검수(의무 · 사장님께 보고하기 전) ━━━━━━",
      "지시문 = fillcity/prompts/09-ai-final-review/instruction.txt — 처음부터 끝까지 읽고 그대로 한다.",
      `걸린 행 명단 = docs/b1-reports/${cityId}/*_final-todo.json(가장 나중 파일) · 최종 점검표 = docs/b1-reports/${cityId}/final-check-*/final-table.json`,
      `끝 = npx tsx fillcity/status.ts --city-id=${cityId} --judge=true 가 "통과"를 낸 뒤에만 보고한다. 이 단계 없이 "끝났다"고 하면 거짓 보고다.`,
    ].join("\n"),
  );
})();
