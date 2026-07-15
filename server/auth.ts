import type { Express } from "express";
import { storage } from "./storage";
import type { User } from "@shared/schema";

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "";

/** provider 1순위, provider 없을 때만 birth_date로 매칭 */
async function findOrCreateUser(params: {
  provider: string;
  providerId: string;
  birthDate: string;
  displayName: string;
  language?: string;
  deviceType?: string;
}): Promise<User> {
  const { provider, providerId, birthDate, displayName, language, deviceType } = params;

  // 1) provider로 조회
  let user = await storage.getUserByProvider(provider, providerId);
  if (user) {
    user = (await storage.updateUserLogin(user.id, {
      lastLoginAt: new Date(),
      loginCount: (user.loginCount || 0) + 1,
      deviceType,
      preferredLanguage: language || user.preferredLanguage,
      birthDate: birthDate || user.birthDate,
    }))!;
    return user;
  }

  // 2) birth_date로 조회 → 있으면 provider 연결
  user = await storage.getUserByBirthDate(birthDate);
  if (user) {
    await storage.linkProvider(user.id, provider, providerId);
    user = (await storage.updateUserLogin(user.id, {
      lastLoginAt: new Date(),
      loginCount: (user.loginCount || 0) + 1,
      deviceType,
      preferredLanguage: language || user.preferredLanguage,
      birthDate: birthDate || user.birthDate,
    }))!;
    return user;
  }

  // 3) 신규 사용자 생성
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
        name: user.displayName,       // 프로필 표시명(ProfileScreen 이 읽는 필드)
        email: user.email,            // 프로필 이메일
        username: user.username,
        displayName: user.displayName,
        provider: user.provider,
        birthDate: user.birthDate,
        language: user.preferredLanguage,
        isPaid: user.isPaid,
        planType: user.planType,
        role: user.role,              // 사용자/전문가/관리자 분기
    };
}

