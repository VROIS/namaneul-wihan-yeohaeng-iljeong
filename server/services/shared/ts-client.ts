// ⚠️ 수정금지(승인필요) 2026-06-04 = TS(Google Places) 호출 단일 관문 = 사용자 SSOT 헌법
// = 앱 전체의 모든 Places 검색/사진 호출은 tsSearch()/tsPhoto() **만** 통과한다.
//   raw fetch('https://places.googleapis.com/...') 직접 호출 금지 (= 우회 = 누수).
// = 9요소 FieldMask 가 함수 안에 박혀있어 미만 호출 불가 (= 문서가 아니라 코드가 강제).
//   9요소 = PID / 로컬이름 / 풀주소 / 좌표 / 리뷰수(RC) / 가격 / 사진 / mapsUri / 영업상태.
//   ⚠️ rating(평점) 제외 = 우리는 안 씀.
// = 이유: TS 는 유료(€0.0299/콜) → 한 번에 9요소 전부 받아 옛값 덮어씀(최신검증 유지).
import { STANDARD_TS_FIELD_MASK, validateFieldMask } from './google-places-sku';

// ── 9요소 강제 = 모듈 로드 시 1회 검증 (= 마스크가 변질돼 9 미만이면 즉시 throw = 호출 자체 불가) ──
const REQUIRED_9 = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.location',
  'places.userRatingCount', 'places.priceRange', 'places.photos', 'places.googleMapsUri', 'places.businessStatus',
];
{
  const set = new Set(STANDARD_TS_FIELD_MASK.split(',').map((s) => s.trim()));
  const missing = REQUIRED_9.filter((f) => !set.has(f));
  if (missing.length) throw new Error(`[tsClient] STANDARD_TS_FIELD_MASK 9요소 결손: ${missing.join(', ')} = TS 호출 금지`);
  validateFieldMask(STANDARD_TS_FIELD_MASK); // Atmosphere 차단 재확인 (= §15)
}

// 9요소 응답 (= 우리 컬럼 매핑형)
export interface TsPlace {
  googlePlaceId: string | null;   // id
  nameLocal: string | null;       // displayName.text
  address: string | null;         // formattedAddress
  latitude: number | null;        // location.latitude
  longitude: number | null;       // location.longitude
  googleReviewCount: number | null; // userRatingCount
  priceEur: number | null;        // priceRange.endPrice.units
  photoName: string | null;       // photos[0].name
  googleMapsUri: string | null;
  businessStatus: string | null;
}

export interface TsSearchReq {
  apiKey: string;
  method: 'searchText' | 'searchNearby';
  regionCode?: string;
  languageCode?: string;      // 기본 'ko'
  // 입력 (보유분만 = TS 정확도↑):
  nameLocal?: string;         // searchText textQuery (= 로컬이름, 단독 = 주소와 안 합침)
  address?: string | null;    // 좌표 없을 때만 textQuery 보조
  latitude?: number | null;   // 좌표 앵커
  longitude?: number | null;
  textQuery?: string;         // 카테고리/명소 발굴 쿼리 (= nameLocal 대신 직접 지정)
  // 범위 (택1):
  rectangleKm?: number;       // 발굴 = locationRestriction 직사각형 (10km 도심 / 100km 외곽)
  anchorRadiusM?: number;     // 검증 = locationBias 원 (~10m 앵커 = 동명 다른장소 차단)
  circleRadiusM?: number;     // searchNearby = locationRestriction 원 (≤50km)
  includedTypes?: string[];   // searchNearby 전용
  priceLevels?: string[];     // searchText 가격필터
  maxResults?: number;        // searchText ≤60 / searchNearby ≤20
  timeoutMs?: number;
}

// 중심+반경(km) → 강제 사각형 viewport
const rectFromCenter = (lat: number, lng: number, km: number) => {
  const latD = km / 111;
  const lngD = km / (111 * Math.cos((lat * Math.PI) / 180));
  return { low: { latitude: lat - latD, longitude: lng - lngD }, high: { latitude: lat + latD, longitude: lng + lngD } };
};

const mapPlace = (p: any): TsPlace => ({
  googlePlaceId: p.id ?? null,
  nameLocal: p.displayName?.text ?? null,
  address: p.formattedAddress ?? null,
  latitude: p.location?.latitude ?? null,
  longitude: p.location?.longitude ?? null,
  googleReviewCount: p.userRatingCount ?? null,
  priceEur: p.priceRange?.endPrice?.units ? parseFloat(p.priceRange.endPrice.units) : null,
  photoName: p.photos?.[0]?.name ?? null,
  googleMapsUri: p.googleMapsUri ?? null,
  businessStatus: p.businessStatus ?? null,
});

