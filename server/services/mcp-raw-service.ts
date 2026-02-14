import { db } from "../db";
import { cities, placeSeedRaw, placeNubiReasons, celebEvidence, places, dataSyncLog } from "@shared/schema";
import { and, eq, gt, sql, asc } from "drizzle-orm";
import { getSearchTools } from "./gemini-search-limiter";
import { getMcpExecutionOrder, getMcpCitySourceMeta } from "../config/mcp-raw-data-final";

type SeedCategory = "attraction" | "restaurant" | "healing" | "adventure" | "hotspot";

interface Stage1Item {
  rank: number;
  nameKo?: string;
  nameEn: string;
  googleSearchNote?: string;
  googleReviewCountNote?: string;
  googleImageCountNote?: string;
  source?: string;
}

interface Stage1RunOptions {
  cityId?: number;
  category?: SeedCategory;
  runBatchId?: string;
}

interface Stage2RunOptions {
  cityId: number;
  category: SeedCategory;
  runBatchId?: string;
}

interface TargetCity {
  id: number;
  nameKo: string;
  nameEn: string;
}

interface Stage2Item {
  placeName: string;
  sourceRank: number;
  sourceType: "instagram" | "youtube" | "naver_blog" | "package" | "travel_app";
  nubiReason: string;
  evidenceUrl: string;
  verified: boolean;
}

const CATEGORIES: SeedCategory[] = ["attraction", "restaurant", "healing", "adventure", "hotspot"];
const STAGE2_SOURCE_TYPES = ["instagram", "youtube", "naver_blog", "package", "travel_app"] as const;
const INSTAGRAM_UNAVAILABLE = "Sorry, this page isn't available";
const YOUTUBE_UNAVAILABLE = "Video unavailable";
const STAGE_MIN_ITEMS = 20;

const CATEGORY_KO_LABEL: Record<SeedCategory, string> = {
  attraction: "명소",
  restaurant: "맛집",
  healing: "힐링",
  adventure: "모험",
  hotspot: "핫스팟",
};

const CATEGORY_GUIDE_TEXT: Record<SeedCategory, string> = {
  attraction: "관광 명소·박물관·랜드마크",
  restaurant: "맛집·레스토랑·카페",
  healing: "힐링·휴식 스팟(공원, 스파, 웰니스, 한적한 명소)",
  adventure: "모험·액티비티·테마파크·동물원·아웃도어 스팟",
  hotspot: "핫스팟·인기 관광지",
};

function buildStage1Prompt(cityKo: string, cityEn: string, category: SeedCategory): string {
  const guide = CATEGORY_GUIDE_TEXT[category];
  return `당신은 여행 데이터 수집 전문가입니다.

아래 조건만 사용해서 ${cityKo}(${cityEn})의 ${CATEGORY_KO_LABEL[category]} 카테고리 상위 30곳을 추출하세요.

[필수 범위 규칙]
- 도시 중심 반경 100km 내외 범위에서만 후보를 찾고, 범위 밖 장소는 제외하세요.

[선정 기준: 아래 3개만 사용]
1) 구글 검색 노출/검색량
2) 구글 리뷰 수 (평점 아님)
3) 구글 이미지 검색 결과 수 (인스타 아님)

[카테고리]
- ${guide}

[응답 형식]
- 반드시 JSON 배열만 반환 (코드블록/설명문 금지)
- 최대 30개
- 필드: rank, nameKo, nameEn, googleSearchNote, googleReviewCountNote, googleImageCountNote, source

예시:
[{"rank":1,"nameKo":"에펠탑","nameEn":"Eiffel Tower","googleSearchNote":"검색량 상위","googleReviewCountNote":"리뷰 약 35만+","googleImageCountNote":"이미지 결과 다수","source":"google search"}]`;
}

function extractJsonArray(text: string): any[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function extractPureUrl(str: string): string {
  if (!str) return "";
  const markdownLink = str.match(/\[([^\]]+)\]\(([^)]+)\)/);
  if (markdownLink) return markdownLink[2].trim();
  return str.trim();
}

function normalizePlaceKey(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .trim();
}

async function verifyEvidenceUrl(url: string, sourceType: string): Promise<boolean> {
  if (!url || !url.startsWith("http")) return false;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NubiBot/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    const text = await response.text();
    if (sourceType === "instagram" && text.includes(INSTAGRAM_UNAVAILABLE)) return false;
    if (sourceType === "youtube" && text.includes(YOUTUBE_UNAVAILABLE)) return false;
    return response.ok;
  } catch {
    return false;
  }
}

