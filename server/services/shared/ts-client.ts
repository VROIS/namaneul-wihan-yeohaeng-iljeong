// ⚠️ 수정금지(승인필요) 2026-06-04 = TS(Google Places) 호출 단일 관문 = 사용자 SSOT 헌법
// = 앱 전체의 모든 Places 검색/사진 호출은 tsSearch()/tsPhoto() **만** 통과한다.
//   raw fetch('https://places.googleapis.com/...') 직접 호출 금지 (= 우회 = 누수).
// = 9요소 FieldMask 가 함수 안에 박혀있어 미만 호출 불가 (= 문서가 아니라 코드가 강제).
//   9요소 = PID / 로컬이름 / 풀주소 / 좌표 / 리뷰수(RC) / 가격 / 사진 / mapsUri / 영업상태.
//   ⚠️ rating(평점) 제외 = 우리는 안 씀.
// = 이유: TS 는 유료(€0.0299/콜) → 한 번에 9요소 전부 받아 옛값 덮어씀(최신검증 유지).
import { STANDARD_TS_FIELD_MASK, validateFieldMask } from "./google-places-sku";
import { saveRaw } from "./save-raw";

// ⚠️ 수정금지(승인필요) 2026-07-09 사장님 SSOT = 사진 저장 해상도 단일 상수 = 구글 PhotoMedia 다운 시점부터 작게(내부 축소, Supabase 변환 유료 안 씀).
//   = FE 표시 실측: 메인앱 썸네일 56px, BTS 궤도카드 80×140px, BTS 하단 화면폭(~800px). 사장님 "BTS 하단 흐려져도 됨" → 400px 균형(800 대비 데이터 1/4 = 다운·저장·FE로딩 4배 빠름).
//   = 모든 사진 호출(ag3·repair·발굴스킬)이 이 관문(tsPhoto) 통과 = 이 상수 1곳으로 전체 통일(§16, 800 하드코딩 5곳 드리프트 폐기 §19).
export const PHOTO_MAX_WIDTH_PX = 400;

// ── 9요소 강제 = 모듈 로드 시 1회 검증 (= 마스크가 변질돼 9 미만이면 즉시 throw = 호출 자체 불가) ──
const REQUIRED_9 = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.userRatingCount",
  "places.priceRange",
  "places.photos",
  "places.googleMapsUri",
  "places.businessStatus",
];
{
  const set = new Set(STANDARD_TS_FIELD_MASK.split(",").map((s) => s.trim()));
  const missing = REQUIRED_9.filter((f) => !set.has(f));
  if (missing.length)
    throw new Error(
      `[tsClient] STANDARD_TS_FIELD_MASK 9요소 결손: ${missing.join(", ")} = TS 호출 금지`,
    );
  validateFieldMask(STANDARD_TS_FIELD_MASK); // Atmosphere 차단 재확인 (= §15)
}

// 9요소 응답 (= 우리 컬럼 매핑형)
export interface TsPlace {
  googlePlaceId: string | null; // id
  // ⚠️ 수정금지(승인필요) — TS displayName→name_en (2026-06-17 사장님 SSOT) = name_local은 Gemini전용
  nameEn: string | null; // displayName.text (= languageCode 미지정=영어 → name_en 컬럼)
  nameLocal: string | null; // ⚠️ 수정금지(승인필요) — TS displayName→name_en (2026-06-17 사장님 SSOT) = name_local은 Gemini전용 (= 하위호환 유지, TS는 항상 null)
  address: string | null; // formattedAddress
  latitude: number | null; // location.latitude
  longitude: number | null; // location.longitude
  googleReviewCount: number | null; // userRatingCount
  priceEur: number | null; // priceRange.endPrice.units
  photoName: string | null; // photos[0].name
  googleMapsUri: string | null;
  businessStatus: string | null;
}

