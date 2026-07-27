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
import {
  findOrCreateUser,
  toClientUser,
  KAKAO_DEFAULT_NAME,
  GOOGLE_DEFAULT_NAME,
} from "./auth-user";
import type { User } from "@shared/schema";

const GOOGLE_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ||
  process.env.GOOGLE_CLIENT_ID ||
  "";

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
    // 카카오는 메일을 안 줄 수도 있음(동의 안 함) = 주면 저장, 없으면 provider 로만 매칭.
    email: meData.kakao_account?.email || undefined,
    // 카카오가 함께 주는 인증 여부. true 일 때만 기존 계정에 연결(§22 보안 지적).
    emailVerified: meData.kakao_account?.is_email_verified === true,
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
 * ⚠️ 수정금지(승인필요) — 앱 로그인 값을 **우리 서버만 열 수 있게 봉함** = 1벌 (2026-07-26 §16).
 *   `vibetrip://` 는 안드로이드에서 독점이 아니라 가로채기 가능 → ① 인가코드를 그대로 안 넘기고 봉한 표로 바꿔 넘김
 *   ② 앱만 아는 무작위값(nonce) 지문을 봉투에 넣어 마지막에 원본을 요구 = 가로채도 못 씀.
 *   서명이 아니라 암호화인 이유 = 서명만 하면 안을 읽어 코드를 꺼내 재봉인 가능(§22 검증이 잡은 우회로).
 *   PKCE 미사용 = 카카오 공식 REST 문서에 `code_challenge` 없음(2026-07-26 확인).
 *   열쇠 = 서버만 아는 값에서 파생(카카오 시크릿은 콘솔에서 꺼질 수 있어 안 씀 §2). 저장소 불필요 = 봉투가 스스로 검증.
 */
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
        // ⚠️ 2026-07-27 = 구글이 준 메일을 **반드시 저장**. 메일 1개 = 그 사람의 신원이라
        //   나중에 같은 메일로 이메일 로그인해도 같은 계정으로 들어옴(중복 계정 차단).
        email: tokenData.email,
        // tokeninfo 는 문자열 "true" 로 내려줌. 인증된 메일일 때만 기존 계정에 연결(§22 보안 지적).
        emailVerified:
          tokenData.email_verified === true ||
          tokenData.email_verified === "true",
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

  // ⚠️ 앱 카카오 브라우저 방식(/kakao/start·/callback·/code) 완전삭제 = 2026-07-27 §19.
  //   사유(사장님 실기기) = 인증 후에도 웹 창이 백그라운드에 남고 안드로이드는 그 창을 닫는 기능이 없음.
  //   앱은 네이티브 SDK 로 전환(카카오톡 2탭, 창 안 뜸) → accessToken 을 /api/auth/kakao 로 보냄(웹과 같은 1벌).

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

  // ⚠️ 수정금지(승인필요) — 사장님 SSOT 2026-07-27 = **이메일 = 인증 3종 중 하나 = 신규 가입도 여기서 된다.**
  //   지메일이 아닌 메일을 쓰는 사람의 가입·로그인 창구. 구글·카카오와 **완전히 같은 대우**:
  //   있으면 그 계정으로 로그인, 없으면 **새 계정 생성**(구글·카카오의 findOrCreateUser 와 같은 규칙).
  //   옛 "모르는 메일 = 404" 완전삭제 §19 = 신규 가입 자체를 막고 있던 것(사장님 지적 2026-07-27).
  //   비번 없음 = 개발단계 한정(정식화 때 메일 인증코드 추가 예정).
  app.post("/api/auth/email-login", async (req, res) => {
    try {
      const raw = req.body?.email;
      // ⚠️ 조회(getUserByEmail 은 소문자 비교)와 저장을 **같은 모양**으로 = 대소문자·공백 때문에 계정이 갈리지 않게.
      const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
      const { birthDate, language, deviceType } = req.body;
      if (!email || !email.includes("@")) {
        return res
          .status(400)
          .json({ success: false, error: "email_required" });
      }
      // ⚠️ 구글·카카오와 **같은 함수 1벌**(§16). 그 안에서 메일로 기존 계정을 찾아 연결하므로
      //   "구글로 가입 → 같은 메일로 이메일 로그인" 도 **같은 계정**으로 들어온다(중복 계정 없음).
      const user = await findOrCreateUser({
        provider: "email",
        providerId: email,
        email,
        // 이 경로는 메일 자체가 신원(그 메일로 로그인하는 중) = 연결 허용.
        // ⚠️ 개발단계라 메일 인증코드가 없음 = 정식화 때 코드 확인 후 true 로 바꿀 것.
        emailVerified: true,
        birthDate,
        displayName: email.split("@")[0],
        language,
        deviceType,
      });
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
