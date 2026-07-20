export const meta = {
  name: "dev-pipeline",
  description:
    "회귀방지 모델 파이프라인 = Fable5 조사→영향분석(도미노)→Sonnet 그룹병렬 코딩→Fable5 검수→적대적 회귀검증+실증→§22 검증(커밋 직전 정지). 단계별 모델 자동 전환.",
  whenToUse:
    "여러 파일에 걸친 큰 개발 작업 전용(예: 화면 여러 개 신설·구조도 클론). args 에 작업 지시(문자열) 넣고 실행. ⚠️ 파일 1~2개 작은 작업은 메인이 직접 하는 게 빠름(에이전트 스폰 오버헤드). 자동 진행 후 '목표달성+회귀없음+실증+§22' 통과 표를 내고 커밋 직전 멈춤(§10). 이 앱은 6개월 사용자행동 로직=도미노 위험이라 영향분석·적대적 회귀검증이 핵심.",
  phases: [
    { title: "조사·계획", detail: "Fable5 = 사전조사·연구 후 상세 계획+todo", model: "fable" },
    { title: "영향분석", detail: "Fable5 = 도미노 반경 역추적(회귀 위험 지도)", model: "fable" },
    { title: "병렬코딩", detail: "Sonnet = 파일별 그룹 병렬(같은 파일은 순차 = 충돌0)", model: "sonnet" },
    { title: "검수·실증", detail: "Fable5 = 목표 도달 검수 후 수정 지시", model: "fable" },
    { title: "회귀·실증", detail: "Fable5 = 적대적 회귀검증 + 실증 시나리오 병렬", model: "fable" },
    { title: "커밋전검증", detail: "§22 기계4+판단3 병렬(verify-workflow 재사용)" },
  ],
};

// ⚠️ 2026-07-20~21 사장님 SSOT = 회귀방지 모델 파이프라인.
//   메인 대화창(지휘자) 모델은 불변 = 이 스크립트가 단계마다 하위 에이전트 모델을 자동 배정(사장님 개입 0).
//   흐름: 조사(fable) → 영향분석/도미노(fable) → 그룹병렬코딩(sonnet) → 검수(fable) → 적대적회귀+실증(fable) → §22.
//   범용 = 특정 앱 회귀 체크리스트 불필요 = 영향분석이 매번 코드에서 "이번 변경의 회귀 반경"을 자동 생성(2026-07-21 사장님 SSOT).
//   §22(커밋전 병렬검증)·§17(3게이트)·§10(커밋은 명시지시 후)·§16(재발명 금지=verify-workflow 재사용) 정합.

// ── 작업 지시 = args (문자열 또는 {task} 객체) ──
const TASK =
  typeof args === "string" ? args : args?.task || "(작업 지시 미지정)";

// ── 1단계 산출물 스키마 = todo list(병렬 코딩 입력) ──
const PLAN_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "조사 결과·접근 요약(한국어)" },
    todos: {
      type: "array",
      description: "독립 병렬 구현 가능한 작업 단위. 각 항목 = 한 에이전트가 끝까지 처리할 1건.",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string", description: "작업 한 줄 제목(한국어)" },
          detail: {
            type: "string",
            description: "구현에 필요한 상세(대상 파일·정확한 변경·근거·주의). 이것만 보고 바로 코딩 가능한 수준.",
          },
          files: { type: "array", items: { type: "string" }, description: "예상 변경 파일(겹치면 직렬화 판단용)" },
        },
        required: ["id", "title", "detail"],
      },
    },
    risks: { type: "array", items: { type: "string" }, description: "사장님이 결정해야 할 위험·불명확점(있으면 여기 표기 = 자동진행 중단 신호)" },
  },
  required: ["summary", "todos"],
};

// ── 3단계 각 코딩 결과 스키마 ──
const IMPL_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    done: { type: "boolean", description: "구현 완료 여부" },
    changedFiles: { type: "array", items: { type: "string" } },
    note: { type: "string", description: "무엇을 어떻게 바꿨는지 요약(한국어)" },
    blocker: { type: "string", description: "막힌 게 있으면 사유(없으면 빈 문자열)" },
  },
  required: ["id", "done", "note"],
};

