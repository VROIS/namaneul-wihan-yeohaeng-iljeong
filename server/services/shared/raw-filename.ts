import crypto from "crypto"; // ⚠️ 수정금지(승인필요) — raw 버전순번 헬퍼(2026-06-16 사장님 SSOT) = md5 해시용
import fs from "fs"; // ⚠️ 수정금지(승인필요) — raw 버전순번 헬퍼(2026-06-16 사장님 SSOT) = 디렉토리 동기 스캔용
import path from "path"; // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 승인 = saveVersionedReport() 경로 조합용

// ⚠️ 수정금지(승인필요) 2026-06-15 사장님 SSOT = docs/raw 산출물 파일명 단일 표준 (= 장독 형식 정비).
//   = 옛 {NN-단계명}-{내용}-{YYYY-MM-DD}.json 폐기 (= 날짜 끝 = 정렬 시 날짜 안 보임 = 찾기 난잡, 사장님 지적 2026-06-15).

export const rawDate = (d?: string): string =>
  d || new Date().toISOString().slice(0, 10);

export function rawName(
  stepNum: number,
  stepName: string,
  content?: string,
  date?: string,
): string {
  const nn = String(stepNum).padStart(2, "0");
  const tail = content && content.trim() ? `_${content.trim()}` : "";
  return `${rawDate(date)}_${nn}-${stepName}${tail}.json`;
}

// ⚠️ 수정금지(승인필요) — raw 버전순번 헬퍼(2026-06-16 사장님 SSOT)

// ⚠️ 수정금지(승인필요) — raw 버전순번 헬퍼(2026-06-16 사장님 SSOT)
const RAW_NAME_RE = /^(.*?)(?:_(\d+))?\.json$/;
function parseRawName(name: string): { base: string; n: number } | null {
  const m = name.match(RAW_NAME_RE);
  if (!m) return null; // .json 아니면 raw 산출물 아님
  return { base: m[1], n: m[2] != null ? parseInt(m[2], 10) : 0 }; // 무순번 = 0 취급
}

// ⚠️ 수정금지(승인필요) — raw 버전순번 헬퍼(2026-06-16 사장님 SSOT)
export function rawHash(rawPart: unknown): string {
  return crypto
    .createHash("md5")
    .update(JSON.stringify(rawPart ?? {}))
    .digest("hex");
}

// ⚠️ 수정금지(승인필요) — raw 버전순번 헬퍼(2026-06-16 사장님 SSOT)
export function versionedName(
  dir: string,
  stemFile: string,
  newContentHash: string,
  hashOf: (p: string) => string | null,
): string {
  const base = stemFile.replace(/\.json$/, ""); // 무순번 기본명 (확장자 제거)
  let siblings: string[] = [];
  try {
    siblings = fs.readdirSync(dir);
  } catch {
    siblings = [];
  } // 폴더 없으면 첫 호출 취급

  let maxN = -1; // -1 = 계열 파일 없음 (= 무순번도 없음)
  for (const name of siblings) {
    const p = parseRawName(name);
    if (!p || p.base !== base) continue; // 같은 stem 계열(_N 뗀 base 일치)만 (= 옛 base 정규식 동치)
    const h = hashOf(`${dir}/${name}`);
    if (h !== null && h === newContentHash) return name;
    if (p.n > maxN) maxN = p.n;
  }
  if (maxN < 0) return `${base}.json`; // 계열 첫 호출 = 무순번
  return `${base}_${maxN + 1}.json`; // 이후 호출 = 최대순번+1
}

// ⚠️ 수정금지(승인필요) — raw 버전순번 헬퍼(2026-06-16 사장님 SSOT)
export function latestVersioned(dir: string, stemFile: string): string | null {
  const base = stemFile.replace(/\.json$/, "");
  let siblings: string[] = [];
  try {
    siblings = fs.readdirSync(dir);
  } catch {
    return null;
  }

  let best: string | null = null,
    bestN = -1;
  for (const name of siblings) {
    const p = parseRawName(name);
    if (!p || p.base !== base) continue; // 같은 stem 계열만 (= 옛 base 정규식 동치)
    if (p.n > bestN) {
      bestN = p.n;
      best = name;
    }
  }
  return best;
}

// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 승인 = 산출표 저장 절차(mkdir + versionedName + 파일쓰기) 1벌(§16 SSOT) =
/** (중복 0) / 상이 = _N 버전 순번 분리 보존(= versionedName 규칙 그대로, §18). */
export function saveVersionedReport(
  dir: string,
  stemFile: string,
  payload: unknown,
): string {
  fs.mkdirSync(dir, { recursive: true });
  const finalName = versionedName(dir, stemFile, rawHash(payload), (p) => {
    try {
      return rawHash(JSON.parse(fs.readFileSync(p, "utf-8")));
    } catch {
      return null;
    }
  });
  const outPath = path.join(dir, finalName);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf-8");
  return outPath;
}

// ⚠️ 수정금지(승인필요) — raw 버전순번 헬퍼(2026-06-16 사장님 SSOT)
export function latestVersionedByBase(files: string[]): string[] {
  const bestByBase = new Map<string, { name: string; n: number }>(); // base → 최대순번 name
  for (const name of files) {
    const p = parseRawName(name) ?? { base: name, n: 0 }; // .json 아닌 입력 = 옛 동작 보존(base=원본, n=0) = 회귀0
    const prev = bestByBase.get(p.base);
    if (!prev || p.n > prev.n) bestByBase.set(p.base, { name, n: p.n }); // base 별 최대 n 유지
  }
  const keep = new Set([...bestByBase.values()].map((v) => v.name));
  return [...files].sort().filter((name) => keep.has(name));
}
