#!/usr/bin/env node
// ⚠️ 수정금지(승인필요) 2026-08-01 사장님 지시 = "이번엔 구워야 하나?" **한 가지만** 판단한다.
//
// 배경(중요): 사장님 배포 흐름은 이미 완결돼 있다 —
//   깃 푸시 → Replit pull(코드 전부 따라옴) → 그쪽 AI 점검·빌드 → 웹·Expo Go·아이폰12 확인.
//   AI 가 여기에 새 배포 경로를 만들면 곁가지 + 오류만 생긴다(2026-08-01 실증 = /deploy 스킬 폐기 §19).
//   AI 가 챙길 것은 **TF(아이폰)·APK(삼성)** 뿐이고, 그 둘의 규칙은 완전히 같다:
//     - 새 부품(라이브러리)·네이티브 설정이 바뀜 → **다시 구워야** 함(IPA/APK)
//     - 그 외(화면·글자·로직)          → 무선 업데이트로 들어감(앱 껐다 켜기. APK 는 2번)
//
// 쓰기: node scripts/needs-rebuild.mjs          (사람이 읽는 답)
//       node scripts/needs-rebuild.mjs --json   (AI 가 읽는 형식)

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

// git 은 한글 파일명을 8진수로 escape 한다 = 사장님이 알아보시게 되돌림
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

// ── 마지막 "구운 시점" = app.json 의 version/buildNumber 를 올린 커밋 ──
function findLastBuildCommit() {
  const commits = sh(`git log --format=%H -- app.json`)
    .split("\n")
    .filter(Boolean);
  for (const c of commits) {
    const diff = sh(`git show ${c} -- app.json`);
    if (/^[+-]\s*"(version|buildNumber|versionCode)"/m.test(diff)) return c;
  }
  return commits[commits.length - 1] || "";
}

const base = findLastBuildCommit();
const baseInfo = base
  ? sh(`git log -1 --format="%h %ad %s" --date=short ${base}`)
  : "(빌드 이력 없음)";
const range = base ? `${base}..HEAD` : "HEAD";

const changed = sh(`git diff --name-only ${range}`)
  .split("\n")
  .filter(Boolean)
  .map(unescapePath);
const uncommitted = sh(`git status --porcelain`)
  .split("\n")
  .filter(Boolean)
  .map((l) => unescapePath(l.slice(3)));
const all = [...new Set([...changed, ...uncommitted])];

// ── 판단 = "무선으로 절대 못 가는 것"이 바뀌었나 ──
const reasons = [];

if (all.includes("package.json")) {
  const d =
    sh(`git diff ${range} -- package.json`) + sh(`git diff -- package.json`);
  // 의존성 줄(이름: "^1.2.3")이 바뀐 것만 = 스크립트만 바뀐 건 제외
  if (/^[+-]\s*"[^"]+":\s*"[~^]?\d/m.test(d)) {
    reasons.push("package.json 에 새 부품(라이브러리)이 추가·변경됨");
  }
}

if (all.includes("app.json")) {
  const d = sh(`git diff ${range} -- app.json`) + sh(`git diff -- app.json`);
  if (
    /^[+-].*(plugins|bundleIdentifier|package|permissions|extraPods|scheme|usesAppleSignIn)/m.test(
      d,
    )
  ) {
    reasons.push("app.json 의 네이티브 설정(플러그인·권한·번들ID)이 바뀜");
  }
  // 번호표가 바뀌면 이미 깔린 앱은 무선 업데이트를 못 받는다 = 다시 구워야 함
  if (/^[+-]\s*"(runtimeVersion|policy)"/m.test(d)) {
    reasons.push(
      "app.json 의 번호표(runtimeVersion)가 바뀜 = 이미 깔린 앱은 무선으로 못 받음",
    );
  }
}

if (all.some((f) => f.startsWith("ios/") || f.startsWith("android/"))) {
  reasons.push("ios/ 또는 android/ 폴더를 직접 고침");
}

const needsRebuild = reasons.length > 0;
const serverChanged = all.some(
  (f) => f.startsWith("server/") || f.startsWith("shared/"),
);

const result = {
  needsRebuild,
  reasons,
  serverChanged, // = Replit 에서 서버 빌드가 필요한 변경이 있었나(사장님 흐름 쪽 참고용)
  base: baseInfo,
  changedCount: all.length,
  uncommittedCount: uncommitted.length,
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

console.log("");
console.log("┌─ 이번에 구워야 하나? ─────────────────────────────");
if (needsRebuild) {
  console.log("│ 🔥 예 — IPA(TF)·APK 를 다시 구워야 합니다");
  for (const r of reasons) console.log(`│   · ${r}`);
} else {
  console.log("│ 🟢 아니오 — 무선 업데이트로 들어갑니다");
  console.log("│   (TF·APK 모두. 앱 껐다 켜기 / APK 는 2번)");
}
console.log("├───────────────────────────────────────────────────");
console.log(`│ 마지막 구운 시점: ${baseInfo}`);
console.log(`│ 그 뒤 바뀐 파일: ${all.length}개`);
if (serverChanged)
  console.log("│ ℹ 서버(server/)도 바뀜 = Replit 쪽에서 반영됨");
console.log("└───────────────────────────────────────────────────");
console.log("");
