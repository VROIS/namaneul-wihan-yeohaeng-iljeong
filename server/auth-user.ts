// ⚠️ 수정금지(승인필요) — 로그인 사용자 처리 1벌 (2026-07-27 §16 분리).
//   server/auth.ts 가 700줄 한도(§0 기계가드)를 넘어 **사용자 조회·생성·연결·응답변환**만 여기로 옮김(순수 이동).
import type { Request } from "express";
import { storage } from "./storage";
import { creditService } from "./creditService";
import type { User } from "@shared/schema";

// ⚠️ 수정금지(승인필요) — Bearer 토큰 → userId = 프로젝트 전체 1벌 (2026-07-29 §16 1벌화).
//   토큰 형식은 server/auth.ts 가 발급하는 것과 한 쌍이다(둘을 항상 함께 바꿀 것).
//   옛 사본 3벌(expert-routes·guide-routes·auth.ts 인라인) 중 라우트 2곳 사본 삭제 = 2026-07-29 §19.
export function getUserIdFromReq(req: Request): string | null {
  const m = (req.headers.authorization || "").match(
    /^Bearer\s+simple_auth_token_v1_(.+)$/,
  );
  return m ? m[1] : null;
}

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
    email?: string;
    emailVerified?: boolean; // ⚠️ 인증된 메일일 때만 저장(미인증 메일이 남의 메일을 선점하는 것 차단)
    provider?: string;
    providerId?: string;
  },
): Promise<User> {
  // ⚠️ 수정금지(승인필요) — 2026-07-27 §22 지적 반영: ① 기존 이름이 있으면 절대 안 덮음(데이터 훼손 방지)
  //   ② users.email 은 고유 = 남이 쓰는 메일이면 안 씀(500 방지) ③ 신원 연결은 storage.linkProvider() 재사용(§0 재발명 금지).
  const nameIsPlaceholder =
    !user.displayName || SOCIAL_DEFAULT_NAMES.has(user.displayName);
  const incomingIsRealName =
    !!opts.displayName && !SOCIAL_DEFAULT_NAMES.has(opts.displayName);

  // 메일 채우기 = 이 행이 비어 있고 + 그 메일의 주인이 아무도 없을 때만
  let emailToFill: string | undefined;
  if (opts.email && opts.emailVerified && !user.email) {
    const owner = await storage.getUserByEmail(opts.email);
    if (!owner) emailToFill = opts.email;
    else if (owner.id !== user.id)
      console.warn(
        `[Auth] 메일 ${opts.email} 은 다른 계정(${owner.id}) 소유 = 채우지 않음`,
      );
  }

  // 신원 연결 = user_providers 1벌. ⚠️ try/catch 필수 = 이 저장소는 그 테이블·제약이 없을 수도 있다는 전제
  //   (storage.ts 의 createUser·getUserByProvider 도 동일). 안 감싸면 기존 사용자 로그인이 전부 500(§22 지적).
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
 * 사용자 조회/생성 = ⚠️ 사장님 SSOT 2026-07-25 = **오직 provider+providerId(소셜 인증 신원)로만** 기존 계정 매칭.
 *   birthDate 는 매칭 키가 아니라 신규 생성 시 저장·성인확인용. "2가지(생년월일+소셜인증) 다 충족" = 소셜 신원이 일치하는 그 사람일 때만 기존 계정.
 *   ⚠️ 옛 2단계(birthDate 단독 매칭 → provider 연결) 완전삭제 §19 = 근본버그(남이 같은 생년월일 넣으면 남 계정에 붙음)의 원인. birthDate=비번대체지만 "매칭 단독키"로는 절대 안 씀.
 */
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

  // ⚠️ 수정금지(승인필요) — 가입 보너스 140 크레딧 (2026-07-29 사장님 SSOT = CLAUDE.md §9 유지).
  //   여기가 **신규 계정이 만들어지는 유일한 지점**(구글·카카오·왓츠앱·이메일 전부 이 함수로 모임) = 보너스도 여기 1벌(§0·§16).
  //   grantSignupBonus 는 자체적으로 중복 지급을 막으므로(기존 signup_bonus 줄 확인) 두 번 불려도 안전하다.
  //   ⚠️ try/catch 필수 = 위 linkProvider(:52-58)와 같은 취지. 보너스 지급이 실패해도 **로그인 자체는 성공해야** 한다.
  try {
    await creditService.grantSignupBonus(created.id);
  } catch (e: any) {
    console.warn("[Auth] 가입 보너스 지급 실패(로그인은 계속):", e?.message);
  }

  return created;
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
