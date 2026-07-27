export const meta = {
  name: "verify-before-commit",
  description: "커밋 전 의무 병렬 검증 = 기계1(tsc·서버빌드·웹빌드·lint 묶음) + 판단3(simplify·code-review·react-best) = 4개 동시 (§22)",
  phases: [{ title: "Verify", detail: "4개 검증 에이전트 병렬(= 이 PC 동시 한도)" }],
};

// ⚠️ 수정금지(승인필요) 2026-07-19 사장님 SSOT = 커밋 전 의무 병렬 검증 (§22).
// = 하나라도 실패 = 커밋 불가 = Ralph-loop 로 통과까지 보완.
// = args.tsxChanged(선택,bool) = TSX 변경 여부(react-best 스킵 판정용).
//
// ⚠️⚠️ 2026-07-27 사장님 지시 "검증 시간 최대한 줄여라" — **에이전트 수 = 4개 고정**.
//   근본 원인(실측): 동시 실행 한도 = min(16, CPU코어 - 2). 이 PC 는 6코어 = **한도 4**.
//   그런데 7개를 띄우고 있었다 → 4개 돌고 **나머지 3개가 줄 서서 두 번에 나눠 실행** = 시간 2배.
//   그래서 기계 검증 4종을 **한 에이전트가 순서대로** 돌리게 묶어 4개로 맞춤(기계 4종 합쳐도 ~4분).
//   실측 이력: 7개 = 17분 → (중복 실행 금지) 8분 → (판단 규칙 강화) 10분 → **4개로 맞춤 = 이 버전**.
//   ⚠️ 항목을 추가할 때는 **4개를 넘기지 마라**. 넘기는 순간 다시 두 번에 나눠 돌아 시간이 튄다.

const RESULT_SCHEMA = {
  type: "object",
  properties: {
    check: { type: "string" },
    pass: { type: "boolean" },
    summary: { type: "string" },
    blockers: { type: "array", items: { type: "string" } },
  },
  required: ["check", "pass", "summary"],
};

phase("Verify");

// ── ① 기계 검증 = 4종을 한 에이전트가 순서대로 실행 (판단 없음 = effort 낮게) ──
const MACHINE_PROMPT =
  "이 저장소 루트에서 아래 4개를 **순서대로 그대로** 실행하고 결과만 보고하라. 코드를 읽거나 고치지 마라." +
  "\n1) `npx tsc --noEmit` → 출력의 'error TS' 개수. 161 이하면 통과, 초과면 실패." +
  "\n2) `npm run server:build` → exit 0 이면 통과." +
  "\n3) `npx expo export --platform web` → 출력에 'Exported' 있고 exit 0 이면 통과." +
  "\n4) `npx expo lint` → exit 0(경고만 있어도 에러 0)이면 통과." +
  "\n\ncheck='machine'. **4개가 전부 통과해야 pass=true**. 실패한 항목만 blockers 에 '항목명: 사유' 로 넣어라." +
  " summary 에는 4개 결과를 한 줄씩 숫자와 함께 적어라(예: tsc 158건/161, 서버빌드 exit0 ...)." +
  "\n⚠️ 위 4개 외의 명령을 실행하지 마라. 실패해도 원인 조사·수정하지 마라(그건 사장님·메인 AI 몫).";

// ── ② 판단 검증 = 사람 눈으로 볼 것만. 기계가 하는 일을 다시 하지 않는다 ──
const JUDGE_RULES =
  "\n\n⚠️ 시간 규칙(필수 — 어기면 검증이 몇 배 느려진다):" +
  "\n- `npx tsc`·`eslint`·`expo lint`·`expo export`·`npm run build` 등 타입체크·린트·빌드를 **절대 실행하지 마라**. 다른 에이전트가 동시에 이미 하고 있고, 그 통과 여부는 네 판정 대상이 아니다." +
  "\n- 프로젝트 가드 스크립트(`scripts/guard-*.mjs`)도 실행하지 마라. 커밋 훅이 따로 돌린다." +
  "\n- `gh`·`curl` 등 네트워크 명령을 쓰지 마라." +
  "\n- `node_modules` 는 **외부 라이브러리 호출 규약이 실제로 의심될 때 그 파일 1개만** 열어라. 훑어보기 금지." +
  "\n- 먼저 `git diff --cached --stat` 로 바뀐 파일 목록을 보고, **네 담당에 해당하는 파일만** 읽어라." +
  "\n- diff 는 반드시 `git diff --cached -w`(공백 무시)로 봐라. 들여쓰기만 바뀐 수백 줄을 읽느라 시간을 버리지 마라." +
  "\n- 파일 전체 읽기보다 diff + 필요한 부분만 읽기를 우선하라. 근거가 충분해지면 **더 파지 말고 바로 결론을 내라**.";

const JUDGE = [
  {
    key: "simplify",
    prompt:
      "이 저장소의 커밋 대기 변경(`git diff --cached`)에 대해 /simplify 관점(재사용·품질·효율)으로 검토하라." +
      " 커밋을 막아야 할 심각한 문제만 blockers 에 넣어라(사소한 개선은 pass=true 로 두고 summary 에만). check='simplify'." +
      JUDGE_RULES,
  },
  {
    key: "review",
    prompt:
      "이 저장소의 커밋 대기 변경(`git diff --cached`)에 대해 /code-review 관점(정확성·컨벤션·보안 버그)으로 검토하라." +
      " 실제 버그·회귀만 blockers 에 넣어라(스타일은 제외). check='review'." +
      JUDGE_RULES,
  },
];

const tsxChanged = args?.tsxChanged !== false; // 기본 = 검사(명시적 false 일 때만 스킵)
if (tsxChanged) {
  JUDGE.push({
    key: "react-best",
    prompt:
      "이 저장소의 커밋 대기 TSX 변경에 대해 vercel:react-best-practices 관점(React 패턴·성능·접근성)으로 검토하라." +
      " 커밋을 막을 실제 문제만 blockers 에 넣어라. check='react-best'." +
      JUDGE_RULES,
  });
}

log(
  `병렬 검증 ${1 + JUDGE.length}개 동시 실행 (기계 1묶음 + 판단 ${JUDGE.length}) = 이 PC 동시 한도에 맞춤`,
);

const results = await parallel([
  () =>
    agent(MACHINE_PROMPT, {
      label: "verify:machine",
      phase: "Verify",
      schema: RESULT_SCHEMA,
      effort: "low",
    }),
  ...JUDGE.map(
    (c) => () =>
      agent(c.prompt, {
        label: `verify:${c.key}`,
        phase: "Verify",
        schema: RESULT_SCHEMA,
      }),
  ),
]);

const clean = results.filter(Boolean);
const failed = clean.filter((r) => r && r.pass === false);

return {
  total: 1 + JUDGE.length,
  passed: clean.filter((r) => r.pass).length,
  failedChecks: failed.map((r) => ({ check: r.check, summary: r.summary, blockers: r.blockers || [] })),
  allPassed: failed.length === 0 && clean.length === 1 + JUDGE.length,
  results: clean,
};
