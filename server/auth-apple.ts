// ⚠️ 수정금지(승인필요) — 애플 신분증(identityToken) 확인 = 이 함수 1벌만 (2026-07-31 사장님 지시 §16).
//
// 구글·카카오와 확인 방식이 **다른 이유**:
//   구글·카카오는 "이 표 진짜냐?"고 물어볼 창구(주소)가 있어서 우리가 물어보면 답해준다.
//   애플에는 그런 창구가 없다. 대신 애플이 **자기 도장(공개열쇠)** 을 공개해 두었고,
//   우리가 그 도장으로 신분증의 서명이 진짜인지 직접 대조해야 한다.
//   그래서 `jose`(서명 대조 도구)를 쓴다. 이것 말고 다른 방법은 애플이 제공하지 않는다.
//
// 대조하는 것 3가지(하나라도 어긋나면 거부):
//   ① 서명 = 애플이 실제로 발급한 것인가        → 애플 공개열쇠로 검사
//   ② 발급자(iss) = 애플이 맞는가               → https://appleid.apple.com
//   ③ 수신자(aud) = **우리 앱**에게 준 것인가    → APPLE_CLIENT_ID (= 우리 번들ID)
//   ③번이 핵심이다. 이게 없으면 남의 앱에서 받은 애플 신분증으로도 우리 앱에 들어올 수 있다
//   (구글 라우트의 aud 대조, 카카오의 app_id 대조와 같은 목적 = 세 소셜이 같은 원칙 1벌).
import { createRemoteJWKSet, jwtVerify } from "jose";
import fs from "node:fs";
import path from "node:path";

// ⚠️ 수정금지(승인필요) 2026-07-31 = 앱 설정(app.json)에서 번호를 읽는다.
//   ⚠️ **읽는 방법을 함부로 바꾸지 마라.** 실제로 겪은 함정 2개:
//     ① `import ... with { type: "json" }` = 묶는 도구·Node 판에 따라 동작이 갈린다.
//     ② `createRequire(import.meta.url)` = **배포에서 서버가 안 켜진다.**
//        서버는 CommonJS 로 묶여 나가는데 그 형식에는 `import.meta` 가 없어 값이 비고,
//        기동 즉시 터진다(2026-07-31 Node 20 실측 = jose 사고와 같은 종류).
//   그래서 **파일을 그냥 읽는다** = 어떤 형식으로 묶이든 똑같이 동작한다.
const appConfig = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "app.json"), "utf8"),
) as { expo: { ios: { bundleIdentifier: string } } };

// ⚠️ 2026-07-27 §16 = 값 끝의 줄바꿈·공백을 깎는다(카카오 KOE101 사고 근본 = 눈에 안 보이는 글자).
//   요청 시점에 읽는다 = 열쇠가 DB(api_keys)에서 늦게 들어와도 검사가 죽지 않는다(카카오와 동일 이유).
//
// ⚠️ 수정금지(승인필요) 2026-07-31 사장님 SSOT = **애플도 네이티브**(카카오·구글과 같음).
//   네이티브(아이폰이 직접 띄우는 시트)가 주는 신분증의 수신자(aud) = **앱 번들ID**.
//   `.env` 의 APPLE_CLIENT_ID 는 '내손앱' 이 웹으로 쓰던 값(끝이 `.signin`)이라 형태가 다르다.
//   둘 다 같은 애플 계정(Team) 것이므로 **둘 다 우리 것으로 인정**한다.
//   (env 값이 번들ID 로 바뀌어도 그대로 동작 = 나중에 갈아끼워도 코드 안 건드림)
// ⚠️ 2026-07-31 사장님 결정 = **'내손앱' 과 같은 번호를 쓴다**(`com.sonanie.guide`).
//   이유: 그 번호는 애플·구글·카카오 콘솔에 **이미 등록돼 있다**(내손앱이 그걸로 돌고 있음)
//   = 콘솔에 새로 등록할 것이 없다. 지금은 사장님 폰에서 로그인만 확인하는 단계이고,
//   사장님 폰의 앱만 덮인다(다른 아이폰의 내손앱은 그대로) = 사장님이 명시 승인.
//   ⚠️ **안드로이드 `package` 는 이 값으로 바꾸지 마라** = 2026-07-28 카카오 앱 로그인 성공이 거기 묶여 있다.
//
// ⚠️ 수정금지(승인필요) 2026-07-31 §16 = 번호를 **여기 적지 않고 `app.json` 에서 읽는다.**
//   사유: 같은 번호를 서버·app.json·검사기 세 곳에 각각 적어두면, 나중에 한 곳만 바꿨을 때
//   애플 로그인이 **아무 말 없이 401 로 죽는다**(글로 "같아야 함"이라 적어두는 것으로는 못 막는다 §19).
//   이제 출처는 `app.json` 1곳뿐 = 거기만 바꾸면 서버도 검사기도 자동으로 따라온다.
const APPLE_BUNDLE_ID: string = appConfig.expo.ios.bundleIdentifier;

function getAppleAudiences(): string[] {
  const fromEnv = (process.env.APPLE_CLIENT_ID || "").trim();
  // 번들ID 는 항상 인정(네이티브 경로). env 값이 따로 있으면 그것도 인정.
  return fromEnv && fromEnv !== APPLE_BUNDLE_ID
    ? [APPLE_BUNDLE_ID, fromEnv]
    : [APPLE_BUNDLE_ID];
}

const APPLE_ISSUER = "https://appleid.apple.com";

// 애플 공개열쇠 꾸러미. 한 번 만들어 두고 계속 쓴다(jose 가 알아서 받아오고 일정 시간 보관).
// 매 요청마다 새로 만들면 애플에 쓸데없이 계속 물어보게 된다.
const appleKeys = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys"),
);

export type AppleIdentity = {
  /** 애플이 정한 그 사람의 고유번호(sub). 우리 DB 의 provider_id 가 된다. */
  providerId: string;
  email?: string;
  emailVerified: boolean;
};

/**
 * 애플 신분증을 확인해 "누구인지"를 돌려준다.
 * 확인 실패(가짜·만료·다른 앱 것) = **null 반환**, 호출자가 401 응답 (카카오와 같은 형식).
 */
export async function verifyAppleIdentityToken(
  identityToken: string,
): Promise<AppleIdentity | null> {
  try {
    const { payload } = await jwtVerify(identityToken, appleKeys, {
      issuer: APPLE_ISSUER,
      // ③ 우리 것인가 = 남의 앱 신분증 거부. 번들ID(네이티브) 를 항상 인정한다.
      audience: getAppleAudiences(),
    });

    const providerId = String(payload.sub || "");
    if (!providerId) {
      console.error("[Auth] 애플 신분증에 sub 없음 = 거부");
      return null;
    }

    // 애플은 이 값을 문자열 "true" 로 줄 때가 있다(구글 tokeninfo 와 같은 습성).
    const emailVerified =
      payload.email_verified === true || payload.email_verified === "true";

    return {
      providerId,
      email: typeof payload.email === "string" ? payload.email : undefined,
      emailVerified,
    };
  } catch (e) {
    // 서명 불일치·만료·수신자 불일치 전부 여기로 온다 = 전부 "가짜 취급"이 맞다.
    console.error("[Auth] 애플 신분증 확인 실패:", (e as Error).message);
    return null;
  }
}