function normalizeStage1Items(items: any[]): Stage1Item[] {
  const normalized: Stage1Item[] = [];
  const seen = new Set<number>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i] || {};
    const rankRaw = Number(item.rank ?? i + 1);
    const rank = Number.isFinite(rankRaw) ? Math.max(1, Math.min(30, Math.trunc(rankRaw))) : i + 1;
    if (seen.has(rank)) continue;

    const nameEn = String(item.nameEn || item.name || "").trim();
    if (!nameEn) continue;

    seen.add(rank);
    normalized.push({
      rank,
      nameKo: String(item.nameKo || "").trim() || undefined,
      nameEn,
      googleSearchNote: String(item.googleSearchNote || "").trim() || undefined,
      googleReviewCountNote: String(item.googleReviewCountNote || "").trim() || undefined,
      googleImageCountNote: String(item.googleImageCountNote || "").trim() || undefined,
      source: String(item.source || "mcp_google_search").trim(),
    });
  }

  return normalized.sort((a, b) => a.rank - b.rank).slice(0, 30);
}

function normalizeStage2Items(items: any[]): Stage2Item[] {
  const normalized: Stage2Item[] = [];
  const usedNames = new Set<string>();
  for (const item of items) {
    const placeName = String(item?.placeName || item?.name || "").trim();
    if (!placeName) continue;
    const key = placeName.toLowerCase();
    if (usedNames.has(key)) continue;

    const sourceRankRaw = Number(item?.sourceRank);
    const sourceRank = Number.isFinite(sourceRankRaw) ? Math.max(1, Math.min(5, Math.trunc(sourceRankRaw))) : 5;
    const sourceTypeRaw = String(item?.sourceType || "").toLowerCase();
    const sourceType = STAGE2_SOURCE_TYPES.includes(sourceTypeRaw as any)
      ? (sourceTypeRaw as Stage2Item["sourceType"])
      : "travel_app";
    const nubiReason = String(item?.nubiReason || "").trim();
    if (!nubiReason) continue;

    const evidenceUrl = extractPureUrl(String(item?.evidenceUrl || "").trim());
    const verified = Boolean(item?.verified);
    usedNames.add(key);
    normalized.push({
      placeName,
      sourceRank,
      sourceType,
      nubiReason,
      evidenceUrl,
      verified,
    });
  }
  return normalized;
}

async function resolveTargetCities(options: Stage1RunOptions): Promise<TargetCity[]> {
  if (!db) return [];
  const configured = getMcpExecutionOrder();

  if (options.cityId) {
    const [row] = await db
      .select({ id: cities.id, nameKo: cities.name, nameEn: cities.nameEn })
      .from(cities)
      .where(eq(cities.id, options.cityId))
      .limit(1);
    if (!row) return [];
    return [{ id: row.id, nameKo: row.nameKo, nameEn: row.nameEn || row.nameKo }];
  }

  const results: TargetCity[] = [];
  for (const c of configured) {
    const [row] = await db
      .select({ id: cities.id, nameKo: cities.name, nameEn: cities.nameEn })
      .from(cities)
      .where(
        sql`LOWER(${cities.name}) = LOWER(${c.nameKo}) OR LOWER(COALESCE(${cities.nameEn}, '')) = LOWER(${c.nameEn})`
      )
      .limit(1);
    if (row) {
      results.push({ id: row.id, nameKo: row.nameKo, nameEn: row.nameEn || c.nameEn });
    }
  }
  return results;
}

function makeRunBatchId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `MCP_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function buildCheckpointSource(input: {
  runBatchId: string;
  category: SeedCategory;
  cityOrder: number;
  cityNameEn: string;
}): string {
  return `run=${input.runBatchId}|cat=${input.category}|cityOrder=${input.cityOrder}|city=${input.cityNameEn}`;
}

async function writeCheckpointLog(input: {
  entityType: "mcp_stage1" | "mcp_stage2";
  cityId: number;
  category: SeedCategory;
  cityOrder: number;
  cityNameEn: string;
  runBatchId: string;
  status: "running" | "success" | "failed";
  itemsProcessed?: number;
  itemsFailed?: number;
  errorMessage?: string;
}) {
  if (!db) return;
  await db.insert(dataSyncLog).values({
    entityType: input.entityType,
    entityId: input.cityId,
    source: buildCheckpointSource({
      runBatchId: input.runBatchId,
      category: input.category,
      cityOrder: input.cityOrder,
      cityNameEn: input.cityNameEn,
    }),
    status: input.status,
    itemsProcessed: input.itemsProcessed ?? 0,
    itemsFailed: input.itemsFailed ?? 0,
    errorMessage: input.errorMessage || null,
    completedAt: input.status === "running" ? null : new Date(),
  });
}

function buildStage2Prompt(cityKo: string, cityEn: string, placeList: string[], celebListText: string): string {
  return `당신은 장소별 "한 줄 추천 이유"를 수집하고 그 근거 URL을 검증하는 작업을 수행합니다.

