// ⚠️ 수정금지(승인필요) 2026-06-05 = Gemini 한국어 큐레이션 단일 관문 (= tsSearch 대칭, 사용자 SSOT)
// = 입력(헤더=어느 장소)만 바뀌고 **출력 요소는 고정**: name_ko + summary_ko(요약) + editorial_summary(숏폼) + price(1인당).
//   PID/URI 는 Gemini 에 **전달 안 함**(환각 + 인식 못함 + 느려짐 = 사용자 SSOT).
// = 프롬프트 = 잠긴 02-enrich/prompt.txt (1글자 변경 X) 단일 소스. 호출설정 = _call-config (gemini-3-flash + googleSearch + 40 batch + adaptive fallback).
// = 모든 한국어 큐레이션 호출은 이 함수만 통과. 결과(데이터)는 호출자가 upsertPlace 로 융합 → 덮어쓰기 = self-validating PSR.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { geminiJson } from './geminiClient';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PROMPT_PATH = path.join(ROOT, '.claude/skills/raw-db-verify-and-complete/prompts/02-enrich-place/prompt.txt');
const FALLBACK = [40, 30, 20, 10]; // = _call-config adaptive fallback

export interface GeminiCurateInput {
  id: number;              // place_seed_raw.id (= 응답 매칭 키)
  nameEn: string;
  nameLocal?: string | null;
  nameKo?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  seedCategory?: string;  // ⚠️ 2026-06-16 = Gemini 입력에서 제외(카테고리 안 줌) = optional 로 정합. shopping price=null 은 호출자 저장단계 처리.
}
export interface GeminiCurateOutput {
  id: number;
  nameKo: string | null;
  summaryKo: string | null;        // ← summary_ko (한국 트렌드/사회적 검증)
  editorialSummary: string | null; // ← editorial_summary (코믹/위트 후킹)
  priceEur: number | null;         // ← price_eur (1인 입장료/식대, shopping=null)
}

// 잘림 복구 파서 (= _call-config 표준)
function parsePlaces(t: string): any[] {
  const start = t.indexOf('{');
  if (start < 0) return [];
  try { const j = JSON.parse(t.slice(start, t.lastIndexOf('}') + 1)); if (j?.places) return j.places; } catch {}
  for (let e = t.length - 1; e > start; e--) {
    if (t[e] !== '}') continue;
    for (const suf of [']}}', ']}', '}']) {
      try { const j = JSON.parse(t.slice(start, e + 1) + suf); if (j?.places) return j.places; } catch {}
    }
  }
  return [];
}

/**
 * 한국어 큐레이션 관문 = 배치 단위(40, adaptive). 입력 = 이름/주소/좌표(PID·URI 제외). 출력 = 고정 4요소.
 * @returns id 로 키된 큐레이션 배열 (= 호출자가 upsertPlace 로 덮어씀)
 */
export async function geminiCurate(
  cityName: string,
  cityId: number,
  rows: GeminiCurateInput[],
  opts?: { year?: string },
): Promise<GeminiCurateOutput[]> {
  const valid = rows.filter((r) => r.id && r.nameEn); // = 매칭 키 필수
  if (!valid.length) return [];
  const body = fs.readFileSync(PROMPT_PATH, 'utf-8').split(/═{30,}/)[2] || '';
  const year = opts?.year || String(new Date().getFullYear());
  // ⚠️ 수정금지(승인필요) 2026-06-16 사장님 승인 = ${MONTH} 동적 치환 = 호출 시점 이번 달 (getMonth 는 0부터 = +1). prompt.txt grounding 줄 "${YEAR}년 ${MONTH}월 현재 시점" = 최신 강제.
  const month = String(new Date().getMonth() + 1);
  const out: GeminiCurateOutput[] = [];

  let i = 0;
  let size = FALLBACK[0];
  while (i < valid.length) {
    const batch = valid.slice(i, i + size);
    // ⚠️ 입력 = PID/URI 제외 (= 환각 방지). id=매칭키.
    // ⚠️ 2026-06-16 사장님 승인 = seed_category 입력 제거 (= id 에 이미 분류 + 카테고리 주면 shopping 에서 식당/바 가격 오염 실증). shopping price=null 은 호출자 저장단계 처리.
    const input = batch.map((r) => ({
      id: r.id, name_en: r.nameEn, name_local: r.nameLocal ?? null, name_ko: r.nameKo ?? null,
      address: r.address ?? null, latitude: r.latitude ?? null, longitude: r.longitude ?? null,
    }));
    const prompt = body
      .replace(/\$\{CITY_NAME\}/g, cityName).replace(/\[CITY_NAME\]/g, cityName)
      .replace(/\$\{CITY_ID\}/g, String(cityId)).replace(/\$\{YEAR\}/g, year).replace(/\$\{MONTH\}/g, month)
      .replace(/\$\{BATCH_LEN\}/g, String(batch.length)).replace(/\$\{JSON_INPUT\}/g, JSON.stringify(input));

    // ⚠️ 2026-06-16 사장님 SSOT = contextId(cityId)+rawTag = raw 가 docs/raw/{cityId}/ 도시폴더 저장(= TS 동형, runtime 폴더 방지).
    const r = await geminiJson(prompt, { googleSearch: true, contextId: cityId, rawTag: 'enrich-curate' });
    const places = (r.data?.places && Array.isArray(r.data.places)) ? r.data.places : parsePlaces(r.raw);
    const missing = batch.filter((b) => !places.find((p: any) => p.id === b.id)).length;

    // adaptive fallback = 응답 부족 시 batch 축소 재시도
    if ((places.length === 0 || missing > 5) && FALLBACK.indexOf(size) < FALLBACK.length - 1) {
      size = FALLBACK[FALLBACK.indexOf(size) + 1];
      continue;
    }
    for (const p of places) {
      out.push({
        id: p.id,
        nameKo: p.name_ko || null,
        summaryKo: p.summary_ko || null,
        editorialSummary: p.editorial_summary || null,
        priceEur: p.price_eur ?? null,
      });
    }
    i += batch.length;
  }
  return out;
}
