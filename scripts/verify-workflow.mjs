export const meta = {
  name: "verify-before-commit",
  description: "커밋 전 의무 병렬 검증 = 기계4(tsc·서버빌드·웹빌드·lint) + 판단3(simplify·code-review·react-best) 서브에이전트 동시 실행 (§22)",
  phases: [{ title: "Verify", detail: "7개 검증 에이전트 병렬" }],
};

// ⚠️ 수정금지(승인필요) 2026-07-19 사장님 SSOT = 커밋 전 의무 병렬 검증 (§22).
// = 서브에이전트를 "전부 병렬"로 동원(사장님 지시) = 기계4 + 판단3 = 7개 동시.
// = 하나라도 실패 = 커밋 불가 = Ralph-loop 로 통과까지 보완.
// = args.diffSummary(선택) = 변경 요약. args.tsxChanged(선택,bool) = TSX 변경 여부(react-best 스킵 판정용).

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

// ── 기계 검증 4종 = 각 에이전트가 실제 명령 실행 후 결과 판정 ──
const MACHINE = [
  { key: "tsc", prompt: "이 저장소에서 `node scripts/verify-before-commit.mjs --quick` 대신, 정확히 `npx tsc --noEmit` 를 실행하라. 출력의 'error TS' 개수를 세라. 베이스라인 161 이하면 pass=true(신규 대량에러 없음), 초과면 pass=false 로 하고 초과분을 blockers 에 넣어라. check='tsc'." },
  { key: "serverBuild", prompt: "정확히 `npm run server:build` 를 실행하라. exit 0 이면 pass=true, 아니면 pass=false 로 하고 에러메시지를 blockers 에 넣어라. check='serverBuild'." },
  { key: "webBuild", prompt: "정확히 `npx expo export --platform web` 를 실행하라. 출력에 'Exported' 가 있고 exit 0 이면 pass=true, 아니면 pass=false 로 하고 에러를 blockers 에 넣어라. check='webBuild'." },
  { key: "lint", prompt: "정확히 `npx expo lint` 를 실행하라. exit 0(경고만 있어도 에러 0)이면 pass=true, 오류 있으면 pass=false 로 하고 오류를 blockers 에 넣어라. check='lint'." },
];

// ── AI 판단 검증 3종 = 스킬 호출 ──
const JUDGE = [
  { key: "simplify", prompt: "이 저장소의 현재 미커밋 변경(git diff)에 대해 /simplify 관점(재사용·품질·효율)으로 검토하라. 커밋을 막아야 할 심각한 문제만 blockers 에 넣어라(사소한 개선은 pass=true 로 두고 summary 에만). check='simplify'." },
  { key: "review", prompt: "이 저장소의 현재 미커밋 변경(git diff)에 대해 /code-review 관점(정확성·컨벤션·보안 버그)으로 검토하라. 실제 버그·회귀만 blockers 에 넣어라(스타일은 제외). check='review'." },
];

const tsxChanged = args?.tsxChanged !== false; // 기본 = 검사(명시적 false 일 때만 스킵)
if (tsxChanged) {
  JUDGE.push({ key: "react-best", prompt: "이 저장소의 TSX 변경에 대해 vercel:react-best-practices 관점(React 패턴·성능·접근성)으로 검토하라. 커밋을 막을 실제 문제만 blockers 에 넣어라. check='react-best'." });
}

const all = [...MACHINE, ...JUDGE];
log(`병렬 검증 ${all.length}개 에이전트 동시 실행 (기계 ${MACHINE.length} + 판단 ${JUDGE.length})`);

const results = await parallel(
  all.map((c) => () =>
    agent(c.prompt, { label: `verify:${c.key}`, phase: "Verify", schema: RESULT_SCHEMA }),
  ),
);

const clean = results.filter(Boolean);
const failed = clean.filter((r) => r && r.pass === false);

return {
  total: all.length,
  passed: clean.filter((r) => r.pass).length,
  failedChecks: failed.map((r) => ({ check: r.check, summary: r.summary, blockers: r.blockers || [] })),
  allPassed: failed.length === 0 && clean.length === all.length,
  results: clean,
};
