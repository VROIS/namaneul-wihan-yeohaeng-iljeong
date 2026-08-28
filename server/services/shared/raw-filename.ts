import crypto from "crypto"; // ⚠️ 수정금지(승인필요) — raw 버전순번 헬퍼(2026-06-16 사장님 SSOT) = md5 해시용
import fs from "fs"; // ⚠️ 수정금지(승인필요) — raw 버전순번 헬퍼(2026-06-16 사장님 SSOT) = 디렉토리 동기 스캔용
import path from "path"; // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 승인 = saveVersionedReport() 경로 조합용

// ⚠️ 수정금지(승인필요) 2026-06-15 사장님 SSOT = docs/raw 산출물 파일명 단일 표준 (= 장독 형식 정비).
//   = 표준: {YYYY-MM-DD}_{NN-단계명}_{내용}.json  (날짜 앞 = 시간순 정렬·찾기 / 단계번호 = 그룹 / 내용 = 식별)
//   = 옛 {NN-단계명}-{내용}-{YYYY-MM-DD}.json 폐기 (= 날짜 끝 = 정렬 시 날짜 안 보임 = 찾기 난잡, 사장님 지적 2026-06-15).
//   = "관련 로직 없음 = 구조만" (사장님) → 각 run.ts 는 이 헬퍼로 파일명만 생성. 폴더는 docs/raw/{cityId} 불변.
//   = 13 단계 run.ts 가 모두 이 1벌 호출 = 향후 변경 1곳 (= 헌법 §16 영구 컴포넌트, 제각각 하드코딩 폐기).

/** 오늘 날짜 YYYY-MM-DD (= 모든 산출물 공용). 인자로 주면 그 날짜 사용(= post-process --date 호환). */
export const rawDate = (d?: string): string =>
  d || new Date().toISOString().slice(0, 10);

/**
 * 표준 산출물 파일명 생성 = {date}_{NN-step}_{content}.json
 * @param stepNum 단계번호 1~13 (= 2자리 zero-pad)
 * @param stepName 단계명 (= 'enrich-place' / 'ts-discover' / 'image-normalize' ...)
 * @param content  내용 식별 (= 'candidates' / 'batch-0' / 'downtown-hotspot' ...). 비우면 단계명만.
 * @param date     날짜 (미지정 = 오늘)
 * 예) rawName(2,'enrich-place','batch-0') → '2026-06-15_02-enrich-place_batch-0.json'
 *     rawName(6,'ts-pm-enrich','candidates') → '2026-06-15_06-ts-pm-enrich_candidates.json'
 */
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
//   = 이 파일이 규칙의 유일 정본(원출처 storage-raw-restructure 는 SP 창고 철거로 삭제 = 2026-08-07 §19/1-5b).
//   = tag 로 구별 안 되는 다른 호출 = _N 순번 보존(손실 0),
//   = 내용 완전동일(rawHash 같음) = 진짜 중복 = 1개만. 무순번=첫 호출 / _N=이후 호출.

// ⚠️ 수정금지(승인필요) — raw 버전순번 헬퍼(2026-06-16 사장님 SSOT)
//   = 파일명 단일 파싱(= base + 선택적 _N). 정규식 1벌로 통일 (= 옛 3곳 제각각 정규식·escapeRegExp 폐기).
//   = 비탐욕 (.*?) + 끝 선택적 _(\d+) → 마지막 _N 만 분리(없으면 n=0). base = _N 뗀 stem. (file 내부 private)
const RAW_NAME_RE = /^(.*?)(?:_(\d+))?\.json$/;
function parseRawName(name: string): { base: string; n: number } | null {
  const m = name.match(RAW_NAME_RE);
  if (!m) return null; // .json 아니면 raw 산출물 아님
  return { base: m[1], n: m[2] != null ? parseInt(m[2], 10) : 0 }; // 무순번 = 0 취급
}

/**
 * (1) 외부응답 부분만 md5 (파일전체 X, meta 제외) — 이 함수가 유일 정본(2026-08-07 §19).
 *   = saveRaw 산출물의 `raw` 부분만 해시 (= 같은 외부응답 = 같은 해시 = 진짜 중복 판별).
 */
