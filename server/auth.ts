import type { Express } from "express";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "crypto";
import { storage } from "./storage";
import type { User } from "@shared/schema";

const GOOGLE_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ||
  process.env.GOOGLE_CLIENT_ID ||
  "";

// ⚠️ 사장님 SSOT 2026-07-26 = 소셜별 닉네임 기본문구(카카오/구글이 이름 안 줄 때 fallback) = 1벌 상수(§0·§16).
//   재로그인 displayName 갱신 가드가 이 집합과 비교 = 정의부·가드가 같은 소스 참조(따로 하드코딩 시 한쪽만 바뀌면 가드 조용히 깨짐 = simplify 지적).
const KAKAO_DEFAULT_NAME = "카카오 사용자";
const GOOGLE_DEFAULT_NAME = "Google User";
const SOCIAL_DEFAULT_NAMES = new Set([KAKAO_DEFAULT_NAME, GOOGLE_DEFAULT_NAME]);

/**
 * ⚠️ 수정금지(승인필요) — 로그인 성공 시 기존 계정에 반영하는 단 하나의 함수 (2026-07-26 §16 1벌).
 *   사장님 SSOT: 이메일도 "지메일이 아닌 다른 메일로 하는 정식 인증" = 소셜과 동일 취급 =
 *   생년월일 저장·로그인 기록 갱신을 우회하면 안 됨. 그래서 소셜(findOrCreateUser)·이메일이 이 함수 1벌을 공유.
 *   - birthDate = 이번 로그인에서 온 값이 있으면 갱신, 없으면 기존값 유지(파괴 금지).
 *   - displayName = 진짜 이름일 때만 덮음("카카오 사용자"/"Google User" 기본문구로는 안 덮음 = 좋은 이름 보존).
 */
async function applyLogin(
  user: User,
  opts: {
    birthDate?: string;
    language?: string;
    deviceType?: string;
    displayName?: string;
  },
): Promise<User> {
  const isRealName =
    !!opts.displayName && !SOCIAL_DEFAULT_NAMES.has(opts.displayName);
  return (await storage.updateUserLogin(user.id, {
    lastLoginAt: new Date(),
    loginCount: (user.loginCount || 0) + 1,
    deviceType: opts.deviceType,
    preferredLanguage: opts.language || user.preferredLanguage,
    birthDate: opts.birthDate || user.birthDate,
    ...(isRealName ? { displayName: opts.displayName } : {}),
  }))!;
}

/**
 * 사용자 조회/생성 = ⚠️ 사장님 SSOT 2026-07-25 = **오직 provider+providerId(소셜 인증 신원)로만** 기존 계정 매칭.
 *   birthDate 는 매칭 키가 아니라 신규 생성 시 저장·성인확인용. "2가지(생년월일+소셜인증) 다 충족" = 소셜 신원이 일치하는 그 사람일 때만 기존 계정.
 *   ⚠️ 옛 2단계(birthDate 단독 매칭 → provider 연결) 완전삭제 §19 = 근본버그(남이 같은 생년월일 넣으면 남 계정에 붙음)의 원인. birthDate=비번대체지만 "매칭 단독키"로는 절대 안 씀.
 */
async function findOrCreateUser(params: {
  provider: string;
  providerId: string;
  birthDate?: string; // ⚠️ 2026-07-26(세션2-D) = 외부인증에서 분리 = 선택적. 있으면 저장/갱신, 없으면 null(신규)·기존값 유지.
  displayName: string;
  language?: string;
  deviceType?: string;
}): Promise<User> {
  const { provider, providerId, birthDate, displayName, language, deviceType } =
    params;

  // 1) provider+providerId(소셜 인증 신원)로만 조회 = 그 사람일 때만 기존 계정 매칭.
  const user = await storage.getUserByProvider(provider, providerId);
  if (user)
    return applyLogin(user, { birthDate, language, deviceType, displayName });

  // 2) 신규 사용자 생성 (birthDate = 저장·성인확인용으로만 사용, 매칭 키 아님).
  const username = `${provider}_${providerId.substring(0, 12)}_${Math.random().toString(36).substring(2, 6)}`;
  return storage.createUser({
    username,
    password: "social_login_no_password",
    displayName,
    provider,
    providerId,
    birthDate,
    preferredLanguage: language || "ko",
    deviceType,
    loginCount: 1,
    lastLoginAt: new Date(),
    isPaid: false,
    planType: "free",
  });
}

