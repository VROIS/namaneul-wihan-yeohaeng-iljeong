// ⚠️ 수정금지(승인필요) 2026-06-05 = Gemini 한국어 큐레이션 단일 관문 (= tsSearch 대칭, 사용자 SSOT)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { geminiJson } from "./geminiClient";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const PROMPT_PATH = path.join(
  ROOT,
  ".claude/skills/raw-db-verify-and-complete/prompts/02-enrich-place/prompt.txt",
);
// ⚠️ 수정금지(승인필요) 2026-06-23 사장님 SSOT = 1콜 우선(120) → 실패(missing>5) 시 자동 축소 = 콜 최소화.
const FALLBACK = [120, 60, 40, 20, 10]; // = adaptive fallback (큰 배치 먼저 = 콜 최소)

export interface GeminiCurateInput {
  id: number; // place_seed_raw.id (= 응답 매칭 키)
  nameEn: string;
  nameLocal?: string | null;
  nameKo?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  seedCategory?: string; // ⚠️ 2026-06-16 = Gemini 입력에서 제외(카테고리 안 줌) = optional 로 정합. shopping price=null 은 호출자 저장단계 처리.
}
// ⚠️ 수정금지(승인필요) 2026-06-20 사장님 SSOT = 선별 금지 = Gemini 응답 전 필드 포함(02-enrich/prompt.txt 응답 10요소 그대로) (§19).
export interface GeminiCurateOutput {
  id: number;
  nameLocal: string | null; // ← name_local (현지 원어명 = Gemini 전용)
  nameEn: string | null; // ← name_en (영어명, 1차 = TS displayName 이 최종 덮음)
  nameKo: string | null; // ← name_ko (한국 친숙 호칭)
  address: string | null; // ← address
  latitude: number | null; // ← latitude
  longitude: number | null; // ← longitude
  summaryKo: string | null; // ← summary_ko (한국 트렌드/사회적 검증)
  editorialSummary: string | null; // ← editorial_summary (코믹/위트 후킹)
  priceEur: number | null; // ← price_eur (1인 입장료/식대, shopping=null)
  distanceKmFromCenter: number | null; // ← distance_km_from_center (도심거리 = 동선 최적화 재료 = Gemini 전용)
}

function parsePlaces(t: string): any[] {
  const start = t.indexOf("{");
  if (start < 0) return [];
  try {
    const j = JSON.parse(t.slice(start, t.lastIndexOf("}") + 1));
    if (j?.places) return j.places;
  } catch {}
  for (let e = t.length - 1; e > start; e--) {
    if (t[e] !== "}") continue;
    for (const suf of ["]}}", "]}", "}"]) {
      try {
        const j = JSON.parse(t.slice(start, e + 1) + suf);
        if (j?.places) return j.places;
      } catch {}
    }
  }
  return [];
}

export async function geminiCurate(
  cityName: string,
  cityId: number,
  rows: GeminiCurateInput[],
  opts?: { year?: string; apiKey?: string }, // ⚠️ 2026-06-19 = apiKey = 출입증 발급 키 직독(결손보강 WF). 미지정 시 env(라이브앱 무영향).
): Promise<GeminiCurateOutput[]> {
  const valid = rows.filter((r) => r.id && r.nameEn); // = 매칭 키 필수
  if (!valid.length) return [];
  const body = fs.readFileSync(PROMPT_PATH, "utf-8").split(/═{30,}/)[2] || "";
  const year = opts?.year || String(new Date().getFullYear());
  // ⚠️ 수정금지(승인필요) 2026-06-16 사장님 승인 = ${MONTH} 동적 치환 = 호출 시점 이번 달 (getMonth 는 0부터 = +1). prompt.txt grounding 줄 "${YEAR}년 ${MONTH}월 현재 시점" = 최신 강제.
  const month = String(new Date().getMonth() + 1);
  const out: GeminiCurateOutput[] = [];

  let i = 0;
  let size = FALLBACK[0];
  while (i < valid.length) {
    const batch = valid.slice(i, i + size);
    // ⚠️ 2026-06-16 사장님 승인 = seed_category 입력 제거 (= id 에 이미 분류 + 카테고리 주면 shopping 에서 식당/바 가격 오염 실증). shopping price=null 은 호출자 저장단계 처리.
    const input = batch.map((r) => ({
      id: r.id,
      name_en: r.nameEn,
      name_local: r.nameLocal ?? null,
      name_ko: r.nameKo ?? null,
      address: r.address ?? null,
      latitude: r.latitude ?? null,
      longitude: r.longitude ?? null,
    }));
    // ⚠️ 수정금지(승인필요) 2026-06-18 = 출입증(${API_PASS}) 동적 조립·치환 = 02-enrich/run.ts 와 동일 패턴(prompt.txt 헤더에 박힘).
    const apiPass = `[API-PASS] 도시=${cityName}(${cityId}) / 행=있음(채움) / 날짜=${new Date().toISOString().slice(0, 10)}`;
    const prompt = body
      .replace(/\$\{CITY_NAME\}/g, cityName)
      .replace(/\[CITY_NAME\]/g, cityName)
      .replace(/\$\{CITY_ID\}/g, String(cityId))
      .replace(/\$\{YEAR\}/g, year)
      .replace(/\$\{MONTH\}/g, month)
      .replace(/\$\{API_PASS\}/g, apiPass)
      .replace(/\$\{BATCH_LEN\}/g, String(batch.length))
      .replace(/\$\{JSON_INPUT\}/g, JSON.stringify(input));

    // ⚠️ 2026-06-16 사장님 SSOT = contextId(cityId)+rawTag = raw 가 docs/raw/{cityId}/ 도시폴더 저장(= TS 동형, runtime 폴더 방지).
    const r = await geminiJson(prompt, {
      googleSearch: true,
      contextId: cityId,
      rawTag: "enrich-curate",
      apiKey: opts?.apiKey,
    });
    const places =
      r.data?.places && Array.isArray(r.data.places)
        ? r.data.places
        : parsePlaces(r.raw);
    const missing = batch.filter(
      (b) => !places.find((p: any) => p.id === b.id),
    ).length;

    if (
      (places.length === 0 || missing > 5) &&
      FALLBACK.indexOf(size) < FALLBACK.length - 1
    ) {
      size = FALLBACK[FALLBACK.indexOf(size) + 1];
      continue;
    }
    // ⚠️ 수정금지(승인필요) 2026-06-20 사장님 SSOT = 선별 금지 = 응답 전 필드 그대로 꺼냄(prompt.txt 응답 10요소) (§19).
    for (const p of places) {
      out.push({
        id: p.id,
        nameLocal: p.name_local || null,
        nameEn: p.name_en || null,
        nameKo: p.name_ko || null,
        address: p.address || null,
        latitude: p.latitude ?? null,
        longitude: p.longitude ?? null,
        summaryKo: p.summary_ko || null,
        editorialSummary: p.editorial_summary || null,
        priceEur: p.price_eur ?? null,
        distanceKmFromCenter: p.distance_km_from_center ?? null,
      });
    }
    i += batch.length;
  }
  return out;
}