## 규칙
- 아래 장소 수만큼 모두 채워야 하며, 빈 곳이 있으면 안 됩니다.
- 우선순위 1→5 순으로 검색해, 첫 번째로 확인된 출처를 사용합니다.

## 우선순위
1. 인스타그램 — 셀럽 20인 중 해당 장소 방문 게시물, 사진
2. 유튜브 — 한국 유튜버가 해당 장소 언급한 영상
3. 네이버 블로그 — 해당 장소 리뷰/후기 게시물
4. 4대 여행사 패키지 — 하나투어·모두투어·노랑풍선·참좋은여행 등 패키지 일정에 포함
5. 여행앱 — 마이리얼트립·트립닷컴·클룩 등 평점/리뷰 출처

## 입력 (${cityKo}/${cityEn} 장소 ${placeList.length}곳)
${placeList.join(", ")}

## 셀럽 20인
${celebListText}

## 절차
1단계: 각 장소에 대해 1→5 순으로 검색해 evidenceUrl을 찾고, nubiReason을 정리합니다.
2단계: 찾은 evidenceUrl 각각을 실제로 열어보고, "Sorry, this page isn't available"(인스타), "Video unavailable"(유튜브) 등이 없으면 verified:true로 표시합니다.
3단계: evidenceUrl은 마크다운 형식 없이 순수 URL만 반환합니다.