// ⚠️ 사장님 SSOT 2026-07-15 = 모든 로그인 응답의 user 객체 = 이 함수 1벌만(§0.3·§16). 옛 5곳 제각각(name·email 누락 → 프로필 빈칸 / google·kakao 는 role 까지 누락) 폐기 §19.
//   클라 UserData(client/lib/auth.ts) 와 필드 일치 = 프로필 이름·이메일 표시 + role 로 전문가/관리자 분기.
function toClientUser(user: User) {
  return {
    id: user.id,
    name: user.displayName, // 프로필 표시명(ProfileScreen 이 읽는 필드)
    email: user.email, // 프로필 이메일
    username: user.username,
    displayName: user.displayName,
    provider: user.provider,
    birthDate: user.birthDate,
    language: user.preferredLanguage,
    isPaid: user.isPaid,
    planType: user.planType,
    role: user.role, // 사용자/전문가/관리자 분기
  };
}

// ⚠️ 수정금지(승인필요) — 카카오 accessToken → 우리 로그인 = 이 함수 1벌만 (2026-07-26 §16).
//   웹(브라우저가 토큰 교환)·앱(서버가 code 로 교환) 두 경로가 이 함수를 공유 = 처리 두 벌 방지.
//   실패(토큰 무효) = null 반환, 호출자가 401 응답.
async function loginWithKakaoAccessToken(params: {
  accessToken: string;
  birthDate?: string;
  language?: string;
  deviceType?: string;
}) {
  const meRes = await fetch("https://kapi.kakao.com/v2/user/me", {
    headers: { Authorization: `Bearer ${params.accessToken}` },
  });
  if (!meRes.ok) {
    console.error("[Auth] Kakao /v2/user/me failed:", await meRes.text());
    return null;
  }
  const meData = await meRes.json();
  const providerId = String(meData.id ?? meData.kakao_account?.id);
  const displayName =
    meData.kakao_account?.profile?.nickname ||
    meData.kakao_account?.profile?.name ||
    meData.properties?.nickname ||
    KAKAO_DEFAULT_NAME;
  const user = await findOrCreateUser({
    provider: "kakao",
    providerId,
    birthDate: params.birthDate,
    displayName,
    language: params.language,
    deviceType: params.deviceType,
  });
  return {
    success: true as const,
    user: toClientUser(user),
    token: "simple_auth_token_v1_" + user.id,
  };
}

// ⚠️ 수정금지(승인필요) — 앱(iOS·Android) 카카오 로그인용 서버 설정 (2026-07-26).
//   '내손앱'이 실제로 쓰는 방식(REST API 키 + 리다이렉트 콜백)을 그대로 씀.
//   앱 네이티브 SDK 방식은 카카오가 네이티브 앱 키를 거부(KOE101)해서 폐기 = 2026-07-26 §19.
// ⚠️ 이름은 웹 클라이언트(client/lib/auth-kakao.ts)와 **같은 것 1벌**을 씀(§0 값 1벌).
//   서버 전용 새 이름을 만들면 같은 키가 이름 2개로 갈라지고, 운영에 그 이름이 없어 500 이 남(§22 검증이 잡음).
const KAKAO_REST_API_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY || "";
const KAKAO_CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET || "";
/** 키가 없을 때 사람이 바로 알아볼 안내 = 1벌(§16) */
const KAKAO_KEY_MISSING =
  "카카오 REST API 키가 서버에 없습니다(EXPO_PUBLIC_KAKAO_REST_API_KEY)";

