// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 승인 = §0 700줄 가드 = 폴더 분리(로직 무변경)
// = gmaps-pid-identity 의 쓰기 1벌 = --apply 시 호출부(entry)가 isWritable 행만 넘김 → upsertPlace(targetRowId 직행) 페이로드 조립·호출·결과 기록. upsertPlace 는 .env 로드 뒤 동적 import 된 함수를 그대로 받음.
import { rawDate } from "../../shared/raw-filename";
import { rcWritable, type Result, type Row } from "./gates";

// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 확정 = 두 모드 공통 태그 1벌 = gmaps-pid-verify-<오늘>.
export const PHASE_TAG = `gmaps-pid-verify-${rawDate()}`;

type UpsertFn = (
  job: Record<string, unknown>,
) => Promise<{ action: string; reason?: string | null }>;
export async function writeRow(
  upsertPlace: UpsertFn,
  cityId: number,
  row: Row,
  r: Result,
): Promise<void> {
  try {
    // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 확정 = 쓰기 컬럼 = 현지명·주소·한국어명·좌표(페이지 @lat,lng = 구글 공식 = 새것 우선 §14, coord-corrected 행은 이 좌표가 곧 교정값)·리뷰수·영업상태 + name_en(우리 값 없을 때만 페이지 영어명). 이미지·가격·PID 안 넘김 = COALESCE 뼈대 보존.
    // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 지시 = followTriggerDup=true = 우리 id 확정행 직행 UPDATE 에 문지기 불변1(PID 일치) 면제(place-upsert.ts 277-283 = 트랜잭션 한정 skip_dup_check, pid-twin-merge 동일 방식). 실측 보고타 --apply = 같은 PID 쌍둥이 #60656/#81549 가 "error:[중복차단]" 으로 막힘.
    const u = await upsertPlace({
      targetRowId: row.id,
      followTriggerDup: true,
      cityId,
      seedCategory: row.seed_category,
      nameEn: row.name_en || r.page_name_en,
      nameLocal: r.name_local,
      address: r.address,
      nameKo: r.name_ko,
      // 2026-08-28 사장님 지시 = page-coord-invalid 행 = 좌표 안 넘김(null = COALESCE 뼈대 보존) / rc_flag 행 = RC 안 넘김.
      latitude: r.gate === "page-coord-invalid" ? null : r.page_lat,
      longitude: r.gate === "page-coord-invalid" ? null : r.page_lng,
      googleReviewCount: rcWritable(r) ? r.rc_page : null,
      businessStatus: r.status,
      phaseTags: [PHASE_TAG],
    });
    r.upsert =
      u.action === "updated" ? "updated" : `${u.action}(${u.reason || ""})`;
  } catch (e: any) {
    r.upsert = `error:${String(e?.message || e).slice(0, 80)}`;
  }
}
