#!/usr/bin/env node
// ⚠️ 수정금지(승인필요) 2026-08-01 사장님 지시 = "이번엔 구워야 하나?" **한 가지만** 판단한다.

import { execSync } from "node:child_process";

//   ⚠️ 2026-08-06 사장님 지적 = 옛 "의존성 줄 변경 = 무조건 굽기" 오판 폐기 §19(실측: @aws-sdk·dotenv = 서버 전용인데 굽기로 오판).
import { existsSync, readFileSync } from "node:fs";

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
  if (/react-native|^expo$|^expo-|^@expo\//.test(name)) return true;
  const dir = `node_modules/${name}`;
  if (!existsSync(dir)) return true;
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
      infoNotes.push(
        `부품 '${n}' = 서버/JS 전용(네이티브 코드 없음) = 무선 OK`,
      );
    }
  }
}

if (all.includes("app.json")) {
  // ⚠️ 수정금지(승인필요) 2026-08-10 사장님 지시 = **--cached(스테이징) 도 봐야 한다.**
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
  // ⚠️ 수정금지(승인필요) 2026-08-30 재확인(원결정 2026-08-10) = 플러그인 "안쪽" 값이 바뀐 것도 잡는다.
  if (
    /^[+-]\s*"(image|imageWidth|resizeMode|backgroundColor|dark|icon|adaptiveIcon|splash|foregroundImage|monochromeImage|backgroundImage)"/m.test(
      d,
    )
  )
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

// ⚠️ 수정금지(승인필요) 2026-08-19 사장님 지시 = **이미지 파일 내용 변경(경로는 그대로)도 잡는다.**
function collectIconSplashImagePaths(cfg) {
  const paths = new Set();
  const add = (p) => {
    if (typeof p === "string" && p) paths.add(p.replace(/^\.\//, ""));
  };
  const expo = cfg?.expo || {};
  add(expo.icon);
  add(expo.web?.favicon);
  add(expo.android?.adaptiveIcon?.foregroundImage);
  add(expo.android?.adaptiveIcon?.backgroundImage);
  add(expo.android?.adaptiveIcon?.monochromeImage);
  add(expo.ios?.icon);
  for (const p of expo.plugins || []) {
    if (!Array.isArray(p) || p[0] !== "expo-splash-screen") continue;
    const conf = p[1] || {};
    const collectSplash = (s) => {
      if (!s) return;
      add(s.image);
      add(s.dark?.image);
    };
    collectSplash(conf); // 옛(레거시) 최상위 형태
    collectSplash(conf.ios);
    collectSplash(conf.android);
  }
  return paths;
}
const iconSplashPaths = collectIconSplashImagePaths(appJson);
const changedIconSplashFiles = all.filter((f) => iconSplashPaths.has(f));
if (changedIconSplashFiles.length > 0) {
  both(
    `아이콘·스플래시 이미지 파일 내용 변경(경로 그대로라 app.json 검사로는 안 잡힘) = ${changedIconSplashFiles.join(", ")}`,
  );
}

const needsIos = iosReasons.length > 0;
const needsAndroid = andReasons.length > 0;
const needsRebuild = needsIos || needsAndroid;

// ⚠️ 수정금지(승인필요) 2026-08-19 사장님 지시 = **굽어야 하는데 버전번호를 안 올렸으면 반드시 경고한다.**
const versionWarnings = [];
if (needsRebuild && base) {
  let baseAppJson = {};
  try {
    baseAppJson = JSON.parse(sh(`git show ${base}:app.json`));
  } catch {}
  const baseBuildNumber = String(baseAppJson?.expo?.ios?.buildNumber ?? "");
  const curBuildNumber = String(appJson?.expo?.ios?.buildNumber ?? "");
  const baseVersionCode = baseAppJson?.expo?.android?.versionCode ?? null;
  const curVersionCode = appJson?.expo?.android?.versionCode ?? null;
  if (needsIos && baseBuildNumber === curBuildNumber) {
    versionWarnings.push(
      `⚠️⚠️ iOS buildNumber 가 마지막 빌드(${baseBuildNumber})와 그대로(${curBuildNumber}) — 굽기 전 반드시 올릴 것(TestFlight 재업로드 거부됨)`,
    );
  }
  if (needsAndroid && baseVersionCode === curVersionCode) {
    versionWarnings.push(
      `⚠️⚠️ Android versionCode 가 마지막 빌드(${baseVersionCode})와 그대로(${curVersionCode}) — 굽기 전 반드시 올릴 것(Play 콘솔 "버전 코드는 이미 사용됨" 거부됨, 2026-08-19 실제 사고 재발 방지)`,
    );
  }
}
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
  versionWarnings, // 굽기 필요인데 버전번호(buildNumber/versionCode) 안 올린 경우 경고
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
if (versionWarnings.length > 0) {
  console.log("├───────────────────────────────────────────────────");
  for (const w of versionWarnings) console.log(`│ ${w}`);
}
console.log("├───────────────────────────────────────────────────");
console.log(`│ 마지막 구운 시점: ${baseInfo}`);
console.log(`│ 그 뒤 바뀐 파일: ${all.length}개`);
if (serverChanged)
  console.log("│ ℹ 서버(server/)도 바뀜 = Replit 쪽에서 반영됨");
console.log("└───────────────────────────────────────────────────");
console.log("");