/**
 * ⚠️ 수정금지(승인필요) — 앱 로그인 도중 오가는 값을 **우리 서버만 열 수 있게 봉하는** 함수 1벌 (2026-07-26 §16).
 *
 * 왜 필요한가: 앱이 결과를 돌려받는 주소(`vibetrip://`)는 안드로이드에서 독점이 아니다.
 *   나쁜 앱이 같은 주소를 등록해 두면 오가는 값을 가로챌 수 있고,
 *   카카오가 준 1회용 인가코드가 그대로 노출되면 **남의 계정을 차지**할 수 있다.
 *
 * 어떻게 막나(두 겹):
 *   ① 인가코드를 앱에 **그대로 넘기지 않는다.** 봉한 표(ticket)로 바꿔 넘기므로 가로채도 코드를 읽지 못한다.
 *   ② 앱이 이번 시도에만 쓰는 무작위값(nonce)을 만들어 **앱 안에만 두고**, 그 지문만 봉투 안에 넣는다.
 *      마지막에 서버가 원본 무작위값을 요구하므로, 표를 가로챈 쪽은 그것이 없어 쓰지 못한다.
 *
 * 왜 서명이 아니라 봉함(암호화)인가: 서명만 하면 안을 읽을 수 있어, 가로챈 쪽이 코드를 꺼내
 *   자기 지문으로 표를 새로 받아갈 수 있다(§22 검증이 잡은 실제 우회 경로). 그래서 읽지도 못하게 봉한다.
 *
 * 왜 표준(PKCE)을 안 쓰나: 카카오 공식 REST 문서(2026-07-26 확인)에 `code_challenge` 계열이 없다.
 *
 * 열쇠 = 이 서버만 아는 값에서 파생(사장님이 새로 등록할 것 없음).
 *   카카오 클라이언트 시크릿을 쓰지 않는 이유 = 그 값은 콘솔에서 꺼져 있을 수 있고,
 *   그것에 묶으면 지금 잘 도는 웹 로그인까지 끌려가 깨진다(§2·§22 검증 지적).
 * 왜 저장소를 안 쓰나: 봉투 자체로 검증되므로 서버가 아무것도 기억할 필요가 없다
 *   (Replit 은 개발용·배포용 프로세스가 갈릴 수 있어, 메모리에 담아두면 한쪽에서만 통한다).
 */
const KAKAO_APP_TTL_MS = 10 * 60 * 1000; // 10분 = 카카오 인가코드 유효시간과 맞춤
/** ⚠️ 열쇠 재료 = `server/db.ts` 와 **똑같은 소스 1벌**(§16). 이름이 갈리면 한쪽만 비어도 조용히 약해짐.
 *  없으면 열쇠를 만들지 않고 **아예 잠가버림**(약한 고정 열쇠로 조용히 내려가지 않음 = §0 폴백 금지). */
const APP_SEAL_KEY =
  process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL
    ? createHmac(
        "sha256",
        process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL!,
      )
        .update("kakao-app-seal-v1")
        .digest()
    : null;
const SEAL_KEY_MISSING =
  "서버에 DB 주소가 없어 앱 로그인 잠금을 만들 수 없습니다(SUPABASE_DATABASE_URL)";

