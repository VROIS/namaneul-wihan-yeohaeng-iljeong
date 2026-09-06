import type { Express } from "express";
import { storage } from "./storage";
import {
  findOrCreateUser,
  applyLogin,
  toClientUser,
  getUserIdFromReq,
  KAKAO_DEFAULT_NAME,
  GOOGLE_DEFAULT_NAME,
  APPLE_DEFAULT_NAME,
} from "./auth-user";
import { verifyAppleIdentityToken } from "./auth-apple";
import type { User } from "@shared/schema";
import { BIRTHDATE_REQUIRED } from "@shared/birthdate-policy";

const GOOGLE_CLIENT_ID = (
  process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ||
  process.env.GOOGLE_CLIENT_ID ||
  ""
).trim();
const GOOGLE_CLIENT_ID_ANDROID = (
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || ""
).trim();
function isValidGoogleAudience(v: string | undefined): boolean {
  if (!v) return false;
  return (
    v === GOOGLE_CLIENT_ID ||
    (!!GOOGLE_CLIENT_ID_ANDROID && v === GOOGLE_CLIENT_ID_ANDROID)
  );
}

// ⚠️ 수정금지(승인필요) — 카카오 accessToken → 우리 로그인 = 이 함수 1벌만 (2026-07-26 §16).
async function loginWithKakaoAccessToken(params: {
  accessToken: string;
  birthDate?: string;
  language?: string;
  deviceType?: string;
}) {
  // ⚠️ 수정금지(승인필요) — 받은 출입증이 **우리 카카오 앱에서 발급된 것인지** 먼저 확인 (2026-07-27 사장님 승인).
  const ourAppId = (process.env.KAKAO_APP_ID || "").trim();
  if (!ourAppId) {
    console.error(
      "[Auth] KAKAO_APP_ID 없음 = 카카오 로그인 차단(api_keys 확인 필요)",
    );
    return null;
  }
  const infoRes = await fetch(
    "https://kapi.kakao.com/v1/user/access_token_info",
    { headers: { Authorization: `Bearer ${params.accessToken}` } },
  );
  if (!infoRes.ok) {
    console.error("[Auth] Kakao access_token_info 실패:", await infoRes.text());
    return null;
  }
  const info = await infoRes.json();
  if (String(info.app_id) !== ourAppId) {
    console.error(
      `[Auth] 다른 앱의 카카오 출입증 거부: app_id=${info.app_id} (우리=${ourAppId})`,
    );
    return null;
  }

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
    email: meData.kakao_account?.email || undefined,
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

export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/google", async (req, res) => {
    try {
      const { idToken, birthDate, language, deviceType } = req.body;
      // ⚠️ 사장님 SSOT 2026-07-26(세션2-D) = 외부인증에서 생년월일 분리 = idToken(인증 신원)만 필수.
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
        !isValidGoogleAudience(tokenData.aud) &&
        !isValidGoogleAudience(tokenData.azp)
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
        email: tokenData.email,
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

  // ⚠️ 수정금지(승인필요) 2026-07-31 사장님 지시 — 애플 로그인(아이폰 전용).
  app.post("/api/auth/apple", async (req, res) => {
    try {
      const { identityToken, birthDate, language, deviceType, fullName } =
        req.body;
      // 사장님 SSOT 2026-07-26(세션2-D) = 외부인증에서 생년월일 분리 = 신분증만 필수.
      if (!identityToken) {
        return res
          .status(400)
          .json({ success: false, error: "identityToken is required" });
      }
      const identity = await verifyAppleIdentityToken(identityToken);
      if (!identity) {
        return res
          .status(401)
          .json({ success: false, error: "Invalid Apple token" });
      }
      const displayName =
        (typeof fullName === "string" && fullName.trim()) ||
        identity.email ||
        APPLE_DEFAULT_NAME;
      const user = await findOrCreateUser({
        provider: "apple",
        providerId: identity.providerId,
        email: identity.email,
        emailVerified: identity.emailVerified,
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
      console.error("[Auth] Apple Error:", e);
      res
        .status(500)
        .json({ success: false, error: "Failed to process Apple login" });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
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
  app.post("/api/admin/login", async (req, res) => {
    try {
      // ⚠️ 수정금지(승인필요) 2026-09-03 사장님 결정 = 비밀번호만 맞으면 누구든 들어간다 = 앞뒤 공백은 떼고 비교(키보드·자동완성이 붙이는 공백 때문에 401 나던 원인)
      const password = String(req.body?.password ?? "").trim();
      const expected = (process.env.ADMIN_PASSWORD || "nubi2026").trim();
      if (!password || password !== expected) {
        return res
          .status(401)
          .json({ success: false, error: "invalid_password" });
      }
      // ⚠️ 수정금지(승인필요) 2026-08-08 사장님 확정 = 관리자 계정을 **아이디로 박지 않는다** §19.
      const admin = await storage.getAdminUser();
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

  // ⚠️ 수정금지(승인필요) 2026-08-08 사장님 확정 = **회원 탈퇴 = 6개월 유예.**
  app.delete("/api/auth/account", async (req, res) => {
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) return res.status(401).json({ error: "login_required" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "user_not_found" });
      await storage.markAccountDeleted(userId);
      res.json({ success: true, graceMonths: 6 });
    } catch (error) {
      console.error("[Auth] 탈퇴 처리 실패:", error);
      res.status(500).json({ error: "server_error" });
    }
  });

  // ⚠️ 수정금지(승인필요) 2026-08-08 사장님 확정 = **이메일창은 "가입"이 아니라 "이미 있는 내 계정 찾기"다.**
  //     'optional'(현재, 2026-08-24 사장님 승인 = 애플 5.1.1(v) 대응) = **메일 하나로 들어간다.**
  app.post("/api/auth/email-login", async (req, res) => {
    try {
      const raw = req.body?.email;
      const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
      const { birthDate, language, deviceType } = req.body;
      if (!email || !email.includes("@")) {
        return res
          .status(400)
          .json({ success: false, error: "email_required" });
      }
      if (BIRTHDATE_REQUIRED && !birthDate) {
        return res
          .status(400)
          .json({ success: false, error: "birthdate_required" });
      }

      const found = await storage.getUserByEmail(email);
      if (!found) {
        return res
          .status(404)
          .json({ success: false, error: "account_not_found" });
      }
      if (birthDate && (!found.birthDate || found.birthDate !== birthDate)) {
        return res
          .status(401)
          .json({ success: false, error: "birthdate_mismatch" });
      }

      const user = await applyLogin(found, {
        language,
        deviceType,
        provider: "email",
        providerId: email,
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