// ── 영향분석 스키마 = 이번 변경의 "도미노 반경"(범용: 코드에서 역추적 = 특정 앱 무관) ──
const IMPACT_SCHEMA = {
  type: "object",
  properties: {
    touchedSymbols: {
      type: "array",
      description: "이번 변경이 건드리는 심볼(함수·ref·state·상수·export). grep 으로 실측.",
      items: { type: "string" },
    },
    dominoes: {
      type: "array",
      description: "각 touchedSymbol 을 '또 쓰는 곳' = 회귀 위험 지점(도미노). 코딩 에이전트가 안 깨야 할 대상.",
      items: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "건드리는 심볼" },
          usedBy: { type: "array", items: { type: "string" }, description: "이 심볼을 쓰는 파일:함수(역추적 실측)" },
          risk: { type: "string", description: "깨질 경우 어떤 기존 기능이 망가지는지(한국어)" },
        },
        required: ["symbol", "usedBy", "risk"],
      },
    },
    guardedBehaviors: {
      type: "array",
      description: "이번 변경 후에도 반드시 유지돼야 할 '기존 보장 동작' 목록(적대적 회귀검증의 기준). 코드·SSOT 근거로 추출.",
      items: { type: "string" },
    },
  },
  required: ["touchedSymbols", "dominoes", "guardedBehaviors"],
};

// ── 적대적 회귀검증 스키마 = "안 건드린 기능이 깨졌나"를 refute ──
const REGRESSION_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["safe", "regression"], description: "safe=회귀없음 / regression=기존기능 깨짐 발견" },
    summary: { type: "string", description: "적대적 검증 결과(한국어, 각 guardedBehavior 별로)" },
    regressions: {
      type: "array",
      description: "실제 깨진 기존 기능(있으면 = 커밋 차단). 각 항목은 재현 시나리오 포함.",
      items: {
        type: "object",
        properties: {
          behavior: { type: "string", description: "깨진 보장 동작" },
          scenario: { type: "string", description: "구체적 재현: 입력·상태 → 잘못된 결과" },
          fixHint: { type: "string", description: "수정 방향(있으면)" },
        },
        required: ["behavior", "scenario"],
      },
    },
  },
  required: ["verdict", "summary"],
};

// ── 4단계 검수 결과 스키마 ──
const AUDIT_SCHEMA = {
  type: "object",
  properties: {
    reached: { type: "boolean", description: "작업 목표 도달 여부" },
    summary: { type: "string", description: "검수·실증 결과(한국어, 근거 포함)" },
    fixes: {
      type: "array",
      description: "목표 미달·결함 = 수정 지시(있으면 다음 라운드에서 Sonnet 이 처리)",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          detail: { type: "string" },
        },
        required: ["id", "title", "detail"],
      },
    },
  },
  required: ["reached", "summary"],
};

// ═══════════════════════════════════════════════
// 1단계 = Fable5 사전조사·연구 + 상세 계획·todo
// ═══════════════════════════════════════════════
phase("조사·계획");
log(`[1/5] Fable5 조사·계획 시작 = ${TASK.slice(0, 60)}`);

const plan = await agent(
  `당신은 사전조사·계획 전문가입니다. 다음 작업을 위해 상세 사전조사·연구를 수행하고, "바로 구현에 착수할 수준"의 상세 계획과 병렬 실행 가능한 todo list 를 작성하세요.

[작업]
${TASK}

[반드시]
- 실제 코드베이스를 읽어 근거를 확보(추측 금지). 관련 파일·함수·기존 패턴을 특정.
- CLAUDE.md 헌법(특히 §0 옛코드 완전삭제·§16 재발명 금지·§19 박제 금지·§14/§18/§20 파이프라인)을 준수하는 계획.
- todos = 서로 독립적으로 병렬 구현 가능한 단위로 분해. 각 todo.detail = 그 항목만 보고 다른 에이전트가 바로 코딩 가능한 수준(대상 파일·정확한 변경·근거).
- 사장님이 먼저 결정해야 할 위험·불명확점이 있으면 risks 에 넣으세요(그러면 파이프라인이 멈춥니다).`,
  { label: "1-plan-fable", phase: "조사·계획", model: "fable", effort: "high", schema: PLAN_SCHEMA },
);

if (!plan) {
  return { stopped: "1단계 조사 실패(에이전트 종료)", stage: "조사·계획" };
}
if (plan.risks && plan.risks.length) {
  log(`[정지] 사장님 결정 필요 위험 ${plan.risks.length}건 = 자동진행 중단`);
  return { stopped: "위험·불명확점 = 사장님 결정 필요", stage: "조사·계획", plan };
}
log(`[1/5] 계획 완료 = todo ${plan.todos.length}건`);

