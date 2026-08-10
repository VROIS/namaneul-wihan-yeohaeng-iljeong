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

// ── 판단 = "무선으로 절대 못 가는 것"이 바뀌었나 = IPA(아이폰)·APK(삼성) **각각** 판정 ──
//   ⚠️ 2026-08-06 사장님 지적 = 옛 "의존성 줄 변경 = 무조건 굽기" 오판 폐기 §19(실측: @aws-sdk·dotenv = 서버 전용인데 굽기로 오판).
//   새 기준 = 그 라이브러리가 **실제로 네이티브 부품인가**: ①node_modules/<이름>/ios|android 네이티브 코드 실존 ②app.json plugins 등재 ③이름이 expo-*/react-native-* 계열인데 미설치(실물 확인 불가) = 보수적으로 굽기.
import { existsSync, readFileSync } from "node:fs";

const iosReasons = []; // IPA(아이폰 TF)를 구워야 하는 사유
const andReasons = []; // APK(삼성)를 구워야 하는 사유
const both = (msg) => {
  iosReasons.push(msg);
  andReasons.push(msg);
};
const infoNotes = []; // 굽기 불필요지만 알아둘 것(서버 전용 부품 등)

let pkgJson = {};
let appJson = {};
try {
  pkgJson = JSON.parse(readFileSync("package.json", "utf8"));
} catch {}
try {
  appJson = JSON.parse(readFileSync("app.json", "utf8"));
} catch {}
const devDeps = new Set(Object.keys(pkgJson.devDependencies || {}));
const pluginNames = (appJson?.expo?.plugins || []).map((p) =>
  Array.isArray(p) ? String(p[0]) : String(p),
);

function isNativeLib(name) {
  // ① 이름에 react-native/expo 계열이 포함 = **설치 여부 무관** 네이티브 취급.
  //    (§22 판단검증 적발 2026-08-06: RN 코어는 node_modules/react-native 에 ios/·android/ 폴더 없이 배포 = 폴더 검사만으론 "무선 OK" 오판 = OTA 크래시 경로.
  //     @stripe/stripe-react-native 같은 스코프 이름도 이 포함 검사로 잡힘.)
  if (/react-native|^expo$|^expo-|^@expo\//.test(name)) return true;
  const dir = `node_modules/${name}`;
  // ② 미설치 = 실물 확인 불가 = **보수적으로 굽기**(안전한 쪽으로만 틀리게)
  if (!existsSync(dir)) return true;
  // ③ 네이티브 코드 실존 or config plugin 등재
  if (existsSync(`${dir}/ios`) || existsSync(`${dir}/android`)) return true;
  if (pluginNames.some((p) => p === name || p.startsWith(name + "/")))
    return true;
  return false;
}

if (all.includes("package.json")) {
  const d =
    sh(`git diff ${range} -- package.json`) +
    sh(`git diff -- package.json`) +
    sh(`git diff --cached -- package.json`); // 스테이징도 봄(2026-08-10 빈틈 메움)
  // 바뀐 의존성 이름 추출(스크립트 줄 제외 = 값이 버전 형태인 줄만)
  const names = [
    ...new Set(
      [...d.matchAll(/^[+-]\s*"([^"]+)":\s*"[~^]?\d[^"]*"/gm)].map((m) => m[1]),
    ),
  ];
  for (const n of names) {
    if (devDeps.has(n)) {
      infoNotes.push(`부품 '${n}' = 개발 도구(devDependencies) = 앱과 무관`);
    } else if (isNativeLib(n)) {
      both(`네이티브 부품 '${n}' 추가·변경 = 무선으로 못 감`);
    } else {
      infoNotes.push(`부품 '${n}' = 서버/JS 전용(네이티브 코드 없음) = 무선 OK`);
    }
  }
}

