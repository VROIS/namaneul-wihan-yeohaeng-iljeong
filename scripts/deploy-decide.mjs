#!/usr/bin/env node
// ⚠️ 수정금지(승인필요) 2026-07-31 사장님 지시 = "이것 할 때마다 빌드해야 하냐? 정말 귀찮은데"
//
// 무엇: 마지막 빌드 이후 바뀐 파일을 보고 **폰에 어떻게 넣어야 하는지 스스로 판단**한다.
//   = 화면·글자만 바뀌었으면 무선 업데이트(1~2분) / 새 부품이 들어왔으면 진짜 굽기(30분)
//   = 서버가 바뀌었으면 Replit Republish 도 함께 안내
//
// 왜: AI 가 판단을 안 하고 매번 굽자고 해서 사장님이 30분씩 낭비하셨다.
//   판단 기준을 글이 아니라 **코드로** 박아 둔다(= 후임 AI 가 감으로 정하지 못하게).
//
// 쓰기: node scripts/deploy-decide.mjs            (사람이 읽는 표)
//       node scripts/deploy-decide.mjs --json     (AI/스킬이 읽는 형식)

import { execSync } from "node:child_process";

const sh = (cmd) => {
  try {
    return execSync(cmd, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
};

// git 은 한글 파일명을 "\352\262\260..." 처럼 8진수로 escape 해서 내보낸다.
// 그대로 두면 사장님이 어느 문서인지 알아볼 수 없으므로 한글로 되돌린다.
function unescapePath(p) {
  const s = p.replace(/^"|"$/g, "");
  if (!s.includes("\\")) return s;
  const bytes = [];
  for (let i = 0; i < s.length; ) {
    const m = /^\\([0-7]{3})/.exec(s.slice(i));
    if (m) {
      bytes.push(parseInt(m[1], 8));
      i += 4;
    } else {
      bytes.push(...Buffer.from(s[i], "utf8"));
      i += 1;
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

// ── 1. 마지막 "구운 시점" 찾기 ────────────────────────────────────────────
// app.json 의 버전·빌드번호는 구울 때만 올린다 = 그 커밋이 마지막 빌드 기준점.
// (없으면 = 한 번도 안 구움 → 전체 이력을 대상으로)
function findLastBuildCommit() {
  const commits = sh(`git log --format=%H -- app.json`)
    .split("\n")
    .filter(Boolean);
  for (const c of commits) {
    const diff = sh(`git show ${c} -- app.json`);
    // 버전 또는 빌드번호가 바뀐 커밋 = 굽기 위해 올린 것
    if (/^[+-]\s*"(version|buildNumber|versionCode)"/m.test(diff)) return c;
  }
  return commits[commits.length - 1] || "";
}

const base = findLastBuildCommit();
const baseInfo = base
  ? sh(`git log -1 --format="%h %ad %s" --date=short ${base}`)
  : "(빌드 이력 없음)";

// ── 2. 그 이후 바뀐 파일 ──────────────────────────────────────────────────
const range = base ? `${base}..HEAD` : "HEAD";
const changed = sh(`git diff --name-only ${range}`)
  .split("\n")
  .filter(Boolean)
  .map(unescapePath);

// 커밋 안 한 것도 포함(사장님이 커밋 전에 물어보실 수 있음)
const uncommitted = sh(`git status --porcelain`)
  .split("\n")
  .filter(Boolean)
  .map((l) => unescapePath(l.slice(3)));

const all = [...new Set([...changed, ...uncommitted])];

// ── 3. 판단 ───────────────────────────────────────────────────────────────
// 새 부품(네이티브)이 들어왔나 = 무선 업데이트로 **절대 못 가는** 것들
const nativeReasons = [];

// package.json 의 의존성이 바뀌었나 (스크립트만 바뀐 건 제외)
if (all.includes("package.json")) {
  const d =
    sh(`git diff ${range} -- package.json`) + sh(`git diff -- package.json`);
  if (/^[+-]\s*"[^"]+":\s*"[~^]?\d/m.test(d)) {
    nativeReasons.push("package.json 에 새 부품(라이브러리)이 추가·변경됨");
  }
}

// app.json 의 네이티브 설정(플러그인·권한·번들ID 등)
if (all.includes("app.json")) {
  const d = sh(`git diff ${range} -- app.json`) + sh(`git diff -- app.json`);
  if (
    /^[+-].*(plugins|bundleIdentifier|package|permissions|extraPods|scheme|usesAppleSignIn)/m.test(
      d,
    )
  ) {
    nativeReasons.push(
      "app.json 의 네이티브 설정(플러그인·권한·번들ID)이 바뀜",
    );
  }
  // ⚠️ 번호표(runtimeVersion)가 바뀌면 = 앱의 신분증이 바뀐 것.
  //   이미 설치된 앱은 옛 번호표를 달고 있어 **무선 업데이트를 받지 못한다.**
  //   = 무선으로 보내봐야 폰에 안 감 → 반드시 구워야 한다.
  //   (2026-07-31 실측: 이 조건이 없어서 도구가 "무선으로 되네요" 라고 잘못 답했다)
  if (/^[+-]\s*"(runtimeVersion|policy)"/m.test(d)) {
    nativeReasons.push(
      "app.json 의 번호표(runtimeVersion)가 바뀜 = 이미 깔린 앱은 무선으로 못 받음",
    );
  }
}

// 네이티브 폴더를 직접 건드림
if (all.some((f) => f.startsWith("ios/") || f.startsWith("android/"))) {
  nativeReasons.push("ios/ 또는 android/ 폴더를 직접 고침");
}

// 서버가 바뀌었나 = Replit Republish 필요(앱 빌드와 무관)
const serverChanged = all.some(
  (f) => f.startsWith("server/") || f.startsWith("shared/"),
);

// 앱 화면이 바뀌었나 = 무선 업데이트 대상
const clientChanged = all.some(
  (f) => f.startsWith("client/") || f.startsWith("assets/") || f === "App.tsx",
);

// 문서·스크립트만 바뀐 것 = 폰에 넣을 게 없음
const onlyDocs =
  all.length > 0 && !nativeReasons.length && !serverChanged && !clientChanged;

let action, why;
if (all.length === 0) {
  action = "none";
  why = "마지막으로 구운 뒤 바뀐 게 없습니다.";
} else if (nativeReasons.length) {
  action = "build";
  why = nativeReasons.join(" / ");
} else if (onlyDocs) {
  action = "none";
  why = "문서·설정만 바뀌어 폰에 넣을 것이 없습니다.";
} else if (clientChanged) {
  action = "ota";
  why = "화면·글자·로직만 바뀌었습니다 = 무선 업데이트로 들어갑니다.";
} else {
  action = "server-only";
  why = "서버만 바뀌었습니다 = 앱은 그대로, Replit 만 새로 올리면 됩니다.";
}

const result = {
  action, // none | ota | build | server-only
  why,
  needsReplit: serverChanged,
  base: baseInfo,
  changedCount: all.length,
  uncommittedCount: uncommitted.length,
  nativeReasons,
  files: all.slice(0, 40),
};

// ── 4. 출력 ───────────────────────────────────────────────────────────────
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const LABEL = {
  none: "🟢 아무것도 안 해도 됩니다",
  ota: "📡 무선 업데이트 (1~2분) — 굽지 않습니다",
  build: "🔥 진짜 굽기 필요 (20~35분)",
  "server-only": "🖥  서버만 = Replit Republish",
};

console.log("");
console.log("┌─ 폰에 어떻게 넣나 ────────────────────────────────");
console.log(`│ ${LABEL[action]}`);
console.log(`│ 이유: ${why}`);
console.log("├───────────────────────────────────────────────────");
console.log(`│ 마지막 구운 시점: ${baseInfo}`);
console.log(
  `│ 그 뒤 바뀐 파일: ${all.length}개 (커밋 안 한 것 ${uncommitted.length}개 포함)`,
);
if (serverChanged) console.log(`│ ⚠️ 서버도 바뀜 = Replit Republish 도 필요`);
console.log("└───────────────────────────────────────────────────");

if (all.length && all.length <= 40) {
  console.log("\n바뀐 파일:");
  for (const f of all) console.log(`  ${f}`);
} else if (all.length > 40) {
  console.log(`\n바뀐 파일 (앞 40개만):`);
  for (const f of all.slice(0, 40)) console.log(`  ${f}`);
  console.log(`  … 외 ${all.length - 40}개`);
}
console.log("");
