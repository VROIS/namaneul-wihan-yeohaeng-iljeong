// ⚠️ 수정금지(승인필요) 2026-10-26 사장님 결정 = 베스트 산출본 직접 읽기 1벌 = 그 도시 최신 산출표(제미니 베스트 산출본)를 읽어 항목마다 짝 행·상태를 매긴다(손님상에 안 나가는 짝 행 = 빠짐) = 못 찾은 베스트 명단·베스트 순위·⑥ 판정이 같은 이 함수를 부른다(장부만 보고 넘기면 빠진다) (정본 §2026-10-26)
import fs from "fs";
import {
  DIFF_SECTIONS,
  diffSectionItems,
  latestReport,
  ledgerKey,
  readLedger,
  type Ledger,
} from "./common";
import { crossKind } from "../../worker/lib/services/fill/gmaps-absorb";
import type { NewEntry } from "../../worker/lib/services/fill/gmaps-shared";

const PLACED = new Set(["inserted", "worker-inserted", "worker-absorbed"]);
const WORKER = new Set(["worker-inserted", "worker-absorbed"]);

export type BestState =
  | "정상"
  | "영구 폐업"
  | "못 찾음 결론"
  | "짝 없음"
  | "행 없음"
  | "병합됨"
  | "베스트 값 없음"
  | "손님상 아님";

export type BestItem = {
  section: (typeof DIFF_SECTIONS)[number];
  ordinal: number;
  entry: NewEntry;
  key: string;
  rowId: number | null;
  state: BestState;
  row: any; // 짝 행(id·name_en·seed_category·best_rank·merged_into·business_status·status) 또는 null
};

/** 빠진 베스트 = 산출본에 있는데 살아 있는 베스트 행이 없는 것(영구 폐업 행·못 찾음 결론은 빠짐이 아니다). */
export const MISSING = new Set<BestState>([
  "짝 없음",
  "행 없음",
  "병합됨",
  "베스트 값 없음",
  "손님상 아님",
]);

/** 산출본 항목 → 짝 행 = 찾기 팀 결론(넣음·흡수·못 찾음)이 먼저 · 다음 확인 항목은 짝 힌트 행(종류가 같을 때) · 그 밖은 장부가 넣은 행. 등수 = 동의 언어 수 많은 순 → 제미니 평균 등수 → 이름. */
export function mapBestItems(
  report: any,
  ledger: Ledger,
): Omit<BestItem, "state" | "row">[] {
  return DIFF_SECTIONS.flatMap((section) =>
    (diffSectionItems(report, section) as NewEntry[])
      .sort(
        (a, b) =>
          b.langs - a.langs ||
          (a.avgRank ?? Number.MAX_SAFE_INTEGER) -
            (b.avgRank ?? Number.MAX_SAFE_INTEGER) ||
          String(a.name).localeCompare(String(b.name)),
      )
      .map((entry, i) => {
        const key = ledgerKey(entry);
        const e = ledger[key];
        const rowId =
          e?.verdict === "not-found"
            ? null
            : e?.rowId && WORKER.has(e.verdict)
              ? e.rowId
              : entry.psrHint && !crossKind(entry)
                ? entry.psrHint.psrId
                : e?.rowId && PLACED.has(e.verdict)
                  ? e.rowId
                  : null;
        return { section, ordinal: i + 1, entry, key, rowId };
      }),
  );
}

/** 그 도시 최신 산출본을 읽어 항목마다 상태를 매긴다(산출본이 없는 도시 = null). */
export async function readBestOutput(
  c: any,
  cityId: number,
  ledger: Ledger = readLedger(cityId),
): Promise<{ reportPath: string; items: BestItem[] } | null> {
  const reportPath = latestReport(cityId, "b1-discovery-diff");
  if (!reportPath) return null;
  const report = JSON.parse(fs.readFileSync(reportPath, "utf-8")).report;
  const mapped = mapBestItems(report, ledger);
  const ids = [...new Set(mapped.map((x) => x.rowId).filter(Boolean))];
  const rows = new Map<number, any>(
    (
      await c.query(
        `SELECT id, name_en, seed_category, best_rank, merged_into, business_status, status FROM place_seed_raw WHERE id = ANY($1::int[])`,
        [ids],
      )
    ).rows.map((r: any) => [r.id, r]),
  );
  const items = mapped.map((x): BestItem => {
    const r = x.rowId ? rows.get(x.rowId) : null;
    const state: BestState = !x.rowId
      ? ledger[x.key]?.verdict === "not-found"
        ? "못 찾음 결론"
        : "짝 없음"
      : !r
        ? "행 없음"
        : r.merged_into
          ? "병합됨"
          : r.best_rank == null
            ? "베스트 값 없음"
            : r.business_status === "CLOSED_PERMANENTLY"
              ? "영구 폐업"
              : r.status !== "active"
                ? "손님상 아님"
                : "정상";
    return { ...x, state, row: r ?? null };
  });
  return { reportPath, items };
}
