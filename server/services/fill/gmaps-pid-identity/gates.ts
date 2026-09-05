// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 승인 = §0 700줄 가드 = 폴더 분리(로직 무변경)
import type { Page } from "playwright";
import { readPlacePage, type BusinessStatus } from "./page-reader";

// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 지시 = 좌표 관문 2km = 이름 강일치(strong) 행은 초과 시 우리 좌표 오염으로 보고 페이지 좌표로 교정(coord-corrected) / 이름 약일치(weak)·실패 행은 초과 시 딴 장소(coord-mismatch = 안 씀).
export const COORD_GATE_KM = 2;
// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 지시 = 페이지 좌표 유효 범위 = 도시 중심 150km 이내. 실측 서울 2행 = 페이지 URL @lat,lng 가 지도 기본(세계) 뷰 = 10,192km/10,224km 떨어진 좌표를 "좌표 교정"으로 써 버림 = 그 밖이면 page-coord-invalid(좌표만 안 씀).
export const PAGE_COORD_MAX_KM = 150;
// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 지시 = 리뷰수 오독 방지 임계 = 우리 RC≥200 인데 페이지 RC 가 1/5 미만 = 실제 리뷰수는 5배 급락하지 않음 = rc_suspicious(안 씀). 단 우리 RC 가 1000 단위 딱 떨어지는 가짜 시드 패턴이면 페이지값 채택.
const RC_SUSPECT_MIN_OURS = 200;
const RC_SUSPECT_RATIO = 0.2;
// ⚠️ 수정금지(승인필요) 2026-08-27 사장님 지시 = 이름 관문(오매칭 감지) = 우리 name_en 과 페이지 h1 의 토큰 집합에 공통 토큰이 0개면 name-mismatch. 불용어 = 관사·전치사·시설 일반어·도시명(cities.name_en 은 실행 시 추가).
const NAME_STOP_WORDS = new Set([
  "de",
  "la",
  "el",
  "los",
  "las",
  "del",
  "y",
  "the",
  "of",
  "museo",
  "museum",
  "musee",
  "parque",
  "park",
  "centro",
  "casa",
  "san",
  "santa",
  "saint",
  "bogota",
  "paris",
]);
export function nameTokens(
  s: string | null,
  extraStop: Set<string>,
): Set<string> {
  const out = new Set<string>();
  if (!s) return out;
  const norm = s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const t of norm.split(/[^\p{L}\p{N}]+/u)) {
    if (t.length >= 3 && !NAME_STOP_WORDS.has(t) && !extraStop.has(t))
      out.add(t);
  }
  return out;
}
// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 지시 = 토큰 공통 판정 = 같거나 앞 5글자 이상 공통 접두(악센트 제거 후). 실측 보고타 #60671 "Planetarium of Bogotá" ↔ 페이지 "Planetario de Bogotá"(영어 페이지 h1 도 동일) = planetari|planetario = 같은 장소인데 정확 일치만 보면 오탐.
const TOKEN_PREFIX_MIN = 5;
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const n = Math.min(a.length, b.length);
  if (n < TOKEN_PREFIX_MIN) return false;
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i >= TOKEN_PREFIX_MIN;
}
// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 지시 = 이름 일치 강도. 실측 시카고 #60631 우리 "Washington Park" ↔ 페이지 "Washington Square Mall"(16.7km) = 공통 토큰 "washington" 1개만으로 이름 관문을 통과해 coord-corrected 로 좌표가 덮인 사고(수동 원복).
export type NameMatch = "strong" | "weak" | "none";
const STRONG_SHARE_RATIO = 0.6;
function normName(s: string | null): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
export function nameMatch(
  ourName: string | null,
  ours: Set<string>,
  pageName: string | null,
  extraStop: Set<string>,
): NameMatch {
  const theirs = nameTokens(pageName, extraStop);
  let shared = 0;
  for (const x of ours)
    for (const y of theirs)
      if (tokensMatch(x, y)) {
        shared++;
        break;
      }
  if (shared === 0) return "none";
  const smaller = Math.min(ours.size, theirs.size);
  if (shared >= 2 || (smaller >= 2 && shared >= smaller * STRONG_SHARE_RATIO))
    return "strong";
  const a = normName(ourName);
  const b = normName(pageName);
  if (a && b && (a.includes(b) || b.includes(a))) return "strong";
  return "weak";
}
const HANGUL_RE = /[가-힣]/;