/**
 * 단일 TS 검색 관문 = 9요소 강제. 앱의 모든 searchText/searchNearby 는 이 함수만 통과.
 * 범위 우선순위: 사각형(발굴) > 좌표앵커(검증) > 원. 좌표 있으면 textQuery=로컬이름(단독), 없으면 이름+주소.
 */
export async function tsSearch(req: TsSearchReq): Promise<TsPlace[]> {
  if (!req.apiKey) throw new Error('[tsSearch] apiKey 필수');
  const lang = req.languageCode || 'ko';
  const isNearby = req.method === 'searchNearby';
  const cap = Math.min(req.maxResults ?? 20, isNearby ? 20 : 60);
  const hasCoord = req.latitude != null && req.longitude != null;

  let loc: any = {};
  if (req.rectangleKm && hasCoord) {
    loc = { locationRestriction: { rectangle: rectFromCenter(req.latitude!, req.longitude!, req.rectangleKm) } };
  } else if (isNearby && req.circleRadiusM && hasCoord) {
    loc = { locationRestriction: { circle: { center: { latitude: req.latitude, longitude: req.longitude }, radius: Math.min(50000, req.circleRadiusM) } } };
  } else if (req.anchorRadiusM && hasCoord) {
    loc = { locationBias: { circle: { center: { latitude: req.latitude, longitude: req.longitude }, radius: req.anchorRadiusM } } };
  } else if (req.circleRadiusM && hasCoord) {
    loc = { locationBias: { circle: { center: { latitude: req.latitude, longitude: req.longitude }, radius: Math.min(50000, req.circleRadiusM) } } };
  }

  const textQuery = req.textQuery
    ?? (hasCoord ? (req.nameLocal || '') : [req.nameLocal, req.address].filter(Boolean).join(' '));

  const body: any = isNearby
    ? { includedTypes: req.includedTypes || ['restaurant'], maxResultCount: cap, rankPreference: 'POPULARITY', languageCode: lang, ...(req.regionCode ? { regionCode: req.regionCode } : {}), ...loc }
    : { textQuery, pageSize: cap, languageCode: lang, ...(req.regionCode ? { regionCode: req.regionCode } : {}), ...(req.priceLevels ? { priceLevels: req.priceLevels } : {}), ...loc };

  const endpoint = isNearby ? 'places:searchNearby' : 'places:searchText';
  const resp = await fetch(`https://places.googleapis.com/v1/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': req.apiKey, 'X-Goog-FieldMask': STANDARD_TS_FIELD_MASK },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(req.timeoutMs ?? 30000),
  });
  const j = (await resp.json()) as any;
  if (!resp.ok) throw new Error(`[tsSearch] ${resp.status} ${j?.error?.message || JSON.stringify(j?.error || {})}`);
  return (j.places || []).map(mapPlace);
}

export interface TsPhotoReq {
  apiKey: string;
  photoName: string;       // TsPlace.photoName
  storageKey: string;      // Supabase service role key (= SUPABASE_SERVICE_ROLE_KEY)
  supaPublicUrl: string;   // 전체 공개 URL (= SUPABASE_PUBLIC_URL, 예 https://xxxx.supabase.co) = image-pool 검증 패턴
  pathKey: string;         // 저장 경로 (예 `${cityId}/${cat}/${pid}`) — .jpg 자동 부착
  bucket?: string;         // 기본 'place-images'
  maxWidthPx?: number;
}

/** 단일 사진 관문 = PhotoMedia 다운 + Supabase Storage 업로드(PUT+x-upsert) → 공개 URL. 모든 사진 호출은 이 함수만. */
export async function tsPhoto(req: TsPhotoReq): Promise<string | null> {
  if (!req.apiKey || !req.photoName || !req.storageKey || !req.supaPublicUrl) return null;
  const bucket = req.bucket || 'place-images';
  try {
    const photoUrl = `https://places.googleapis.com/v1/${req.photoName}/media?maxWidthPx=${req.maxWidthPx ?? 800}&key=${req.apiKey}`;
    const pr = await fetch(photoUrl, { signal: AbortSignal.timeout(30000) });
    if (!pr.ok) return null;
    const buf = Buffer.from(await pr.arrayBuffer());
    const filePath = `${req.pathKey}.jpg`;
    const ur = await fetch(`${req.supaPublicUrl}/storage/v1/object/${bucket}/${filePath}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${req.storageKey}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
      body: buf,
    });
    if (!ur.ok) return null;
    return `${req.supaPublicUrl}/storage/v1/object/public/${bucket}/${filePath}`;
  } catch {
    return null;
  }
}