export interface TsSearchReq {
  apiKey: string;
  method: "searchText" | "searchNearby";
  regionCode?: string;
  languageCode?: string; // ⚠️ 수정금지(승인필요) — languageCode 제거(2026-06-17 사장님 SSOT) = 미지정 시 키 생략(한국어 강제 안 함), 명시(예 'fr') 시에만 사용
  // 입력 (보유분만 = TS 정확도↑):
  nameLocal?: string; // searchText textQuery (= 로컬이름 단독 = 좌표는 아래 anchorRadiusM locationBias 로만)
  address?: string | null; // ⚠️ 2026-07-18 §19 = textQuery 조립에서 안 씀(주소 합치면 premise 오매칭). repair.ts/skill 잔존 소비자 위해 필드만 유지 = 통일 시 삭제.
  latitude?: number | null; // 좌표 앵커
  longitude?: number | null;
  textQuery?: string; // 카테고리/명소 발굴 쿼리 (= nameLocal 대신 직접 지정)
  // 범위 (택1):
  rectangleKm?: number; // 발굴 = locationRestriction 직사각형 (10km 도심 / 100km 외곽)
  anchorRadiusM?: number; // 검증 = locationBias 원 (~10m 앵커 = 동명 다른장소 차단)
  circleRadiusM?: number; // searchNearby = locationRestriction 원 (≤50km)
  includedTypes?: string[]; // searchNearby 전용
  priceLevels?: string[]; // searchText 가격필터
  maxResults?: number; // searchText ≤60 / searchNearby ≤20
  timeoutMs?: number;
  cityId?: number; // ⚠️ raw 저장 폴더 = docs/raw/{cityId}/ts-raw/ (미지정 시 _misc)
  rawTag?: string; // raw 파일명 태그 (= 호출 맥락 식별, 미지정 시 textQuery/nameLocal)
  localSkipRaw?: boolean; // ⚠️ 2026-06-19 사장님 SSOT = 건건 raw 로컬 생략(스토리지만) = 호출자가 모음 1파일 따로 만들 때. 미지정=기존대로 2곳.
  ourId?: number; // ⚠️ 2026-06-16 사장님 SSOT = 우리 place_seed_raw.id = raw.request 에 보존(매칭키) = 재입력 가능. (호출 동작 영향 0 = passthrough)
  // ⚠️ 수정금지(승인필요) 2026-06-16 사장님 SSOT = 관문(issueApiKey) 통과 증표.
  //   = ts-client 는 순수 HTTP 모듈 유지(db 주입 X) → 호출자가 api-gate.issueApiKey 로 키 받고 gated:true 세팅.
  //   = 기본 undefined = 하위호환(옛 호출 그대로). env TS_GATE_ENFORCE='1' 일 때만 검사(=점진 전환 후 차단).
  gated?: boolean;
}

// 중심+반경(km) → 강제 사각형 viewport
const rectFromCenter = (lat: number, lng: number, km: number) => {
  const latD = km / 111;
  const lngD = km / (111 * Math.cos((lat * Math.PI) / 180));
  return {
    low: { latitude: lat - latD, longitude: lng - lngD },
    high: { latitude: lat + latD, longitude: lng + lngD },
  };
};

const mapPlace = (p: any): TsPlace => ({
  googlePlaceId: p.id ?? null,
  // ⚠️ 수정금지(승인필요) — TS displayName→name_en (2026-06-17 사장님 SSOT) = name_local은 Gemini전용
  nameEn: p.displayName?.text ?? null, // displayName(영어) → name_en 컬럼
  nameLocal: null, // TS는 로컬이름 안 줌 = null (place-upsert COALESCE가 기존 Gemini값 보존)
  address: p.formattedAddress ?? null,
  latitude: p.location?.latitude ?? null,
  longitude: p.location?.longitude ?? null,
  googleReviewCount: p.userRatingCount ?? null,
  priceEur: p.priceRange?.endPrice?.units
    ? parseFloat(p.priceRange.endPrice.units)
    : null,
  photoName: p.photos?.[0]?.name ?? null,
  googleMapsUri: p.googleMapsUri ?? null,
  businessStatus: p.businessStatus ?? null,
});

// ⚠️ 수정금지(승인필요) 2026-06-09 사용자 SSOT = 외부호출 raw 저장 강제 (= 코드로). 단일 관문에 박아 모든 tsSearch 가 응답 원본을 저장 후 반환.
//   저장소 = Supabase Storage 'raw-responses' 버킷(shared/save-raw) = 발굴·런타임 둘 다 동작(FS 비의존). apiKey 는 raw 에 저장 안 함(비밀).
async function saveTsRaw(
  method: string,
  req: TsSearchReq,
  raw: any,
): Promise<void> {
  const { apiKey, ...reqSafe } = req;
  await saveRaw({
    source: "ts",
    contextId: req.cityId,
    tag: req.rawTag || req.textQuery || req.nameLocal || method,
    request: reqSafe,
    raw,
    // ⚠️ 2026-06-19 사장님 SSOT = 건건 raw 로컬 skip(스토리지만) = 호출자가 localSkipRaw=true 시. 미지정=기존대로 2곳.
    localSkip: req.localSkipRaw,
  });
}

