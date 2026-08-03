// ⚠️ 수정금지(승인필요) 2026-07-13 사장님 SSOT = 전문가 기능 자체 API 헬퍼 (다른 파일과 안 섞기 원칙).
//   계획서 = docs/2026-07-13 전문가탭 구현계획.md. 백엔드 = server/expert-routes.ts (5라우트, 시뮬 입증됨).
//   공유 apiRequest(쿠키)를 안 쓰고, 여기서 Bearer 토큰(getUserData().token)을 직접 붙여 인증 = /api/auth/me 와 동일 패턴(앱 유일 작동 인증).
import { getApiUrl } from "@/lib/query-client";
import { getUserData } from "@/lib/auth";

// 상태 값 = server/expert-routes + admin-dashboard 규약 통일
export type InquiryStatus = "pending" | "in_review" | "answered" | "rejected";

export interface Inquiry {
  id: string;
  userId: string;
  itineraryId: number | null;
  itineraryData: any | null;
  userMessage: string;
  kind: "expert" | "booking"; // 2026-07-24 사장님 승인 = 'booking' = 일별 [바로 예약하기] 요청
  dayNumber: number | null; // booking 전용 = 몇일차 예약(expert 문의 = null)
  status: InquiryStatus;
  expertId: string | null;
  expertReply: string | null;
  isReadByUser: boolean;
  createdAt: string;
  answeredAt: string | null;
}

