/**
 * ⚠️ 수정금지(승인필요) 2026-05-17 = 파리 DB-only 전환 3 단계 표준화 plan §1
 *
 * Step 1 = enrichPlaceByGemini = id ASC batch (= 사용자 SSOT = 카테고리 무시, 40 장소/호출)
 * = Gemini 만 줄 수 있는 정보 (summary_ko / editorial_summary / price_eur) + 부수 (name_ko/name_local/address/lat/lng)
 * = dryRun = true = DB 변경 0 = raw 응답만 (= 사용자 검증 후 DB UPDATE 명시)
 * = dryRun = false = upsertPlace() 통과 = 1차 덮어쓰기 (= 헌법 §14 단일 진입점)
 *
 * Adaptive fallback (= 사용자 SSOT) = 40 실패 → 30 → 20 → 10
 */

import { db } from '../../db';
import { placeSeedRaw } from '@shared/schema';
import { eq, asc } from 'drizzle-orm';
import { geminiJson } from '../shared/geminiClient';
import { upsertPlace } from '../place-upsert';

interface GeminiInputPlace {
  id: number;
  name_en: string;
  name_local: string | null;
  name_ko: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  google_place_id: string | null;
  seed_category: string;
}

interface GeminiOutputPlace {
  id: number;
  name_en: string;
  name_local: string | null;
  name_ko: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  summary_ko: string | null;
  editorial_summary: string | null;
  price_eur: number | null;
}

interface GeminiResponse {
  places: GeminiOutputPlace[];
}

export interface EnrichOpts {
  batchSize?: number; // default 40
  offset?: number; // default 0
  dryRun?: boolean; // default true (= 안전 기본)
}

export interface EnrichBatchResult {
  cityId: number;
  batchSize: number;
  offset: number;
  inputCount: number;
  rawResponse: string;
  finishReason: string;
  parseError?: string;
  parsedPlaces: GeminiOutputPlace[];
  missingIds: number[];
  unexpectedIds: number[];
  dryRun: boolean;
  upsertSummary?: {
    inserted: number;
    updated: number;
    skipped: number;
    errors: string[];
  };
}

/**
 * Paris 활성 행 (= archive 제외) = id ASC = batch 만큼 SELECT
 */
async function selectBatch(cityId: number, batchSize: number, offset: number) {
  if (!db) throw new Error('db unavailable');
  const rows = await db
    .select({
      id: placeSeedRaw.id,
      seedCategory: placeSeedRaw.seedCategory,
      nameEn: placeSeedRaw.nameEn,
      nameLocal: placeSeedRaw.nameLocal,
      nameKo: placeSeedRaw.nameKo,
      address: placeSeedRaw.address,
      latitude: placeSeedRaw.latitude,
      longitude: placeSeedRaw.longitude,
      googlePlaceId: placeSeedRaw.googlePlaceId,
      phaseTags: placeSeedRaw.phaseTags,
    })
    .from(placeSeedRaw)
    .where(eq(placeSeedRaw.cityId, cityId))
    .orderBy(asc(placeSeedRaw.id));

  // ⚠️ 수정금지(승인필요) 2026-05-21 = archive 마커 폐기 (= 사용자 SSOT = 1 장소 = 1 행 정적)
  return rows.slice(offset, offset + batchSize);
}

