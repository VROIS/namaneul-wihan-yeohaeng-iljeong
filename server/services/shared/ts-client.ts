// ⚠️ 수정금지(승인필요) 2026-06-04 = TS(Google Places) 호출 단일 관문 = 사용자 SSOT 헌법
import { STANDARD_TS_FIELD_MASK, validateFieldMask } from "./google-places-sku";
import { saveRaw } from "./save-raw";
import { recordExternalCall, precheck } from "./external-call-log"; // 2026-08-23 사장님 승인 = 유료호출 카운터
import { uploadToR2, isR2Configured } from "./r2-client";

// ⚠️ 수정금지(승인필요) 2026-07-09 사장님 SSOT = 사진 저장 해상도 단일 상수 = 구글 PhotoMedia 다운 시점부터 작게(내부 축소 = 저장소 유료 변환 안 씀).
export const PHOTO_MAX_WIDTH_PX = 400;

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

export interface TsPlace {
  googlePlaceId: string | null; // id
  // ⚠️ 수정금지(승인필요) — TS displayName→name_en (2026-06-17 사장님 SSOT) = name_local은 Gemini전용
  nameEn: string | null; // displayName.text (= languageCode 미지정=영어 → name_en 컬럼)
  nameLocal: string | null; // ⚠️ 수정금지(승인필요) — TS displayName→name_en (2026-06-17 사장님 SSOT) = name_local은 Gemini전용 (= 하위호환 유지, TS는 항상 null)
  address: string | null; // formattedAddress
  latitude: number | null; // location.latitude
  longitude: number | null; // location.longitude
  googleReviewCount: number | null; // userRatingCount
  // ⚠️ 수정금지(승인필요) 2026-08-19 사장님 승인 = price_eur 필드 완전삭제(§19, 좌표=절대권위 원칙의 가격 적용).
  photoName: string | null; // photos[0].name
  googleMapsUri: string | null;
  businessStatus: string | null;
}

export interface TsSearchReq {
  apiKey: string;
  method: "searchText" | "searchNearby";
  regionCode?: string;
  languageCode?: string; // ⚠️ 수정금지(승인필요) — languageCode 제거(2026-06-17 사장님 SSOT) = 미지정 시 키 생략(한국어 강제 안 함), 명시(예 'fr') 시에만 사용
  nameLocal?: string; // searchText textQuery (= 로컬이름 단독 = 좌표는 아래 anchorRadiusM locationBias 로만)
  address?: string | null; // ⚠️ 2026-07-18 §19 = textQuery 조립에서 안 씀(주소 합치면 premise 오매칭). repair.ts/skill 잔존 소비자 위해 필드만 유지 = 통일 시 삭제.
  latitude?: number | null; // 좌표 앵커
  longitude?: number | null;
  textQuery?: string; // 카테고리/명소 발굴 쿼리 (= nameLocal 대신 직접 지정)
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
  gated?: boolean;
}

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
  // ⚠️ 2026-08-19 = priceEur 필드 삭제(§19, 위 interface 주석 참조) = 응답원본(priceRange)은 §18 raw 저장에
  photoName: p.photos?.[0]?.name ?? null,
  googleMapsUri: p.googleMapsUri ?? null,
  businessStatus: p.businessStatus ?? null,
});

// ⚠️ 수정금지(승인필요) 2026-06-09 사용자 SSOT = 외부호출 raw 저장 강제 (= 코드로). 단일 관문에 박아 모든 tsSearch 가 응답 원본을 저장 후 반환.
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

export async function tsSearch(req: TsSearchReq): Promise<TsPlace[]> {
  if (!req.apiKey) throw new Error("[tsSearch] apiKey 필수");
  // ⚠️ 수정금지(승인필요) 2026-06-16 사장님 SSOT = 관문 수동 강제(soft-assert).
  if (process.env.TS_GATE_ENFORCE === "1" && req.gated !== true) {
    throw new Error(
      "[tsSearch] 관문 미통과 = issueApiKey 로 발급한 키만 허용 (req.gated=true 필요)",
    );
  }
  // ⚠️ 수정금지(승인필요) — languageCode 제거(2026-06-17 사장님 SSOT) = displayName 한국어 강제 안 함
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
  const textQuery = req.textQuery ?? req.nameLocal;
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
  await precheck("ts"); // 2026-08-23 사장님 = 출입증형 사전판정(잔량·추가과금) = 호출 직전 1줄
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
  // 2026-08-23 사장님 승인 = 유료호출 기록(Text Search Enterprise = 월 1,000 무료 후 과금) = 호출 성공 직후 1줄
  void recordExternalCall({
    provider: "ts",
    sku: "text_search_enterprise",
    cityId: req.cityId ?? null,
  });
  return (j.places || []).map(mapPlace);
}

export interface TsPhotoReq {
  apiKey: string;
  photoName: string; // TsPlace.photoName
  pathKey: string; // 저장 경로 (예 `${cityId}/${cat}/${pid}`) — .jpg 자동 부착
  maxWidthPx?: number;
  // ⚠️ 수정금지(승인필요) 2026-06-16 사장님 SSOT = 관문(issueApiKey) 통과 증표 (= tsSearch 와 동일 원리).
  gated?: boolean;
}

// ⚠️ 수정금지(승인필요) 2026-08-06 사장님 SSOT = 사진 저장 = R2 place-images/ 프리픽스 1곳(옛 Supabase 버킷·storageKey/supaPublicUrl 인자 폐기 = 2026-08-06 Cloudflare 이전계획 1단계 §19).
const PHOTO_PREFIX = "place-images";

export async function tsPhoto(req: TsPhotoReq): Promise<string | null> {
  if (!req.apiKey || !req.photoName || !isR2Configured()) return null;
  // ⚠️ 수정금지(승인필요) 2026-06-16 사장님 SSOT = 관문 수동 강제(soft-assert).
  if (process.env.TS_GATE_ENFORCE === "1" && req.gated !== true) return null;
  try {
    const photoUrl = `https://places.googleapis.com/v1/${req.photoName}/media?maxWidthPx=${req.maxWidthPx ?? PHOTO_MAX_WIDTH_PX}&key=${req.apiKey}`;
    await precheck("pm"); // 2026-08-23 출입증형 사전판정
    const pr = await fetch(photoUrl, { signal: AbortSignal.timeout(30000) });
    if (!pr.ok) return null;
    // 2026-08-23 사장님 승인 = 유료호출 기록(Place Details Photos = 월 1,000 무료 후 과금).
    void recordExternalCall({
      provider: "pm",
      sku: "place_details_photos",
      cityId: parseInt(req.pathKey, 10) || null,
      tag: req.pathKey,
    });
    const buf = Buffer.from(await pr.arrayBuffer());
    const up = await uploadToR2(
      `${PHOTO_PREFIX}/${req.pathKey}.jpg`,
      buf,
      "image/jpeg",
    );
    return up.publicUrl;
  } catch {
    return null;
  }
}
