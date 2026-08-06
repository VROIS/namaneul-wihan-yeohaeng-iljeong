// ⚠️ 수정금지(승인필요) 2026-08-06 사장님 SSOT = 발굴형 raw(모음/parsedPlaces) 저장 단일 헬퍼 (= §18 로컬+R2 2곳. 원격지 = 옛 Supabase Storage → R2 대체 = Cloudflare 이전계획 1단계 §19).
//   = #45(repair.ts:259-271)·02-enrich(enrich-paris.ts) 가 만드는 "사람 검수용 형식"({meta, rawResponse, parsedPlaces} / {meta, results[]})을
//     런타임(MIX 여정생성)에서도 도시id 폴더에 동일 저장하기 위한 관문. save-raw.ts(봉투형식 건건)와 별개 = 형식이 다름.
//   = save-raw.ts 의 R2 업로드 + 로컬 write 로직과 동형(§16 재발명0). 파일명 = raw-filename.ts(rawName/versionedName/rawHash) 재사용.
//   = 배포서버(읽기전용 FS)에서도 raw 안 증발 = R2 업로드 필수(로컬 write 는 best-effort). = 사장님 "300 도시 자동" 정합.
import fs from "fs";
import path from "path";
import { rawName, versionedName, rawHash } from "./raw-filename";
import { uploadToR2, isR2Configured } from "./r2-client";

const PREFIX = "raw-responses"; // R2 프리픽스 (옛 Supabase 버킷명과 동일 = 로컬·원격 키 대조 불변)

export interface SaveCollectedRawOpts {
  cityId: number; // = 도시 폴더(raw-responses/{cityId}/ + docs/raw/{cityId}/)
  stepNum: number; // = rawName NN (예: Gemini MIX=90, TS 모음=6)
  stepName: string; // = 'mix-gemini' / 'ts-pm-enrich'
  content?: string; // = 'step1' / 'candidates'
  body: any; // = 저장 본문 = {meta, rawResponse, parsedPlaces} 또는 {meta, results[]}
  hashKey: "rawResponse" | "results"; // = 버전순번 판정 기준 필드(내용동일=덮어쓰기 / 다르면 _N)
  date?: string; // = 미지정 = 오늘(UTC)
}

// = 도시id 폴더 + 사장님 예시 형식으로 로컬+Storage 2곳 저장. best-effort(저장 실패가 유료호출 결과를 안 깸).
export async function saveCollectedRaw(
  opts: SaveCollectedRawOpts,
): Promise<void> {
  try {
    if (!opts.cityId) return; // 도시 미확정 = 저장 skip(runtime 재발 방지 = 사장님 SSOT)

    const stem = rawName(opts.stepNum, opts.stepName, opts.content, opts.date); // {date}_{NN-step}_{content}.json
    const newHash = rawHash((opts.body as any)?.[opts.hashKey] ?? {}); // 판정 기준 필드만 해싱(§18 버전순번)
    const ctx = String(opts.cityId);

    // 파일명 버전순번 = 로컬 docs/raw/{cityId} 기준(발굴 환경 쓰기 가능 FS). 없으면(배포) 무순번 폴백.
    const localRawRoot = path.resolve(process.cwd(), "docs", "raw");
    const localDir = path.join(localRawRoot, ctx);
    let fileName = stem;
    try {
      if (fs.existsSync(localDir)) {
        fileName = versionedName(localDir, stem, newHash, (p: string) => {
          try {
            return rawHash(
              JSON.parse(fs.readFileSync(p, "utf8"))?.[opts.hashKey],
            );
          } catch {
            return null;
          }
        });
      }
    } catch {
      /* 버전판정 실패 = 무순번 폴백(회귀0) */
    }
    const filePath = `${ctx}/${fileName}`;
    const text = JSON.stringify(opts.body, null, 2); // pretty(사장님 눈 검수)

    // ① R2 업로드 (= 배포서버에서도 안 증발 = 필수). save-raw.ts 와 동형(r2-client 단일 진입점).
    // ⚠️ 2026-07-07 무성실패 제거 원칙 유지 = 실패 시 반드시 로그(raw 증발 로그0 재발방지). S3 SDK 는 실패 시 throw.
    if (isR2Configured()) {
      try {
        await uploadToR2(
          `${PREFIX}/${filePath}`,
          Buffer.from(text, "utf8"),
          "application/json",
        );
      } catch (e: any) {
        console.error(
          `[saveCollectedRaw] ❌ R2 PUT 실패 = ${PREFIX}/${filePath} = ${String(e?.message || e).slice(0, 200)}`,
        );
      }
    }
    // ② 로컬 write (= 조회용. 배포 읽기전용 FS = 조용히 skip). save-raw.ts:84-90 복붙.
    try {
      const localPath = path.join(localRawRoot, filePath);
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      fs.writeFileSync(localPath, text);
    } catch {
      /* 배포 읽기전용 FS 등 = Storage 는 이미 됨 = best-effort */
    }
  } catch {
    /* best-effort: raw 저장 실패가 유료 외부호출 결과를 깨면 안 됨 */
  }
}