/**
 * 단일 TS 검색 관문 = 9요소 강제. 앱의 모든 searchText/searchNearby 는 이 함수만 통과.
 * 범위 우선순위: 사각형(발굴) > 좌표앵커(검증) > 원. textQuery = 로컬명 단독(주소 합침 금지 = 2026-07-18 §19), 좌표는 locationBias 로만.
 */
export async function tsSearch(req: TsSearchReq): Promise<TsPlace[]> {
  if (!req.apiKey) throw new Error("[tsSearch] apiKey 필수");
  // ⚠️ 수정금지(승인필요) 2026-06-16 사장님 SSOT = 관문 수동 강제(soft-assert).
  //   = env TS_GATE_ENFORCE='1' 일 때만 검사 → gated≠true(=issueApiKey 미통과)면 throw = 우회 차단.
  //   = env 미설정(현 Replit/로컬 전부) = no-op = 하위호환 100% (옛 호출 동작 0 변경).
  //   = ts-client 는 db 미보유 순수 HTTP 모듈이므로 실제 검문(cities/psr SELECT)은 호출자 issueApiKey 가 수행.
  if (process.env.TS_GATE_ENFORCE === "1" && req.gated !== true) {
    throw new Error(
      "[tsSearch] 관문 미통과 = issueApiKey 로 발급한 키만 허용 (req.gated=true 필요)",
    );
  }
  // ⚠️ 수정금지(승인필요) — languageCode 제거(2026-06-17 사장님 SSOT) = displayName 한국어 강제 안 함
  //   = req.languageCode 명시(예 'fr') 시에만 사용, 미지정이면 undefined = body 에서 languageCode 키 생략(TS 현지 기본).
  const lang = req.languageCode;
  const isNearby = req.method === "searchNearby";
  const cap = Math.min(req.maxResults ?? 20, isNearby ? 20 : 60);
  const hasCoord = req.latitude != null && req.longitude != null;

  let loc: any = {};
  if (req.rectangleKm && hasCoord) {
    loc = {
      locationRestriction: {
        rectangle: rectFromCenter(
          req.latitude!,
          req.longitude!,
          req.rectangleKm,
        ),
      },
    };
  } else if (isNearby && req.circleRadiusM && hasCoord) {
    loc = {
      locationRestriction: {
        circle: {
          center: { latitude: req.latitude, longitude: req.longitude },
          radius: Math.min(50000, req.circleRadiusM),
        },
      },
    };
  } else if (req.anchorRadiusM && hasCoord) {
    loc = {
      locationBias: {
        circle: {
          center: { latitude: req.latitude, longitude: req.longitude },
          radius: req.anchorRadiusM,
        },
      },
    };
  } else if (req.circleRadiusM && hasCoord) {
    loc = {
      locationBias: {
        circle: {
          center: { latitude: req.latitude, longitude: req.longitude },
          radius: Math.min(50000, req.circleRadiusM),
        },
      },
    };
  }

  // ⚠️ 수정금지(승인필요) 2026-07-18 사장님 SSOT = textQuery = 로컬명 단독(주소 합침·영어명 폴백 금지) + 좌표는 locationBias(넓게=오차흡수).
  //   = 옛 "이름+주소 합침"(2026-07-05) 폐기(§19) = Fort Thüngen 실호출 실증: 주소 합치면 Google 이 주소텍스트에 낚여 그 좌표 premise(주소건물)를 반환 = 요새(RC 2361)를 놓침(RC 0 오매칭).
  //   = 정답 = 로컬명만 보내고 좌표 locationBias(1000m)로 근처 가중 = Google 텍스트매칭이 정답을 최상위로 올림(Fort Thüngen 3조합 실증 RC 2361 정확).
  const textQuery = req.textQuery ?? req.nameLocal;
  // ⚠️ 2026-07-18 = searchText 는 textQuery 필수. null/빈값(로컬명 누락)이면 Google 400 = 조용한 실패 대신 명확한 에러(?? 는 null 통과하므로 여기서 방어). searchNearby 는 textQuery 안 씀 = 무관.
  if (!isNearby && (!textQuery || String(textQuery).trim() === "")) {
    throw new Error(
      "[tsSearch] searchText = textQuery(로컬명) 필수 = null/빈값 = 호출부에서 로컬명 없는 곳 스킵 필요",
    );
  }

  // ⚠️ 수정금지(승인필요) — languageCode 제거(2026-06-17 사장님 SSOT) = lang(=req.languageCode) 있을 때만 키 삽입, 없으면 생략(한국어 강제 안 함)
  const body: any = isNearby
    ? {
        includedTypes: req.includedTypes || ["restaurant"],
        maxResultCount: cap,
        rankPreference: "POPULARITY",
        ...(lang ? { languageCode: lang } : {}),
        ...(req.regionCode ? { regionCode: req.regionCode } : {}),
        ...loc,
      }
    : {
        textQuery,
        pageSize: cap,
        ...(lang ? { languageCode: lang } : {}),
        ...(req.regionCode ? { regionCode: req.regionCode } : {}),
        ...(req.priceLevels ? { priceLevels: req.priceLevels } : {}),
        ...loc,
      };

  const endpoint = isNearby ? "places:searchNearby" : "places:searchText";
  const resp = await fetch(`https://places.googleapis.com/v1/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": req.apiKey,
      "X-Goog-FieldMask": STANDARD_TS_FIELD_MASK,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(req.timeoutMs ?? 30000),
  });
  const j = (await resp.json()) as any;
  if (!resp.ok)
    throw new Error(
      `[tsSearch] ${resp.status} ${j?.error?.message || JSON.stringify(j?.error || {})}`,
    );
  await saveTsRaw(req.method, req, j); // ⚠️ 외부호출 = raw 저장 강제 (DB 입력 전 선행 보존 = 소 안 잃음)
  return (j.places || []).map(mapPlace);
}

export interface TsPhotoReq {
  apiKey: string;
  photoName: string; // TsPlace.photoName
  storageKey: string; // Supabase service role key (= SUPABASE_SERVICE_ROLE_KEY)
  supaPublicUrl: string; // 전체 공개 URL (= SUPABASE_PUBLIC_URL, 예 https://xxxx.supabase.co) = image-pool 검증 패턴
  pathKey: string; // 저장 경로 (예 `${cityId}/${cat}/${pid}`) — .jpg 자동 부착
  bucket?: string; // 기본 'place-images'
  maxWidthPx?: number;
  // ⚠️ 수정금지(승인필요) 2026-06-16 사장님 SSOT = 관문(issueApiKey) 통과 증표 (= tsSearch 와 동일 원리).
  //   = 기본 undefined = 하위호환. env TS_GATE_ENFORCE='1' 일 때만 검사. PM 키('pm')도 동일 issueApiKey 경유.
  gated?: boolean;
}

/** 단일 사진 관문 = PhotoMedia 다운 + Supabase Storage 업로드(PUT+x-upsert) → 공개 URL. 모든 사진 호출은 이 함수만. */
export async function tsPhoto(req: TsPhotoReq): Promise<string | null> {
  if (!req.apiKey || !req.photoName || !req.storageKey || !req.supaPublicUrl)
    return null;
  // ⚠️ 수정금지(승인필요) 2026-06-16 사장님 SSOT = 관문 수동 강제(soft-assert).
  //   = env TS_GATE_ENFORCE='1' 일 때만 검사 → gated≠true 면 return null(=tsPhoto 기존 '에러=null' 계약 유지).
  //     (throw 로 바꾸면 06 post-process / restaurant-image-targets 의 if(!imageUrl) 분기 의미가 변질됨)
  //   = env 미설정 = no-op = 하위호환 100%.
  if (process.env.TS_GATE_ENFORCE === "1" && req.gated !== true) return null;
  const bucket = req.bucket || "place-images";
  try {
    const photoUrl = `https://places.googleapis.com/v1/${req.photoName}/media?maxWidthPx=${req.maxWidthPx ?? PHOTO_MAX_WIDTH_PX}&key=${req.apiKey}`;
    const pr = await fetch(photoUrl, { signal: AbortSignal.timeout(30000) });
    if (!pr.ok) return null;
    const buf = Buffer.from(await pr.arrayBuffer());
    const filePath = `${req.pathKey}.jpg`;
    const ur = await fetch(
      `${req.supaPublicUrl}/storage/v1/object/${bucket}/${filePath}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${req.storageKey}`,
          "Content-Type": "image/jpeg",
          "x-upsert": "true",
        },
        body: buf,
      },
    );
    if (!ur.ok) return null;
    return `${req.supaPublicUrl}/storage/v1/object/public/${bucket}/${filePath}`;
  } catch {
    return null;
  }
}