function seal(data: Record<string, string>, now: number): string {
  if (!APP_SEAL_KEY) throw new Error(SEAL_KEY_MISSING);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", APP_SEAL_KEY, iv);
  const body = Buffer.concat([
    cipher.update(
      JSON.stringify({ ...data, exp: now + KAKAO_APP_TTL_MS }),
      "utf8",
    ),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/** 우리가 봉한 것이 맞고 유효기간도 남았으면 내용을 돌려주고, 아니면 null */
function unseal<T>(sealed: unknown, now: number): T | null {
  if (!APP_SEAL_KEY) return null; // 열쇠가 없으면 아무것도 못 엶 = 잠김(fail-closed)
  try {
    const raw = Buffer.from(String(sealed ?? ""), "base64url");
    if (raw.length <= 28) return null; // iv(12) + 인증표(16)
    const decipher = createDecipheriv(
      "aes-256-gcm",
      APP_SEAL_KEY,
      raw.subarray(0, 12),
    );
    decipher.setAuthTag(raw.subarray(12, 28));
    const json = JSON.parse(
      Buffer.concat([
        decipher.update(raw.subarray(28)),
        decipher.final(),
      ]).toString("utf8"),
    );
    return typeof json?.exp === "number" && now <= json.exp
      ? (json as T)
      : null;
  } catch {
    return null; // 위조·변조·만료 = 전부 여기로
  }
}
/**
 * 카카오 콘솔(REST API 키 > 카카오 로그인 리다이렉트 URI)에 등록된 값과 **문자 하나까지** 같아야 함.
 * 다르면 카카오가 거부(KOE006). 그래서 환경변수로 조립하지 않고 **고정값 1벌**로 둔다.
 *   - 환경변수 조립 방식 폐기 = 2026-07-26 §19: EXPO_PUBLIC_DOMAIN 에 옛 Koyeb 주소가 남아 있어
 *     콘솔 등록값과 다른 주소가 나가는 것을 내부 테스트에서 확인.
 *   - 도메인을 바꾸려면 이 값과 카카오 콘솔 등록값을 **함께** 바꿔야 한다.
 */
const KAKAO_APP_REDIRECT_URI =
  "https://my-guide.replit.app/api/auth/kakao/callback";
/** 브라우저 창을 닫고 앱으로 돌아오는 주소.
 *  ⚠️ 같은 값이 `client/lib/auth-kakao.ts` · `app.json` 의 `scheme` 에도 있음(앱↔서버 경계라 한 파일로 못 묶음).
 *     **셋을 항상 함께** 바꿀 것 — 한쪽만 바꾸면 조용히 로그인 실패. */
const KAKAO_APP_RETURN_SCHEME = "vibetrip://kakao-auth";

// WhatsApp OTP: 일시정지 시 비활성화 (출시 전 WHATSAPP_OTP_ENABLED=false)
const WHATSAPP_OTP_ENABLED = process.env.WHATSAPP_OTP_ENABLED === "true";
const otpStore = new Map<string, { otp: string; expiresAt: number }>();
const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5분

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("82")) return "+" + digits;
  if (digits.startsWith("0")) return "+82" + digits.slice(1);
  return "+82" + digits;
}

export function registerAuthRoutes(app: Express) {
  // Google OAuth: id_token 검증 후 사용자 생성/업데이트
  app.post("/api/auth/google", async (req, res) => {
    try {
      const { idToken, birthDate, language, deviceType } = req.body;
      // ⚠️ 사장님 SSOT 2026-07-26(세션2-D) = 외부인증에서 생년월일 분리 = idToken(인증 신원)만 필수.
      //   생년월일은 클라 게이트(입력해야 인증버튼 작동)로 항상 딸려오되, 서버 필수검사에선 뺌 = 인증은 인증만. birthDate 있으면 findOrCreateUser 가 저장/갱신(신규 생성 / 기존 통과).
      if (!idToken) {
        return res.status(400).json({
          success: false,
          error: "idToken is required",
        });
      }
      const tokenRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
      );
      if (!tokenRes.ok) {
        return res
          .status(401)
          .json({ success: false, error: "Invalid Google token" });
      }
      const tokenData = await tokenRes.json();
      if (
        tokenData.aud !== GOOGLE_CLIENT_ID &&
        tokenData.azp !== GOOGLE_CLIENT_ID
      ) {
        return res
          .status(401)
          .json({ success: false, error: "Token audience mismatch" });
      }
      const providerId = tokenData.sub;
      const displayName =
        tokenData.name || tokenData.email || GOOGLE_DEFAULT_NAME;
      const user = await findOrCreateUser({
        provider: "google",
        providerId,
        birthDate,
        displayName,
        language,
        deviceType,
      });
      res.json({
        success: true,
        user: toClientUser(user),
        token: "simple_auth_token_v1_" + user.id,
      });
    } catch (e: any) {
      console.error("[Auth] Google Error:", e);
      res
        .status(500)
        .json({ success: false, error: "Failed to process Google login" });
    }
  });

  // 카카오 OAuth: accessToken으로 사용자 정보 조회 후 생성/업데이트
  app.post("/api/auth/kakao", async (req, res) => {
    try {
      const { accessToken, birthDate, language, deviceType } = req.body;
      // ⚠️ 사장님 SSOT 2026-07-26(세션2-D) = 외부인증에서 생년월일 분리 = accessToken(인증 신원)만 필수. 생년월일은 findOrCreateUser 가 저장/갱신(신규 생성 / 기존 통과).
      if (!accessToken) {
        return res.status(400).json({
          success: false,
          error: "accessToken is required",
        });
      }
      const result = await loginWithKakaoAccessToken({
        accessToken,
        birthDate,
        language,
        deviceType,
      });
      if (!result) {
        return res
          .status(401)
          .json({ success: false, error: "Invalid Kakao token" });
      }
      res.json(result);
    } catch (e: any) {
      console.error("[Auth] Kakao Error:", e);
      res
        .status(500)
        .json({ success: false, error: "Failed to process Kakao login" });
    }
  });

  // WhatsApp OTP: 전화번호로 OTP 발송 (일시정지 시 503)
  app.post("/api/auth/whatsapp/send-otp", async (req, res) => {
    try {
      if (!WHATSAPP_OTP_ENABLED) {
        return res.status(503).json({
          success: false,
          error: "WhatsApp OTP is temporarily disabled",
        });
      }
      const { phoneNumber } = req.body;
      if (!phoneNumber || typeof phoneNumber !== "string") {
        return res
          .status(400)
          .json({ success: false, error: "phoneNumber is required" });
      }
      const phone = normalizePhone(phoneNumber);
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      otpStore.set(phone, { otp, expiresAt: Date.now() + OTP_EXPIRY_MS });
      // TODO: OTPLess/Twilio 연동 시 실제 WhatsApp 발송
      console.log("[Auth] WhatsApp OTP sent (dev):", phone, "->", otp);
      res.json({ success: true, message: "OTP sent" });
    } catch (e: any) {
      console.error("[Auth] WhatsApp send-otp Error:", e);
      res.status(500).json({ success: false, error: "Failed to send OTP" });
    }
  });

  // WhatsApp OTP: 검증 후 로그인/회원가입
  app.post("/api/auth/whatsapp/verify", async (req, res) => {
    try {
      if (!WHATSAPP_OTP_ENABLED) {
        return res.status(503).json({
          success: false,
          error: "WhatsApp OTP is temporarily disabled",
        });
      }
      const { phoneNumber, otp, birthDate, language, deviceType } = req.body;
      if (!phoneNumber || !otp || !birthDate) {
        return res.status(400).json({
          success: false,
          error: "phoneNumber, otp and birthDate are required",
        });
      }
      const phone = normalizePhone(phoneNumber);
      const stored = otpStore.get(phone);
      if (!stored || stored.expiresAt < Date.now()) {
        return res
          .status(401)
          .json({ success: false, error: "Invalid or expired OTP" });
      }
      if (stored.otp !== String(otp)) {
        return res.status(401).json({ success: false, error: "Invalid OTP" });
      }
      otpStore.delete(phone);
      const user = await findOrCreateUser({
        provider: "whatsapp",
        providerId: phone,
        birthDate,
        displayName: "WhatsApp User",
        language,
        deviceType,
      });
      res.json({
        success: true,
        user: toClientUser(user),
        token: "simple_auth_token_v1_" + user.id,
      });
    } catch (e: any) {
      console.error("[Auth] WhatsApp verify Error:", e);
      res.status(500).json({ success: false, error: "Failed to verify OTP" });
    }
  });

  // ⚠️ 수정금지(승인필요) — 앱 카카오 로그인 ① 시작 = 브라우저를 카카오 로그인 화면으로 보냄 (2026-07-26)
  //   앱은 이 주소만 열면 됨 = REST API 키를 앱 번들에 넣지 않아도 됨(키는 서버에만).
  app.get("/api/auth/kakao/start", (req, res) => {
    // ⚠️ 2026-07-26 = 잘못됐을 때 **오류 화면을 띄우지 않고 앱으로 사유를 돌려보냄**.
    //   브라우저 안에 오류 글자만 뜨면 사용자는 창을 닫고, 앱은 그것을 '취소'로 알아 아무 말도 못 함
    //   = 사장님이 겪은 "눌러도 아무 반응 없음" 이 그대로 재현됨(§22 검증 지적). 옛 500 응답 폐기 §19.
    const fail = (detail: string) =>
      res.redirect(
        `${KAKAO_APP_RETURN_SCHEME}?error=config&detail=${encodeURIComponent(detail)}`,
      );
    if (!KAKAO_REST_API_KEY) return fail(KAKAO_KEY_MISSING);
    if (!APP_SEAL_KEY) return fail(SEAL_KEY_MISSING);
    const nonceHash = String(req.query.nh ?? "");
    if (!/^[a-f0-9]{64}$/.test(nonceHash))
      return fail("앱이 보낸 확인값(nh)이 없거나 형식이 다릅니다.");

    const url =
      "https://kauth.kakao.com/oauth/authorize" +
      `?client_id=${encodeURIComponent(KAKAO_REST_API_KEY)}` +
      `&redirect_uri=${encodeURIComponent(KAKAO_APP_REDIRECT_URI)}` +
      "&response_type=code" +
      // state = 무작위값 지문을 봉해 카카오에 맡겨 두는 것(카카오가 그대로 돌려줌)
      `&state=${encodeURIComponent(seal({ nh: nonceHash }, Date.now()))}`;
    res.redirect(url);
  });

  // ⚠️ 수정금지(승인필요) — 앱 카카오 로그인 ② 카카오가 돌려보낸 것을 앱으로 넘김 (2026-07-26)
  //   '내손앱' 서버가 하는 일과 같음. 브라우저 창이 이 스킴을 만나면 자동으로 닫히고 앱이 값을 받음.
  app.get("/api/auth/kakao/callback", (req, res) => {
    const { code, state, error, error_description } = req.query as Record<
      string,
      string | undefined
    >;
    const back = (q: string) => res.redirect(`${KAKAO_APP_RETURN_SCHEME}?${q}`);

    if (!code) {
      // 사용자가 동의화면에서 취소하면 카카오가 error=access_denied 로 보냄 = 앱이 조용히 끝냄
      return back(
        `error=${encodeURIComponent(error || "unknown")}&detail=${encodeURIComponent(error_description || "")}`,
      );
    }
    const opened = unseal<{ nh: string }>(state, Date.now());
    if (!opened) {
      return back(
        `error=state&detail=${encodeURIComponent("로그인 확인값이 만료됐거나 올바르지 않습니다.")}`,
      );
    }
    // ⚠️ 인가코드를 앱에 **그대로 넘기지 않음**. 무작위값 지문과 함께 봉해서 넘김
    //   = 가로채도 코드를 읽을 수 없고, 원본 무작위값 없이는 쓸 수도 없음(§22 보안 지적).
    back(
      `ticket=${encodeURIComponent(seal({ code, nh: opened.nh }, Date.now()))}`,
    );
  });

  // ⚠️ 수정금지(승인필요) — 앱 카카오 로그인 ③ 봉한 표를 열어 accessToken 으로 바꾼 뒤 로그인 (2026-07-26)
  //   토큰 교환은 반드시 서버에서 함(앱에 카카오 비밀값을 두지 않음).
  app.post("/api/auth/kakao/code", async (req, res) => {
    try {
      const { ticket, nonce, birthDate, language, deviceType } = req.body;
      if (!KAKAO_REST_API_KEY) {
        return res
          .status(500)
          .json({ success: false, error: KAKAO_KEY_MISSING });
      }
      // ⚠️ 2026-07-26 = 이 표가 **정말 이 폰이 시작한 로그인**의 것인지 확인(§22 보안 지적).
      //   표는 우리 서버만 열 수 있고(봉함), 열어도 원본 무작위값이 있어야 쓸 수 있음 = 가로채기 차단.
      const opened = unseal<{ code: string; nh: string }>(ticket, Date.now());
      if (!opened?.code) {
        return res.status(401).json({
          success: false,
          error:
            "로그인 확인값이 만료됐거나 올바르지 않습니다. 다시 시도해 주세요.",
        });
      }
      const gotHash = createHash("sha256")
        .update(String(nonce ?? ""))
        .digest("hex");
      if (
        gotHash.length !== opened.nh.length ||
        !timingSafeEqual(Buffer.from(gotHash), Buffer.from(opened.nh))
      ) {
        return res.status(401).json({
          success: false,
          error: "이 기기에서 시작한 로그인이 아닙니다.",
        });
      }
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: KAKAO_REST_API_KEY,
        redirect_uri: KAKAO_APP_REDIRECT_URI,
        code: opened.code,
      });
      // ⚠️ 콘솔에서 시크릿을 '사용함'으로 켠 경우에만 보냄 = 지금 잘 도는 웹 로그인과 같은 조건(§2).
      if (KAKAO_CLIENT_SECRET) body.set("client_secret", KAKAO_CLIENT_SECRET);

      const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        },
        body: body.toString(),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.access_token) {
        console.error("[Auth] Kakao token exchange failed:", tokenData);
        return res.status(401).json({
          success: false,
          error:
            `카카오 토큰 교환 실패 (${tokenData.error || tokenRes.status}) ${tokenData.error_description || ""}`.trim(),
        });
      }

      const result = await loginWithKakaoAccessToken({
        accessToken: tokenData.access_token,
        birthDate,
        language,
        deviceType,
      });
      if (!result) {
        return res
          .status(401)
          .json({ success: false, error: "Invalid Kakao token" });
      }
      res.json(result);
    } catch (e: any) {
      console.error("[Auth] Kakao code Error:", e);
      res
        .status(500)
        .json({ success: false, error: "Failed to process Kakao login" });
    }
  });

  // ⚠️ 수정금지(승인필요) — 옛 `/api/auth/social-login` 우회 경로 완전삭제 = 2026-07-26 §0·§19.
  //   사유: 진짜 외부인증(구글 idToken·카카오 accessToken) 없이 로그인시키던 우회로.
  //   앱 번들에 키가 안 박혀 있으면 이 경로로 빠져 400 을 뱉는 것이 "앱에서 인증창도 안 뜬다"의 근본.
  //   진짜 인증만 = 구글 `/api/auth/google` · 카카오 웹 `/api/auth/kakao` · 카카오 앱 `/api/auth/kakao/{start,callback,code}`.

  // 내 정보 조회
  app.get("/api/auth/me", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const userId = authHeader
        .split(" ")[1]
        .replace("simple_auth_token_v1_", "");
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user data" });
    }
  });

  // ⚠️ 수정금지(승인필요) 2026-07-13 = 관리자 로그인 = 비번 서버검증 → 관리자 세션 토큰 발급(§16 = 기존 Bearer 인증 재사용).
  //   관리자 = 현지전문가(사장님) 계정 = role='admin'. 비번을 서버로 옮겨 앱 번들서 제거 = 보안↑. ADMIN_PASSWORD/ADMIN_USER_ID = Replit Secrets 우선.
  //   관리자 인식(2026-07-14 사장님 모델 = 다른 배포앱과 동일) = 이 비번 OR 구글 로그인(사장님 계정 role='admin') 둘 다 가능. 관리자 대시보드만 비번으로 막는 방식. ADMIN_PASSWORD 시크릿 설정 시 기본값 대체(선택).
  app.post("/api/admin/login", async (req, res) => {
    try {
      const { password } = req.body;
      const expected = process.env.ADMIN_PASSWORD || "nubi2026";
      if (!password || password !== expected) {
        return res
          .status(401)
          .json({ success: false, error: "invalid_password" });
      }
      const adminId =
        process.env.ADMIN_USER_ID || "google_103229431780116955364"; // 사장님 구글 계정 = 관리자
      const admin = await storage.getUser(adminId);
      if (!admin) {
        return res
          .status(500)
          .json({ success: false, error: "admin_account_missing" });
      }
      // ⚠️ 사장님 SSOT 2026-07-15 = 다른 로그인과 동일하게 toClientUser 1벌(§0.3). 옛 `user: admin`(users 행 통째 = password 등 전 컬럼 반환 + role 손매핑 누락) 폐기 §19.
      res.json({
        success: true,
        user: toClientUser(admin),
        token: "simple_auth_token_v1_" + admin.id,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: "server_error" });
    }
  });

  // ⚠️ 사장님 SSOT 2026-07-14 = 개발단계 이메일 로그인 = 구글 OAuth(웹 리다이렉트 설정 문제로 400) 우회.
  //   메일 입력 → 그 메일의 users 행으로 로그인(사장님 메일=admin 자동 인식). 기존 세션 토큰(§16 = /api/auth/me 와 동일 Bearer) 발급.
  //   ⚠️ 임시(개발용) = 로그인 정식화(프로필 리팩토링) 때 구글 OAuth 정상화하면 폐기 §19. 비번 없음 = 개발단계 한정.
  app.post("/api/auth/email-login", async (req, res) => {
    try {
      const { email, birthDate, language, deviceType } = req.body;
      if (!email || typeof email !== "string" || !email.includes("@")) {
        return res
          .status(400)
          .json({ success: false, error: "email_required" });
      }
      const found = await storage.getUserByEmail(email);
      if (!found) {
        return res
          .status(404)
          .json({ success: false, error: "email_not_found" });
      }
      // ⚠️ 사장님 SSOT 2026-07-26 = 이메일도 정식 인증(지메일 아닌 메일용) = 소셜과 동일하게
      //   생년월일 저장 + 로그인 기록 갱신. 옛 "조회만 하고 아무것도 안 남김" = 생년월일 우회 = 폐기 §19.
      const user = await applyLogin(found, { birthDate, language, deviceType });
      res.json({
        success: true,
        user: toClientUser(user),
        token: "simple_auth_token_v1_" + user.id,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: "server_error" });
    }
  });
}
