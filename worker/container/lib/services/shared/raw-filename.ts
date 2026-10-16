import crypto from "crypto"; // ⚠️ 수정금지(승인필요) — raw 버전순번 헬퍼(2026-06-16 사장님 SSOT) = md5 해시용
import fs from "fs"; // ⚠️ 수정금지(승인필요) — raw 버전순번 헬퍼(2026-06-16 사장님 SSOT) = 디렉토리 동기 스캔용

// ⚠️ 수정금지(승인필요) 2026-09-28 사장님 결정 = 컨테이너 사본 = 컨테이너가 쓰는 순번 판정(rawHash·versionedName)만 둔다, 이름 규칙은 shared/r2-paths (정본 K3)
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
