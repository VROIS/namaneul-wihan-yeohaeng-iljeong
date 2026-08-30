// 📥 저장한 영상 API 1벌 (2026-08-03 사장님 확정)
import { apiRequest } from "@/lib/query-client";
// ⚠️ 수정금지(승인필요) 2026-08-15 사장님 승인 = 네트워크 오류 폴백 다국어(§16 = i18n 싱글턴 재사용).
import i18n from "@/lib/i18n";

export interface SavedVideoRow {
  itineraryId: number;
  day: number;
  isNew: boolean; // 완료 자동게시 표식(★ + 탭 뱃지) = 그 영상 뷰를 1회 열면 해제
  title: string;
  cityNameEn?: string | null;
  startDate: string | null;
  savedAt: string;
}

// 그 안의 서버 사유(error)만 꺼내 사용자에게 그대로 보여준다(뭉개기 금지 = 사장님 SSOT 2026-07-31).
function serverReason(e: unknown): string {
  const msg = String((e as Error)?.message || "");
  const m = msg.match(/^\d{3}:\s*([\s\S]+)$/);
  if (m) {
    try {
      const j = JSON.parse(m[1]);
      if (j?.error) return j.error;
    } catch {}
    return m[1];
  }
  return msg || i18n.t("common.networkError");
}

export async function listSavedVideos(): Promise<SavedVideoRow[]> {
  try {
    const r = await apiRequest("GET", "/api/videos/saved");
    const rows = await r.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export async function saveVideo(
  itineraryId: number,
  day: number,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await apiRequest("POST", "/api/videos/save", { itineraryId, day });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: serverReason(e) };
  }
}

export async function videoBadgeCount(): Promise<number> {
  try {
    const r = await apiRequest("GET", "/api/videos/badge");
    const j = await r.json();
    return typeof j?.count === "number" ? j.count : 0;
  } catch {
    return 0;
  }
}

export async function markVideoSeen(
  itineraryId: number,
  day: number,
): Promise<void> {
  try {
    await apiRequest("POST", "/api/videos/seen", { itineraryId, day });
  } catch {}
}