// ═══════════════════════════════════════════════
// 1.5단계 = 영향분석(도미노 예측) = Fable5.
//   ⚠️ 이 앱의 본질(6개월 사용자행동 로직 = 조금 건드리면 도미노) 대응 = 코딩 前에 회귀 반경을 코드에서 역추적.
//   범용 = 특정 앱 체크리스트 불필요, 코드 자체에서 매번 자동 생성(2026-07-21 사장님 SSOT).
// ═══════════════════════════════════════════════
phase("영향분석");
log(`[1.5/5] Fable5 영향분석 = 도미노 반경 역추적`);

const impact = await agent(
  `당신은 회귀 영향분석 전문가입니다. 아래 작업이 건드릴 코드의 "도미노 반경"을 실측하세요.

[작업]
${TASK}

[계획 요약]
${plan.summary}

[변경 예상 파일]
${[...new Set(plan.todos.flatMap((t) => t.files || []))].join(", ") || "(계획에 미명시 = 직접 특정)"}

[반드시]
- 변경이 건드릴 심볼(함수·ref·state·상수·export)을 특정하고, 각 심볼을 "또 쓰는 곳"을 grep/검색으로 **역추적 실측**(추측 금지). = dominoes.
- 이 앱은 사용자 행동패턴이 녹은 로직 덩어리 = 한 곳 바꾸면 다른 기능이 깨질 수 있음. 그 연쇄 위험을 risk 에 구체적으로.
- 변경 후에도 반드시 유지돼야 할 "기존 보장 동작"을 코드·docs(SSOT/WORKLOG) 근거로 guardedBehaviors 에 나열(= 뒤 적대적 회귀검증의 기준).`,
  { label: "1.5-impact-fable", phase: "영향분석", model: "fable", effort: "high", schema: IMPACT_SCHEMA },
);

const dominoText = impact
  ? impact.dominoes.map((d) => `  · ${d.symbol} → 사용처: ${(d.usedBy || []).join(", ")} | 위험: ${d.risk}`).join("\n")
  : "(영향분석 실패)";
const guardedText = impact ? impact.guardedBehaviors.map((b) => `  · ${b}`).join("\n") : "";
log(`[1.5/5] 도미노 ${impact ? impact.dominoes.length : 0}건 · 보장동작 ${impact ? impact.guardedBehaviors.length : 0}건`);

// ═══════════════════════════════════════════════
// 2단계 = 오케스트레이션 (이 스크립트 = 메인 지휘자가 조율)
//   = todo 를 파일별 그룹으로 병렬 fan-out(같은 파일 순차 = 충돌0).
// ═══════════════════════════════════════════════
// (별도 phase 없음 = 조율은 코드가 수행. 3단계 병렬 코딩으로 바로 진입.)

// ═══════════════════════════════════════════════
// 3단계 = Sonnet 코딩 (파일 충돌 방지 = 파일별 그룹핑)
//   ⚠️ 2026-07-21 첫 실전 버그 수정: 같은 파일을 여러 todo 가 병렬 편집 → 충돌·검수 혼선(4단계 오판)의 근본.
//   해결 = 파일 겹치는 todo 를 한 그룹으로 묶어 1 에이전트가 순차 처리. 독립 파일 그룹끼리만 병렬 = 충돌 0.
// ═══════════════════════════════════════════════
phase("병렬코딩");

// 파일 기준 그룹핑: 파일을 공유하는 todo 들은 같은 그룹(순차). files 미지정 todo 는 각자 독립 그룹.
const groups = [];
const fileToGroup = {};
for (const td of plan.todos) {
  const files = td.files || [];
  let g = null;
  for (const f of files) if (fileToGroup[f] != null) { g = fileToGroup[f]; break; }
  if (g == null) { g = groups.length; groups.push([]); }
  groups[g].push(td);
  for (const f of files) fileToGroup[f] = g;
}
log(`[3/5] Sonnet 코딩 = ${plan.todos.length}개 todo → ${groups.length}개 그룹 병렬(그룹 내부는 순차 = 파일충돌 0)`);

const groupResults = await parallel(
  groups.map((todos) => async () => {
    const out = [];
    for (const td of todos) {
      const r = await agent(
        `당신은 구현 전문가입니다. 아래 todo 를 코드베이스에 직접 구현하세요.

[전체 작업 맥락]
${plan.summary}

[이 todo]
제목: ${td.title}
상세: ${td.detail}
${td.files ? `예상 파일: ${td.files.join(", ")}` : ""}

[⚠️ 도미노 경고 = 아래 심볼을 건드리면 다른 기능이 깨질 수 있음 = 절대 회귀 없게]
${dominoText}

[반드시]
- CLAUDE.md 헌법 준수(§0 옛코드 완전삭제·§16 재발명 금지·§19 박제 금지·§6 한국어 주석).
- 이 todo 범위만 구현. 다른 todo 영역은 건드리지 마세요.
- 위 도미노 심볼을 바꿔야 하면 = 그 사용처가 모두 정상 작동하게 유지(기존 시그니처·동작 보존).
- 막히면 blocker 에 사유를 남기고 done=false.`,
        { label: `3-impl:${td.id}`, phase: "병렬코딩", model: "sonnet", schema: IMPL_SCHEMA },
      );
      if (r) out.push(r);
    }
    return out;
  }),
);