export type Row = {
  id: number;
  seed_category: string;
  name_en: string | null;
  pid: string;
  lat: number | null;
  lng: number | null;
  rc: number | null;
  has_image: boolean; // ⚠️ 2026-09-04 = 사진 없는 행만 같은 방문에서 채운다(있으면 안 덮음).
};
export type Result = {
  id: number;
  name_en: string | null;
  pid: string;
  name_local: string | null;
  address: string | null;
  page_name_en: string | null; // hl=en h1 (name_en 빈 행 = 채움값 / 그 외 = 기록만)
  name_match: NameMatch | null; // 이름 일치 강도(strong|weak|none) / null = 대조 불가(name_en 빈 행·h1 없음). coord-corrected = strong 만.
  category: string | null;
  lat_ours: number | null; // 우리 행 좌표(좌표 교정 old→new 검수용)
  lng_ours: number | null;
  page_lat: number | null;
  page_lng: number | null;
  dist_km: number | null;
  dist_city_km: number | null; // 페이지 좌표 ↔ 도시 중심 거리(150km 초과 = page-coord-invalid)
  rc_ours: number | null;
  rc_page: number | null; // rc_unparsed 면 null(거부값 = rc_rejected) / rc_suspicious 면 페이지값 그대로 기록만(안 씀)
  rc_rejected: number | null; // rc_unparsed 로 거부된 원시 파싱값(검수용)
  rc_flag: "rc_unparsed" | "rc_suspicious" | null; // 둘 다 RC 안 씀
  rc_source: "aria" | "text" | null; // 리뷰수 출처(검수용)
  rating: string | null; // 기록만(컬럼 없음)
  photo_url: string | null; // ⚠️ 2026-09-04 사장님 결정 = 같은 방문에서 딴 대표사진(관문 통과 행만 씀 = 오염 차단)
  status: BusinessStatus | null;
  gate: "ok" | string; // ok | ok(no-address) | ok(coord-unverified) | coord-corrected | page-coord-invalid | consent-blocked | h1-empty | address-empty-ambiguous | name-mismatch | coord-mismatch | error:<msg> (2026-08-28 사장님 지시 = address-empty 폐기 → address-empty-ambiguous·ok(no-address) 로 분리)
  upsert?: string; // --apply 결과(action 또는 오류)
};
// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 지시 = 쓰기 대상 = ok 계열 + coord-corrected(페이지 좌표가 진실 = 우리 좌표 오염 교정) + page-coord-invalid(좌표만 빼고 나머지 컬럼 씀).
export const isWritable = (gate: string) =>
  gate.startsWith("ok") ||
  gate === "coord-corrected" ||
  gate === "page-coord-invalid";
// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 지시 = RC 쓰기 = 관문 통과 + rc_flag 없음일 때만.
export const rcWritable = (r: Result) =>
  isWritable(r.gate) && r.rc_flag == null && r.rc_page != null;

export function initResult(row: Row): Result {
  return {
    id: row.id,
    name_en: row.name_en,
    pid: row.pid,
    name_local: null,
    address: null,
    page_name_en: null,
    name_match: null,
    category: null,
    lat_ours: row.lat,
    lng_ours: row.lng,
    page_lat: null,
    page_lng: null,
    dist_km: null,
    dist_city_km: null,
    rc_ours: row.rc,
    rc_page: null,
    rc_rejected: null,
    rc_flag: null,
    rc_source: null,
    rating: null,
    photo_url: null,
    status: null,
    gate: "ok",
  };
}

