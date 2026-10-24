// ⚠️ 수정금지(승인필요) 2026-10-23 사장님 결정 = 이 PC 로컬 폴더 1벌 = 원본 docs/raw/{맥락} · 보고서 docs/b1-reports/{도시} = 저장소 뿌리(cwd · 모든 CLI 가 시작할 때 뿌리로 이동) 기준 절대 경로 · 구글맵 읽기 로그(행마다 가장 나중 것) 읽기 1벌 · 필시티·엔진의 저장 관문과 읽는 쪽 전부가 이것만 쓴다 (정본 §18)
import fs from "fs";
import path from "path";

export const rawDirOf = (contextId: string | number): string =>
  path.resolve(process.cwd(), "docs", "raw", String(contextId).trim());

export const reportDirOf = (cityId: string | number): string =>
  path.resolve(process.cwd(), "docs", "b1-reports", String(cityId));

export const GMAPS_READ_RE = /_gmaps-page-read-\d+(_\d+)?\.json$/;

export function lastGoogleLogs(cityId: number, sinceMs = 0): Map<number, any> {
  const dir = rawDirOf(cityId);
  const out = new Map<number, any>();
  if (!fs.existsSync(dir)) return out;
  for (const f of fs
    .readdirSync(dir)
    .filter((f) => GMAPS_READ_RE.test(f))
    .sort()) {
    if (sinceMs && Date.parse(f.slice(0, 10)) < sinceMs) continue;
    const rows = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"))?.raw
      ?.rows;
    for (const r of rows ?? []) out.set(Number(r.id), r);
  }
  return out;
}
