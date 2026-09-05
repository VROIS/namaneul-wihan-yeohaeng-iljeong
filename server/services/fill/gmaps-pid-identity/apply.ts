// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 승인 = §0 700줄 가드 = 폴더 분리(로직 무변경)
import { rawDate } from "../../shared/raw-filename";
import { type Result, type Row } from "./gates";

// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 확정 = 두 모드 공통 태그 1벌 = gmaps-pid-verify-<오늘>.
export const PHASE_TAG = `gmaps-pid-verify-${rawDate()}`;

// ⚠️ 수정금지(승인필요) 2026-09-04 사장님 확정 = 우편번호(유럽 5자리·영국·미국 ZIP·캐나다 등)가 들어간 문자열 = 주소. 이름 칸에 넣지 않는다.
const LOOKS_LIKE_ADDRESS = (s: string): boolean =>
  /\b\d{5}(-\d{4})?\b/.test(s) || // 75010 Paris · 10001-1234
  /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i.test(s) || // 영국 SW1A 1AA
  /\b\d{3}-\d{4}\b/.test(s) || // 일본 100-0001
  /\b[A-Z]\d[A-Z]\s*\d[A-Z]\d\b/i.test(s); // 캐나다 M5H 2N2
// ⚠️ 수정금지(승인필요) 2026-09-04 사장님 확정 = 페이지를 실제로 읽었나 = 검증 시각을 찍을 자격. 못 읽은 관문(error/consent-blocked/h1-empty)은 값이 전부 비어 있다.
export const pageWasRead = (r: Result): boolean =>
  !String(r.gate || "").startsWith("error") &&
  r.gate !== "consent-blocked" &&
  r.gate !== "h1-empty" &&
  (!!r.name_local || !!r.page_name_en || !!r.address || r.page_lat != null);
// ⚠️ 수정금지(승인필요) 2026-09-05 사장님 확정 = name_en 에 넣을 이름은 **영어 h1(page_name_en)뿐**. 현지어 h1(name_local)을 폴백으로 두면 --lang=fr 처럼 다른 언어로 연 순간 "Tour Eiffel" 이 name_en 을 덮는다(hl=en 으로 열면 page_name_en 에 같은 값이 들어오므로 손실 없음).
export function pickPageName(r: Result): string | null {
  const s = (r.page_name_en || "").trim();
  return s && !LOOKS_LIKE_ADDRESS(s) ? s : null;
}

type UpsertFn = (
  job: Record<string, unknown>,
) => Promise<{ action: string; reason?: string | null }>;
// ⚠️ 수정금지(승인필요) 2026-09-04 사장님 확정 = PID 로 대조를 마친 행은 의심 표시를 뗀다(안 떼면 다음에 또 같은 목록에 올라와 반복).
const SUSPECT_TAGS = [
  "중복의심",
  "name-mismatch-absorbed",
  "pid-twin-absorbed",
];
export async function clearSuspectTags(
  c: { query: (q: string, v?: unknown[]) => Promise<unknown> },
  rowId: number,
): Promise<void> {
  await c.query(
    `UPDATE place_seed_raw
        SET phase_tags = (SELECT ARRAY(SELECT t FROM unnest(COALESCE(phase_tags, ARRAY[]::text[])) t
                                        WHERE t <> ALL($2::text[]) AND t NOT LIKE '의심대상-%'))
      WHERE id = $1`,
    [rowId, SUSPECT_TAGS],
  );
}
export async function writeRow(
  upsertPlace: UpsertFn,
  cityId: number,
  row: Row,
  r: Result,
): Promise<void> {
  try {
    const read = pageWasRead(r);
    // ⚠️ 수정금지(승인필요) 2026-09-04 사장님 결정 = 페이지 1회 방문으로 검증+사진 = 사진은 사진 없는 행만(정본 §"페이지를 한 번만 연다")
    let imageUrl: string | undefined;
    if (r.photo_url && !row.has_image) {
      try {
        const res = await fetch(r.photo_url, {
          signal: AbortSignal.timeout(30000),
        });
        if (res.ok) {
          const { uploadToR2 } = await import("../../shared/r2-client");
          const up = await uploadToR2(
            `place-images/${cityId}/${row.seed_category}/${row.pid}.jpg`,
            Buffer.from(await res.arrayBuffer()),
            "image/jpeg",
          );
          imageUrl = up.publicUrl;
        }
      } catch {
        /* 사진 실패는 검증 쓰기를 막지 않는다 */
      }
    }
    const u = await upsertPlace({
      targetRowId: row.id,
      followTriggerDup: true,
      cityId,
      seedCategory: row.seed_category,
      imageUrl,
      // ⚠️ 수정금지(승인필요) 2026-09-04 사장님 확정 = PID 가 정답이나 **페이지를 실제로 읽었을 때만**(read) 값을 넘긴다. 못 읽은 행의 기본값을 넘기면 기존 값을 덮는다(business_status 기본 'OPERATIONAL' 이 폐업 기록을 지움). null = COALESCE 가 기존값 보존.
      //   이름 = 우편번호 든 문자열은 주소이지 이름이 아니다(pickPageName). 현지어명·한국어명은 제미니 영역 = 안 건드린다. page-coord-invalid = 좌표만 / rc_flag = RC 만 제외.
      nameEn: pickPageName(r) ?? row.name_en,
      address: read ? r.address : null,
      latitude: !read || r.gate === "page-coord-invalid" ? null : r.page_lat,
      longitude: !read || r.gate === "page-coord-invalid" ? null : r.page_lng,
      googleReviewCount: read && r.rc_flag == null ? r.rc_page : null,
      businessStatus: read ? r.status : null,
      verifySource: read ? "gmaps-pid-page" : null,
      phaseTags: [PHASE_TAG],
    });
    r.upsert =
      u.action === "updated" ? "updated" : `${u.action}(${u.reason || ""})`;
  } catch (e: any) {
    r.upsert = `error:${String(e?.message || e).slice(0, 80)}`;
  }
}
