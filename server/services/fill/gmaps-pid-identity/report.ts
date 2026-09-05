// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 승인 = §0 700줄 가드 = 폴더 분리(로직 무변경)
import path from "path";
// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 승인 = 산출표 저장(mkdir+versionedName+쓰기) 1벌 = saveVersionedReport()
import { rawDate, saveVersionedReport } from "../../shared/raw-filename";
import { PHASE_TAG } from "./apply";
import {
  COORD_GATE_KM,
  PAGE_COORD_MAX_KM,
  isWritable,
  rcWritable,
  type Result,
} from "./gates";

export function printAndSaveReport(opts: {
  results: Result[];
  elapsed: number;
  apply: boolean;
  cityId: number;
  lang: string;
  ROOT: string;
}): void {
  const { results, elapsed, apply, cityId, lang, ROOT } = opts;
  console.table(
    results.map((r) => ({
      id: r.id,
      name_en: (r.name_en || "").slice(0, 28),
      "→ name_local": (r.name_local || "").slice(0, 28),
      page_name_en: (r.page_name_en || "").slice(0, 28),
      name_match: r.name_match || "",
      address: (r.address || "").slice(0, 36),
      rc_ours: r.rc_ours ?? "",
      rc_page: r.rc_page ?? "",
      rc_flag: r.rc_flag || "",
      rating: r.rating || "",
      status: r.status || "",
      dist_km: r.dist_km ?? "",
      gate: r.gate,
      ...(apply ? { upsert: r.upsert || "" } : {}),
    })),
  );
  const byGate: Record<string, number> = {};
  for (const r of results) byGate[r.gate] = (byGate[r.gate] || 0) + 1;
  const filled = results.filter((r) => r.upsert === "updated").length;
  const upsertErr = results.filter(
    (r) => r.upsert && r.upsert !== "updated",
  ).length;
  const writableRows = results.filter((r) => isWritable(r.gate));
  const nOk = results.filter((r) => r.gate.startsWith("ok")).length;
  const nName = byGate["name-mismatch"] || 0;
  const nCorr = byGate["coord-corrected"] || 0;
  const nCoord = byGate["coord-mismatch"] || 0;
  const nPci = byGate["page-coord-invalid"] || 0;
  const nErr = results.filter((r) => r.gate.startsWith("error:")).length;
  const closedRows = writableRows.filter(
    (r) => r.status && r.status !== "OPERATIONAL",
  );
  const nOther = results.length - nOk - nName - nCorr - nCoord - nPci - nErr;
  const rcChanged = writableRows.filter(
    (r) => rcWritable(r) && r.rc_page !== r.rc_ours,
  );
  // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 지시 = 리뷰수 파싱 실패/의심 = RC 안 쓴 행(관문 무관 전 행) 목록.
  const rcFlagged = results.filter((r) => r.rc_flag != null);
  const pageCoordInvalidRows = results.filter(
    (r) => r.gate === "page-coord-invalid",
  );
  const rcAvgDelta = rcChanged.length
    ? Math.round(
        rcChanged.reduce((s, r) => s + (r.rc_page! - (r.rc_ours ?? 0)), 0) /
          rcChanged.length,
      )
    : 0;
  console.log(
    `═══ 요약: ${elapsed.toFixed(1)}s · ${results.length}행 · ok ${nOk} · name-mismatch ${nName} · coord-corrected ${nCorr} · coord-mismatch ${nCoord} · page-coord-invalid ${nPci} · closed ${closedRows.length} · errors ${nErr} · 기타스킵 ${nOther} · RC 갱신 ${rcChanged.length}행(평균 변화 ${rcAvgDelta >= 0 ? "+" : ""}${rcAvgDelta}) · RC 안 씀(파싱실패/의심) ${rcFlagged.length}행 · 관문 ${JSON.stringify(byGate)}${apply ? ` · 채움 ${filled} · 쓰기오류 ${upsertErr}` : " · DRY(--apply 로 실행)"} ═══`,
  );
  // ⚠️ 수정금지(승인필요) 2026-08-27 사장님 지시 = 오매칭 의심 목록 = PID 페이지 이름이 우리 이름과 토큰 하나도 안 겹친 행 = 사장님 검수용(DB 안 씀).
  const suspects = results.filter((r) => r.gate === "name-mismatch");
  if (suspects.length) {
    console.log(
      `\n⚠️ 오매칭 의심(PID 페이지 이름 ≠ 우리 이름) = ${suspects.length}행 = 우리 행의 PID 가 딴 장소를 가리킬 가능성`,
    );
    for (const r of suspects) {
      console.log(
        `  #${r.id} | 우리: ${r.name_en || ""} | 페이지: ${r.name_local || ""}${r.page_name_en ? ` / en: ${r.page_name_en}` : ""} | ${r.category || ""} | ${r.address || ""}`,
      );
    }
  }
  // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 지시 = 좌표 교정 목록 = 이름은 같은데 우리 좌표가 페이지 좌표와 2km 초과 = 구글 페이지가 진실 = --apply 시 페이지 좌표로 덮음(old→new 거리 = 사장님 검수용).
  const coordCorrected = results.filter((r) => r.gate === "coord-corrected");
  if (coordCorrected.length) {
    console.log(
      `\n⚠️ 좌표 교정(우리 좌표 오염 → 페이지 좌표로 덮음) = ${coordCorrected.length}행 = ${apply ? "페이지 좌표로 씀" : "DRY = --apply 시 페이지 좌표로 씀"}`,
    );
    for (const r of coordCorrected) {
      console.log(
        `  #${r.id} | ${r.name_en || ""} | 페이지: ${r.name_local || ""} | (${r.lat_ours},${r.lng_ours}) → (${r.page_lat},${r.page_lng}) = ${r.dist_km}km | ${r.address || ""}`,
      );
    }
  }
  // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 지시 = 좌표 오염 의심 목록 = 이름 관문 실패(불일치) 또는 약일치(weak)·대조 불가 + 페이지 좌표 2km 초과 = 딴 장소 의심 = 그 행은 아무것도 안 씀(사장님 검수용, 사유 표시).
  const coordSuspects = results.filter((r) => r.gate === "coord-mismatch");
  if (coordSuspects.length) {
    console.log(
      `\n⚠️ 좌표 오염 의심(이름 불일치·약일치·대조 불가 + 페이지 @lat,lng 와 ${COORD_GATE_KM}km 초과) = ${coordSuspects.length}행 = 아무것도 안 씀`,
    );
    for (const r of coordSuspects) {
      const why =
        r.name_match === "weak"
          ? "이름 약일치"
          : r.name_match === "none"
            ? "이름 불일치"
            : "이름 대조 불가";
      console.log(
        `  #${r.id} | ${why} | 우리: ${r.name_en || ""} | 페이지: ${r.name_local || ""}${r.page_name_en ? ` / en: ${r.page_name_en}` : ""} | ${r.dist_km}km | ${r.address || ""}`,
      );
    }
  }
  // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 지시 = 페이지 좌표 무효 목록 = 도시 중심 150km 초과(지도 기본 뷰 좌표) = 좌표만 안 쓰고 나머지는 씀 = 교정 아님.
  if (pageCoordInvalidRows.length) {
    console.log(
      `\n⚠️ 페이지 좌표 무효(도시 중심 ${PAGE_COORD_MAX_KM}km 초과 = 지도 기본 뷰, 좌표 안 씀) = ${pageCoordInvalidRows.length}행 = 나머지 컬럼만 씀`,
    );
    for (const r of pageCoordInvalidRows) {
      console.log(
        `  #${r.id} | ${r.name_en || ""} | 페이지: ${r.name_local || ""} | 페이지 좌표 (${r.page_lat},${r.page_lng}) = 도시 중심에서 ${r.dist_city_km}km | 우리 (${r.lat_ours},${r.lng_ours}) 유지`,
      );
    }
  }
  // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 지시 = 리뷰수 파싱 실패/의심 목록 = rc_unparsed(별점 오독·본문 대체 100 미만 등 = 거부값 표시) / rc_suspicious(우리 RC 의 1/5 미만 급락) = 둘 다 RC 안 씀.
  if (rcFlagged.length) {
    console.log(
      `\n⚠️ 리뷰수 파싱 실패/의심(안 씀) = ${rcFlagged.length}행 = rc_unparsed ${rcFlagged.filter((r) => r.rc_flag === "rc_unparsed").length} · rc_suspicious ${rcFlagged.filter((r) => r.rc_flag === "rc_suspicious").length}`,
    );
    for (const r of rcFlagged) {
      console.log(
        `  #${r.id} | ${r.name_en || ""} | ${r.rc_flag} | 우리 RC ${r.rc_ours ?? ""} | 페이지 ${r.rc_flag === "rc_unparsed" ? `거부값 ${r.rc_rejected ?? ""}` : (r.rc_page ?? "")} | 별점 ${r.rating || ""} | ${r.gate}`,
      );
    }
  }
  if (closedRows.length) {
    console.log(
      `\n⚠️ 폐업·휴업(business_status) = ${closedRows.length}행 = 쓰기 대상 행이라 상태는 씀(서빙 관문 제외 근거)`,
    );
    for (const r of closedRows) {
      console.log(
        `  #${r.id} | ${r.name_en || ""} | ${r.status} | ${r.name_local || ""} | ${r.address || ""}`,
      );
    }
  }
  // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 지시 = address-empty 단독 차단 폐기(광장·거리 등은 주소 없이도 정상 장소) → 주소 없음 + 이름/좌표 관문도 실패(진짜 애매한 행)만 address-empty-ambiguous 로 남아 id 목록 보고(재확인용). 주소만 없고 관문 통과한 행은 ok(no-address) 로 이미 쓰기 대상(nOk 집계 포함).
  const addressAmbiguous = results.filter(
    (r) => r.gate === "address-empty-ambiguous",
  );
  if (addressAmbiguous.length) {
    console.log(
      `\n⚠️ address-empty-ambiguous(페이지 주소 없음 + 이름/좌표 관문도 실패 = 스킵) = ${addressAmbiguous.length}행 = id: ${addressAmbiguous.map((r) => r.id).join(", ")}`,
    );
  }

  const today = rawDate();
  const payload = {
    cityId,
    generatedAt: today,
    mode: "verify",
    lang,
    apply,
    coordGateKm: COORD_GATE_KM,
    pageCoordMaxKm: PAGE_COORD_MAX_KM,
    phaseTag: PHASE_TAG,
    summary: {
      rows: results.length,
      byGate,
      closed: closedRows.length,
      errors: nErr,
      rcChanged: rcChanged.length,
      rcAvgDelta,
      rcUnparsed: rcFlagged.filter((r) => r.rc_flag === "rc_unparsed").length,
      rcSuspicious: rcFlagged.filter((r) => r.rc_flag === "rc_suspicious")
        .length,
      pageCoordInvalid: nPci,
      filled,
      upsertErr,
    }, // 소요시간은 해시(중복판정)에서 제외 = 같은 결과면 1파일
    results,
  };
  const outDir = path.join(ROOT, "docs", "b1-reports", String(cityId));
  const outPath = saveVersionedReport(
    outDir,
    `${today}_gmaps-pid-identity.json`,
    payload,
  );
  console.log(`✓ 산출표 저장 = ${outPath}`);
}
