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
  status: InquiryStatus;
  expertId: string | null;
  expertReply: string | null;
  isReadByUser: boolean;
  createdAt: string;
  answeredAt: string | null;
}

// 공용 fetch = Bearer 토큰 자동 첨부(로그인 사용자) + JSON. 미로그인이면 토큰 없음(백엔드가 401 반환).
async function req(method: string, path: string, body?: unknown): Promise<Response> {
  const user = await getUserData();
  const headers: Record<string, string> = {};
  if (body) headers["Content-Type"] = "application/json; charset=utf-8";
  // 실제 형식 토큰(simple_auth_token_v1_+id)일 때만 Bearer 첨부. DEV 목업도 2026-07-13부터 실형식이라 첨부됨(local_dev_user 로 인증).
  if (user?.token && user.token.startsWith("simple_auth_token_v1_")) {
    headers["Authorization"] = `Bearer ${user.token}`;
  }
  return fetch(new URL(path, getApiUrl()).toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ── 사용자: 문의 접수(여정+AI의견 스냅샷 첨부) ──
export async function submitInquiry(input: {
  userMessage: string;
  itineraryData?: any;
  itineraryId?: number | null;
}): Promise<{ ok: boolean; requestId?: string; error?: string }> {
  const user = await getUserData();
  const res = await req("POST", "/api/verification/request", {
    userId: user?.id, // 과도기 = body userId(백엔드가 Bearer 우선, 없으면 body 사용)
    userMessage: input.userMessage,
    itineraryData: input.itineraryData ?? null,
    itineraryId: input.itineraryId ?? null,
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
export async function listInquiries(status?: InquiryStatus): Promise<Inquiry[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await req("GET", `/api/verification/requests${q}`);
  if (!res.ok) return [];
  return (await res.json()) as Inquiry[];
}

// ── 사용자: 안 읽은 답변 수(탭 배지) ──
export async function unreadCount(): Promise<number> {
  const user = await getUserData();
  const q = user?.id ? `?userId=${encodeURIComponent(user.id)}` : "";
  const res = await req("GET", `/api/verification/unread-count${q}`);
  if (!res.ok) return 0;
  const j = await res.json().catch(() => ({ count: 0 }));
  return j.count || 0;
}

// ── 상세(열람 시 백엔드가 본인 답변이면 읽음 처리) ──
export async function getInquiry(id: string): Promise<Inquiry | null> {
  const user = await getUserData();
  const q = user?.id ? `?userId=${encodeURIComponent(user.id)}` : "";
  const res = await req("GET", `/api/verification/requests/${id}${q}`);
  if (!res.ok) return null;
  return (await res.json()) as Inquiry;
}

// ── 전문가/관리자: 답변 전송(백엔드가 role 검사 + 질문자에게 알림 발송) ──
export async function replyInquiry(id: string, expertReply: string, status: InquiryStatus = "answered"): Promise<{ ok: boolean; error?: string }> {
  const res = await req("PATCH", `/api/verification/requests/${id}`, { status, expertReply });
  if (res.ok) return { ok: true };
  if (res.status === 403) return { ok: false, error: "expert_only" };
  if (res.status === 400) {
    const j = await res.json().catch(() => ({}));
    return { ok: false, error: j.error || "bad_request" };
  }
  return { ok: false, error: "server_error" };
}

// ── 내 역할 조회 = 기존 /api/auth/me(Bearer) 재사용 = role 컬럼 읽음(전문가/관리자 화면 분기용). 실패/미로그인 = 'user'. ──
export async function getMyRole(): Promise<"user" | "expert" | "admin"> {
  const res = await req("GET", "/api/auth/me");
  if (!res.ok) return "user";
  const u = await res.json().catch(() => ({}));
  return (u?.role === "expert" || u?.role === "admin") ? u.role : "user";
}

// ── 탭 배지 수 = 역할별(리뷰 2026-07-13). 사용자 = 안 읽은 답변 수 / 전문가·관리자 = 대기+검토중 받은 문의 수(응답 대기 신호). ──
export async function tabBadgeCount(): Promise<number> {
  const role = await getMyRole();
  if (role === "expert" || role === "admin") {
    const list = await listInquiries();
    return list.filter((q) => q.status === "pending" || q.status === "in_review").length;
  }
  return unreadCount();
}
