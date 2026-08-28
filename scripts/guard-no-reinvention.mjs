#!/usr/bin/env node
// ⚠️ 수정금지(승인필요) 2026-07-11 사장님 SSOT = §16 재발명 가드 = 기존 도구를 후임이 다시 만드는 것을 "글 아닌 기계"로 차단.
// = 근본: 등재(WORKLOG·SSOT)만 하면 안 읽고 재발명함(사장님 실증). CLAUDE.md 도 안 지켜 §19 를 기계화한 것과 동형.
// = server/services/fill/ 은 그 자체가 "결손별 단독 도구 카탈로그"(각 파일 헤더 1줄 = 책임). 이 가드가 그 카탈로그를 자동 유지 + 재발명 신호 감지.
// = 진입점:
//     --catalog       : fill/ 폴더를 스캔해 각 도구의 책임 1줄 카탈로그를 stdout 출력(사람·AI 열람용, 항상 최신).
//     --staged        : git pre-commit = staged diff 가 기존 도구 책임을 재발명하는 신호면 exit 1 + 기존 도구 안내.
//     --file <경로>   : Edit/Write 직후 hook = 그 파일이 재발명 신호면 경고.
// = 위반 판정 = "새/추가 코드가 아래 CAPABILITIES 의 트리거 키워드를 담았는데, 그 능력의 기존 도구 파일이 아닌 곳에서" = 재발명 의심.
import { execSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILL_DIR = join(ROOT, "server", "services", "fill");

// ── 능력 카탈로그 = "이 결손이면 이 도구" (= 재발명 트리거) ──
// owner = 유일 정본 파일(들). triggers = 이 능력을 새로 짜려 할 때 diff 에 나타나는 신호(정규식).
// 새 도구 추가 시 여기 1줄 등재 = 카탈로그 = 후임 AI 가 --catalog 로 즉시 봄.
const CAPABILITIES = [
  {
    id: "image-fill",
    ko: "이미지 결손 채우기(PID 있고 사진만 없는 행 → PM 일괄)",
    // owners = 정당한 tsPhoto 사용처 전부(= 재발명 아님): 사후보강 image-backfill, 무료재링크 relink, 사진관문 ts-client,
    //   결손보강 WF repair, 발굴 12/06 post-process, ag3-save-new-places(라이브 생성 중 PM, 아래 참고).
    owners: [
      "server/services/fill/image-backfill.ts",
      "server/services/fill/storage-image-relink.ts",
      "server/services/shared/ts-client.ts",
      "fillcity/repair.ts",
      "server/services/agents/ag3-data-matcher.ts",
      "fillcity/prompts/12-ts-discover-pool/post-process.ts",
      "fillcity/prompts/06-ts-pm-enrich/post-process.ts",
      // ⚠️ 2026-08-16 사장님 SSOT = 사진 분리 수술(2026-07-11) 재통합 폐기 §19 = 라이브 MIX 생성 중에도
      //   즉시 PM 실행하도록 복귀(공식업뎁 전 요구). image-backfill.ts(사후일괄, 관리자 수동)과는 별개
      //   능력(라이브/사용자호출 vs 사후일괄/관리자임의) = 같은 tsPhoto 관문 재사용이라 재발명 아님(§16).
      "server/services/agents/ag3-save-new-places.ts",
      // ⚠️ 2026-08-27 사장님 확정 = B2(7개국어 베스트 발굴 입력 연결부) = "정말 신규행"으로 판정된 행에만 TS+PM 1회.
      //   병합(기존 행) 경로는 외부호출 0 = 일괄 도구(image-backfill)에 넘기면 이미지 있는 병합행까지 2중 호출되므로
      //   일괄 위임 금지 = 신규행 전용 즉시 PM = 같은 tsPhoto 관문 재사용 = 재발명 아님(§16).
      "fillcity/steps/discovery-verify-and-insert.ts",
      ".claude/skills/", // 스킬 내 post-process 도 정당
      // ⚠️ 2026-08-07 사장님 승인 = fillcity-bts/ = fillcity/ 의 BTS 전용 사본(원본 보존 원칙).
      //   = 새 능력이 아니라 같은 도구의 설정만 다른 사본(TOP5·공연장반경·보강범위) = 재발명 아님.
      //   = BTS 15개 도시 작업 종료 후 사본 폐기 시 이 줄도 함께 삭제할 것.
      "fillcity-bts/", // BTS 전용 사본 폴더 전체
    ],
    triggers: [/tsPhoto\s*\(/, /PhotoMedia\/media/i, /place-images.*x-upsert/i],
    hint: "이미지 채우기 = image-backfill.ts(무료재링크→raw재활용→PM) / relink = storage-image-relink.ts / 사진관문 = ts-client tsPhoto. 새 다운로더·업로더 만들지 말 것(§16).",
  },
  {
    id: "ts-backfill",
    ko: "PID 없는 행 TS 재검증·9요소 보강",
    owners: ["server/services/fill/ts-backfill.ts"],
    triggers: [
      /PID\s*없는.*tsSearch/,
      /google_place_id\s+IS\s+NULL[\s\S]{0,80}tsSearch/i,
    ],
    hint: "PID 없는 행 보강 = ts-backfill.ts. 새 TS 재검증 루프 만들지 말 것(§16).",
  },
  {
    id: "rc-rerank",
    ko: "최종 랭킹(RC DESC) 재정렬",
    owners: ["server/services/fill/rc-rerank.ts"],
    triggers: [
      /rank\s*=[\s\S]{0,40}(ROW_NUMBER|RANK\s*\(\)|ORDER BY.*google_review_count)/i,
    ],
    hint: "랭킹은 DB autorank 트리거 + rc-rerank.ts 단일 권위체. 앱 코드에서 rank 계산 금지(§19 이중화).",
  },
  {
    id: "raw-reinsert",
    ko: "저장 raw → PSR 재입력(외부호출 0)",
    // ⚠️ 2026-08-07 = fillcity/ 발굴 post-process 는 "자기 발굴 raw 를 자기가 병합"하는 정상 경로(재입력 도구 아님).
    //   원본은 기존 커밋분이라 검사 대상이 아니었고, BTS 사본(fillcity-bts/)은 신규 추가라 걸림 → 사본도 동일 정당 사용처로 등재(사장님 승인).
    owners: [
      "server/services/fill/reinsert-saved-raw.ts",
      "fillcity/",
      "fillcity-bts/",
    ],
    triggers: [/docs[\/\\]raw[\/\\][\s\S]{0,80}(INSERT|upsertPlace)/i],
    hint: "raw → PSR 재입력 = reinsert-saved-raw.ts + raw-storage-recall 스킬. 새로 만들지 말 것(§16).",
  },
  {
    id: "category-move",
    ko: "오분류 장소 카테고리 이동(DELETE 금지)",
    owners: ["server/services/fill/category-move.ts"],
    triggers: [/seed_category\s*=[\s\S]{0,40}(UPDATE|move)/i],
    hint: "오분류 이동 = category-move.ts (DELETE 금지 = TS 자산 보존). 새로 만들지 말 것(§16).",
  },
  {
    id: "r2-storage",
    ko: "R2 창고 접근·guides base64 추출 (SP 창고 철거 완료 2026-08-07 = 1-5b, 이전 도구 3종은 임무 완수로 삭제 §19)",
    owners: [
      "server/services/fill/guides-photo-extract.ts",
      "server/services/shared/r2-client.ts",
    ],
    triggers: [
      /storage\.objects[\s\S]{0,200}uploadToR2/i,
      /supabase\.co\/storage\/v1/i,
    ],
    hint: "창고 = R2 단독(r2-client.ts 단일 진입점). 옛 Supabase Storage(storage/v1) 경로를 새로 쓰는 것 = SP 부활 = 금지(1-5b 철거 완료). guides base64 추출 = guides-photo-extract.ts.",
  },
  {
    // ⚠️ 2026-08-27 사장님 확정 = "PID 가 있으니 구글맵을 열어 내용을 입력하면 될 일 — TS 다시 하지 마라" = 유료 API 0 = Playwright 로 구글맵 공개 페이지(place_id 링크) 열어 h1·주소 추출.
    id: "identity-fill",
    ko: "PID 는 있는데 현지어이름·주소·한국어이름이 빈 행 → 구글맵 페이지로 채움(유료 API 0) + PID 오매칭 감지(이름·좌표 대조) + --verify = 전 PID 행 오염 재확인·리뷰수·영업상태·좌표 최신화",
    owners: [
      "server/services/fill/gmaps-pid-identity.ts",
      "server/services/fill/gmaps-pid-identity/", // 2026-08-28 사장님 승인 = §0 700줄 가드 = 폴더 분리(page-reader·gates·apply·report)
    ],
    triggers: [
      /maps\/place\/\?q=place_id:/,
      /data-item-id="address"/,
      /div\.F7nice/,
    ],
    hint: "PID 보유 행의 name_local·address·name_ko 채움 + PID 오매칭 감지(name-mismatch·coord-mismatch 관문, 2026-08-27 사장님 지시) + --verify(2026-08-28 사장님 확정) = 도시의 전 PID 행 오염 재확인 + 리뷰수(google_review_count)·영업상태(business_status)·좌표·영어명(빈 칸만) 최신화 = gmaps-pid-identity.ts(Playwright 구글맵 공개 페이지, 유료 호출 0, upsertPlace targetRowId 직행). 새 스크래퍼·TS 재호출 루프·별도 PID 검증기·리뷰수 긁개 만들지 말 것(§16).",
  },
  {
    // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 확정 = A안 = "같은 PID = 같은 장소" 는 소프트 병합(status='merged'+merged_into 포인터, 행 보존)으로만 = PSR 행 DELETE 없음.
    //   = 1벌 = status-backfill.ts 규칙 ①(keep = RC 최대 → id 큰 쪽) 이 keep 흡수·태그/언어코드 합집합·번역행 복사·포인터 이동까지 담당.
    id: "pid-twin-merge",
    ko: "같은 PID 쌍둥이 = 소프트 병합(status='merged'+포인터, 행 보존) + keep 흡수·태그/언어코드 합집합·번역행 복사",
    owners: ["server/services/fill/status-backfill.ts"],
    triggers: [
      /DELETE\s+FROM\s+place_seed_raw/i,
      /HAVING\s+count\(\*\)\s*>\s*1[\s\S]{0,120}google_place_id/i,
    ],
    hint: "같은 PID 쌍둥이 = status-backfill.ts 규칙 ①(keep 흡수 = upsertPlace targetRowId, best_rank = bestRankUnion, place_translations 사본 복사·guides·cities 선별입력·merged_into 포인터 → keep, 그룹당 1 트랜잭션, loser = status='merged'). PSR 행 DELETE 금지 = 소프트 병합만(2026-08-28 A안). 새 PID 중복 청소 스크립트 만들지 말 것(§16).",
  },
];

// ── --catalog : fill/ 실제 파일 헤더 1줄 + 능력표를 출력 (항상 최신 = 카탈로그가 코드에서 자동 생성) ──
function buildCatalog() {
  const lines = [
    "# server/services/fill/ 결손별 단독 도구 카탈로그 (= §16 재발명 금지 = 기존 것 재사용)",
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
      lines.push(`- server/services/fill/${f} = ${resp || "(헤더 1줄 없음)"}`);
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
  /(node_modules|server_dist|dist[\/\\]|_archive|\.json$|guard-no-reinvention\.mjs$)/;
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
