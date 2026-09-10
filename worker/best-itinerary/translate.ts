// ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = 응답 번역 = 원본 shared/place-translation.ts:75
//   1,777줄 한 덩어리에서 그대로 잘라낸 것(§0) = 계산·규칙 한 글자도 안 바꿈.

import type { Express, Request, Response } from "express";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq, inArray } from "drizzle-orm";
import * as schema from "../../shared/schema";

const { placeTranslations } = schema;

type Db = PostgresJsDatabase<typeof schema>;

// ── 응답 번역 (원본 server/services/shared/place-translation.ts:75) ──────────

/** 원본 server/services/shared/language-instruction.ts:? LANGS. */
export const LANGS = ["ko", "en", "ja", "zh", "fr", "es", "de"] as const;

/** 원본 place-translation.ts:53 readCachedPlaceTranslations = 캐시 읽기만(외부호출 0). */
export async function readCachedPlaceTranslations(
  db: Db,
  ids: number[],
  language: string,
): Promise<
  Map<number, { summary: string | null; editorialSummary: string | null }>
> {
  const result = new Map<
    number,
    { summary: string | null; editorialSummary: string | null }
  >();
  if (ids.length === 0) return result;
  const cached = await db
    .select()
    .from(placeTranslations)
    .where(
      and(
        inArray(placeTranslations.placeId, ids),
        eq(placeTranslations.language, language),
      ),
    );
  for (const c of cached)
    result.set(c.placeId, {
      summary: c.summary,
      editorialSummary: c.editorialSummary,
    });
  return result;
}

/** 원본 place-translation.ts:75 applyItineraryTranslations = 제미니 호출 없음(사장님 2026-08-27 = 끔). */
export async function applyItineraryTranslations<T extends Record<string, any>>(
  db: Db,
  itinerary: T,
  language: string,
): Promise<T> {
  if (
    !itinerary ||
    language === "ko" ||
    !(LANGS as readonly string[]).includes(language)
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

  const primary = await readCachedPlaceTranslations(db, [...ids], language);
  const enIds =
    language === "en"
      ? []
      : [...ids].filter((id) => {
          const t = primary.get(id);
          return !t || !t.editorialSummary || !t.summary;
        });
  const fallbackEn =
    enIds.length > 0
      ? await readCachedPlaceTranslations(db, enIds, "en")
      : new Map<
          number,
          { summary: string | null; editorialSummary: string | null }
        >();
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