const doneImpls = groupResults.filter(Boolean).flat();
log(`[3/5] 코딩 완료 = ${doneImpls.filter((i) => i.done).length}/${plan.todos.length} 성공`);

// ═══════════════════════════════════════════════
// 4단계 = Fable5 검수·실증 후 수정 (미달 시 1회 재코딩 루프)
// ═══════════════════════════════════════════════
phase("검수·실증");
log(`[4/5] Fable5 검수·실증`);

const auditPrompt = (extra) =>
  `당신은 검수·실증 전문가입니다. 아래 작업이 목표에 도달했는지 실제 코드·동작으로 검증하세요.

[작업 목표]
${TASK}

[계획 요약]
${plan.summary}

[구현 결과]
${doneImpls.map((i) => `- [${i.done ? "완료" : "미완"}] ${i.id}: ${i.note}${i.blocker ? ` (막힘: ${i.blocker})` : ""}`).join("\n")}
${extra || ""}

[반드시]
- ⚠️ 3단계 코딩이 방금 완료된 상태입니다. 반드시 대상 파일을 **지금 새로 Read** 해서 최신 내용으로 검증하세요(캐시·기억 금지). 위 [구현 결과] 는 코딩 에이전트의 자기보고일 뿐 = 실제 파일이 진실.
- 실제 파일을 읽고, 가능하면 실행/빌드로 실증(추측 금지 = §1.1).
- 목표 미달·결함이 있으면 fixes 에 "그 항목만 보고 바로 수정 가능한" 지시로 넣으세요.
- CLAUDE.md 헌법 위반(재발명·박제·옛코드 잔존)도 결함으로 판정.`;

let audit = await agent(auditPrompt(), {
  label: "4-audit-fable",
  phase: "검수·실증",
  model: "fable",
  effort: "high",
  schema: AUDIT_SCHEMA,
});

// 미달 = Sonnet 재코딩 1라운드 → Fable 재검수 (무한루프 방지 = 1회만).
if (audit && !audit.reached && audit.fixes && audit.fixes.length) {
  log(`[4/5] 미달 = 수정 ${audit.fixes.length}건 재코딩(1라운드)`);
  const fixImpls = await parallel(
    audit.fixes.map((fx) => () =>
      agent(
        `당신은 구현 전문가입니다. 검수에서 발견된 아래 수정 지시를 코드베이스에 반영하세요.

[수정 지시]
제목: ${fx.title}
상세: ${fx.detail}

[반드시] CLAUDE.md 헌법 준수. 이 수정 범위만.`,
        { label: `4-fix:${fx.id}`, phase: "검수·실증", model: "sonnet", schema: IMPL_SCHEMA },
      ),
    ),
  );
  const fixed = fixImpls.filter(Boolean);
  audit = await agent(
    auditPrompt(
      `\n[수정 라운드 결과]\n${fixed.map((i) => `- [${i.done ? "완료" : "미완"}] ${i.id}: ${i.note}`).join("\n")}`,
    ),
    { label: "4-reaudit-fable", phase: "검수·실증", model: "fable", effort: "high", schema: AUDIT_SCHEMA },
  );
}

// ═══════════════════════════════════════════════
// 4.5단계 = 적대적 회귀검증 + 실증 시나리오 (병렬) = 이 앱 도미노 대응 핵심.
//   ②적대적 회귀검증(Fable5) = 영향분석의 guardedBehaviors 각각을 "깨졌나?"로 refute.
//   ③실증 시나리오(Fable5) = 변경 함수의 실제 동작을 DevTools·DB 등으로 실측(사장님 검증방식 자동화).
// ═══════════════════════════════════════════════
phase("회귀·실증");
log(`[4.5/5] 적대적 회귀검증 + 실증 시나리오 병렬`);