export type GateContext = {
  page: Page;
  lang: string;
  // ⚠️ 수정금지(승인필요) 2026-09-04 사장님 결정 = 페이지를 한 번만 연다 = 검증(이름·좌표·리뷰수)과 사진을 같은 방문에서 함께 취득.
  photoWidth?: number;
  cityLat: number | null;
  cityLng: number | null;
  cityStop: Set<string>;
  distanceKmFromCoords: (
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ) => number;
};
export async function evaluateRow(
  ctx: GateContext,
  row: Row,
  r: Result,
): Promise<void> {
  const { page, lang, cityLat, cityLng, cityStop, distanceKmFromCoords } = ctx;
  const local = await readPlacePage(page, row.pid, lang, true, ctx.photoWidth);
  r.photo_url = local.photoUrl;
  r.name_local = local.h1;
  r.address = local.address;
  r.category = local.category;
  r.page_lat = local.urlLat;
  r.page_lng = local.urlLng;
  r.rating = local.rating;
  r.rc_source = local.rcSource;
  r.status = local.consentBlocked ? null : local.status;
  // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 지시 = 리뷰수 거부 규칙(서울 169행 4.6→46 오독 재발 방지) = 페이지 RC 가 round(별점×10)/round(별점×100) 과 같음 · 우리 RC≥100 인데 5 미만 · 본문 "(N)" 대체 출처인데 100 미만 = rc_unparsed(rc_page=null, 안 씀).
  {
    const rc = local.reviewCount;
    const rt = local.ratingNum;
    const ours = row.rc;
    const looksLikeRating =
      rc != null &&
      rt != null &&
      (rc === Math.round(rt * 10) || rc === Math.round(rt * 100));
    const tooSmall = rc != null && rc < 5 && ours != null && ours >= 100;
    const weakText = rc != null && local.rcSource === "text" && rc < 100;
    if (rc != null && (looksLikeRating || tooSmall || weakText)) {
      r.rc_rejected = rc;
      r.rc_page = null;
      r.rc_flag = "rc_unparsed";
    } else {
      r.rc_page = rc;
      if (
        rc != null &&
        ours != null &&
        ours >= RC_SUSPECT_MIN_OURS &&
        rc < ours * RC_SUSPECT_RATIO &&
        ours % 1000 !== 0
      )
        r.rc_flag = "rc_suspicious";
    }
  }
  // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 지시 = 페이지 좌표 유효 관문 = 도시 중심 150km 초과 = 지도 기본 뷰 좌표(서울 2행 10,192km/10,224km 사고) = page-coord-invalid = 좌표 안 씀·교정 아님.
  let pageCoordInvalid = false;
  if (
    cityLat != null &&
    cityLng != null &&
    local.urlLat != null &&
    local.urlLng != null
  ) {
    r.dist_city_km =
      Math.round(
        distanceKmFromCoords(cityLat, cityLng, local.urlLat, local.urlLng) *
          1000,
      ) / 1000;
    pageCoordInvalid = r.dist_city_km > PAGE_COORD_MAX_KM;
  }
  if (
    row.lat != null &&
    row.lng != null &&
    local.urlLat != null &&
    local.urlLng != null
  ) {
    r.dist_km =
      Math.round(
        distanceKmFromCoords(row.lat, row.lng, local.urlLat, local.urlLng) *
          1000,
      ) / 1000;
  }
  // ⚠️ 수정금지(승인필요) 2026-08-27 사장님 지시 = 관문 2종(이름·좌표) = PID 오염(오매칭) 감지. 이름 관문 = 양쪽 토큰이 다 있을 때만 판정(name_en 빈 행은 대조 불가 = 좌표 관문만).
  // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 지시 = name_en 이 한글(레거시 음역 데이터, 예 "안젤리나"="Angelina Paris - Rivoli")이면 프랑스어/영어 페이지 h1 과 토큰이 문자체계상 절대 안 겹쳐 매번 오탐 name-mismatch 가 남 = 이런 행도 name_en 빈 행과 동일하게 대조 불가 처리(좌표 관문만).
  const ours = nameTokens(row.name_en, cityStop);
  const comparable =
    ours.size > 0 && !!local.h1 && !HANGUL_RE.test(row.name_en || "");
  if (comparable)
    r.name_match = nameMatch(row.name_en, ours, local.h1, cityStop);
  let nameOk = !comparable || r.name_match !== "none";
  const coordFar =
    !pageCoordInvalid && r.dist_km != null && r.dist_km > COORD_GATE_KM;
  // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 확정 = hl=en 페이지 = name_en 빈 행(채움값) 또는 현지어 h1 과 안 겹친 행(영어 정식명 재대조 = 번역명 오탐 방지) 또는 약일치 + 2km 초과 행(영어 정식명으로 강일치 재시도)에서만 1장 더.
  if (lang === "en") r.page_name_en = local.h1;
  else if (
    !local.consentBlocked &&
    local.h1 &&
    (!row.name_en || !nameOk || (r.name_match === "weak" && coordFar))
  ) {
    const en = await readPlacePage(page, row.pid, "en", false);
    r.page_name_en = en.h1;
    if (comparable && en.h1) {
      const enMatch = nameMatch(row.name_en, ours, en.h1, cityStop);
      if (enMatch === "strong" || r.name_match === "none")
        r.name_match = enMatch;
      nameOk = r.name_match !== "none";
    }
  }
  // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 지시 = 구글 페이지가 진실. 이름 강일치(strong) + 2km 초과 = coord-corrected(우리 좌표 오염 → 페이지 좌표로 덮음, 실측 #60672 "Star Park Altavista" 9.87km) / 이름 실패 + 2km 초과 = coord-mismatch(딴 장소, 안 씀) / 이름 실패 + 2km 이내 = name-mismatch(안 씀).
  // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 지시(시카고 #60631 사고 수리) = 약일치(weak = 공통 토큰 1개뿐)·대조 불가(name_en 빈 행) + 2km 초과 = coord-mismatch(안 씀, "이름 약일치"/"이름 대조 불가"). 2km 이내 = weak 도 통과(같은 장소의 번역 변형).
  // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 지시 = 주소 없음(address-empty) 은 더 이상 자동 차단이 아님 = 광장·거리·구역(예 "Place de la Concorde"·"Le Marais")은 구글이 번지주소를 안 줘도 이름·좌표 관문은 통과하는 실제 장소(전 Paris 사례 dist_km 0~0.6). 이름/좌표 관문을 먼저 그대로 판정한 뒤, 주소 없음은 그 판정이 이미 실패(name-mismatch/coord-mismatch/coord-corrected)일 때만 "대조 재료 부족" 의미로 얹어 address-empty-ambiguous(쓰기 안 함)로 바꾸고, 통과(ok 계열)면 ok(no-address)(쓰기 함, address 컬럼은 null 그대로 넘겨 upsertPlace COALESCE 가 기존값 보존)로 확정한다.
  let gate: string;
  if (local.consentBlocked) gate = "consent-blocked";
  else if (!local.h1) gate = "h1-empty";
  else if (!nameOk) gate = coordFar ? "coord-mismatch" : "name-mismatch";
  else if (pageCoordInvalid) gate = "page-coord-invalid";
  else if (coordFar)
    gate = r.name_match === "strong" ? "coord-corrected" : "coord-mismatch";
  else if (r.dist_km == null && row.lat != null && row.lng != null)
    gate = "ok(coord-unverified)";
  else gate = "ok";
  if (!local.address) {
    if (gate === "ok" || gate === "ok(coord-unverified)")
      gate = "ok(no-address)";
    else if (
      gate === "name-mismatch" ||
      gate === "coord-mismatch" ||
      gate === "coord-corrected"
    )
      gate = "address-empty-ambiguous";
  }
  r.gate = gate;
}