function buildPrompt(input: GeminiInputPlace[]): string {
  return `역할: 너는 한국인 여행자를 위한 파리 장소 정보 보강 전문가야.

⚠️ 응답 근거 = **Google Search 그라운딩 기반** = 최신/검증된 사실 (= 가격/주소/한국어 호칭) 만 사용 = 추정/환각 금지.

목적: 파리 (city_id=19) 의 기존 장소 ${input.length} 곳 = 누락 정보를 채우고 + 한국 관점 큐레이션을 작성한다.

입력 = 각 장소 = JSON (= id 는 우리 place_seed_raw.id = 응답 매칭 키)
  - id: number (= place_seed_raw.id = 응답에 정확히 매칭 필수)
  - name_en: string (= 공식 영어명 = 변경 X)
  - name_local: string | null
  - name_ko: string | null
  - address: string | null
  - latitude: number | null
  - longitude: number | null
  - google_place_id: string | null
  - seed_category: 'restaurant'|'attraction'|'healing'|'adventure'|'hotspot'|'heritage'|'shopping'

응답 (= JSON 배열, 설명 텍스트 X):
{
  "places": [
    {
      "id": <입력 id 그대로 = place_seed_raw.id>,
      "name_en": "<입력 그대로 = 변경 X>",
      "name_local": "<현지 원어명 = 예 'Tour Eiffel' / 입력 있으면 검증 / 없으면 채움>",
      "name_ko": "<한국 여행자 친숙 호칭 = 예 '에펠탑' / 입력 있으면 검증 / 없으면 채움>",
      "address": "<번지 + 거리 + 우편번호 + 도시 + 국가 = 예 '5 Avenue Anatole France, 75007 Paris, France'>",
      "latitude": <위도 6 자리 = 예 48.858370>,
      "longitude": <경도 6 자리 = 예 2.294481>,
      "summary_ko": "<한 줄 숏폼 대사 = 인스타/FOMO 사회적 검증 = 한국어 25 자 이내>",
      "editorial_summary": "<한 줄 한국인 관점 선정 이유 = 코믹/위트 후킹 카피 = 한국어 35 자 이내>",
      "price_eur": <1인 입장료 또는 평균 식대 EUR 숫자 = shopping 은 null>
    }
  ]
}

규칙:
1. 모든 입력 id = 응답에 정확히 포함 (= 누락 0) ← id = 우리 place_seed_raw.id = 매칭 키
2. name_en = 입력 그대로 (= 변경 절대 X = 매칭 키)
3. 좌표 = 6 자리 소수 (= 예 48.858370, 2.294481)
4. address = 번지부터 국가까지 완전 (= 부분 주소 X)
5. summary_ko / editorial_summary = 한국어만 (= 영어 단어 혼용 X)
6. price_eur = shopping 카테고리 = null 강제 / 그 외 = 합리적 EUR 정수
7. 응답 = 위 JSON 만 (= 설명/주석/마크다운 X)

입력 ${input.length} 장소:
${JSON.stringify(input, null, 2)}
`;
}

/**
 * cityId Paris (= 19) 활성 행 = id ASC = batch 만큼 = Gemini 호출 → (dryRun X) upsertPlace
 */
export async function enrichPlaceByGemini(
  cityId: number,
  opts?: EnrichOpts,
): Promise<EnrichBatchResult> {
  const batchSize = opts?.batchSize ?? 40;
  const offset = opts?.offset ?? 0;
  const dryRun = opts?.dryRun ?? true;

  const batch = await selectBatch(cityId, batchSize, offset);
  const input: GeminiInputPlace[] = batch.map((r) => ({
    id: r.id,
    name_en: r.nameEn || '',
    name_local: r.nameLocal,
    name_ko: r.nameKo,
    address: r.address,
    latitude: r.latitude != null ? Number(r.latitude) : null,
    longitude: r.longitude != null ? Number(r.longitude) : null,
    google_place_id: r.googlePlaceId,
    seed_category: r.seedCategory,
  }));

  const prompt = buildPrompt(input);
  const { raw, data, finishReason, parseError } =
    await geminiJson<GeminiResponse>(prompt, { googleSearch: true });

  const parsed = data?.places || [];
  const inputIds = new Set(input.map((i) => i.id));
  const responseIds = new Set(parsed.map((p) => Number(p.id)));
  const missingIds = [...inputIds].filter((id) => !responseIds.has(id));
  const unexpectedIds = [...responseIds].filter((id) => !inputIds.has(id));

  const result: EnrichBatchResult = {
    cityId,
    batchSize,
    offset,
    inputCount: input.length,
    rawResponse: raw,
    finishReason,
    parseError,
    parsedPlaces: parsed,
    missingIds,
    unexpectedIds,
    dryRun,
  };

  if (!dryRun && parsed.length > 0) {
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const p of parsed) {
      const orig = batch.find((b) => b.id === Number(p.id));
      if (!orig) {
        errors.push(`unknown id ${p.id} (not in input)`);
        continue;
      }
      try {
        const isShopping = orig.seedCategory === 'shopping';
        const priceEur = isShopping
          ? null
          : p.price_eur != null
            ? p.price_eur
            : null;
        const r = await upsertPlace({
          cityId,
          seedCategory: orig.seedCategory,
          nameEn: p.name_en || orig.nameEn,
          nameLocal: p.name_local || undefined,
          nameKo: p.name_ko || undefined,
          address: p.address || undefined,
          latitude: p.latitude != null ? p.latitude : undefined,
          longitude: p.longitude != null ? p.longitude : undefined,
          googlePlaceId: orig.googlePlaceId || undefined,
          priceEur: priceEur != null ? priceEur : undefined,
          selectionReasonKo: p.summary_ko || undefined,
          shortformKo: p.editorial_summary || undefined,
        });
        if (r.action === 'inserted') inserted++;
        else if (r.action === 'updated') updated++;
        else skipped++;
      } catch (e: any) {
        errors.push(`upsert id ${p.id}: ${e.message || String(e)}`);
      }
    }

    result.upsertSummary = { inserted, updated, skipped, errors };
  }

  return result;
}
