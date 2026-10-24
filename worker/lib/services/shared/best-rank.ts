// ⚠️ 수정금지(승인필요) 2026-10-18 사장님 결정 = place_seed_raw.best_rank = 순위 × 10,000,000 + 7자리 언어코드(앞자리 = 기준 도시 산출표 순위, 없으면 언어코드만) = 앱 전체 1벌(§16) · 쓰기 = 언어코드는 자리별 합집합(∪) · 순위는 작은 쪽 = bestRankUnion() 1벌 (정본 §)

import { sql } from "drizzle-orm";
import { placeSeedRaw } from "@shared/schema";
import { LANGS } from "./language-instruction";

export const BEST_RANK_BASE = 10_000_000;

export function bestRankCode(langs: readonly string[]): number | null {
  const digits = LANGS.map((l, i) => (langs.includes(l) ? String(i + 1) : "0"));
  const code = Number(digits.join(""));
  return code === 0 ? null : code;
}

export function bestRankLangCode(v: number | null | undefined): number | null {
  if (v == null) return null;
  const code = Number(v) % BEST_RANK_BASE;
  return code === 0 ? null : code;
}

export function bestRankOrdinal(v: number | null | undefined): number | null {
  if (v == null) return null;
  const o = Math.floor(Number(v) / BEST_RANK_BASE);
  return o > 0 ? o : null;
}

export function bestRankWithOrdinal(
  code: number | null,
  ordinal: number | null,
): number | null {
  if (code == null) return null;
  return (ordinal ?? 0) * BEST_RANK_BASE + code;
}

export function bestRankUnion(
  a: number | null | undefined,
  b: number | null | undefined,
): number | null {
  const pa = String(bestRankLangCode(a) ?? 0).padStart(LANGS.length, "0");
  const pb = String(bestRankLangCode(b) ?? 0).padStart(LANGS.length, "0");
  const digits = LANGS.map((_, i) =>
    pa[i] !== "0" || pb[i] !== "0" ? String(i + 1) : "0",
  );
  const code = Number(digits.join(""));
  if (code === 0) return null;
  const oa = bestRankOrdinal(a);
  const ob = bestRankOrdinal(b);
  const ordinal = oa == null ? ob : ob == null ? oa : Math.min(oa, ob);
  return bestRankWithOrdinal(code, ordinal);
}

// ⚠️ 수정금지(승인필요) 2026-10-23 사장님 결정 = best_rank 쓰기 절차 1벌(SELECT FOR UPDATE → 계산 → 달라지면 UPDATE) = 언어 합치기와 순위 앞자리 쓰기가 같이 쓴다 (정본 §2026-10-23)
type Client = {
  query: (sql: string, params?: any[]) => Promise<{ rows: any[] }>;
};
async function writeBestRank(
  client: Client,
  rowId: number,
  next: (cur: number | null) => number | null,
): Promise<{ cur: number | null; result: number | null }> {
  const cur: number | null =
    (
      await client.query(
        `SELECT best_rank FROM place_seed_raw WHERE id = $1 FOR UPDATE`,
        [rowId],
      )
    ).rows[0]?.best_rank ?? null;
  const result = next(cur);
  if (result !== cur) {
    await client.query(
      `UPDATE place_seed_raw SET best_rank = $1, updated_at = NOW() WHERE id = $2`,
      [result, rowId],
    );
  }
  return { cur, result };
}

// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 승인 = best_rank 쓰기 트랜잭션 절차(SELECT..FOR UPDATE → bestRankUnion →
export async function writeBestRankUnion(
  client: Client,
  rowId: number,
  code: number | null,
): Promise<{ cur: number | null; result: number | null }> {
  return writeBestRank(client, rowId, (cur) => bestRankUnion(cur, code));
}

// ⚠️ 수정금지(승인필요) 2026-10-23 사장님 결정 = 순위 앞자리 쓰기 1벌 = 언어코드(뒤 7자리)는 그대로 두고 앞자리만 그 도시 최신 산출표 순위로 바꾼다 · 베스트가 아닌 행(언어코드 없음)은 쓰지 않는다 (정본 §2026-10-23)
export async function writeBestRankOrdinal(
  client: Client,
  rowId: number,
  ordinal: number,
): Promise<{ cur: number | null; result: number | null }> {
  return writeBestRank(
    client,
    rowId,
    (cur) => bestRankWithOrdinal(bestRankLangCode(cur), ordinal) ?? cur,
  );
}

export function bestRankLangCount(v: number | null | undefined): number {
  const code = bestRankLangCode(v);
  if (!code) return 0;
  return String(code)
    .split("")
    .filter((c) => c !== "0").length;
}

const langCodeSql = `(best_rank % ${BEST_RANK_BASE})`;
const bestRankLangCountSql = `length(replace(${langCodeSql}::text, '0', ''))`;

function langDigit(lang?: string): number | undefined {
  const i = (LANGS as readonly string[]).indexOf(lang || "");
  return i >= 0 ? i + 1 : undefined;
}

export function bestRankOrderSql(lang?: string): string {
  const d = langDigit(lang);
  if (d === undefined) return `${bestRankLangCountSql} DESC NULLS LAST`;
  return `(CASE WHEN position('${d}' in ${langCodeSql}::text) > 0 THEN ${bestRankLangCountSql} END) DESC NULLS LAST`;
}

export function bestRankOrder(lang?: string) {
  const col = placeSeedRaw.bestRank;
  const code = sql`(${col} % ${sql.raw(String(BEST_RANK_BASE))})`;
  const count = sql`length(replace(${code}::text, '0', ''))`;
  const d = langDigit(lang);
  if (d === undefined) return sql`${count} DESC NULLS LAST`;
  return sql`(CASE WHEN position(${sql.raw(`'${d}'`)} in ${code}::text) > 0 THEN ${count} END) DESC NULLS LAST`;
}
