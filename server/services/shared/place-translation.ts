// ⚠️ 수정금지(승인필요) 2026-08-13 = 다국어 노출용 번역 캐시 조회/생성 단일 진입점(§16, §2.3 Phase B).
// = place_seed_raw.summary_ko/editorial_summary(한국어 원문, 컬럼명 불변 — A1 보류 §19 정합)를
//   요청 언어로 번역해 place_translations 에 캐시. 이후 같은 (place_id, language) 조합은 DB만 읽는다.
// = 번역 엔진 = geminiClient.ts 재사용(신규 연동 0, raw 자동저장 §18 동승, 사장님 승인 2026-08-13).
//   여정 단위 배치 1호출(장소 N개를 JSON 배열로 한 번에) = 장소당 호출 아님.
// = 크레딧 차감 대상 아님(운영 원가, 사장님 승인 2026-08-13) — 호출자가 별도로 chargeFeature 부르지 않는다.
// = 실패(파싱 오류·API 오류) = 한국어 원문 그대로 반환(화면 공백 방지, 폴백 분기 아니라 열화지 처리).

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { placeTranslations } from "@shared/schema";
import { geminiJson } from "./geminiClient";
import { getLanguageInstruction } from "./language-instruction";

export interface PlaceForTranslation {
  id: number;
  summaryKo: string | null;
  editorialSummary: string | null;
}

export interface PlaceTranslationResult {
  summary: string | null;
  editorialSummary: string | null;
}

interface TranslatedItem {
  id: number;
  summary: string;
  editorial: string;
}

/** Gemini 배치 번역 1회 호출. 응답 실패·파싱 오류 = 빈 배열(호출자가 한국어 원문으로 채움). */
async function translateBatch(
  places: PlaceForTranslation[],
  language: string,
): Promise<TranslatedItem[]> {
  const prompt = `아래 장소 목록의 summary/editorial 텍스트를 번역해줘. 원문 뜻을 그대로 유지하고 과장·창작 금지.
${getLanguageInstruction(language)}
입력:
${JSON.stringify(
  places.map((p) => ({
    id: p.id,
    summary: p.summaryKo,
    editorial: p.editorialSummary,
  })),
)}

출력 형식(JSON 객체 1개만, 설명 X):
{"translations": [{"id": <숫자>, "summary": "<번역>", "editorial": "<번역>"}, ...]}`;

  const result = await geminiJson<{ translations: TranslatedItem[] }>(prompt, {
    contextId: "runtime",
    rawTag: `i18n-place-translate-${language}`,
  });
  return result.data?.translations || [];
}

/**
 * 여정 단위 배치 조회(§16 = 이 함수 1벌만, D 에서 N+1 호출 금지 용도).
 * language='ko' = 캐시 조회 없이 원문 그대로(스키마 주석 정합 = ko 는 캐시 대상 아님).
 */
export async function getPlaceTranslationsForPlaces(
  places: PlaceForTranslation[],
  language: string,
): Promise<Map<number, PlaceTranslationResult>> {
  const result = new Map<number, PlaceTranslationResult>();
  if (places.length === 0) return result;

  if (language === "ko") {
    for (const p of places) {
      result.set(p.id, {
        summary: p.summaryKo,
        editorialSummary: p.editorialSummary,
      });
    }
    return result;
  }

  if (!db) {
    for (const p of places) {
      result.set(p.id, {
        summary: p.summaryKo,
        editorialSummary: p.editorialSummary,
      });
    }
    return result;
  }

  const ids = places.map((p) => p.id);
  const cached = await db
    .select()
    .from(placeTranslations)
    .where(
      and(
        inArray(placeTranslations.placeId, ids),
        eq(placeTranslations.language, language),
      ),
    );

  for (const c of cached) {
    result.set(c.placeId, {
      summary: c.summary,
      editorialSummary: c.editorialSummary,
    });
  }

  const missing = places.filter((p) => !result.has(p.id));
  if (missing.length > 0) {
    let translated: TranslatedItem[] = [];
    try {
      translated = await translateBatch(missing, language);
    } catch (e) {
      console.error(
        "[place-translation] 배치 번역 호출 실패:",
        (e as Error)?.message || e,
      );
    }

    for (const t of translated) {
      result.set(t.id, { summary: t.summary, editorialSummary: t.editorial });
      // 캐시 저장 = best-effort(건별 격리). 여기서 예외가 나도 이미 번역된 값은 이번 응답엔 그대로 쓰고
      // (result 는 위에서 이미 채움), 캐시만 이번엔 안 남을 뿐 = 다음 요청이 다시 번역해 채운다.
      try {
        await db
          .insert(placeTranslations)
          .values({
            placeId: t.id,
            language,
            summary: t.summary,
            editorialSummary: t.editorial,
          })
          .onConflictDoNothing();
      } catch (e) {
        console.error(
          "[place-translation] 캐시 저장 실패(이번 응답엔 영향 없음):",
          (e as Error)?.message || e,
        );
      }
    }

    // 응답에 안 실렸거나 호출 자체가 실패한 항목 = 한국어 원문으로 열화(화면 공백 방지)
    for (const p of missing) {
      if (!result.has(p.id)) {
        result.set(p.id, {
          summary: p.summaryKo,
          editorialSummary: p.editorialSummary,
        });
      }
    }
  }

  return result;
}

/** 단일 장소 조회. 배치 함수에 위임(§16 = 로직 1벌). */
export async function getPlaceTranslation(
  place: PlaceForTranslation,
  language: string,
): Promise<PlaceTranslationResult> {
  const map = await getPlaceTranslationsForPlaces([place], language);
  return (
    map.get(place.id) || {
      summary: place.summaryKo,
      editorialSummary: place.editorialSummary,
    }
  );
}
