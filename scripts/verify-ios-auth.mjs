// ⚠️ 수정금지(승인필요) 2026-07-31 사장님 지시 = **아이폰 소셜 3종(구글·애플·카톡) 설정 검사기.**
import fs from "node:fs";
import path from "node:path";

const IOS_DIR = "ios";

const rows = [];
function check(name, ok, detail) {
  rows.push({ name, ok, detail });
}

function findIosFiles(match) {
  if (!fs.existsSync(IOS_DIR)) return [];
  const found = [];
  const stack = [IOS_DIR];
  while (stack.length) {
    const dir = stack.pop();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "Pods" && e.name !== "build") stack.push(full);
      } else if (match(e.name)) {
        found.push({ path: full, text: fs.readFileSync(full, "utf8") });
      }
    }
  }
  return found;
}

function pickOne(files, label) {
  if (files.length === 1) return files[0];
  if (files.length === 0) return null;
  console.error(
    `⚠️ ${label} 이 ${files.length} 개 발견됨 = 어느 것이 앱 본체인지 알 수 없다:\n   ` +
      files.map((f) => f.path).join("\n   "),
  );
  return null;
}

const plists = findIosFiles((n) => n === "Info.plist");
const entsAll = findIosFiles((n) => n.endsWith(".entitlements"));
const pbxAll = findIosFiles((n) => n === "project.pbxproj");
const appDelegates = findIosFiles(
  (n) => n === "AppDelegate.swift" || n === "AppDelegate.mm",
);

const plist = pickOne(plists, "Info.plist");
const ents = pickOne(entsAll, "entitlements");
const pbx = pickOne(pbxAll, "project.pbxproj");
const appDelegate = pickOne(appDelegates, "AppDelegate");

if (!plist) {
  console.error(
    plists.length === 0
      ? "❌ Info.plist 를 못 찾음 = prebuild 가 안 돌았다."
      : "❌ Info.plist 가 여러 개 = 판단 불가(위 목록 참고).",
  );
  process.exit(1);
}

const EXPECTED_BUNDLE = JSON.parse(fs.readFileSync("app.json", "utf8")).expo.ios
  .bundleIdentifier;
const bundleOk = pbx ? pbx.text.includes(EXPECTED_BUNDLE) : false;
check(
  `번들ID = ${EXPECTED_BUNDLE}`,
  bundleOk,
  bundleOk ? "일치" : "iOS 프로젝트에서 못 찾음",
);

const iosClientId = (process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || "").trim();
const expectedGoogleScheme = iosClientId
  ? "com.googleusercontent.apps." +
    iosClientId.replace(/\.apps\.googleusercontent\.com$/, "")
  : "";
const googleOk =
  !!expectedGoogleScheme && plist.text.includes(expectedGoogleScheme);
check(
  "구글 = 앱으로 돌아오는 문(URL 스킴)",
  googleOk,
  googleOk
    ? expectedGoogleScheme
    : iosClientId
      ? `Info.plist 에 없음 (기대: ${expectedGoogleScheme})`
      : "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID 열쇠가 없음",
);

const googleWebId = (process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || "").trim();
check(
  "구글 = 웹 클라이언트 열쇠(아이폰도 필요)",
  !!googleWebId,
  googleWebId
    ? "있음"
    : "EXPO_PUBLIC_GOOGLE_CLIENT_ID 없음 = 아이폰에서 구글 버튼이 비활성",
);

const appleOk = !!ents && ents.text.includes("com.apple.developer.applesignin");
check(
  "애플 = 로그인 자격(entitlement)",
  appleOk,
  appleOk
    ? "있음"
    : ents
      ? "entitlements 에 applesignin 없음 (app.json 의 usesAppleSignIn 확인)"
      : "entitlements 파일 자체가 없음",
);

const kakaoKey = (process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY || "").trim();
const expectedKakaoScheme = kakaoKey ? `kakao${kakaoKey}` : "";
const kakaoSchemeOk =
  !!expectedKakaoScheme && plist.text.includes(expectedKakaoScheme);
check(
  "카카오 = 앱으로 돌아오는 문(URL 스킴)",
  kakaoSchemeOk,
  kakaoSchemeOk
    ? "kakao<앱키> 있음"
    : kakaoKey
      ? "Info.plist 에 없음"
      : "EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY 열쇠가 없음",
);

const kakaoQueryOk =
  plist.text.includes("LSApplicationQueriesSchemes") &&
  plist.text.includes("kakaokompassauth");
check(
  "카카오 = 카카오톡 실행 조회 권한",
  kakaoQueryOk,
  kakaoQueryOk
    ? "있음"
    : "LSApplicationQueriesSchemes 에 kakaokompassauth 없음",
);

const kakaoHandlerOk = appDelegate
  ? appDelegate.text.includes("RNCKakaoUserUtil.handleOpen") || // Swift
    appDelegate.text.includes("RNCKakaoUserUtil handleOpenUrl") // Objective-C
  : false;
check(
  "카카오 = 돌아온 주소 처리 코드(AppDelegate)",
  kakaoHandlerOk,
  kakaoHandlerOk
    ? `있음 (${appDelegate.path})`
    : appDelegate
      ? `${appDelegate.path} 에 RNCKakaoUserUtil 처리 없음 = 카톡에서 앱으로 못 돌아옴`
      : "AppDelegate 를 못 찾음(또는 여러 개)",
);

console.log("\n=== 아이폰 인증 3종 확인 결과 ===\n");
for (const r of rows) {
  console.log(`${r.ok ? "✅" : "❌"}  ${r.name}\n      ${r.detail}`);
}

const failed = rows.filter((r) => !r.ok);
console.log(`\n통과 ${rows.length - failed.length} / ${rows.length}`);

if (failed.length) {
  console.error("\n실패 항목이 있습니다. 위 내용을 그대로 사장님께 보고할 것.");
  process.exit(1);
}
console.log("\n3종 전부 준비됨 = 아이폰 빌드 가능.");
