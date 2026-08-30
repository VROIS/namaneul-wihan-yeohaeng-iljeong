// ⚠️ 수정금지(승인필요) 2026-08-13 = 다국어 노출용 번역 캐시 조회/생성 단일 진입점(§16, §2.3 Phase B).
// = 번역 엔진 = geminiClient.ts 재사용(신규 연동 0, raw 자동저장 §18 동승, 사장님 승인 2026-08-13).
// ⚠️ 수정금지(승인필요) 2026-08-27 사장님 승인 = 이 보호파일에 (1) 캐시 읽기 1벌 readCachedPlaceTranslations() 분리

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { placeTranslations } from "@shared/schema";
import { geminiJson } from "./geminiClient";
import { getLanguageInstruction, LANGS } from "./language-instruction";

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

/** ⚠️ 수정금지(승인필요) 2026-08-27 사장님 승인 = place_translations (place_id, language) 캐시 읽기 1벌(§16). */
export async function readCachedPlaceTranslations(
  ids: number[],
  language: string,
): Promise<Map<number, PlaceTranslationResult>> {
  const result = new Map<number, PlaceTranslationResult>();
  if (!db || ids.length === 0) return result;
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
  return result;
}

/** ⚠️ 수정금지(승인필요) 2026-08-27 사장님 확정 = 여정 응답(days[].places[]) 슬롯 해설 언어 = 완전 다국어화 전 중간 단계 = 3단 사슬. */
/** 여기서 제미니 번역 호출 없음(사장님 2026-08-27 = 끔). */
export async function applyItineraryTranslations<T extends Record<string, any>>(
  itinerary: T,
  language: string,
): Promise<T> {
  if (
    !itinerary ||
    language === "ko" ||
    !(LANGS as readonly string[]).includes(language) ||
    !db
  )
    return itinerary;
  const days: any[] = Array.isArray(itinerary.days) ? itinerary.days : [];
  const psrIdOf = (slot: any): number | null => {
    const m = /^db-(\d+)$/.exec(String(slot?.id ?? ""));
    return m ? Number(m[1]) : null;
  };
  const ids = new Set<number>();
  for (const d of days)
    for (const s of Array.isArray(d?.places) ? d.places : []) {
      const id = psrIdOf(s);
      if (id != null) ids.add(id);
    }
  if (ids.size === 0) return itinerary;

  // ⚠️ 수정금지(승인필요) 2026-08-27 사장님 확정 = ① 요청 언어 1회 읽기.
  const primary = await readCachedPlaceTranslations([...ids], language);
  // ⚠️ 수정금지(승인필요) 2026-08-27 사장님 확정 = ② 영어(en) 1회 읽기 = language!=="en" 이고 ①에서 두 필드가 다 안 채워진 id 만.
  const enIds =
    language === "en"
      ? []
      : [...ids].filter((id) => {
          const t = primary.get(id);
          return !t || !t.editorialSummary || !t.summary;
        });
  const fallbackEn =
    enIds.length > 0
      ? await readCachedPlaceTranslations(enIds, "en")
      : new Map<number, PlaceTranslationResult>();
  if (primary.size === 0 && fallbackEn.size === 0) return itinerary;

  return {
    ...itinerary,
    days: days.map((d) => {
      if (!Array.isArray(d?.places)) return d;
      return {
        ...d,
        places: d.places.map((s: any) => {
          const id = psrIdOf(s);
          const t = id != null ? primary.get(id) : undefined;
          const e = id != null ? fallbackEn.get(id) : undefined;
          if (!t && !e) return s;
          // ⚠️ 수정금지(승인필요) 2026-08-27 사장님 확정 = 필드마다 ① 요청 언어 → ② en → ③ 슬롯 원문 유지(빈 값은 다음 단계로).
          const editorialSummary = t?.editorialSummary || e?.editorialSummary;
          const summary = t?.summary || e?.summary;
          return {
            ...s,
            ...(editorialSummary ? { editorialSummary } : {}),
            ...(summary ? { summaryKo: summary } : {}),
          };
        }),
      };
    }),
  };
}

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

  const cached = await readCachedPlaceTranslations(
    places.map((p) => p.id),
    language,
  );
  for (const [id, t] of cached) result.set(id, t);

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
