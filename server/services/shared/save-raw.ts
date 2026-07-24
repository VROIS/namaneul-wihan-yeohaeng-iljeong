// ⚠️ 수정금지(승인필요) 2026-06-09 사용자 SSOT = 외부호출 raw 저장 단일 관문 (ts-client·geminiClient 가 응답 직후 호출).
//   = 모든 외부 클라이언트가 이 함수로 raw 저장 → 이후 사용/DB 입력 = 소 안 잃음, 맥락 무관.
//   = 강제는 각 관문(클라이언트)에 박음. best-effort(저장 실패가 유료 호출 결과를 깨지 않음).
// ⚠️ 수정금지(승인필요) 2026-06-15 사장님 SSOT = 외부호출 raw = 로컬 + Storage **2곳** 저장 (= 추후 재활용 + 비용 보호).
//   = 같은 파일규칙으로 양쪽 저장: 로컬 docs/raw/{cityId}/{YYYY-MM-DD}_{source}-{tag}.json + Storage raw-responses 동일 경로.
//   = 로컬 = 발굴 환경(쓰기 가능 FS)에서만 됨(배포 읽기전용 FS = 조용히 skip). Storage = 어디서든 HTTP PUT.
//   = 이미지(PM)는 별도 = Storage place-images {cityId}/{category}/{PID} 1곳만 (= 본 함수 아님).

import fs from "fs";
import path from "path";
// ⚠️ 수정금지(승인필요) 2026-06-16 = raw 버전순번 헬퍼 = 정적 top-level import (= CJS 번들 import.meta.url 깨짐 회피).
//   = sibling raw-filename.ts 는 save-raw 를 import 안 함(순환참조 없음) → 정적 import 안전 = esbuild 가 server_dist 번들에 포함 = 배포(CJS)에서도 동작.
//   = 옛 동적 import('raw-filename.ts') 폐기 = dist 에 .ts 없어 throw + import.meta.url 기준 = CJS 번들 깨짐.
import { rawHash, versionedName } from "./raw-filename";

const BUCKET = "raw-responses";

export interface SaveRawOpts {
  source: "ts" | "gemini" | "routes"; // routes = Google Routes API(일별 바로가기 선처리) = 2026-07-24 사장님 승인 추가

  contextId?: string | number | null; // cityId(발굴) 또는 'runtime'(동선·메인앱 등 cityId 없는 호출)
  tag?: string | null; // 호출 맥락 식별(파일명) — 미지정 시 'call'
  request: any; // 호출 입력 (= 비밀 제외, 재현용)
  raw: any; // 외부 응답 원본 (= 진짜 raw)
  // ⚠️ 수정금지(승인필요) 2026-06-19 사장님 SSOT = 건건 raw 로컬 skip(스토리지만) = 로컬 폴더 가독성·공간 낭비 방지.
  //   = 기본 false(기존대로 로컬+스토리지 2곳). true 시 로컬 쓰기만 건너뜀 = §18 원본보존은 스토리지가 담당.
  localSkip?: boolean;
}

