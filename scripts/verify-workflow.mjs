export const meta = {
  name: "verify-before-commit",
  description: "커밋 직전 판단 3종(simplify·code-review·react-best) 병렬 (§22)",
  phases: [{ title: "Verify", detail: "판단 에이전트 3개 병렬" }],
};

// ⚠️ 수정금지(승인필요) 2026-08-03 사장님 SSOT = **이 워크플로 = 판단 3종만** (§22 갱신).
//   기계 에이전트 폐기 = 2026-08-03 §19 — 기계 4종(tsc·서버빌드·웹빌드·lint)은 이미 2중이다:
//   ① `node scripts/verify-before-commit.mjs`(로컬 스크립트, AI 아님·수 분) ② git pre-commit hook.
//   여기서 또 돌리면 3중 중복 = 시간·토큰 낭비(사장님 지적 2026-08-03 "기계검증은 통과했으니 판단 3종만").
//   확정 순서 = 수정 → 기계검증(로컬 스크립트) → 크롬 실증 → 미비 시 재수정 반복 → 커밋 직전 = 이 워크플로.
// = 하나라도 실패 = 커밋 불가 = Ralph-loop 로 통과까지 보완.
// = args.tsxChanged(선택,bool) = TSX 변경 여부(react-best 스킵 판정용).
// ⚠️ 에이전트 3개 = 이 PC 동시 한도 4 안(2026-07-27 실측 = 한도를 넘기면 줄 서서 시간 2배).

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

// ⚠️ 2026-07-28 사장님 지시 = **검사 대상 지정**.
//   기본 = `git diff HEAD` = **아직 커밋 안 된 것 전부**(스테이지+미스테이지).
//     옛 `git diff --cached` 폐기 = 스테이지 안 한 변경을 영영 안 보던 구멍(§22 검증이 잡음).
//   args.range 를 주면 **이미 커밋된 범위**(예: "1ed7229..HEAD")를 검사한다
//     = 급해서 훅(기계 4종)만 통과시키고 커밋해 버린 코드를 뒤늦게라도 전수 점검할 때.
//   ⚠️ range 는 리비전 글자만 허용 = 프롬프트로 셸에 전달되므로 다른 명령이 끼어들 수 없게 막는다.
// ⚠️ args 가 글자 뭉치로 도착하는 경우가 있어 여기서 한 번 풀어준다(실측 2026-07-28 = 그래서 range 가
//   두 번이나 무시되고 엉뚱한 대상을 검사했다). 객체로 오면 그대로 쓴다.
//   JSON 이 아닌 평문이 와도 검증 전체가 죽지 않게 감싼다(§22 검증 지적 2026-07-28).
function readArgs(v) {
  if (typeof v !== "string") return v ?? {};
  try {
    return JSON.parse(v);
  } catch {
    return { range: v.trim() }; // 평문이면 range 로 본다(예: "1ed7229..HEAD")
  }
}
const A = readArgs(args);
const RANGE_OK = /^[\w][\w.\-/^~]*(\.\.\.?[\w][\w.\-/^~]*)?$/;
if (A.range && !RANGE_OK.test(A.range)) {
  throw new Error(`range 형식이 잘못됨: ${A.range}`);
}
const DIFF = A.range ? `git diff ${A.range}` : "git diff HEAD";
log(`검사 대상 = ${DIFF}`);