// ⚠️ 수정금지(승인필요) — raw 버전순번 헬퍼(2026-06-16 사장님 SSOT)
export function rawHash(rawPart: unknown): string {
  return crypto
    .createHash("md5")
    .update(JSON.stringify(rawPart ?? {}))
    .digest("hex");
}

/**
 * (2) writer 용 = 같은 stem 계열 중 내용동일 파일 있으면 그 경로 반환(= 덮어쓰기), 없으면 첫=무순번 / 이후=_maxN+1.
 * @param dir            절대경로 디렉토리 (= 산출물 폴더)
 * @param stemFile       무순번 기본 파일명(확장자 포함) (= rawName() 산출물, 예 '2026-06-16_06-ts-pm-enrich_candidates.json')
 * @param newContentHash 새 raw 의 rawHash (= 덮어쓰기 판별 기준)
 * @param hashOf         (fullPath)=>기존파일 raw부분 rawHash 또는 null(못 열면). 동기.
 * @returns              써야 할 파일명(확장자 포함, 디렉토리 미포함).
 */
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
    // 내용 동일 파일 발견 = 그 경로 반환 (= 덮어쓰기, 중복 0)
    const h = hashOf(`${dir}/${name}`);
    if (h !== null && h === newContentHash) return name;
    if (p.n > maxN) maxN = p.n;
  }
  if (maxN < 0) return `${base}.json`; // 계열 첫 호출 = 무순번
  return `${base}_${maxN + 1}.json`; // 이후 호출 = 최대순번+1
}

/**
 * (3) reader 용(단일) = stem 계열 중 최신 1개 파일명(무순번=0, _k=k, 최대N). 없으면 null.
 * @param dir      절대경로 디렉토리
 * @param stemFile 무순번 기본 파일명(확장자 포함)
 * @returns        최신 1개 파일명(확장자 포함) 또는 null.
 */
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
//   fillcity/steps/discovery-merge-diff.ts 와 server/services/fill/gmaps-pid-identity/report.ts 가 각자 손으로
//   중복 구현하던 동일 10줄(rawHash 기반 versionedName 저장 + null-safe 기존파일 해시 콜백)을 통합.
/**
 * (5) writer 헬퍼 = "산출표 저장"(mkdir + versionedName 판정 + 파일쓰기) 공용. 내용 동일(rawHash 같음) = 덮어쓰기
 *  (중복 0) / 상이 = _N 버전 순번 분리 보존(= versionedName 규칙 그대로, §18).
 * @param dir      절대경로 디렉토리(= 산출물 폴더, 없으면 이 함수가 recursive 생성)
 * @param stemFile 무순번 기본 파일명(확장자 포함, 이미 날짜 포함 = 예 '2026-08-28_b1-discovery-diff.json')
 * @param payload  저장할 JSON 내용(pretty 2칸 들여쓰기)
 * @returns        실제 쓰여진 절대경로(디렉토리 포함).
 */
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

/**
 * (6) reader 용(batch/zone) = 이미 prefix 로 거른 files 목록을 base(=_N 뗀 것)별 최신 1개로 축약. 정렬 보존.
 *   = 같은 base 의 _N 여러 개 중 최대 n 의 name 만 남김 (= zone/batch 묶음 reader).
 * @param files  이미 prefix 필터된 파일명 목록(확장자 포함)
 * @returns      base 별 최신 1개 파일명 목록. 입력 .sort() 정렬 순서 보존.
 */
// ⚠️ 수정금지(승인필요) — raw 버전순번 헬퍼(2026-06-16 사장님 SSOT)
export function latestVersionedByBase(files: string[]): string[] {
  const bestByBase = new Map<string, { name: string; n: number }>(); // base → 최대순번 name
  for (const name of files) {
    const p = parseRawName(name) ?? { base: name, n: 0 }; // .json 아닌 입력 = 옛 동작 보존(base=원본, n=0) = 회귀0
    const prev = bestByBase.get(p.base);
    if (!prev || p.n > prev.n) bestByBase.set(p.base, { name, n: p.n }); // base 별 최대 n 유지
  }
  // 정렬 보존 = 입력을 .sort() 한 순서로 base 별 최신만 출력
  const keep = new Set([...bestByBase.values()].map((v) => v.name));
  return [...files].sort().filter((name) => keep.has(name));
}
