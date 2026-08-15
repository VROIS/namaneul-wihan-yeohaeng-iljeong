// 📥 저장한 영상 API 1벌 (2026-08-03 사장님 확정)
// = 영상은 회사 자산(여정 video_by_day) → 저장 = "내 프로필에 담기" = saved_videos 연결 행(해설 guides 와 같은 DB 방식).
// = 부르는 곳 3: 프로필 '나의 TRIPIS' 영상 카드(목록) · 통합 모달 [저장]·열람해제 · 하단 TRIPIS 탭 뱃지.
//   전부 이 파일만 통과(§0·§16). 기기 다운로드 없음 = 앱에 접속해서 보는 구조(사장님 SSOT).
import { apiRequest } from "@/lib/query-client";
// ⚠️ 수정금지(승인필요) 2026-08-15 사장님 승인 = 네트워크 오류 폴백 다국어(§16 = i18n 싱글턴 재사용).
import i18n from "@/lib/i18n";

export interface SavedVideoRow {
  itineraryId: number;
  day: number;
  isNew: boolean; // 완료 자동게시 표식(★ + 탭 뱃지) = 그 영상 뷰를 1회 열면 해제
  title: string;
  startDate: string | null;
  savedAt: string;
}

// apiRequest 는 실패 시 `"401: {\"error\":\"로그인 필요\"}"` 꼴로 throw 한다(query-client throwIfResNotOk).
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

// 내가 담은 영상 목록 (미로그인·오류 = 빈 목록)
export async function listSavedVideos(): Promise<SavedVideoRow[]> {
  try {
    const r = await apiRequest("GET", "/api/videos/saved");
    const rows = await r.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

// [저장] = 담기 (생성기 우측 상단 버튼. 이미 담겨 있어도 성공)
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

// 탭 뱃지 수 = 아직 안 열어 본 완성 영상 수 (게스트·오류 = 0 = 뱃지는 장식, 앱을 막지 않는다)
export async function videoBadgeCount(): Promise<number> {
  try {
    const r = await apiRequest("GET", "/api/videos/badge");
    const j = await r.json();
    return typeof j?.count === "number" ? j.count : 0;
  } catch {
    return 0;
  }
}

// 열람 = ★·뱃지 해제 (사장님 SSOT = "이 영상 뷰를 1회 열 때부터 해제". 담긴 행이 없으면 서버가 0행 갱신 = 무해)
export async function markVideoSeen(
  itineraryId: number,
  day: number,
): Promise<void> {
  try {
    await apiRequest("POST", "/api/videos/seen", { itineraryId, day });
  } catch {}
}