// 공용 fetch = Bearer 토큰 자동 첨부(로그인 사용자) + JSON. 미로그인이면 토큰 없음(백엔드가 401 반환).
async function req(
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const user = await getUserData();
  const headers: Record<string, string> = {};
  if (body) headers["Content-Type"] = "application/json; charset=utf-8";
  // 실제 형식 토큰(simple_auth_token_v1_+id)일 때만 Bearer 첨부. 비로그인=토큰 없음=미첨부(서버 401).
  if (user?.token && user.token.startsWith("simple_auth_token_v1_")) {
    headers["Authorization"] = `Bearer ${user.token}`;
  }
  return fetch(new URL(path, getApiUrl()).toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ⚠️ 사장님 SSOT 2026-07-14 = 문의 시 여정이 아직 저장 안 됐으면(currentItineraryId null) 여기서 BE에 저장(POST /api/itineraries) → id 확보 → 문의가 그 id에 연결(전문가·사용자 restore-by-id 원본 열람). 옛: 저장 안 하면 itineraryId=null → 여정 안 보임(사장님 지적) 폐기 §19.
//   저장 페이로드 = 화면 여정(currentItinerary) 그대로. userId=본인. buildItineraryData(서버)가 나머지 정규화. 실패 시 null 반환(문의는 itineraryData 요약으로라도 진행).
export async function saveItineraryForInquiry(
  itin: any,
): Promise<number | null> {
  if (!itin) return null;
  const user = await getUserData();
  if (!user?.id) return null;
  try {
    const saveData = {
      userId: user.id,
      cityId: 1,
      title: `${itin.destination || "여정"} 문의`,
      startDate: itin.startDate,
      endDate: itin.endDate,
      travelStyle: (itin.travelStyle || "comfort").toLowerCase(),
      companionType: itin.companionType,
      companionCount: itin.companionCount,
      // ⚠️ 사장님 SSOT 2026-07-14 = status='inquiry' = 전문가 체크용 저장(전문가가 추후 이 여정 봄)이지만 사용자가 저장한 게 아니므로 프로필 '나의 여정' 카드엔 안 뜸(프로필 조회는 status='saved'만). 사용자 저장(💾)은 별개.
      status: "inquiry",
      rawData: itin, // 여정 본문 통째로(days·좌표·AI의견 등) = restore-by-id 원본
    };
    const res = await req("POST", "/api/itineraries", saveData);
    if (!res.ok) return null;
    const j = await res.json();
    return typeof j.id === "number" ? j.id : null;
  } catch {
    return null;
  }
}

// ── 사용자: 문의 접수(여정+AI의견 스냅샷 첨부). kind='booking' = 일별 예약 요청(2026-07-24) ──
export async function submitInquiry(input: {
  userMessage: string;
  itineraryData?: any;
  itineraryId?: number | null;
  kind?: "expert" | "booking";
  dayNumber?: number | null;
}): Promise<{ ok: boolean; requestId?: string; error?: string }> {
  // ⚠️ 수정금지(승인필요) 2026-07-30 = 신원은 **로그인 표(Bearer 토큰)로만** 판단한다.
  //   옛 방식(본문에 userId 를 실어 보냄)은 서버가 더 이상 읽지 않으므로 삭제 §19.
  const res = await req("POST", "/api/verification/request", {
    userMessage: input.userMessage,
    itineraryData: input.itineraryData ?? null,
    itineraryId: input.itineraryId ?? null,
    kind: input.kind ?? "expert",
    dayNumber: input.dayNumber ?? null,
  });
  if (res.ok) {
    const j = await res.json();
    return { ok: true, requestId: j.requestId };
  }
  if (res.status === 401) return { ok: false, error: "login_required" };
  if (res.status === 400) {
    const j = await res.json().catch(() => ({}));
    return { ok: false, error: j.error || "bad_request" };
  }
  return { ok: false, error: "server_error" };
}

// ── 문의 목록 = Bearer 신원으로 백엔드가 판단(일반=본인 것만 강제 / 전문가·관리자=전체). ──
//   ⚠️ userId 쿼리 안 보냄 = 전문가가 전체를 보려면 필수(옛 ?userId=me = 전문가도 자기 것만 나오던 버그, 폐기 §19).
export async function listInquiries(
  status?: InquiryStatus,
): Promise<Inquiry[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await req("GET", `/api/verification/requests${q}`);
  if (!res.ok) return [];
  return (await res.json()) as Inquiry[];
}

// ── 상세(열람 시 백엔드가 본인 답변이면 읽음 처리) ──
export async function getInquiry(id: string): Promise<Inquiry | null> {
  const user = await getUserData();
  const q = user?.id ? `?userId=${encodeURIComponent(user.id)}` : "";
  const res = await req("GET", `/api/verification/requests/${id}${q}`);
  if (!res.ok) return null;
  return (await res.json()) as Inquiry;
}

// ── 사용자/전문가: 문의 건 개별 삭제 ──
export async function deleteInquiry(id: string): Promise<boolean> {
  try {
    const res = await req("DELETE", `/api/verification/requests/${id}`);
    return res.ok;
  } catch {
    return false;
  }
}

// ── 전문가/관리자: 답변 전송(백엔드가 role 검사 + 질문자에게 알림 발송) ──
export async function replyInquiry(
  id: string,
  expertReply: string,
  status: InquiryStatus = "answered",
): Promise<{ ok: boolean; error?: string }> {
  const res = await req("PATCH", `/api/verification/requests/${id}`, {
    status,
    expertReply,
  });
  if (res.ok) return { ok: true };
  if (res.status === 403) return { ok: false, error: "expert_only" };
  if (res.status === 400) {
    const j = await res.json().catch(() => ({}));
    return { ok: false, error: j.error || "bad_request" };
  }
  return { ok: false, error: "server_error" };
}

// ── 내 역할 조회 = 로그인 시 이미 폰에 저장된 role 을 그대로 읽음(서버 재조회 삭제 = 2026-07-16 §0 사장님 SSOT). 미로그인/role 없음 = 'user'. ──
export async function getMyRole(): Promise<"user" | "expert" | "admin"> {
  const user = await getUserData();
  return user?.role === "expert" || user?.role === "admin" ? user.role : "user";
}

// ── 탭 배지 수 = 역할별. ⚠️ 사장님 SSOT 2026-07-14 = 실시간 접수/답변 신호.
//   전문가·관리자 = 대기+검토중 받은 문의 수(응답 대기 신호).
//   사용자 = 진행중 문의(접수됨=pending·검토중=in_review) + 안 읽은 답변(answered 미열람). = 문의 즉시 배지로 "접수됨"을 인식(옛: 안읽은답변만 = 문의 직후 배지0 = 접수 인식불가 폐기 §19).
// ⚠️ 수정금지(승인필요) 2026-07-30 = **같은 순간의 배지 조회는 1번만 서버에 간다.**
//   이유(운영 로그 실측): 이 함수를 부르는 곳이 4군데이고, 하단 탭바가 BTS 화면 3개에도 붙어 있어
//   화면을 한 번 움직이면 **같은 조회가 초당 5~8번** 몰려 나갔다(호출 1회당 요청 2개 = 역할+목록).
//   화면에 보이는 문제는 없지만 DB 전송량 = 돈이므로 차단한다.
//   방식 = 아주 짧은 시간(아래 값) 안의 중복 호출은 **먼저 나간 요청의 답을 함께 쓴다**.
const BADGE_DEDUP_MS = 3000;
let badgeInFlight: { at: number; p: Promise<number> } | null = null;

export function tabBadgeCount(): Promise<number> {
  const now = Date.now();
  if (badgeInFlight && now - badgeInFlight.at < BADGE_DEDUP_MS) {
    return badgeInFlight.p;
  }
  const p = fetchBadgeCount().finally(() => {
    // 실패해도 다음 호출이 다시 시도할 수 있게 통을 비운다
    if (badgeInFlight && badgeInFlight.p === p) badgeInFlight = null;
  });
  badgeInFlight = { at: now, p };
  return p;
}

async function fetchBadgeCount(): Promise<number> {
  // ⚠️ 사장님 승인 2026-07-14 = 비로그인(실형식 토큰 없음)이면 배지 API 자체를 안 부름 → 401 로그·불필요 서버호출 제거.
  const user = await getUserData();
  if (!user?.token || !user.token.startsWith("simple_auth_token_v1_")) return 0;
  // ⚠️ 2026-08-03 사장님 지시 = 숫자 하나 얻으려고 문의 **목록 전체**를 내려받아 세던 방식 폐기 §19.
  //   세는 일 = 서버 unread-count 1벌(역할별 기준 동일)이 DB COUNT 로 함 → 여기는 숫자만 받는다.
  const res = await req("GET", "/api/verification/unread-count");
  if (!res.ok) return 0;
  const j = await res.json().catch(() => ({ count: 0 }));
  return j.count || 0;
}

// ── 현지 전문가 프로필(닉네임/경력/자기소개/캐릭터) = 소개카드 표시·편집(2026-07-13). ──
export interface ExpertProfile {
  nickname?: string;
  career?: string;
  bio?: string;
  character?: string;
  avatarUrl?: string;
}

// 공개 조회(미인증) = 소개카드용(대표 전문가). 없으면 null → 화면이 i18n 기본문구로 폴백.
export async function getExpertProfile(): Promise<{
  profile: ExpertProfile | null;
  displayName: string | null;
}> {
  const res = await req("GET", "/api/expert/profile");
  if (!res.ok) return { profile: null, displayName: null };
  return (await res
    .json()
    .catch(() => ({ profile: null, displayName: null }))) as {
    profile: ExpertProfile | null;
    displayName: string | null;
  };
}

// 본인 조회(expert·admin) = 편집화면 프리필용 = 로그인한 본인 행(대표전문가 아님, 리뷰 2026-07-13).
export async function getMyExpertProfile(): Promise<{
  profile: ExpertProfile | null;
  displayName: string | null;
}> {
  const res = await req("GET", "/api/expert/profile/me");
  if (!res.ok) return { profile: null, displayName: null };
  return (await res
    .json()
    .catch(() => ({ profile: null, displayName: null }))) as {
    profile: ExpertProfile | null;
    displayName: string | null;
  };
}

// 본인 저장(expert·admin) = 백엔드가 role 검사.
export async function saveExpertProfile(
  p: ExpertProfile,
): Promise<{ ok: boolean; error?: string }> {
  const res = await req("PATCH", "/api/expert/profile", p);
  if (res.ok) return { ok: true };
  if (res.status === 401) return { ok: false, error: "login_required" };
  if (res.status === 403) return { ok: false, error: "expert_only" };
  return { ok: false, error: "server_error" };
}