## 산출물
반드시 JSON 배열만 반환 (마크다운 코드블록 없이). 필드:
placeName, sourceRank(1~5), sourceType(instagram|youtube|naver_blog|package|travel_app), nubiReason, evidenceUrl(순수 URL), verified(boolean)`;
}

async function runStage2ForCityCategory(city: TargetCity, category: SeedCategory): Promise<{
  success: boolean;
  updatedRawRows: number;
  savedNubiReasonRows: number;
  error?: string;
}> {
  if (!db) return { success: false, updatedRawRows: 0, savedNubiReasonRows: 0, error: "DB 연결 없음" };
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, updatedRawRows: 0, savedNubiReasonRows: 0, error: "Gemini API 키 없음" };

  const baseRows = await db
    .select()
    .from(placeSeedRaw)
    .where(and(eq(placeSeedRaw.cityId, city.id), eq(placeSeedRaw.seedCategory, category)))
    .orderBy(asc(placeSeedRaw.rank));
  if (baseRows.length === 0) {
    return { success: false, updatedRawRows: 0, savedNubiReasonRows: 0, error: "1단계 데이터 없음" };
  }

  const placeList = baseRows.map((r) => r.nameKo || r.nameEn).filter(Boolean);
  const celebRows = await db
    .select({ name: celebEvidence.name, instagramHandle: celebEvidence.instagramHandle })
    .from(celebEvidence)
    .where(eq(celebEvidence.isActive, true))
    .orderBy(asc(celebEvidence.rank));
  const celebListText = celebRows.map((c) => `@${c.instagramHandle} (${c.name})`).join(", ");

  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });
    const tools = getSearchTools("mcp_raw_stage2");
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: buildStage2Prompt(city.nameKo, city.nameEn, placeList, celebListText),
      config: tools ? { tools } : {},
    });
    const text = (response as any).text || "";
    const parsed = extractJsonArray(text);
    const items = normalizeStage2Items(parsed);
    if (items.length < STAGE_MIN_ITEMS) {
      return {
        success: false,
        updatedRawRows: 0,
        savedNubiReasonRows: 0,
        error: `2단계 응답 품질 미달 (${items.length}건, 최소 ${STAGE_MIN_ITEMS}건 필요)`,
      };
    }

    const rawLookup = new Map<string, (typeof baseRows)[number]>();
    for (const row of baseRows) {
      const ko = String(row.nameKo || "").trim().toLowerCase();
      const en = String(row.nameEn || "").trim().toLowerCase();
      if (ko) rawLookup.set(ko, row);
      if (en) rawLookup.set(en, row);
      const koNorm = normalizePlaceKey(ko);
      const enNorm = normalizePlaceKey(en);
      if (koNorm) rawLookup.set(koNorm, row);
      if (enNorm) rawLookup.set(enNorm, row);
    }

    const cityPlaces = await db
      .select({ id: places.id, name: places.name, displayNameKo: places.displayNameKo, aliases: places.aliases })
      .from(places)
      .where(eq(places.cityId, city.id));
    const placeIdLookup = new Map<string, number>();
    for (const p of cityPlaces) {
      const name = String(p.name || "").toLowerCase();
      placeIdLookup.set(name, p.id);
      const nameNorm = normalizePlaceKey(name);
      if (nameNorm) placeIdLookup.set(nameNorm, p.id);
      if (p.displayNameKo) {
        const koName = String(p.displayNameKo).toLowerCase();
        placeIdLookup.set(koName, p.id);
        const koNameNorm = normalizePlaceKey(koName);
        if (koNameNorm) placeIdLookup.set(koNameNorm, p.id);
      }
      const aliases = (p.aliases as string[] | null) || [];
      for (const alias of aliases) {
        const aliasName = String(alias).toLowerCase();
        placeIdLookup.set(aliasName, p.id);
        const aliasNorm = normalizePlaceKey(aliasName);
        if (aliasNorm) placeIdLookup.set(aliasNorm, p.id);
      }
    }

    let updatedRawRows = 0;
    let savedNubiReasonRows = 0;

    for (const item of items) {
      const key = item.placeName.toLowerCase().trim();
      const keyNorm = normalizePlaceKey(item.placeName);
      const raw = rawLookup.get(key) || (keyNorm ? rawLookup.get(keyNorm) : undefined);
      if (!raw) continue;

      let verified = item.verified;
      if (item.evidenceUrl && (item.sourceType === "instagram" || item.sourceType === "youtube")) {
        verified = await verifyEvidenceUrl(item.evidenceUrl, item.sourceType);
      }

      await db
        .update(placeSeedRaw)
        .set({
          sourceRank: item.sourceRank,
          sourceType: item.sourceType,
          nubiReason: item.nubiReason,
          evidenceUrl: item.evidenceUrl || null,
          evidenceVerified: verified,
        })
        .where(eq(placeSeedRaw.id, raw.id));
      updatedRawRows++;

      // 대표님 요청: 2단계는 기존 DB 테이블(place_nubi_reasons)에도 저장
      const placeId = placeIdLookup.get(key) || (keyNorm ? placeIdLookup.get(keyNorm) : undefined);
      if (placeId) {
        await db
          .insert(placeNubiReasons)
          .values({
            placeId,
            cityId: city.id,
            placeName: raw.nameKo || raw.nameEn,
            sourceRank: item.sourceRank,
            sourceType: item.sourceType,
            nubiReason: item.nubiReason,
            evidenceUrl: item.evidenceUrl || null,
            verified,
          })
          .onConflictDoUpdate({
            target: [placeNubiReasons.placeId],
            set: {
              cityId: city.id,
              placeName: raw.nameKo || raw.nameEn,
              sourceRank: item.sourceRank,
              sourceType: item.sourceType,
              nubiReason: item.nubiReason,
              evidenceUrl: item.evidenceUrl || null,
              verified,
              fetchedAt: new Date(),
            },
          });
        savedNubiReasonRows++;
      }
    }

    return { success: true, updatedRawRows, savedNubiReasonRows };
  } catch (error: any) {
    return {
      success: false,
      updatedRawRows: 0,
      savedNubiReasonRows: 0,
      error: error?.message || String(error),
    };
  }
}

async function runStage1ForCityCategory(city: TargetCity, category: SeedCategory): Promise<{
  success: boolean;
  saved: number;
  error?: string;
}> {
  if (!db) return { success: false, saved: 0, error: "DB 연결 없음" };

  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, saved: 0, error: "Gemini API 키 없음" };

  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });
    const tools = getSearchTools("mcp_raw_stage1");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: buildStage1Prompt(city.nameKo, city.nameEn, category),
      config: tools ? { tools } : {},
    });

    const text = (response as any).text || "";
    const parsed = extractJsonArray(text);
    const items = normalizeStage1Items(parsed);

    if (items.length < STAGE_MIN_ITEMS) {
      return {
        success: false,
        saved: 0,
        error: `1단계 응답 품질 미달 (${items.length}건, 최소 ${STAGE_MIN_ITEMS}건 필요)`,
      };
    }

    await db.transaction(async (tx) => {
      for (const item of items) {
        await tx
          .insert(placeSeedRaw)
          .values({
            cityId: city.id,
            seedCategory: category,
            rank: item.rank,
            nameKo: item.nameKo || null,
            nameEn: item.nameEn,
            googleSearchNote: item.googleSearchNote || null,
            googleReviewCountNote: item.googleReviewCountNote || null,
            googleImageCountNote: item.googleImageCountNote || null,
            source: item.source || "mcp_google_search",
            sourceRank: null,
            sourceType: null,
            nubiReason: null,
            evidenceUrl: null,
            evidenceVerified: false,
          })
          .onConflictDoUpdate({
            target: [placeSeedRaw.cityId, placeSeedRaw.seedCategory, placeSeedRaw.rank],
            set: {
              nameKo: item.nameKo || null,
              nameEn: item.nameEn,
              googleSearchNote: item.googleSearchNote || null,
              googleReviewCountNote: item.googleReviewCountNote || null,
              googleImageCountNote: item.googleImageCountNote || null,
              source: item.source || "mcp_google_search",
              sourceRank: null,
              sourceType: null,
              nubiReason: null,
              evidenceUrl: null,
              evidenceVerified: false,
            },
          });
      }

      await tx
        .delete(placeSeedRaw)
        .where(
          and(
            eq(placeSeedRaw.cityId, city.id),
            eq(placeSeedRaw.seedCategory, category),
            gt(placeSeedRaw.rank, items.length),
          )
        );
    });

    return { success: true, saved: items.length };
  } catch (error: any) {
    return { success: false, saved: 0, error: error?.message || String(error) };
  }
}

export async function runMcpRawStage1(options: Stage1RunOptions = {}): Promise<{
  success: boolean;
  runBatchId: string;
  processedCities: number;
  processedCategories: number;
  savedRows: number;
  errors: string[];
  citySource: "runtime_file" | "draft_default";
  citySourcePath: string;
}> {
  const runBatchId = options.runBatchId || makeRunBatchId();
  if (!db) {
    return {
      success: false,
      runBatchId,
      processedCities: 0,
      processedCategories: 0,
      savedRows: 0,
      errors: ["DB 연결 없음"],
      citySource: "draft_default",
      citySourcePath: "",
    };
  }

  const cityMeta = getMcpCitySourceMeta();
  const targetCities = await resolveTargetCities(options);
  const targetCategories = options.category ? [options.category] : CATEGORIES;

  const errors: string[] = [];
  let processedCategories = 0;
  let savedRows = 0;

  for (let cityIdx = 0; cityIdx < targetCities.length; cityIdx++) {
    const city = targetCities[cityIdx];
    const cityOrder = cityIdx + 1;
    for (const category of targetCategories) {
      await writeCheckpointLog({
        entityType: "mcp_stage1",
        cityId: city.id,
        category,
        cityOrder,
        cityNameEn: city.nameEn,
        runBatchId,
        status: "running",
      });
      const result = await runStage1ForCityCategory(city, category);
      processedCategories++;
      savedRows += result.saved;
      if (!result.success && result.error) {
        errors.push(`${city.nameEn}/${category}: ${result.error}`);
        await writeCheckpointLog({
          entityType: "mcp_stage1",
          cityId: city.id,
          category,
          cityOrder,
          cityNameEn: city.nameEn,
          runBatchId,
          status: "failed",
          itemsProcessed: result.saved,
          itemsFailed: 1,
          errorMessage: result.error,
        });
      } else {
        await writeCheckpointLog({
          entityType: "mcp_stage1",
          cityId: city.id,
          category,
          cityOrder,
          cityNameEn: city.nameEn,
          runBatchId,
          status: "success",
          itemsProcessed: result.saved,
        });
      }
    }
  }

  return {
    success: errors.length === 0,
    runBatchId,
    processedCities: targetCities.length,
    processedCategories,
    savedRows,
    errors,
    citySource: cityMeta.source,
    citySourcePath: cityMeta.path,
  };
}

export async function runMcpRawStage2(options: Stage2RunOptions): Promise<{
  success: boolean;
  runBatchId: string;
  processedCityId: number;
  processedCategory: SeedCategory;
  updatedRawRows: number;
  savedNubiReasonRows: number;
  errors: string[];
  citySource: "runtime_file" | "draft_default";
  citySourcePath: string;
}> {
  const cityMeta = getMcpCitySourceMeta();
  const runBatchId = options.runBatchId || makeRunBatchId();
  if (!db) {
    return {
      success: false,
      runBatchId,
      processedCityId: options.cityId,
      processedCategory: options.category,
      updatedRawRows: 0,
      savedNubiReasonRows: 0,
      errors: ["DB 연결 없음"],
      citySource: cityMeta.source,
      citySourcePath: cityMeta.path,
    };
  }
  const targetCities = await resolveTargetCities({ cityId: options.cityId });
  const city = targetCities[0];
  if (!city) {
    return {
      success: false,
      runBatchId,
      processedCityId: options.cityId,
      processedCategory: options.category,
      updatedRawRows: 0,
      savedNubiReasonRows: 0,
      errors: ["대상 도시를 찾을 수 없습니다."],
      citySource: cityMeta.source,
      citySourcePath: cityMeta.path,
    };
  }
  const executionOrder = getMcpExecutionOrder();
  const cityOrder = Math.max(
    1,
    executionOrder.findIndex((c) => c.nameEn.toLowerCase() === city.nameEn.toLowerCase()) + 1 || 1
  );
  await writeCheckpointLog({
    entityType: "mcp_stage2",
    cityId: city.id,
    category: options.category,
    cityOrder,
    cityNameEn: city.nameEn,
    runBatchId,
    status: "running",
  });
  const stage2 = await runStage2ForCityCategory(city, options.category);
  const errors = stage2.success ? [] : [`${city.nameEn}/${options.category}: ${stage2.error || "2단계 처리 실패"}`];
  if (stage2.success) {
    await writeCheckpointLog({
      entityType: "mcp_stage2",
      cityId: city.id,
      category: options.category,
      cityOrder,
      cityNameEn: city.nameEn,
      runBatchId,
      status: "success",
      itemsProcessed: stage2.updatedRawRows,
    });
  } else {
    await writeCheckpointLog({
      entityType: "mcp_stage2",
      cityId: city.id,
      category: options.category,
      cityOrder,
      cityNameEn: city.nameEn,
      runBatchId,
      status: "failed",
      itemsProcessed: stage2.updatedRawRows,
      itemsFailed: 1,
      errorMessage: stage2.error || "2단계 처리 실패",
    });
  }

  return {
    success: errors.length === 0,
    runBatchId,
    processedCityId: city.id,
    processedCategory: options.category,
    updatedRawRows: stage2.updatedRawRows,
    savedNubiReasonRows: stage2.savedNubiReasonRows,
    errors,
    citySource: cityMeta.source,
    citySourcePath: cityMeta.path,
  };
}

type WorkflowStartOptions = {
  startCity?: string | number;
  endCity?: string | number;
  runBatchId?: string;
  retryLimit?: number;
};

type WorkflowSummary = {
  success: boolean;
  runBatchId: string;
  processedCities: number;
  stage1Success: number;
  stage1Failed: number;
  stage2Success: number;
  stage2Failed: number;
  errors: string[];
};

function normalizeCityKey(input: string | number): string {
  return String(input).trim().toLowerCase();
}

function findCityIndexBySelector(citiesList: TargetCity[], selector: string | number): number {
  const key = normalizeCityKey(selector);
  return citiesList.findIndex((city) => {
    if (normalizeCityKey(city.id) === key) return true;
    if (normalizeCityKey(city.nameEn) === key) return true;
    if (normalizeCityKey(city.nameKo) === key) return true;
    return false;
  });
}

function pickCityRange(citiesList: TargetCity[], options: WorkflowStartOptions): TargetCity[] {
  if (!options.startCity && !options.endCity) return citiesList;

  let startIdx = 0;
  let endIdx = citiesList.length - 1;

  if (options.startCity !== undefined) {
    const idx = findCityIndexBySelector(citiesList, options.startCity);
    if (idx >= 0) startIdx = idx;
  }
  if (options.endCity !== undefined) {
    const idx = findCityIndexBySelector(citiesList, options.endCity);
    if (idx >= 0) endIdx = idx;
  }
  if (endIdx < startIdx) return [];
  return citiesList.slice(startIdx, endIdx + 1);
}

async function runWithRetry<T>(
  run: () => Promise<T>,
  isSuccess: (result: T) => boolean,
  retryLimit: number
): Promise<{ result: T; retries: number }> {
  let retries = 0;
  let result = await run();
  while (!isSuccess(result) && retries < retryLimit) {
    retries++;
    result = await run();
  }
  return { result, retries };
}

async function getLatestCheckpointStatus(input: {
  runBatchId: string;
  entityType: "mcp_stage1" | "mcp_stage2";
  cityId: number;
  category: SeedCategory;
}): Promise<"running" | "success" | "failed" | null> {
  if (!db) return null;
  const [row] = await db
    .select({ status: dataSyncLog.status })
    .from(dataSyncLog)
    .where(
      and(
        eq(dataSyncLog.entityType, input.entityType),
        eq(dataSyncLog.entityId, input.cityId),
        sql`${dataSyncLog.source} LIKE ${`%run=${input.runBatchId}|cat=${input.category}|%`}`
      )
    )
    .orderBy(sql`${dataSyncLog.startedAt} DESC`)
    .limit(1);
  if (!row?.status) return null;
  if (row.status === "running" || row.status === "success" || row.status === "failed") return row.status;
  return null;
}

export async function runMcpWorkflowStart(options: WorkflowStartOptions = {}): Promise<WorkflowSummary> {
  const runBatchId = options.runBatchId || makeRunBatchId();
  const retryLimit = Number.isFinite(options.retryLimit) ? Math.max(0, Number(options.retryLimit)) : 1;
  const targetAll = await resolveTargetCities({});
  const targets = pickCityRange(targetAll, options);
  const errors: string[] = [];
  let stage1Success = 0;
  let stage1Failed = 0;
  let stage2Success = 0;
  let stage2Failed = 0;

  for (const city of targets) {
    for (const category of CATEGORIES) {
      const stage1Run = await runWithRetry(
        () => runMcpRawStage1({ cityId: city.id, category, runBatchId }),
        (r) => r.success,
        retryLimit
      );
      if (stage1Run.result.success) {
        stage1Success++;
      } else {
        stage1Failed++;
        errors.push(`${city.nameEn}/${category}/stage1: ${stage1Run.result.errors.join(", ") || "실패"}`);
      }

      const stage2Run = await runWithRetry(
        () => runMcpRawStage2({ cityId: city.id, category, runBatchId }),
        (r) => r.success,
        retryLimit
      );
      if (stage2Run.result.success) {
        stage2Success++;
      } else {
        stage2Failed++;
        errors.push(`${city.nameEn}/${category}/stage2: ${stage2Run.result.errors.join(", ") || "실패"}`);
      }
    }
  }

  return {
    success: errors.length === 0,
    runBatchId,
    processedCities: targets.length,
    stage1Success,
    stage1Failed,
    stage2Success,
    stage2Failed,
    errors,
  };
}

export async function runMcpWorkflowResume(options: {
  runBatchId: string;
  retryLimit?: number;
  startCity?: string | number;
  endCity?: string | number;
}): Promise<WorkflowSummary> {
  const retryLimit = Number.isFinite(options.retryLimit) ? Math.max(0, Number(options.retryLimit)) : 1;
  const targetAll = await resolveTargetCities({});
  const targets = pickCityRange(targetAll, options);
  const errors: string[] = [];
  let stage1Success = 0;
  let stage1Failed = 0;
  let stage2Success = 0;
  let stage2Failed = 0;

  for (const city of targets) {
    for (const category of CATEGORIES) {
      const stage1Status = await getLatestCheckpointStatus({
        runBatchId: options.runBatchId,
        entityType: "mcp_stage1",
        cityId: city.id,
        category,
      });
      if (stage1Status !== "success") {
        const stage1Run = await runWithRetry(
          () => runMcpRawStage1({ cityId: city.id, category, runBatchId: options.runBatchId }),
          (r) => r.success,
          retryLimit
        );
        if (stage1Run.result.success) {
          stage1Success++;
        } else {
          stage1Failed++;
          errors.push(`${city.nameEn}/${category}/stage1: ${stage1Run.result.errors.join(", ") || "실패"}`);
        }
      }

      const stage2Status = await getLatestCheckpointStatus({
        runBatchId: options.runBatchId,
        entityType: "mcp_stage2",
        cityId: city.id,
        category,
      });
      if (stage2Status !== "success") {
        const stage2Run = await runWithRetry(
          () => runMcpRawStage2({ cityId: city.id, category, runBatchId: options.runBatchId }),
          (r) => r.success,
          retryLimit
        );
        if (stage2Run.result.success) {
          stage2Success++;
        } else {
          stage2Failed++;
          errors.push(`${city.nameEn}/${category}/stage2: ${stage2Run.result.errors.join(", ") || "실패"}`);
        }
      }
    }
  }

  return {
    success: errors.length === 0,
    runBatchId: options.runBatchId,
    processedCities: targets.length,
    stage1Success,
    stage1Failed,
    stage2Success,
    stage2Failed,
    errors,
  };
}

export async function getMcpWorkflowStatus(runBatchId: string): Promise<{
  runBatchId: string;
  runningCount: number;
  successCount: number;
  failedCount: number;
  lastUpdatedAt: Date | null;
}> {
  if (!db) {
    return { runBatchId, runningCount: 0, successCount: 0, failedCount: 0, lastUpdatedAt: null };
  }
  const rows = await db
    .select({ status: dataSyncLog.status, startedAt: dataSyncLog.startedAt })
    .from(dataSyncLog)
    .where(sql`${dataSyncLog.source} LIKE ${`%run=${runBatchId}|%`}`);

  let runningCount = 0;
  let successCount = 0;
  let failedCount = 0;
  let lastUpdatedAt: Date | null = null;

  for (const row of rows) {
    if (row.status === "running") runningCount++;
    else if (row.status === "success") successCount++;
    else if (row.status === "failed") failedCount++;
    if (row.startedAt && (!lastUpdatedAt || row.startedAt > lastUpdatedAt)) {
      lastUpdatedAt = row.startedAt;
    }
  }

  return { runBatchId, runningCount, successCount, failedCount, lastUpdatedAt };
}

export async function getMcpWorkflowReport(runBatchId: string): Promise<{
  runBatchId: string;
  cities: Array<{ cityId: number; cityNameEn: string; stage1Count: number; stage2Count: number }>;
  failedLogs: Array<{ entityType: string; entityId: number | null; source: string | null; errorMessage: string | null }>;
}> {
  if (!db) return { runBatchId, cities: [], failedLogs: [] };

  const targetCities = await resolveTargetCities({});
  const cityReports: Array<{ cityId: number; cityNameEn: string; stage1Count: number; stage2Count: number }> = [];

  for (const city of targetCities) {
    const stage1Rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(placeSeedRaw)
      .where(eq(placeSeedRaw.cityId, city.id));
    const stage2Rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(placeSeedRaw)
      .where(and(eq(placeSeedRaw.cityId, city.id), sql`${placeSeedRaw.nubiReason} IS NOT NULL`));
    cityReports.push({
      cityId: city.id,
      cityNameEn: city.nameEn,
      stage1Count: Number(stage1Rows[0]?.count || 0),
      stage2Count: Number(stage2Rows[0]?.count || 0),
    });
  }

  const failedLogs = await db
    .select({
      entityType: dataSyncLog.entityType,
      entityId: dataSyncLog.entityId,
      source: dataSyncLog.source,
      errorMessage: dataSyncLog.errorMessage,
    })
    .from(dataSyncLog)
    .where(
      and(
        eq(dataSyncLog.status, "failed"),
        sql`${dataSyncLog.source} LIKE ${`%run=${runBatchId}|%`}`
      )
    )
    .orderBy(sql`${dataSyncLog.startedAt} DESC`);

  return { runBatchId, cities: cityReports, failedLogs };
}

export async function getMcpRawStatus(): Promise<{
  cityCount: number;
  categoryCount: number;
  rowCount: number;
  stage2FilledCount: number;
  nubiReasonTableCount: number;
  byCategory: Record<string, number>;
}> {
  if (!db) {
    return {
      cityCount: 0,
      categoryCount: 0,
      rowCount: 0,
      stage2FilledCount: 0,
      nubiReasonTableCount: 0,
      byCategory: {},
    };
  }

  const rows = await db.select().from(placeSeedRaw);
  const nubiReasonRows = await db.select().from(placeNubiReasons);
  const citySet = new Set<number>();
  const catSet = new Set<string>();
  const byCategory: Record<string, number> = {};
  let stage2FilledCount = 0;

  for (const row of rows) {
    citySet.add(row.cityId);
    catSet.add(row.seedCategory);
    byCategory[row.seedCategory] = (byCategory[row.seedCategory] || 0) + 1;
    if (row.nubiReason) stage2FilledCount++;
  }

  return {
    cityCount: citySet.size,
    categoryCount: catSet.size,
    rowCount: rows.length,
    stage2FilledCount,
    nubiReasonTableCount: nubiReasonRows.length,
    byCategory,
  };
}
