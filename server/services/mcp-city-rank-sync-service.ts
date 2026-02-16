import { db } from "../db";
import { cities } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getMcpPhaseCities, type McpRankedCity } from "../config/mcp-raw-data-final";

const RANK_BASIS = "euromonitor_un_tourism_2024_2025";

const NAME_EN_ALIAS: Record<string, string[]> = {
  "chamonix-mont-blanc": ["chamonix"],
  florence: ["firenze"],
  naples: ["napoli"],
  seville: ["sevilla"],
  vienna: ["wien"],
};

type Phase = "france30" | "europe30";

interface RankUpdateRow {
  mcpRankFr: number | null;
  mcpRankEu: number | null;
  mcpBucket: "france30" | "europe30" | "both";
  mcpRankBasis: string;
  mcpRankNote: string;
  mcpRankUpdatedAt: Date;
}

function normalize(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function buildTokens(city: McpRankedCity): string[] {
  const set = new Set<string>();
  const en = normalize(city.nameEn);
  const ko = normalize(city.nameKo);
  if (en) set.add(en);
  if (ko) set.add(ko);
  for (const alias of NAME_EN_ALIAS[en] || []) set.add(normalize(alias));
  return Array.from(set);
}

function applyPhaseRank(target: RankUpdateRow, phase: Phase, rank: number) {
  if (phase === "france30") target.mcpRankFr = rank;
  if (phase === "europe30") target.mcpRankEu = rank;
  target.mcpBucket = target.mcpRankFr && target.mcpRankEu
    ? "both"
    : target.mcpRankFr
      ? "france30"
      : "europe30";
}

export async function syncMcpCityRanksToDb(): Promise<{
  success: boolean;
  basis: string;
  totalInput: number;
  matched: number;
  unmatched: Array<{ phase: Phase; rank: number; nameEn: string; nameKo: string }>;
  bucketCounts: { france30: number; europe30: number; both: number };
}> {
  if (!db) {
    throw new Error("DB 연결이 없습니다.");
  }

  const france = getMcpPhaseCities("france30");
  const europe = getMcpPhaseCities("europe30");
  const all = [...france, ...europe];

  const rows = await db
    .select({
      id: cities.id,
      name: cities.name,
      nameEn: cities.nameEn,
      nameLocal: cities.nameLocal,
      aliases: cities.aliases,
    })
    .from(cities);

  const tokenToCityId = new Map<string, number>();
  for (const row of rows) {
    const tokens = [
      normalize(row.name),
      normalize(row.nameEn || ""),
      normalize(row.nameLocal || ""),
      ...(((row.aliases as string[] | null) || []).map((v) => normalize(v))),
    ].filter(Boolean);
    for (const token of tokens) {
      if (!tokenToCityId.has(token)) tokenToCityId.set(token, row.id);
    }
  }

  // 초기화: 기존 MCP 순위 컬럼 리셋
  await db.update(cities).set({
    mcpBucket: null,
    mcpRankFr: null,
    mcpRankEu: null,
    mcpRankBasis: null,
    mcpRankNote: null,
    mcpRankUpdatedAt: null,
  });

  const pending = new Map<number, RankUpdateRow>();
  const unmatched: Array<{ phase: Phase; rank: number; nameEn: string; nameKo: string }> = [];

  for (const item of all) {
    const tokens = buildTokens(item);
    const matchedId = tokens.map((t) => tokenToCityId.get(t)).find((id) => Number.isFinite(id));
    if (!matchedId) {
      unmatched.push({
        phase: item.phase,
        rank: item.rank,
        nameEn: item.nameEn,
        nameKo: item.nameKo,
      });
      continue;
    }

    const current = pending.get(matchedId) || {
      mcpRankFr: null,
      mcpRankEu: null,
      mcpBucket: "france30",
      mcpRankBasis: RANK_BASIS,
      mcpRankNote: "MCP 확정 순위(프랑스30/유럽30) 기준",
      mcpRankUpdatedAt: new Date(),
    };
    applyPhaseRank(current, item.phase, item.rank);
    pending.set(matchedId, current);
  }

  for (const [cityId, update] of pending.entries()) {
    await db.update(cities)
      .set(update)
      .where(eq(cities.id, cityId));
  }

  let franceCount = 0;
  let europeCount = 0;
  let bothCount = 0;
  for (const v of pending.values()) {
    if (v.mcpBucket === "france30") franceCount++;
    if (v.mcpBucket === "europe30") europeCount++;
    if (v.mcpBucket === "both") bothCount++;
  }

  return {
    success: true,
    basis: RANK_BASIS,
    totalInput: all.length,
    matched: pending.size,
    unmatched,
    bucketCounts: {
      france30: franceCount,
      europe30: europeCount,
      both: bothCount,
    },
  };
}
