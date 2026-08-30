// ⚠️ 수정금지(승인필요) 2026-06-09 사용자 SSOT = 외부호출 raw 저장 단일 관문 (ts-client·geminiClient 가 응답 직후 호출).
// ⚠️ 수정금지(승인필요) 2026-08-06 사장님 SSOT = 외부호출 raw = 로컬 + R2 **2곳** 저장 (= §18 2곳 동형 유지. 원격지 = 옛 Supabase Storage → R2 raw-responses/ 프리픽스 대체 = Cloudflare 이전계획 1단계 §19).

import fs from "fs";
import path from "path";
// ⚠️ 수정금지(승인필요) 2026-06-16 = raw 버전순번 헬퍼 = 정적 top-level import (= CJS 번들 import.meta.url 깨짐 회피).
import { rawHash, versionedName } from "./raw-filename";
import { uploadToR2, isR2Configured } from "./r2-client";

const PREFIX = "raw-responses"; // R2 프리픽스 (옛 Supabase 버킷명과 동일 = 로컬·원격 키 대조 불변)

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
    if (!isR2Configured()) return; // R2 설정 없으면 조용히 skip (best-effort, 옛 Supabase 키 검사 대체 2026-08-06)

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
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (날짜 앞)
    const stemFileName = `${date}_${opts.source}-${tag}.json`; // ⚠️ 수정금지(승인필요) — raw 버전순번(2026-06-16 SSOT) = 무순번 기본 파일명(확장자 포함)
    let filePath = `${ctx}/${stemFileName}`;
    // ⚠️ 수정금지(승인필요) 2026-06-16 사장님 SSOT = raw 버전순번 판정 = 같은 stem(같은 날·같은 tag) 인데 외부응답 내용이 다르면 _N 순번 보존(손실 0),
    // ⚠️ 수정금지(승인필요) 2026-06-16 사장님 SSOT = 로컬 docs/raw 루트 = process.cwd() 기준(= CJS 번들 import.meta.url 깨짐 회피, throw 없음).
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
            try {
              return rawHash(JSON.parse(fs.readFileSync(p, "utf8")).raw);
            } catch {
              return null;
            } // 기존 파일의 raw 부분만 rawHash (= 못 열면 null)
          },
        );
        filePath = `${ctx}/${versioned}`; // 순번 판정 반영된 최종 경로 (= Storage·로컬 동일 키)
      }
    } catch {}
    // ⚠️ 수정금지(승인필요) 2026-08-30 재확인(원결정 2026-06-16) = pretty(들여쓰기 2) 저장, 사람이 원본 눈으로 검수 가능
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

    // ⚠️ 2026-07-07 무성실패 제거(사장님 승인) 원칙 유지 = R2 업로드 실패도 반드시 로그(raw 증발 로그0 재발방지). S3 SDK 는 실패 시 throw.
    try {
      await uploadToR2(
        `${PREFIX}/${filePath}`,
        Buffer.from(body, "utf8"),
        "application/json",
      );
    } catch (e: any) {
      console.error(
        `[saveRaw] ❌ R2 PUT 실패 = ${PREFIX}/${filePath} = ${String(e?.message || e).slice(0, 200)}`,
      );
    }

    // ⚠️ 수정금지(승인필요) 2026-06-15 사장님 SSOT = 로컬 2곳째 저장 (= Storage 와 동일 파일규칙 = 추후 재활용·비용보호).
    //   ⚠️ 2026-06-19 사장님 SSOT = localSkip=true(건건 TS) 시 로컬 생략 = 스토리지(위 PUT)만 보존 = 로컬 폴더 깔끔.
    if (!opts.localSkip)
      try {
        const localPath = path.join(localRawRoot, filePath); // ⚠️ 수정금지(승인필요) 2026-06-16 = 버전판정과 동일 localRawRoot 기준 (= cwd 비의존, 두 곳 기준 통일). filePath = `${ctx}/${date}_${source}-${tag}.json`
        fs.mkdirSync(path.dirname(localPath), { recursive: true });
        fs.writeFileSync(localPath, body);
      } catch {}
  } catch {}
}