export async function saveRaw(opts: SaveRawOpts): Promise<void> {
  try {
    const storageKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_KEY;
    const supaPublicUrl =
      process.env.SUPABASE_PUBLIC_URL ||
      "https://wxebceflvuythuodemro.supabase.co";
    if (!storageKey || !supaPublicUrl) return; // 키 없으면 조용히 skip (best-effort)

    const ctx =
      opts.contextId != null && String(opts.contextId).trim() !== ""
        ? String(opts.contextId)
        : "runtime";
    const tag =
      (opts.tag ?? "call")
        .toString()
        .replace(/[^0-9a-z]+/gi, "-")
        .slice(0, 48) || "call";
    // ⚠️ 수정금지(승인필요) 2026-06-15 사장님 SSOT = Storage(보존용) = 로컬 docs/raw(조회용)와 동일 형식 도일화.
    //   = 경로 = {cityId}/{YYYY-MM-DD}_{source}-{tag}.json (= 도시폴더 + 날짜앞 + 내용 = 로컬 {cityId}/{날짜}_{내용} 과 동형).
    //   = 시각(HH-mm-ss) 제거 = 같은 날 같은 호출(tag) = 같은 파일명 = x-upsert 덮어쓰기 = 중복 2번 저장 안 됨 (= 사장님 SSOT).
    //   = 추후 재활용·재입력 = 로컬·Storage 동일 키로 대조 가능. (옛 {source}/{ctx}/{tag}-{ISO} = 형식 불일치 + 시각마다 새 파일=중복.)
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (날짜 앞)
    const stemFileName = `${date}_${opts.source}-${tag}.json`; // ⚠️ 수정금지(승인필요) — raw 버전순번(2026-06-16 SSOT) = 무순번 기본 파일명(확장자 포함)
    let filePath = `${ctx}/${stemFileName}`;
    // ⚠️ 수정금지(승인필요) 2026-06-16 사장님 SSOT = raw 버전순번 판정 = 같은 stem(같은 날·같은 tag) 인데 외부응답 내용이 다르면 _N 순번 보존(손실 0),
    //   = 내용 완전동일(rawHash 같음) = 진짜 중복 = 같은 파일 덮어쓰기(=x-upsert) = 1개만. 무순번=첫 호출 / _N=이후.
    //   = authority = 로컬 docs/raw/{ctx} 디렉토리(= 발굴 환경 쓰기 가능 FS). dir 없으면(배포 읽기전용) = 판정 불가 = 무순번 현행 유지(폴백).
    //   = 해싱대상 = 외부응답 부분(opts.raw)만 (meta/savedAt 절대 제외 = raw-filename.ts:rawHash 규칙). best-effort try/catch = 판정 실패 시 무순번 폴백(회귀0).
    // ⚠️ 수정금지(승인필요) 2026-06-16 사장님 SSOT = 로컬 docs/raw 루트 = process.cwd() 기준(= CJS 번들 import.meta.url 깨짐 회피, throw 없음).
    //   = 발굴 환경(tsx) = cwd=레포루트 → docs/raw 정상(회귀0). 배포(server_dist CJS) = docs/raw 없음 → fs.existsSync=false → 버전판정 skip → 무순번 폴백(현행 의도).
    //   = 옛 fileURLToPath(import.meta.url) = esbuild CJS shim 시 throw/엉뚱경로(server_dist 기준) → 외부 try/catch 삼킴 → Storage PUT 도 못 감 = raw 손실(§18 위반). 제거.
    const localRawRoot = path.resolve(process.cwd(), "docs", "raw"); // cwd/docs/raw 절대경로 (= 버전판정·로컬쓰기 동일 기준 통일)
    try {
      const localDir = path.join(localRawRoot, ctx); // docs/raw/{ctx} 절대경로 (= 버전판정 디렉토리)
      if (fs.existsSync(localDir)) {
        const newHash: string = rawHash(opts.raw); // 외부응답 부분만 md5 (= meta 제외)
        const versioned: string = versionedName(
          localDir,
          stemFileName,
          newHash,
          (p: string) => {
            // 같은 stem 계열 중 내용동일=덮어쓰기 / 다름=_maxN+1
            try {
              return rawHash(JSON.parse(fs.readFileSync(p, "utf8")).raw);
            } catch {
              return null;
            } // 기존 파일의 raw 부분만 rawHash (= 못 열면 null)
          },
        );
        filePath = `${ctx}/${versioned}`; // 순번 판정 반영된 최종 경로 (= Storage·로컬 동일 키)
      }
    } catch {
      // 버전순번 판정 실패(헬퍼 로드/스캔 오류 등) = 무순번 현행 유지 = 회귀 0 (best-effort 폴백). PUT 은 이 try 밖이라 무관하게 항상 실행.
    }
    // ⚠️ 수정금지(승인필요) 2026-06-16 사장님 SSOT = pretty(들여쓰기 2) 저장 = 사람이 원본 눈으로 검수 가능 (= 이전 AI 표준, 한 줄 minified 폐기).
    const body = JSON.stringify(
      {
        savedAt: new Date().toISOString(),
        source: opts.source,
        contextId: ctx,
        request: opts.request,
        raw: opts.raw,
      },
      null,
      2,
    );

    // ⚠️ 2026-07-07 무성실패 제거(사장님 승인) = fetch 는 HTTP 4xx/5xx 예외 안 던짐 → response.ok 확인 강제(raw 증발 로그0 재발방지).
    const resp = await fetch(
      `${supaPublicUrl}/storage/v1/object/${BUCKET}/${filePath}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${storageKey}`,
          "Content-Type": "application/json",
          "x-upsert": "true",
        },
        body,
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!resp.ok) {
      const eb = await resp.text().catch(() => "");
      console.error(
        `[saveRaw] ❌ Storage PUT 실패 ${resp.status} = ${BUCKET}/${filePath} = ${eb.slice(0, 200)}`,
      );
    }

    // ⚠️ 수정금지(승인필요) 2026-06-15 사장님 SSOT = 로컬 2곳째 저장 (= Storage 와 동일 파일규칙 = 추후 재활용·비용보호).
    //   = docs/raw/{cityId}/{date}_{source}-{tag}.json (= filePath 와 동형). 배포 읽기전용 FS = 조용히 skip(best-effort).
    //   ⚠️ 2026-06-19 사장님 SSOT = localSkip=true(건건 TS) 시 로컬 생략 = 스토리지(위 PUT)만 보존 = 로컬 폴더 깔끔.
    if (!opts.localSkip)
      try {
        const localPath = path.join(localRawRoot, filePath); // ⚠️ 수정금지(승인필요) 2026-06-16 = 버전판정과 동일 localRawRoot 기준 (= cwd 비의존, 두 곳 기준 통일). filePath = `${ctx}/${date}_${source}-${tag}.json`
        fs.mkdirSync(path.dirname(localPath), { recursive: true });
        fs.writeFileSync(localPath, body);
      } catch {
        // 로컬 쓰기 실패(배포 읽기전용 FS 등) = Storage 는 이미 됨 = best-effort skip.
      }
  } catch {
    // best-effort: raw 저장 실패가 유료 외부호출 결과를 깨면 안 됨 (단일 관문이라 정상 시 항상 저장).
  }
}
