// ⚠️ 수정금지(승인필요) — 로그인 사용자 처리 1벌 (2026-07-27 §16 분리).
//   server/auth.ts 가 700줄 한도(§0 기계가드)를 넘어 **사용자 조회·생성·연결·응답변환**만 여기로 옮김(순수 이동).
import { storage } from "./storage";
import { isDatabaseConnected } from "./db";
import type { User } from "@shared/schema";

// ⚠️ 사장님 SSOT 2026-07-26 = 소셜별 닉네임 기본문구(카카오/구글이 이름 안 줄 때 fallback) = 1벌 상수(§0·§16).
const KAKAO_DEFAULT_NAME = "카카오 사용자";
const GOOGLE_DEFAULT_NAME = "Google User";
const SOCIAL_DEFAULT_NAMES = new Set([KAKAO_DEFAULT_NAME, GOOGLE_DEFAULT_NAME]);

/**
 * ⚠️ 수정금지(승인필요) — 로그인 성공 시 기존 계정에 반영하는 단 하나의 함수 (2026-07-26 §16 1벌).
 */
async function applyLogin(
  user: User,
  opts: {
    birthDate?: string;
    language?: string;
    deviceType?: string;
    displayName?: string;
    email?: string;
    emailVerified?: boolean;
    provider?: string;
    providerId?: string;
  },
): Promise<User> {
  const nameIsPlaceholder =
    !user.displayName || SOCIAL_DEFAULT_NAMES.has(user.displayName);
  const incomingIsRealName =
    !!opts.displayName && !SOCIAL_DEFAULT_NAMES.has(opts.displayName);

  let emailToFill: string | undefined;
  if (opts.email && opts.emailVerified && !user.email) {
    const owner = await storage.getUserByEmail(opts.email);
    if (!owner) emailToFill = opts.email;
  }

  if (opts.provider && opts.providerId) {
    try {
      await storage.linkProvider(user.id, opts.provider, opts.providerId);
    } catch (e: any) {
      console.warn("[Auth] linkProvider 실패(로그인은 계속):", e?.message);
    }
  }

  return (await storage.updateUserLogin(user.id, {
    ...(emailToFill ? { email: emailToFill } : {}),
    lastLoginAt: new Date(),
    loginCount: (user.loginCount || 0) + 1,
    deviceType: opts.deviceType,
    preferredLanguage: opts.language || user.preferredLanguage,
    birthDate: opts.birthDate || user.birthDate,
    ...(incomingIsRealName && nameIsPlaceholder
      ? { displayName: opts.displayName }
      : {}),
  }))!;
}

/**
 * 사용자 조회/생성 (DB 미연동 시 데모 사용자 반환 처리)
 */
async function findOrCreateUser(params: {
  provider: string;
  providerId: string;
  birthDate?: string;
  email?: string;
  emailVerified?: boolean;
  displayName: string;
  language?: string;
  deviceType?: string;
}): Promise<User> {
  const {
    provider,
    providerId,
    birthDate,
    email,
    emailVerified,
    displayName,
    language,
    deviceType,
  } = params;

  // DB 비연동 환경 폴백 데모 사용자
  if (!isDatabaseConnected()) {
    const isDevAdmin =
      !email ||
      email.toLowerCase().includes("admin") ||
      email.toLowerCase().includes("expert") ||
      email.toLowerCase().includes("dbstour1") ||
      displayName.toLowerCase().includes("admin") ||
      displayName.toLowerCase().includes("expert");

    console.log(
      "[Auth] DB 비연동 환경 → 데모 사용자 즉시 로그인 성공:",
      email || providerId,
      `Role: ${isDevAdmin ? "admin" : "user"}`,
    );
    return {
      id:
        "demo_user_" +
        (email ? email.replace(/[^a-zA-Z0-9]/g, "_") : providerId),
      username: email || providerId,
      password: "social_login_no_password",
      displayName:
        displayName || (email ? email.split("@")[0] : "kang wook Kim"),
      email: email || "dbstour1@gmail.com",
      provider: provider || "email",
      providerId: providerId || "demo",
      birthDate: birthDate || "1990-05-15",
      preferredLanguage: language || "ko",
      deviceType: deviceType || "web",
      loginCount: 1,
      lastLoginAt: new Date(),
      isPaid: true,
      planType: "pro",
      role: isDevAdmin ? "admin" : "user",
      createdAt: new Date(),
    } as User;
  }

  // 1) provider+providerId(소셜 인증 신원)로 조회 = 그 사람일 때만 기존 계정 매칭.
  const user = await storage.getUserByProvider(provider, providerId);
  if (user)
    return applyLogin(user, {
      birthDate,
      language,
      deviceType,
      displayName,
      email,
      emailVerified,
      provider, // 이미 연결돼 있으면 linkProvider 가 조용히 무시(ON CONFLICT DO NOTHING)
      providerId,
    });

  // ⚠️ 수정금지(승인필요) — 사장님 SSOT 2026-07-27 = **메일 1개 = 그 사람의 신원**(지메일·일반메일 구분 없음).
  //   같은 메일이면 새 계정을 만들지 않고 **기존 계정에 연결**(중복 계정 지뢰 차단).
  //   단 **인증된 메일일 때만** = 남의 메일을 적어 넣고 그 계정을 차지하는 것 차단(§22 보안 지적).
  //   카카오는 메일을 안 줄 수 있어 그때는 provider 매칭만 = 사장님 "카톡은 다르지만".
  if (email && emailVerified) {
    const byEmail = await storage.getUserByEmail(email);
    if (byEmail)
      return applyLogin(byEmail, {
        birthDate,
        language,
        deviceType,
        displayName,
        email,
        emailVerified,
        provider,
        providerId,
      });
  }

  // 2) 신규 생성. ⚠️ 메일은 **주인이 없을 때만** 넣는다(users.email 은 유니크 = 넣으면 500).
  //   위 UPDATE 경로와 **같은 규칙 1벌**(§16) = 주인 없음 + **인증된 메일**일 때만 저장.
  //   안 그러면 미인증 메일이 남의 메일을 선점해, 진짜 주인이 로그인할 때 그 계정으로 들어가게 됨(§22 보안 지적).
  const username = `${provider}_${providerId.substring(0, 12)}_${Math.random().toString(36).substring(2, 6)}`;
  const emailFree = email ? !(await storage.getUserByEmail(email)) : false;
  return storage.createUser({
    username,
    password: "social_login_no_password",
    displayName,
    email: emailFree && emailVerified ? email : undefined,
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

export {
  applyLogin,
  findOrCreateUser,
  toClientUser,
  KAKAO_DEFAULT_NAME,
  GOOGLE_DEFAULT_NAME,
};
