// ⚠️ 수정금지(승인필요) 2026-07-13 사장님 SSOT = 전문가 기능 자체 API 헬퍼 (다른 파일과 안 섞기 원칙).
import { getApiUrl } from "@/lib/query-client";
import { getUserData } from "@/lib/auth";
import { parseCreditShortfall, type CreditShortfall } from "@/lib/creditError";

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

async function req(
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const user = await getUserData();
  const headers: Record<string, string> = {};
  if (body) headers["Content-Type"] = "application/json; charset=utf-8";
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

export async function submitInquiry(input: {
  userMessage: string;
  itineraryData?: any;
  itineraryId?: number | null;
  kind?: "expert" | "booking";
  dayNumber?: number | null;
}): Promise<{
  ok: boolean;
  requestId?: string;
  error?: string;
  shortfall?: CreditShortfall | null;
}> {
  // ⚠️ 수정금지(승인필요) 2026-07-30 = 신원은 **로그인 표(Bearer 토큰)로만** 판단한다.
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
  // ⚠️ 수정금지(승인필요) 2026-08-05 사장님 SSOT = 크레딧부족(402) 뭉개지 않고 숫자까지 그대로 올려보냄(§16 5곳 공용).
  if (res.status === 402) {
    const j = await res.json().catch(() => null);
    return {
      ok: false,
      error: "insufficient_credits",
      shortfall: parseCreditShortfall(j),
    };
  }
  return { ok: false, error: "server_error" };
}

export async function listInquiries(
  status?: InquiryStatus,
): Promise<Inquiry[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await req("GET", `/api/verification/requests${q}`);
  if (!res.ok) return [];
  return (await res.json()) as Inquiry[];
}

export async function getInquiry(id: string): Promise<Inquiry | null> {
  const user = await getUserData();
  const q = user?.id ? `?userId=${encodeURIComponent(user.id)}` : "";
  const res = await req("GET", `/api/verification/requests/${id}${q}`);
  if (!res.ok) return null;
  return (await res.json()) as Inquiry;
}

export async function deleteInquiry(id: string): Promise<boolean> {
  try {
    const res = await req("DELETE", `/api/verification/requests/${id}`);
    return res.ok;
  } catch {
    return false;
  }
}

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

// ⚠️ 수정금지(승인필요) 2026-07-30 = **같은 순간의 배지 조회는 1번만 서버에 간다.**
const BADGE_DEDUP_MS = 3000;
let badgeInFlight: { at: number; p: Promise<number> } | null = null;

export function tabBadgeCount(): Promise<number> {
  const now = Date.now();
  if (badgeInFlight && now - badgeInFlight.at < BADGE_DEDUP_MS) {
    return badgeInFlight.p;
  }
  const p = fetchBadgeCount().finally(() => {
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
  const res = await req("GET", "/api/verification/unread-count");
  if (!res.ok) return 0;
  const j = await res.json().catch(() => ({ count: 0 }));
  return j.count || 0;
}

export interface ExpertProfile {
  nickname?: string;
  career?: string;
  bio?: string;
  character?: string;
  avatarUrl?: string;
}

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

export async function saveExpertProfile(
  p: ExpertProfile,
): Promise<{ ok: boolean; error?: string }> {
  const res = await req("PATCH", "/api/expert/profile", p);
  if (res.ok) return { ok: true };
  if (res.status === 401) return { ok: false, error: "login_required" };
  if (res.status === 403) return { ok: false, error: "expert_only" };
  return { ok: false, error: "server_error" };
}