const [regression, evidence] = await parallel([
  // ② 적대적 회귀검증
  () =>
    agent(
      `당신은 적대적 회귀검증 전문가입니다. 이번 변경이 "안 건드린 기존 기능"을 깨뜨렸는지 적대적으로 파고드세요(기본 태도 = 의심).

[작업 목표]
${TASK}

[반드시 유지돼야 할 기존 보장 동작 = 이걸 하나씩 refute]
${guardedText || "(영향분석 산출 없음 = 변경 파일의 모든 기존 동작을 스스로 도출해 검증)"}

[도미노 반경 = 이 사용처들이 여전히 정상인지 실측]
${dominoText}

[반드시]
- 각 보장 동작에 대해 "이번 변경으로 이게 깨졌을 시나리오"를 적극적으로 상상하고, 실제 코드를 Read 해서 확인(추측 금지).
- 깨진 게 있으면 regressions 에 "구체적 재현(입력·상태→잘못된 결과)"으로. 없으면 verdict='safe'.
- 스타일·개선점 아님 = 실제 기존기능 회귀만.`,
      { label: "4.5-regression-fable", phase: "회귀·실증", model: "fable", effort: "high", schema: REGRESSION_SCHEMA },
    ),
  // ③ 실증 시나리오
  () =>
    agent(
      `당신은 실증 검증 전문가입니다. 이번 변경의 핵심 동작이 실제로 되는지 "실행"으로 입증하세요(사장님 검증방식 = 직접조작+로그+DB).

[작업 목표]
${TASK}

[반드시]
- 코드 읽기만으로 끝내지 말고, 가능하면 실제 실행으로 실증: 로컬 서버·빌드·DB 직접조회([[feedback_no_supabase_mcp_direct_db_only]] = 직접접속만, Supabase MCP 금지)·DevTools 등.
- 이 앱 로직(저장 중복방지·낭독 재개·슬롯·매칭 등)은 "행동 시나리오"로 확인해야 진짜 = 예: 저장 N회→DB 1행 같은 실측.
- 실증 불가한 부분은 정직히 "실증 못함"으로(§1.1 게으름 금지 = 시도는 최대한).
- 결과를 reached(목표도달 여부)·summary(근거·수치 포함)로. 문제 발견 시 fixes 에.`,
      { label: "4.5-evidence-fable", phase: "회귀·실증", model: "fable", effort: "high", schema: AUDIT_SCHEMA },
    ),
]);

const hasRegression = regression && regression.verdict === "regression" && (regression.regressions || []).length > 0;
if (hasRegression) {
  log(`[4.5/5] 🔴 회귀 ${regression.regressions.length}건 발견 = 커밋 불가(수정 필요)`);
} else {
  log(`[4.5/5] ✅ 회귀 없음(safe)`);
}

// ═══════════════════════════════════════════════
// 5단계 = §22 커밋 전 병렬 검증 (verify-workflow 재사용 = §16 재발명 금지)
//   = 검증 통과 표를 내고 여기서 멈춤. 실제 커밋·push 는 사장님 명시 지시 후(§10).
// ═══════════════════════════════════════════════
phase("커밋전검증");
log(`[5/5] §22 커밋 전 병렬검증 = verify-workflow 재사용`);

// verify-workflow 를 scriptPath 로 재사용(우리 표준 호출 방식). 이름 미등록 대비.
let verify = null;
try {
  verify = await workflow({ scriptPath: "scripts/verify-workflow.mjs" });
} catch (e) {
  log(`[5/5] 검증 워크플로 호출 실패 = ${String(e).slice(0, 80)}. 커밋 전 수동 재검증 필요.`);
}

const allClear =
  verify?.allPassed && audit?.reached && !hasRegression && evidence?.reached !== false;

return {
  task: TASK,
  plan: { summary: plan.summary, todoCount: plan.todos.length },
  impact: impact
    ? { dominoes: impact.dominoes.length, guardedBehaviors: impact.guardedBehaviors }
    : null,
  coding: doneImpls.map((i) => ({ id: i.id, done: i.done, note: i.note, blocker: i.blocker || "" })),
  audit: audit ? { reached: audit.reached, summary: audit.summary } : null,
  regression: regression
    ? { verdict: regression.verdict, summary: regression.summary, regressions: regression.regressions || [] }
    : null,
  evidence: evidence ? { reached: evidence.reached, summary: evidence.summary } : null,
  verify: verify
    ? { allPassed: verify.allPassed, passed: verify.passed, total: verify.total, failedChecks: verify.failedChecks }
    : null,
  nextStep: allClear
    ? "✅ 목표달성 + 회귀없음 + 실증통과 + §22통과 = 커밋 준비 완료. 사장님 커밋 지시 대기(§10)."
    : hasRegression
      ? "🔴 기존기능 회귀 발견 = 커밋 불가(위 regression.regressions 확인·수정 필요)."
      : "🔴 미통과 = 보완 필요(audit/evidence/verify 확인).",
};