if (all.includes("app.json")) {
  // ⚠️ 수정금지(승인필요) 2026-08-10 사장님 지시 = **--cached(스테이징) 도 봐야 한다.**
  //   빈틈 실증 = 2026-08-10 시작 그림 변경을 git add 로 담아 둔 상태에서 이 도구가 "굽기 불필요"로 오판했다.
  //   파일 목록(git status)은 스테이징을 보는데 정작 내용(git diff)은 안 봐서, 바뀐 줄이 하나도 안 잡혔다.
  const d =
    sh(`git diff ${range} -- app.json`) +
    sh(`git diff -- app.json`) +
    sh(`git diff --cached -- app.json`);
  if (/^[+-].*(bundleIdentifier|usesAppleSignIn|extraPods|infoPlist)/m.test(d))
    iosReasons.push("app.json 아이폰 설정(번들ID·애플로그인·Info) 변경");
  if (/^[+-].*("package"|permissions|intentFilters)/m.test(d))
    andReasons.push("app.json 안드로이드 설정(패키지·권한) 변경");
  if (/^[+-].*(plugins|scheme)/m.test(d))
    both("app.json 공통 네이티브 설정(플러그인·scheme) 변경");
  // ⚠️ 수정금지(승인필요) 2026-08-10 사장님 지시 = **플러그인 "안쪽" 값이 바뀐 것도 잡는다.**
  //   빈틈 실증 = 2026-08-10 시작 그림(expo-splash-screen 의 image·backgroundColor·dark)을 바꿨는데
  //   위 규칙은 'plugins' 라는 **글자가 그 줄에 있어야** 잡으므로 통째로 놓쳤다("불필요"로 오판).
  //   시작 그림·아이콘은 굽는 순간 앱에 박히는 값 = 무선으로 절대 안 바뀐다 = 놓치면 실기기에서 옛 그림이 남는다.
  if (/^[+-]\s*"(image|imageWidth|resizeMode|backgroundColor|dark|icon|adaptiveIcon|splash|foregroundImage|monochromeImage|backgroundImage)"/m.test(d))
    both("app.json 시작그림·아이콘 설정 변경 = 굽는 순간 박히는 값(무선 불가)");
  if (/^[+-]\s*"(runtimeVersion|policy)"/m.test(d))
    both("번호표(runtimeVersion) 변경 = 이미 깔린 앱은 무선으로 못 받음");
}

if (all.some((f) => f.startsWith("ios/")))
  iosReasons.push("ios/ 폴더 직접 수정");
if (all.some((f) => f.startsWith("android/")))
  andReasons.push("android/ 폴더 직접 수정");
if (all.some((f) => f.startsWith("plugins/")))
  both("plugins/(네이티브 설정 플러그인) 수정");

const needsIos = iosReasons.length > 0;
const needsAndroid = andReasons.length > 0;
const needsRebuild = needsIos || needsAndroid;
const serverChanged = all.some(
  (f) => f.startsWith("server/") || f.startsWith("shared/"),
);

const result = {
  needsRebuild,
  needsIos, // IPA(아이폰 TF)
  needsAndroid, // APK(삼성)
  iosReasons,
  androidReasons: andReasons,
  infoNotes,
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
console.log("┌─ 이번에 구워야 하나? (IPA·APK 각각) ──────────────");
console.log(
  needsIos
    ? "│ 🔥 IPA(아이폰 TF) = 다시 구워야 함"
    : "│ 🟢 IPA(아이폰 TF) = 불필요(무선 업데이트로 들어감)",
);
for (const r of iosReasons) console.log(`│     · ${r}`);
console.log(
  needsAndroid
    ? "│ 🔥 APK(삼성)      = 다시 구워야 함"
    : "│ 🟢 APK(삼성)      = 불필요(무선 업데이트로 들어감)",
);
for (const r of andReasons) console.log(`│     · ${r}`);
for (const n of infoNotes) console.log(`│ ℹ ${n}`);
console.log("├───────────────────────────────────────────────────");
console.log(`│ 마지막 구운 시점: ${baseInfo}`);
console.log(`│ 그 뒤 바뀐 파일: ${all.length}개`);
if (serverChanged)
  console.log("│ ℹ 서버(server/)도 바뀜 = Replit 쪽에서 반영됨");
console.log("└───────────────────────────────────────────────────");
console.log("");
