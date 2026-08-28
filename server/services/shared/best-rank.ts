// ⚠️ 수정금지(승인필요) 2026-08-27 사장님 확정 = place_seed_raw.best_rank = 7자리 언어코드(분류번호) = 앱 전체 1벌(§16).
// = 순위도 계산식도 아니다. "어느 언어들의 베스트20 발굴이 이 장소를 뽑았나"를 자릿수로 적은 분류 표식이다.
// = 언어 번호(고정, language-instruction.ts LANGS 순서 = index+1): 1=ko 2=en 3=ja 4=fr 5=zh 6=es 7=de.
//   k번째 자리 = 그 언어가 뽑았으면 k, 아니면 0.
//   예) 1234567 = 7개 언어 전부(만장일치) / 1204567 = ja 만 빠짐 / 1034060 = ko+ja+fr+es / 7(=0000007) = de 만.
//   정수라 앞자리 0은 사라지지만(예 7), 자리값 == 언어번호이므로 해독은 항상 유일하다.
// = 뜻: (a) 이 장소는 "베스트" 장소다. (b) 0 아닌 자리 d 마다(1=ko 제외, ko 원문은 PSR summary_ko/editorial_summary 자체)
//   place_translations(place_id, language) 에 그 언어의 summary+editorial_summary 행이 반드시 있다(B2 계약).
//   같은 코드를 여러 행이 공유한다 = 의도됨(분류지 id 가 아님).
// = 정렬(언어 무관) = 0 아닌 자릿수 개수 DESC NULLS LAST → google_review_count DESC NULLS LAST → id.
//   SQL: length(replace(best_rank::text, '0', '')) DESC NULLS LAST
// = 정렬(언어 인지, 요청 언어 L 의 번호 d 를 알 때) = 코드에 d 가 든 행만 베스트(그 안에서 자릿수 개수 DESC), 나머지는 순수 RC 순.
//   SQL: (CASE WHEN position('d' in best_rank::text) > 0 THEN length(replace(best_rank::text,'0','')) END) DESC NULLS LAST
// = ⚠️ 절대 best_rank 의 숫자 크기로 정렬하지 말 것 = 1234500 > 1204567 이지만 언어 수는 더 적다(5 < 6).
// = 쓰기 주체 = writeBestRankUnion() 1벌(§16 SSOT, 2026-08-28 사장님 승인) = fillcity/steps/discovery-verify-and-insert.ts(B2)
//   병합·신규 두 경로 + server/services/fill/status-backfill.ts absorbTwinGroup() 공용. 옛날 각자 독립구현(중복) 폐기.
//   읽는 곳 = autorank 트리거 SQL(원문 동일)·city-representative-place·city-place-routes·ag4-db-finalize = bestRankOrder()/bestRankOrderSql().
// = 검산 메모: bestRankCode(["de"]) = 7 / bestRankCode(["ko","ja","fr","es"]) = 1034060 / bestRankCode(LANGS) = 1234567 /
//   bestRankCode(["xx"]) = null / bestRankCode(["en","en"]) = 200000.
// = ⚠️ 수정금지(승인필요) 2026-08-27 사장님 확정 = best_rank 쓰기 = 덮어쓰기가 아니라 자리별 합집합(∪) = bestRankUnion() 1벌.
//   B1 은 문지기가 같은 장소라 판정한 원시항목만 묶으므로 한 실제 장소가 여러 그룹으로 나뉘어 도착할 수 있다
//   (예 오르세: ko/en/ja 그룹 → 오늘 1230000 / fr/zh/es/de 그룹 → 나중에 TS→PID 로 같은 행). 각 그룹은 자기 코드를
//   행의 현재값과 합쳐 쓴다 → 먼저 온 언어가 지워지지 않는다.
//   검산: 1230000 ∪ 4567 = 1234567 / 7 ∪ 1000000 = 1000007 / null ∪ 200000 = 200000 / null ∪ null = null.

import { sql } from "drizzle-orm";
import { placeSeedRaw } from "@shared/schema";
import { LANGS } from "./language-instruction";

/** 언어코드 배열 → 7자리 분류번호. 모르는 언어코드는 무시, 아는 언어가 하나도 없으면 null. */
export function bestRankCode(langs: readonly string[]): number | null {
  const digits = LANGS.map((l, i) => (langs.includes(l) ? String(i + 1) : "0"));
  const code = Number(digits.join(""));
  return code === 0 ? null : code;
}

/** 두 7자리 언어코드의 자리별 합집합. k번째 자리 = 둘 중 하나라도 k 면 k, 아니면 0.
 *  둘 다 null → null / 한쪽 null → 다른 쪽. 예) 1230000 ∪ 4567 = 1234567 / 7 ∪ 1000000 = 1000007. */
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
//   조건부 UPDATE) 유일 진입점(§16) = discovery-verify-and-insert.ts(B2 병합·신규)와 status-backfill.ts(absorbTwinGroup)가
//   각자 독립 구현해 드리프트(멱등 최적화 유무 불일치)가 났던 것을 이 함수 1벌로 통합. 호출자가 이미 연 트랜잭션
//   (BEGIN..COMMIT, skip_dup_check 면제) 안에서 호출해야 한다(이 함수 자체는 트랜잭션을 열지 않음).
/** 행의 best_rank 를 FOR UPDATE 로 잠가 읽고 code 와 합집합(bestRankUnion)한 뒤, 값이 바뀔 때만 UPDATE(멱등).
 *  반환 = {cur: 읽은 현재값, result: 합집합 결과}. */
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

/** 0 아닌 자릿수 개수(= 뽑은 언어 수) raw SQL. */
export const bestRankLangCountSql = "length(replace(best_rank::text, '0', ''))";

/** 요청 언어의 자릿수 번호(1~7). 미지정·미지원 = undefined. */
function langDigit(lang?: string): number | undefined {
  const i = (LANGS as readonly string[]).indexOf(lang || "");
  return i >= 0 ? i + 1 : undefined;
}

/**
 * ORDER BY 선두 표현식(raw SQL 문자열). 언어 모르면 언어 무관, 알면 그 언어가 든 행만 베스트.
 * 호출자가 `, google_review_count DESC NULLS LAST, id` 를 뒤에 붙인다.
 */
export function bestRankOrderSql(lang?: string): string {
  const d = langDigit(lang);
  if (d === undefined) return `${bestRankLangCountSql} DESC NULLS LAST`;
  return `(CASE WHEN position('${d}' in best_rank::text) > 0 THEN ${bestRankLangCountSql} END) DESC NULLS LAST`;
}

/** 같은 표현식의 drizzle orderBy 조각(placeSeedRaw.bestRank 바인딩). */
export function bestRankOrder(lang?: string) {
  const col = placeSeedRaw.bestRank;
  const count = sql`length(replace(${col}::text, '0', ''))`;
  const d = langDigit(lang);
  if (d === undefined) return sql`${count} DESC NULLS LAST`;
  return sql`(CASE WHEN position(${sql.raw(`'${d}'`)} in ${col}::text) > 0 THEN ${count} END) DESC NULLS LAST`;
}