// ── 판단 검증 = 사람 눈으로 볼 것만. 기계가 하는 일을 다시 하지 않는다 ──
const JUDGE_RULES =
  "\n\n⚠️ 시간 규칙(필수 — 어기면 검증이 몇 배 느려진다):" +
  "\n- `npx tsc`·`eslint`·`expo lint`·`expo export`·`npm run build` 등 타입체크·린트·빌드를 **절대 실행하지 마라**. 기계 검증은 로컬 스크립트·커밋 훅이 따로 하고, 그 통과 여부는 네 판정 대상이 아니다." +
  "\n- 프로젝트 가드 스크립트(`scripts/guard-*.mjs`)도 실행하지 마라. 커밋 훅이 따로 돌린다." +
  "\n- `gh`·`curl` 등 네트워크 명령을 쓰지 마라." +
  "\n- `node_modules` 는 **외부 라이브러리 호출 규약이 실제로 의심될 때 그 파일 1개만** 열어라. 훑어보기 금지." +
  `\n- 먼저 \`${DIFF} --stat\` 로 바뀐 파일 목록을 보고, **네 담당에 해당하는 파일만** 읽어라.` +
  `\n- diff 는 반드시 \`${DIFF} -w\`(공백 무시)로 봐라. 들여쓰기만 바뀐 수백 줄을 읽느라 시간을 버리지 마라.` +
  "\n- 파일 전체 읽기보다 diff + 필요한 부분만 읽기를 우선하라. 근거가 충분해지면 **더 파지 말고 바로 결론을 내라**." +
  // ⚠️ 2026-07-28 = **빈 통과 차단**(§22 검증이 실제로 잡은 사고). 검사할 게 없는데 초록불이 나면
  //   "검증했다"는 보고 자체가 거짓이 된다. 실제로 그 상태로 4/4 통과 보고가 나간 적이 있다.
  `\n\n⚠️ **맨 먼저** \`${DIFF} --stat\` 과 \`git status --short\` 를 **둘 다** 실행하라.` +
  // ⚠️ 2026-07-28 = `git diff` 는 **새로 만든 파일(추적 전)을 못 본다**(§22 검증이 잡음).
  //   새 파일이 통째로 검토를 빠져나가면 "전부 통과" 가 또 거짓이 된다.
  " `git status --short` 에 `??` 로 뜬 **새 파일도 검사 대상에 포함**해 직접 읽어라(diff 에는 안 나온다)." +
  " **둘 다 합쳐 0건이면 검토하지 말고 즉시 pass=false** 로 하고, blockers 에" +
  " \"검사 대상 0건 — 대상을 만들거나 range 를 지정할 것\" 을 넣어라." +
  " summary 첫 줄에는 **항상 '검사 대상 = 바뀐 N개 + 새 파일 M개'** 를 적어라(무엇을 봤는지 사장님이 확인하실 수 있게)." +
  // ⚠️ 수정금지(승인필요) 2026-08-09 사장님 반복 지시 = 검사원이 매번 같은 헛것을 물고 와서 지침에 박음.
  //   실제 사고(2026-08-09): 검사원이 "동시 요청으로 잔액보다 많이 쓸 수 있다"고 해서 방어를 만들었는데,
  //   ① 화면은 누르는 즉시 바뀌어 사람은 두 번 못 누르고 ② 그 방어가 정상 사용자의 모든 유료 요청에
  //   DB 조회를 얹었으며 ③ 새 버그를 둘 만들었다. 결국 통째로 삭제. = 없는 위협에 시간·비용만 썼다.
  "\n\n⚠️ **손가락 규칙(필수)** — 이 앱은 여행앱이다. 금융앱도 지갑도 아니다." +
  "\n- 지적하기 전에 **'일반 사용자가 손가락으로 그렇게 할 수 있나?'** 를 먼저 따져라." +
  "\n- **못 하면 지적하지 마라.** 프로그램으로 API 직접 호출·토큰 위조·번호 순차 훑기·동시 요청 폭주" +
  " 같은 경로는 blockers 에 넣지 말고 summary 에도 적지 마라(사장님이 반복해서 금지하신 항목)." +
  "\n- 화면이 이미 막고 있는지 **코드로 확인**하라(예: 버튼을 누르면 화면이 즉시 바뀌어 두 번 못 누른다)." +
  " 확인 없이 '이중 탭으로 재현된다' 같은 추정을 쓰지 마라 — 실제로 그 추정이 틀린 적이 있다." +
  "\n- 판정 기준 = **정상 사용자가 평범하게 쓰다가 겪는 일인가.** 아니면 없는 것으로 본다." +
  // ⚠️ 수정금지(승인필요) 2026-08-09 사장님 지시 = 근거 없는 지적이 반복돼 지침에 박음.
  //   실제 사고(2026-08-09): 검사원이 "여정 생성 직후 공유하면 숙소가 빠진다 = 이번 변경이 만든 회귀"라고 했으나
  //   코드를 보니 **원래부터 그 동작**이었고(복원한 여정도 동일), 사장님 설계상 "한 번 만든 여정 재활용"이 맞았다.
  //   그 한 문장 때문에 없는 회귀를 고치려 들었다.
  "\n\n⚠️ **시나리오 규칙(필수)** — 화면(FE) 동작은 **일반 사용자가 실제로 쓰는 관점**으로만 판단하라." +
  "\n- blockers 에 넣기 전에 **그 일이 일어나는 순서를 사용자 동작으로** 적어라." +
  " 예: `로그인 → 여정 생성 → 결과화면에서 숙소 지정 → [저장] 안 누르고 [공유] → 상대가 받은 링크에 숙소 없음`." +
  "\n- 그 순서를 못 적으면 **지적하지 마라.** '~할 여지가 있다' `~일 수 있다` 같은 추정만으로는 안 된다." +
  "\n- **'이번 변경이 만든 회귀'라고 쓰려면 옛 코드에서도 같은지 반드시 확인하라**" +
  " (`git show HEAD:<파일>` 로 바뀌기 전을 읽어 비교). 확인 없이 '회귀'라고 단정하지 마라 — 실제로 틀린 적이 있다." +
  "\n- 화면 흐름을 근거로 삼을 때는 **그 화면 코드를 직접 열어** 확인하라(버튼이 언제 사라지는지, 어떤 상태에서만 눌리는지).";

