// ⚠️ 수정금지(승인필요) 2026-07-31 사장님 지시 = **아이폰 소셜 3종(구글·애플·카톡) 설정 검사기.**
//
// 무엇을 하나
//   `expo prebuild` 가 만든 iOS 설정 파일(Info.plist·entitlements)을 열어,
//   구글·애플·카카오가 **아이폰에서 실제로 동작할 조건**을 갖췄는지 하나씩 확인한다.
//   하나라도 어긋나면 **실패로 끝낸다**(조용한 실패 금지 §0).
//
// 왜 필요한가
//   iOS 설정 생성은 **맥·리눅스에서만** 된다. 사장님 PC(윈도우)에서는 확인 자체가 불가능하다.
//   그래서 리눅스에서 도는 GitHub 작업(.github/workflows/ios-auth-verify.yml)이 이 검사기를 부른다.
//   빌드를 굽지 않고도 "3종이 준비됐는가"를 사실로 확인할 수 있다.
//
// 1회용 아님 = 상시 도구(§16). 열쇠가 바뀌거나 아이폰 로그인이 안 되면 여기서 먼저 원인을 본다.
import fs from "node:fs";
import path from "node:path";

const IOS_DIR = "ios";

/** 검사 결과를 모아 마지막에 표로 보여준다. */
const rows = [];
function check(name, ok, detail) {
  rows.push({ name, ok, detail });
}

/**
 * iOS 폴더에서 조건에 맞는 파일을 **전부** 찾는다.
 * ⚠️ 2026-07-31 = 옛것(먼저 찾은 1개만 반환) 삭제 §19.
 *   사유: 폴더를 훑는 순서가 컴퓨터마다 달라, 앱 본체가 아닌 **엉뚱한 파일**을 볼 수 있었다.
 *   그러면 검사가 조용히 거짓말을 한다(통과인데 실제로는 안 되거나, 그 반대).
 *   이제 전부 찾아서 **2개 이상이면 실패**시킨다 = 애매하면 멈춘다(§0 조용한 실패 금지).
 */
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

/** 딱 1개여야 하는 파일을 집는다. 0개·2개 이상이면 사유와 함께 null. */
function pickOne(files, label) {
  if (files.length === 1) return files[0];
  if (files.length === 0) return null;
  console.error(
    `⚠️ ${label} 이 ${files.length} 개 발견됨 = 어느 것이 앱 본체인지 알 수 없다:\n   ` +
      files.map((f) => f.path).join("\n   "),
  );
  return null;
}

// 앱 본체의 Info.plist = 정확히 그 이름인 파일만(다른 이름이 섞이는 것 차단)
const plists = findIosFiles((n) => n === "Info.plist");
const entsAll = findIosFiles((n) => n.endsWith(".entitlements"));
const pbxAll = findIosFiles((n) => n === "project.pbxproj");
// AppDelegate = 카카오가 "돌아온 주소를 실제로 처리하는 코드"를 심는 곳
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

// ── 공통: 번들ID ────────────────────────────────────────────────
// 아이폰 앱을 구분하는 번호. 애플·구글·카카오 콘솔에 등록된 값과 같아야 한다.
// ⚠️ 2026-07-31 §16 = 번호를 여기 적지 않고 **`app.json` 에서 읽는다**(서버 auth-apple.ts 와 같은 출처 1벌).
//   따로 적어두면 한 곳만 바꿨을 때 검사는 통과하는데 실제 로그인은 죽는다.
const EXPECTED_BUNDLE = JSON.parse(fs.readFileSync("app.json", "utf8")).expo.ios
  .bundleIdentifier;
const bundleOk = pbx ? pbx.text.includes(EXPECTED_BUNDLE) : false;
check(
  `번들ID = ${EXPECTED_BUNDLE}`,
  bundleOk,
  bundleOk ? "일치" : "iOS 프로젝트에서 못 찾음",
);

// ── ① 구글 ────────────────────────────────────────────────────
// 구글 창에서 우리 앱으로 **돌아오는 문**(URL 스킴)이 있어야 한다. 없으면 로그인 후 앱으로 복귀 못 함.
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

// ⚠️ 2026-07-31 추가 = **웹 클라이언트 ID 도 반드시 있어야 아이폰 구글 버튼이 열린다.**
//   근거: client/lib/auth-google.ts 의 isGoogleOAuthConfigured() 가 iOS 에서 **두 개 다** 요구한다.
//   이게 비면 = 위 URL 스킴은 멀쩡해서 검사는 통과하는데, 실기기에서는 **버튼이 죽어 있다**(빈 통과).
const googleWebId = (process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || "").trim();
check(
  "구글 = 웹 클라이언트 열쇠(아이폰도 필요)",
  !!googleWebId,
  googleWebId
    ? "있음"
    : "EXPO_PUBLIC_GOOGLE_CLIENT_ID 없음 = 아이폰에서 구글 버튼이 비활성",
);

// ── ② 애플 ────────────────────────────────────────────────────
// 애플은 **자격(entitlement)** 이 있어야 시트가 뜬다. 이게 없으면 버튼을 눌러도 아무 일이 안 난다.
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

// ── ③ 카카오 ──────────────────────────────────────────────────
// (a) 카카오톡에서 우리 앱으로 돌아오는 문 = kakao{네이티브앱키}
// (b) 카카오톡이 깔려 있는지 물어볼 수 있는 권한 = LSApplicationQueriesSchemes
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

// ⚠️ 2026-07-31 추가 = **돌아온 주소를 실제로 처리하는 코드**가 앱에 들어갔는지.
//   위 두 항목(스킴·조회권한)은 "카카오톡이 우리 앱을 깨울 수 있는가"까지만 보장한다.
//   깨어난 뒤 그 주소를 카카오 부품에 넘기는 코드가 없으면 = **로그인 화면에서 영영 안 돌아온다.**
//   이 코드는 카카오 플러그인이 AppDelegate 안의 함수를 **글자로 찾아 끼워 넣는** 방식이라,
//   Expo 가 그 파일 모양을 바꾸면 **아무 말 없이 안 끼워진다** = 그래서 결과를 직접 확인해야 한다.
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

// ── 결과 ──────────────────────────────────────────────────────
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
