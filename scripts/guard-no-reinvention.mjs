#!/usr/bin/env node
// ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = §16 재발명 가드 = 도구 카탈로그 = worker/lib/services/fill(워커 정본). 진입점 = --catalog(책임 1줄 목록) · --staged(pre-commit) · --file(Edit 직후). 위반 = 아래 CAPABILITIES 트리거를 owner 아닌 곳에서 새로 짬 (정본 §16)
import { execSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = 카탈로그가 읽는 자리 = 워커 정본(worker/lib/services/fill).
const FILL_DIR = join(ROOT, "worker", "lib", "services", "fill");

// ── 능력 카탈로그 = "이 결손이면 이 도구" (= 재발명 트리거) ──
// owner = 유일 정본 파일(들). triggers = 이 능력을 새로 짜려 할 때 diff 에 나타나는 신호(정규식).
// 새 도구 추가 시 여기 1줄 등재 = 카탈로그 = 후임 AI 가 --catalog 로 즉시 봄.
const CAPABILITIES = [
  // ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = 도구 정본 = worker/lib 판 · 창고 채움은 4단계 1벌(제미니 힌트→TS=PID 확정→입힘→PID 페이지 1회 방문=사진·대조·최신화) = 여기 owners 가 그 전부. 옛 도구 32개 삭제(§19). 도구가 바뀌면 이 표를 그 턴에 다시 쓴다.
  {
    id: "image-fill",
    ko: "이미지 결손 채우기(PID 페이지 무료 우선 → PM 은 결손행만)",
    owners: [
      "worker/lib/services/fill/backfill-verify.ts",
      "worker/lib/services/fill/storage-image-relink.ts",
      "worker/lib/services/shared/ts-client.ts",
      "worker/lib/services/agents/ag3-data-matcher.ts",
      "worker/lib/services/agents/ag3-save-new-places.ts",
      "worker/lib/services/fill/gmaps-post.ts",
    ],
    triggers: [/tsPhoto\s*\(/, /PhotoMedia\/media/i],
    hint: "이미지 채우기 = backfill-verify.ts(무료재링크→PID 페이지→PM) / relink = storage-image-relink.ts / 사진관문 = ts-client tsPhoto. 새 다운로더·업로더 만들지 말 것(§16).",
  },
  {
    id: "r2-storage",
    ko: "R2 창고 접근(단일 진입점)",
    owners: ["worker/lib/services/shared/r2-client.ts"],
    triggers: [
      /storage\.objects[\s\S]{0,200}uploadToR2/i,
      /supabase\.co\/storage\/v1/i,
    ],
    hint: "창고 = R2 단독(r2-client.ts). 옛 Supabase Storage(storage/v1) 경로 부활 금지.",
  },
  {
    id: "identity-fill",
    ko: "PID 페이지 1회 방문 = 이름·주소·RC·영업상태·좌표·사진 6요소 대조·최신화(유료 API 0)",
    owners: [
      "worker/lib/services/fill/gmaps-pid-identity.ts",
      "worker/lib/services/fill/gmaps-pid-identity/",
      "worker/lib/services/fill/backfill-verify.ts",
    ],
    triggers: [
      /maps\/place\/\?q=place_id:/,
      /data-item-id="address"/,
      /div\.F7nice/,
    ],
    hint: "PID 행 검증·최신화 = gmaps-pid-identity(Playwright 구글맵 공개 페이지, upsertPlace targetRowId 직행). 새 스크래퍼·TS 재호출 루프·별도 검증기 만들지 말 것(§16).",
  },
  {
    id: "pid-twin-merge",
    ko: "같은 PID 쌍둥이 병합 + 붙을 도시 없는 행 삭제",
    owners: [
      "worker/lib/services/fill/status-backfill.ts",
      "worker/lib/services/fill/wrongcity-quarantine.ts",
      // ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = MIX 쌍둥이 흡수 시 껍데기(자기 행) 즉시 삭제 = worker/lib 판 place-upsert 가 그 능력의 owner
      "worker/lib/services/place-upsert.ts",
    ],
    triggers: [
      /DELETE\s+FROM\s+place_seed_raw/i,
      /HAVING\s+count\(\*\)\s*>\s*1[\s\S]{0,120}google_place_id/i,
    ],
    hint: "같은 PID 쌍둥이 = status-backfill.ts(keep 흡수·best_rank 합집합·번역행 복사). 소속오염 행 = wrongcity-quarantine.ts(500km 안 가장 가까운 도시로 이동, 없으면 삭제). 새 중복 청소·이동 스크립트 만들지 말 것(§16).",
  },
  // ⚠️ 수정금지(승인필요) 2026-09-30 사장님 결정 = 식당 가격 = 페이지 열 때 머리줄 가격(9요소, page-reader) → 유로 환산 1벌(shared/price-eur, 상한 규칙) → 남은 것만 ⑤ 후처리 제미니 몰아 묻기(price-gemini, #07 prompt.txt) · 어사이드 답 넣기도 price-gemini
  {
    id: "price-fill",
    ko: "식당 가격(페이지 머리줄 → 유로 상한 규칙 → 남은 것 제미니 120곳/콜 · 어사이드 답 넣기)",
    owners: [
      "worker/lib/services/fill/price-gemini.ts",
      "worker/lib/services/shared/price-eur.ts",
      "worker/lib/services/shared/gemini-curate.ts",
      "worker/lib/services/fill/gmaps-pid-identity/page-reader.ts",
    ],
    triggers: [
      /Price per person/i,
      /\bfunction\s+(cardPrice|priceText|toEur|headerPrice)\s*\(/,
      /02-enrich-place\/prompt\.txt/,
    ],
    hint: "가격 = page-reader headerPrice(페이지) + price-eur toEur(환산) + price-gemini(--gemini=true 몰아 묻기 · --apply-json 어사이드). 새 가격 긁개·환산기·보강 지시문 만들지 말 것(§16).",
  },
  // ⚠️ 수정금지(승인필요) 2026-09-30 사장님 결정 = 제미니 응답 저장 = gemini-apply.ts 1벌(구글맵 로그에 값이 있는 칸은 덮지 않음)
  {
    id: "gemini-apply",
    ko: "제미니 응답 저장(구글맵 로그 값 칸은 지키고, 구글이 못 준 칸과 제미니 전용 칸만 씀)",
    owners: [
      "worker/lib/services/fill/gemini-apply.ts",
      "worker/lib/services/shared/gemini-curate.ts",
      "worker/lib/services/fill/price-gemini.ts",
    ],
    triggers: [/geminiCurate\s*\(/, /gemini-enrich-/],
    hint: "제미니 응답 저장 = gemini-apply.ts(--raw=<원본> · 시험이 기본, --apply 로 씀) 1벌. 응답을 행에 곧바로 덮어쓰는 새 코드 만들지 말 것(§16).",
  },
  // ⚠️ 수정금지(승인필요) 2026-09-30 사장님 결정 = 환율표 = exchange-rates.ts 1벌(open.er-api.com 무료)
  {
    id: "exchange-rates",
    ko: "환율표 갱신(open.er-api.com, base KRW)",
    owners: ["worker/lib/services/fill/exchange-rates.ts"],
    triggers: [/open\.er-api\.com/, /frankfurter\.app/, /exchangerate/i],
    hint: "환율 = exchange-rates.ts(--apply) 1벌. 다른 환율 API·표 만들지 말 것(§16).",
  },
  // ⚠️ 수정금지(승인필요) 2026-09-30 사장님 결정 = 분류 확정 = finalCategory 1벌(place-category-map) · DB 만 도는 정렬 = category-align.ts
  {
    id: "category-align",
    ko: "분류 정렬(구글 분류 최우선 · 장소 아님 삭제 · 핫스팟은 태그로 · 새 글자 보고)",
    owners: [
      "worker/lib/services/fill/category-align.ts",
      "worker/lib/services/shared/place-category-map.ts",
    ],
    triggers: [/\bfunction\s+(finalCategory|categoriesOfLabel|resolveCategory)\s*\(/, /NOT_PLACE/],
    hint: "분류 = place-category-map finalCategory 1벌, 기존 행 정렬 = category-align.ts. 새 대응표·판정식 만들지 말 것(§16).",
  },
  // ⚠️ 수정금지(승인필요) 2026-10-01 사장님 결정 = 필시티 읽은 뒤 단계 = fillcity/steps 의 탐지·에이전트 명단·같은 장소 병합·제미니 호출 대상·손님상 검수 1벌 (정본 §)
  {
    id: "post-read-steps",
    ko: "필시티 읽은 뒤 단계(탐지 → 에이전트 명단·판정 적용·같은 장소 병합 → 제미니 호출 대상 → 손님상 검수)",
    owners: [
      "fillcity/steps/common.ts",
      "fillcity/steps/post-read-scan.ts",
      "fillcity/steps/agent-export.ts",
      "fillcity/steps/agent-run.ts",
      "fillcity/steps/dup-merge.ts",
      "fillcity/steps/gemini-targets.ts",
      "fillcity/steps/serving-report.ts",
    ],
    triggers: [/_scan\.json/, /_agent-input/, /gemini-before/, /\bfunction\s+(isLodgingPage|roomRateEur)\s*\(/],
    hint: "읽은 뒤 단계 = fillcity/steps/{post-read-scan,agent-export,agent-run,dup-merge,gemini-targets,serving-report}.ts 1벌(v3 --only=scan,agent,gtarget,report · 에이전트 동시 실행 = agent-run.ts). 호텔 판정은 에이전트 지시문(prompts/04-classify-agent) 안에 있다. 호텔 판별·객실 요금 읽기·같은 장소 병합·제미니 호출 후보 뽑기·손님상 검수 새 스크립트 만들지 말 것(§16).",
  },
  // ⚠️ 수정금지(승인필요) 2026-09-30 사장님 결정 = LLM 삭제 = llm-review.ts(명단 내보내기·판정 적용) + 에이전트 판단(CRITERIA)
  {
    id: "llm-review",
    ko: "LLM 검토 삭제(명단 --export → 에이전트 판정 → --apply=<판정> 삭제, 껍데기 0)",
    owners: ["fillcity/steps/llm-review.ts"],
    triggers: [/llm-review-input/, /CRITERIA\s*=/],
    hint: "LLM 삭제 = fillcity/steps/llm-review.ts 1벌. 판정 기준은 그 파일 CRITERIA. 새 검토 스크립트 만들지 말 것(§16).",
  },
  // ⚠️ 수정금지(승인필요) 2026-09-28 사장님 결정 = 올리기 = scripts/release.mjs 1벌, 다른 배포 스크립트·임시 배포 명령 금지 (정본 §24)
  {
    id: "deploy",
    ko: "트리피스 올리기(커밋 → 직접 배포 → 확인 → GitHub 푸시 맨 뒤)",
    owners: ["scripts/release.mjs", "scripts/verify-before-commit.mjs"],
    triggers: [
      /wrangler(\.js)?["'`]?\s+deploy\b(?!.*--dry-run)/,
      /^\s*["'`]deploy["'`]\s*,?\s*$/,
      /["'`]deploy["'`]\s*,\s*["'`]--(config|cwd)/,
    ],
    hint: "올리기 = node scripts/release.mjs <커밋메시지파일> 1벌(§24). verify-before-commit 는 조립 시험(--dry-run)만. 새 배포 스크립트·임시 배포 명령 만들지 말 것(§16).",
  },
];

// ── --catalog : fill/ 실제 파일 헤더 1줄 + 능력표를 출력 (항상 최신 = 카탈로그가 코드에서 자동 생성) ──
function buildCatalog() {
  const lines = [
    "# worker/lib/services/fill/ 결손별 단독 도구 카탈로그 (= §16 재발명 금지 = 기존 것 재사용)",
    "",
  ];
  if (existsSync(FILL_DIR)) {
    for (const f of readdirSync(FILL_DIR)
      .filter((x) => x.endsWith(".ts"))
      .sort()) {
      const head =
        readFileSync(join(FILL_DIR, f), "utf8")
          .split(/\r?\n/)
          .find((l) => l.trim().startsWith("//")) || "";
      const resp = head
        .replace(
          /^\/\/\s*⚠️?\s*(수정금지\(승인필요\)|영구 컴포넌트)?\s*20\d\d-\d\d-\d\d\s*(사장님|사용자)?\s*SSOT?\s*=?\s*/,
          "",
        )
        .trim();
      lines.push(
        `- worker/lib/services/fill/${f} = ${resp || "(헤더 1줄 없음)"}`,
      );
    }
  }
  lines.push(
    "",
    "# 새 결손 도구가 필요하면: 위 목록에 겹치는 게 없을 때만 fill/ 에 새 파일 + 이 가드 CAPABILITIES 에 1줄 등재.",
  );
  return lines.join("\n");
}

// ── 재발명 감지 = 추가된 줄이 트리거를 담았는데 그 능력의 owner 파일이 아니면 위반 ──
function scanAddedLines(file, addedLines) {
  const norm = file.replace(/\\/g, "/");
  const out = [];
  for (const cap of CAPABILITIES) {
    // owner 본인(정당 사용처) = 통과. o 가 '/' 로 끝나면 폴더 접두(스킬 등), 아니면 파일 경로 꼬리 일치.
    if (
      cap.owners.some((o) =>
        o.endsWith("/") ? norm.includes(o) : norm.endsWith(o),
      )
    )
      continue;
    for (const line of addedLines) {
      if (cap.triggers.some((re) => re.test(line))) {
        out.push({
          file,
          cap: cap.ko,
          hint: cap.hint,
          text: line.trim().slice(0, 90),
        });
        break; // 능력당 1건
      }
    }
  }
  return out;
}

const SKIP =
  /(node_modules|dist[\/\\]|_archive|\.json$|guard-no-reinvention\.mjs$)/;
const SCAN_EXT = /\.(ts|tsx|js|mjs|cjs)$/;

function scanStaged() {
  const files = execSync("git diff --cached --name-only --diff-filter=ACM", {
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean)
    .filter((f) => SCAN_EXT.test(f) && !SKIP.test(f));
  const out = [];
  for (const f of files) {
    if (!existsSync(f)) continue;
    const diff = execSync(`git diff --cached -U0 -- "${f}"`, {
      encoding: "utf8",
    });
    const added = diff
      .split(/\r?\n/)
      .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
      .map((l) => l.slice(1));
    out.push(...scanAddedLines(f, added));
  }
  return out;
}

function scanFile(path) {
  if (
    !path ||
    !existsSync(path) ||
    statSync(path).isDirectory() ||
    SKIP.test(path) ||
    !SCAN_EXT.test(path)
  )
    return [];
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  return scanAddedLines(path, lines);
}

function fileFromStdin() {
  try {
    const j = JSON.parse(readFileSync(0, "utf8") || "{}");
    return j?.tool_input?.file_path || j?.file_path || null;
  } catch {
    return null;
  }
}

const args = process.argv.slice(2);
if (args[0] === "--catalog") {
  console.log(buildCatalog());
  process.exit(0);
}

let findings = [];
if (args[0] === "--staged") findings = scanStaged();
else if (args[0] === "--file") findings = scanFile(args[1]);
else if (args[0] === "--stdin") findings = scanFile(fileFromStdin());
else {
  console.error("사용법: --catalog | --staged | --file <경로> | --stdin");
  process.exit(2);
}

if (findings.length) {
  console.error(
    "\n❌ §16 재발명 의심 = 이미 있는 도구를 다시 만들고 있습니다 (기존 것을 재사용하세요):",
  );
  for (const h of findings)
    console.error(
      `  ${h.path || h.file} → [${h.cap}]\n     기존: ${h.hint}\n     감지: ${h.text}`,
    );
  console.error(
    "\n전체 도구 카탈로그: node scripts/guard-no-reinvention.mjs --catalog",
  );
  console.error(
    "정말 새 도구가 맞으면(기존과 능력이 다르면) 이 스크립트 CAPABILITIES 에 등재 후 재커밋.\n",
  );
  process.exit(1);
}
process.exit(0);
