/**
 * ⚠️ 수정금지(승인필요) 2026-05-23 = 사용자 SSOT
 * = 신규 도시 자동 백필 헬퍼 (= city-resolver.ts 5 단계 = cities INSERT 직전 호출)
 * = Gemini 한 번 호출 = 도시 메타 (= 좌표/국가/타임존/한국어/현지어) JSON 반환
 * = 실패 = null (= 도시 미존재 = caller 가 매칭 null 반환)
 */

import { geminiJson } from './geminiClient';

export interface CityMeta {
  nameKo: string;
  nameEn: string;
  nameLocal: string;
  countryCode: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
  primaryLanguage: string;
}

export async function fetchCityMetaFromGemini(input: string): Promise<CityMeta | null> {
  const prompt = `역할: 너는 도시 메타데이터 전문가야.

⚠️ 응답 근거 = **Google Search 그라운딩 기반** = 검증된 사실만 사용 = 추정/환각 금지.

목적: 사용자 입력 "${input}" 가 실제 존재하는 도시인지 판별 + 메타데이터 반환.

응답 (= JSON, 설명 X):
{
  "exists": true,
  "nameKo": "<한국 여행자 친숙 호칭 = 예 '피사'>",
  "nameEn": "<공식 영어명 = 예 'Pisa'>",
  "nameLocal": "<현지 원어명 = 예 'Pisa'>",
  "countryCode": "<ISO 2 문자 = 예 'IT'>",
  "country": "<국가 한국어 = 예 '이탈리아'>",
  "latitude": <도심 위도 6 자리 = 예 43.722840>,
  "longitude": <도심 경도 6 자리 = 예 10.401690>,
  "timezone": "<IANA = 예 'Europe/Rome'>",
  "primaryLanguage": "<ISO 2 문자 = 예 'it'>"
}

존재하지 않는 도시 = { "exists": false }

입력: "${input}"
`;

  try {
    const { data } = await geminiJson<any>(prompt, { googleSearch: true });
    if (!data || data.exists === false) return null;
    if (!data.nameEn || !data.latitude || !data.longitude || !data.countryCode) return null;
    return {
      nameKo: data.nameKo || data.nameEn,
      nameEn: data.nameEn,
      nameLocal: data.nameLocal || data.nameEn,
      countryCode: data.countryCode,
      country: data.country || data.countryCode,
      latitude: Number(data.latitude),
      longitude: Number(data.longitude),
      timezone: data.timezone || 'UTC',
      primaryLanguage: data.primaryLanguage || 'en',
    };
  } catch (e: any) {
    console.error(`[CityMeta] Gemini 호출 실패 "${input}":`, e?.message || e);
    return null;
  }
}
