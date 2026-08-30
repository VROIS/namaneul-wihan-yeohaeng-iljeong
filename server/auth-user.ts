// ⚠️ 수정금지(승인필요) — 로그인 사용자 처리 1벌 (2026-07-27 §16 분리).
import type { Request } from "express";
import { storage } from "./storage";
import { creditService } from "./creditService";
import type { User } from "@shared/schema";

// ⚠️ 수정금지(승인필요) — Bearer 토큰 → userId = 프로젝트 전체 1벌 (2026-07-29 §16 1벌화).
export function getUserIdFromReq(req: Request): string | null {
  const m = (req.headers.authorization || "").match(
    /^Bearer\s+simple_auth_token_v1_(.+)$/,
  );
  return m ? m[1] : null;
}

// ⚠️ 수정금지(승인필요) 2026-08-06 사장님 승인 = 역할 조회 1벌(관리자 전체 상황판 = 영상·해설·여정 3곳 + 전문가 문의함 공용).
export async function getRoleFromDb(userId: string): Promise<string> {
  const u = await creditService.getUserProfile(userId);
  return u?.role || "user";
}

// ⚠️ 사장님 SSOT 2026-07-26 = 소셜별 닉네임 기본문구(카카오/구글이 이름 안 줄 때 fallback) = 1벌 상수(§0·§16).
const KAKAO_DEFAULT_NAME = "카카오 사용자";
const GOOGLE_DEFAULT_NAME = "Google User";
const APPLE_DEFAULT_NAME = "Apple User";
const SOCIAL_DEFAULT_NAMES = new Set([
  KAKAO_DEFAULT_NAME,
  GOOGLE_DEFAULT_NAME,
  APPLE_DEFAULT_NAME,
]);

/** ⚠️ 수정금지(승인필요) — 로그인 성공 시 기존 계정에 반영하는 단 하나의 함수 (2026-07-26 §16 1벌). */
async function applyLogin(
  user: User,
  opts: {
    birthDate?: string;
    language?: string;
    deviceType?: string;
    displayName?: string;
    email?: string;
    emailVerified?: boolean; // ⚠️ 인증된 메일일 때만 저장(미인증 메일이 남의 메일을 선점하는 것 차단)
    provider?: string;
    providerId?: string;
  },
): Promise<User> {
  // ⚠️ 수정금지(승인필요) — 2026-07-27 §22 지적 반영: ① 기존 이름이 있으면 절대 안 덮음(데이터 훼손 방지)
  const nameIsPlaceholder =
    !user.displayName || SOCIAL_DEFAULT_NAMES.has(user.displayName);
  const incomingIsRealName =
    !!opts.displayName && !SOCIAL_DEFAULT_NAMES.has(opts.displayName);

  let emailToFill: string | undefined;
  if (opts.email && opts.emailVerified && !user.email) {
    const owner = await storage.getUserByEmail(opts.email);
    if (!owner) emailToFill = opts.email;
    else if (owner.id !== user.id)
      console.warn(
        `[Auth] 메일 ${opts.email} 은 다른 계정(${owner.id}) 소유 = 채우지 않음`,
      );
  }

  if (opts.provider && opts.providerId) {
    try {
      await storage.linkProvider(user.id, opts.provider, opts.providerId);
    } catch (e: any) {
      console.warn("[Auth] linkProvider 실패(로그인은 계속):", e?.message);
    }
  }

  // ⚠️ 수정금지(승인필요) 2026-08-08 = **탈퇴 유예 중 다시 로그인하면 되살린다.**
  const wasDeleted = user.accountStatus === "deleted";

  return (await storage.updateUserLogin(user.id, {
    ...(emailToFill ? { email: emailToFill } : {}),
    ...(wasDeleted ? { accountStatus: "active", deletedAt: null } : {}),
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

/** 사용자 조회/생성 = ⚠️ 사장님 SSOT 2026-07-25 = **오직 provider+providerId(소셜 인증 신원)로만** 기존 계정 매칭. */
async function findOrCreateUser(params: {
  provider: string;
  providerId: string;
  birthDate?: string; // ⚠️ 2026-07-26(세션2-D) = 외부인증에서 분리 = 선택적. 있으면 저장/갱신, 없으면 null(신규)·기존값 유지.
  email?: string; // 이메일 가입일 때만. 소셜은 메일을 안 주는 경우가 있어 선택.
  emailVerified?: boolean; // ⚠️ 이 메일이 **인증된 것**인지. 아니면 기존 계정에 붙이지 않는다.
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

  const username = `${provider}_${providerId.substring(0, 12)}_${Math.random().toString(36).substring(2, 6)}`;
  const emailFree = email ? !(await storage.getUserByEmail(email)) : false;
  const created = await storage.createUser({
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

  // ⚠️ 수정금지(승인필요) — 가입 보너스 50 크레딧(2026-08-05 조정 = CLAUDE.md §9, 금액은 CREDIT_CONFIG.SIGNUP_BONUS 1벌).
  try {
    await creditService.grantSignupBonus(created.id);
  } catch (e: any) {
    console.warn("[Auth] 가입 보너스 지급 실패(로그인은 계속):", e?.message);
  }

  return created;
}

// ⚠️ 사장님 SSOT 2026-07-15 = 모든 로그인 응답의 user 객체 = 이 함수 1벌만(§0.3·§16). 옛 5곳 제각각(name·email 누락 → 프로필 빈칸 / google·kakao 는 role 까지 누락) 폐기 §19.
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
  APPLE_DEFAULT_NAME,
};