const JUDGE = [
  {
    key: "simplify",
    prompt:
      `이 저장소의 변경(${DIFF})에 대해 /simplify 관점(재사용·품질·효율)으로 검토하라.` +
      " 심각한 문제만 blockers 에 넣어라(사소한 개선은 pass=true 로 두고 summary 에만). check='simplify'." +
      JUDGE_RULES,
  },
  {
    key: "review",
    prompt:
      `이 저장소의 변경(${DIFF})에 대해 /code-review 관점(정확성·컨벤션·보안 버그)으로 검토하라.` +
      " 실제 버그·회귀만 blockers 에 넣어라(스타일은 제외). check='review'." +
      JUDGE_RULES,
  },
];

// ⚠️ 반드시 위에서 푼 A 를 쓸 것(원본 args 를 읽으면 글자 뭉치로 올 때 이 설정이 무시된다 = §22 검증 지적).
const tsxChanged = A.tsxChanged !== false; // 기본 = 검사(명시적 false 일 때만 스킵)
if (tsxChanged) {
  JUDGE.push({
    key: "react-best",
    prompt:
      `이 저장소의 변경(${DIFF}) 중 TSX 에 대해 vercel:react-best-practices 관점(React 패턴·성능·접근성)으로 검토하라.` +
      " 실제 문제만 blockers 에 넣어라. check='react-best'." +
      JUDGE_RULES,
  });
}

log(`판단 검증 ${JUDGE.length}개 병렬 실행 (기계 4종 = 로컬 스크립트·커밋 훅 담당)`);

const results = await parallel(
  JUDGE.map(
    (c) => () =>
      agent(c.prompt, {
        label: `verify:${c.key}`,
        phase: "Verify",
        schema: RESULT_SCHEMA,
      }),
  ),
);

const clean = results.filter(Boolean);
const failed = clean.filter((r) => r && r.pass === false);

return {
  total: JUDGE.length,
  passed: clean.filter((r) => r.pass).length,
  failedChecks: failed.map((r) => ({ check: r.check, summary: r.summary, blockers: r.blockers || [] })),
  allPassed: failed.length === 0 && clean.length === JUDGE.length,
  results: clean,
};
