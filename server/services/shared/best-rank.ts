// ⚠️ 수정금지(승인필요) 2026-08-27 사장님 확정 = place_seed_raw.best_rank = 7자리 언어코드(분류번호) = 앱 전체 1벌(§16).
// = 쓰기 주체 = writeBestRankUnion() 1벌(§16 SSOT, 2026-08-28 사장님 승인) = fillcity/steps/discovery-verify-and-insert.ts(B2)
// = ⚠️ 수정금지(승인필요) 2026-08-27 사장님 확정 = best_rank 쓰기 = 덮어쓰기가 아니라 자리별 합집합(∪) = bestRankUnion() 1벌.

import { sql } from "drizzle-orm";
import { placeSeedRaw } from "@shared/schema";
import { LANGS } from "./language-instruction";

export function bestRankCode(langs: readonly string[]): number | null {
  const digits = LANGS.map((l, i) => (langs.includes(l) ? String(i + 1) : "0"));
  const code = Number(digits.join(""));
  return code === 0 ? null : code;
}

export function bestRankUnion(
  a: number | null | undefined,
  b: number | null | undefined,
): number | null {
  const pa = String(a ?? 0).padStart(LANGS.length, "0");
  const pb = String(b ?? 0).padStart(LANGS.length, "0");
  const digits = LANGS.map((_, i) =>
    pa[i] !== "0" || pb[i] !== "0" ? String(i + 1) : "0",
  );
  const code = Number(digits.join(""));
  return code === 0 ? null : code;
}

// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 승인 = best_rank 쓰기 트랜잭션 절차(SELECT..FOR UPDATE → bestRankUnion →
export async function writeBestRankUnion(
  client: { query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> },
  rowId: number,
  code: number | null,
): Promise<{ cur: number | null; result: number | null }> {
  const cur: number | null =
    (
      await client.query(
        `SELECT best_rank FROM place_seed_raw WHERE id = $1 FOR UPDATE`,
        [rowId],
      )
    ).rows[0]?.best_rank ?? null;
  const result = bestRankUnion(cur, code);
  if (result !== cur) {
    await client.query(
      `UPDATE place_seed_raw SET best_rank = $1, updated_at = NOW() WHERE id = $2`,
      [result, rowId],
    );
  }
  return { cur, result };
}

export const bestRankLangCountSql = "length(replace(best_rank::text, '0', ''))";

function langDigit(lang?: string): number | undefined {
  const i = (LANGS as readonly string[]).indexOf(lang || "");
  return i >= 0 ? i + 1 : undefined;
}

export function bestRankOrderSql(lang?: string): string {
  const d = langDigit(lang);
  if (d === undefined) return `${bestRankLangCountSql} DESC NULLS LAST`;
  return `(CASE WHEN position('${d}' in best_rank::text) > 0 THEN ${bestRankLangCountSql} END) DESC NULLS LAST`;
}

export function bestRankOrder(lang?: string) {
  const col = placeSeedRaw.bestRank;
  const count = sql`length(replace(${col}::text, '0', ''))`;
  const d = langDigit(lang);
  if (d === undefined) return sql`${count} DESC NULLS LAST`;
  return sql`(CASE WHEN position(${sql.raw(`'${d}'`)} in ${col}::text) > 0 THEN ${count} END) DESC NULLS LAST`;
}