// 카카오: accessToken으로 /v2/user/me 호출 (REST API 키 불필요)

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
            if (!idToken || !birthDate) {
                return res.status(400).json({ success: false, error: "idToken and birthDate are required" });
            }
            const tokenRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
            if (!tokenRes.ok) {
                return res.status(401).json({ success: false, error: "Invalid Google token" });
            }
            const tokenData = await tokenRes.json();
            if (tokenData.aud !== GOOGLE_CLIENT_ID && tokenData.azp !== GOOGLE_CLIENT_ID) {
                return res.status(401).json({ success: false, error: "Token audience mismatch" });
            }
            const providerId = tokenData.sub;
            const displayName = tokenData.name || tokenData.email || "Google User";
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
            res.status(500).json({ success: false, error: "Failed to process Google login" });
        }
    });

    // 카카오 OAuth: accessToken으로 사용자 정보 조회 후 생성/업데이트
    app.post("/api/auth/kakao", async (req, res) => {
        try {
            const { accessToken, birthDate, language, deviceType } = req.body;
            if (!accessToken || !birthDate) {
                return res.status(400).json({ success: false, error: "accessToken and birthDate are required" });
            }
            const meRes = await fetch("https://kapi.kakao.com/v2/user/me", {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (!meRes.ok) {
                const errText = await meRes.text();
                console.error("[Auth] Kakao /v2/user/me failed:", errText);
                return res.status(401).json({ success: false, error: "Invalid Kakao token" });
            }
            const meData = await meRes.json();
            const providerId = String(meData.id ?? meData.kakao_account?.id);
            const displayName =
                meData.kakao_account?.profile?.nickname ||
                meData.kakao_account?.profile?.name ||
                meData.properties?.nickname ||
                "카카오 사용자";
            const user = await findOrCreateUser({
                provider: "kakao",
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
            console.error("[Auth] Kakao Error:", e);
            res.status(500).json({ success: false, error: "Failed to process Kakao login" });
        }
    });

    // WhatsApp OTP: 전화번호로 OTP 발송 (일시정지 시 503)
    app.post("/api/auth/whatsapp/send-otp", async (req, res) => {
        try {
            if (!WHATSAPP_OTP_ENABLED) {
                return res.status(503).json({ success: false, error: "WhatsApp OTP is temporarily disabled" });
            }
            const { phoneNumber } = req.body;
            if (!phoneNumber || typeof phoneNumber !== "string") {
                return res.status(400).json({ success: false, error: "phoneNumber is required" });
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
                return res.status(503).json({ success: false, error: "WhatsApp OTP is temporarily disabled" });
            }
            const { phoneNumber, otp, birthDate, language, deviceType } = req.body;
            if (!phoneNumber || !otp || !birthDate) {
                return res.status(400).json({ success: false, error: "phoneNumber, otp and birthDate are required" });
            }
            const phone = normalizePhone(phoneNumber);
            const stored = otpStore.get(phone);
            if (!stored || stored.expiresAt < Date.now()) {
                return res.status(401).json({ success: false, error: "Invalid or expired OTP" });
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

    // 소셜 로그인 / 회원가입 통합 엔드포인트
    app.post("/api/auth/social-login", async (req, res) => {
        try {
            const { provider, providerId, birthDate, language, deviceType, displayName } = req.body;

            if (!provider || !birthDate) {
                return res.status(400).json({ error: "Provider and birthDate are required" });
            }

            const pid = providerId || `temp_${provider}_${birthDate.replace(/-/g, "")}`;
            const user = await findOrCreateUser({
                provider,
                providerId: pid,
                birthDate,
                displayName: displayName || `${provider} User`,
                language,
                deviceType,
            });

            // 4. 응답 (실제 운영 환경에선 JWT 토큰 생성 후 반환)
            res.json({
                success: true,
                user: toClientUser(user),
                token: "simple_auth_token_v1_" + user.id, // 임시 토큰
            });
        } catch (error: any) {
            console.error("[Auth] Social Login Error:", error);
            res.status(500).json({ error: "Failed to process social login" });
        }
    });

    // 내 정보 조회
    app.get("/api/auth/me", async (req, res) => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith("Bearer ")) {
                return res.status(401).json({ error: "Unauthorized" });
            }

            const userId = authHeader.split(" ")[1].replace("simple_auth_token_v1_", "");
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
                return res.status(401).json({ success: false, error: "invalid_password" });
            }
            const adminId = process.env.ADMIN_USER_ID || "google_103229431780116955364"; // 사장님 구글 계정 = 관리자
            const admin = await storage.getUser(adminId);
            if (!admin) {
                return res.status(500).json({ success: false, error: "admin_account_missing" });
            }
            // ⚠️ 사장님 SSOT 2026-07-15 = 다른 로그인과 동일하게 toClientUser 1벌(§0.3). 옛 `user: admin`(users 행 통째 = password 등 전 컬럼 반환 + role 손매핑 누락) 폐기 §19.
            res.json({ success: true, user: toClientUser(admin), token: "simple_auth_token_v1_" + admin.id });
        } catch (error) {
            res.status(500).json({ success: false, error: "server_error" });
        }
    });

    // ⚠️ 사장님 SSOT 2026-07-14 = 개발단계 이메일 로그인 = 구글 OAuth(웹 리다이렉트 설정 문제로 400) 우회.
    //   메일 입력 → 그 메일의 users 행으로 로그인(사장님 메일=admin 자동 인식). 기존 세션 토큰(§16 = /api/auth/me 와 동일 Bearer) 발급.
    //   ⚠️ 임시(개발용) = 로그인 정식화(프로필 리팩토링) 때 구글 OAuth 정상화하면 폐기 §19. 비번 없음 = 개발단계 한정.
    app.post("/api/auth/email-login", async (req, res) => {
        try {
            const { email } = req.body;
            if (!email || typeof email !== "string" || !email.includes("@")) {
                return res.status(400).json({ success: false, error: "email_required" });
            }
            const user = await storage.getUserByEmail(email);
            if (!user) {
                return res.status(404).json({ success: false, error: "email_not_found" });
            }
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
