// ⚠️ 수정금지(승인필요) 2026-09-28 사장님 결정 = 외부호출 raw = 로컬 docs/raw/{맥락} + R2 {도시}/raw 2곳 저장 (정본 K3)

import fs from "fs";
import path from "path";
// ⚠️ 수정금지(승인필요) 2026-06-16 = raw 버전순번 헬퍼 = 정적 top-level import (= CJS 번들 import.meta.url 깨짐 회피).
import { rawHash, versionedNameR2 } from "./raw-filename";
import { uploadToR2, isR2Configured } from "./r2-client";
import { fileStamp, rawPlace } from "../../../../shared/r2-paths";

export interface SaveRawOpts {
  // ⚠️ 수정금지(승인필요) 2026-09-08 사장님 승인 = gmaps 추가 = 구글맵 공개페이지로 받은 6요소+cid+사진(TS 자리를 대신하는 형제). 도시별 1파일 = 나중에 한 방에 재입력·조회·근거.
  source: "ts" | "gemini" | "routes" | "gmaps"; // routes = Google Routes API(일별 바로가기 선처리) = 2026-07-24 사장님 승인 추가

  contextId?: string | number | null; // 도시 번호 · itinerary-{번호} · user-{번호} (shared/r2-paths rawPlace)
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
    // ⚠️ 수정금지(승인필요) 2026-09-28 사장님 결정 = R2·로컬 같은 이름, 이름 맨 앞 = 시각 초까지, 같은 초·같은 이름이면 내용 다를 때만 _N (정본 K3)
    const place = rawPlace(ctx);
    const stemFileName = `${fileStamp()}_${opts.source}-${tag}${place.suffix}.json`;
    let fileName = stemFileName;
    // ⚠️ 수정금지(승인필요) 2026-06-16 사장님 SSOT = 로컬 docs/raw 루트 = process.cwd() 기준(= CJS 번들 import.meta.url 깨짐 회피, throw 없음).
    //   = 옛 fileURLToPath(import.meta.url) = esbuild CJS shim 시 throw/엉뚱경로(server_dist 기준) → 외부 try/catch 삼킴 → Storage PUT 도 못 감 = raw 손실(§18 위반). 제거.
    const localRawRoot = path.resolve(process.cwd(), "docs", "raw"); // cwd/docs/raw 절대경로 (= 버전판정·로컬쓰기 동일 기준 통일)
    // ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = 순번 판정 기준 = 로컬 폴더가 아니라 R2 에 있는 같은 stem 파일 (Worker 는 디스크 없음) (정본 §)
    try {
      fileName = await versionedNameR2(
        place.dir,
        stemFileName,
        rawHash(opts.raw),
        (body: string) => {
          try {
            return rawHash(JSON.parse(body).raw);
          } catch {
            return null;
          }
        },
      );
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
        `${place.dir}/${fileName}`,
        Buffer.from(body, "utf8"),
        "application/json",
      );
    } catch (e: any) {
      console.error(
        `[saveRaw] ❌ R2 PUT 실패 = ${place.dir}/${fileName} = ${String(e?.message || e).slice(0, 200)}`,
      );
    }

    //   ⚠️ 2026-06-19 사장님 SSOT = localSkip=true(건건 TS) 시 로컬 생략 = 스토리지(위 PUT)만 보존 = 로컬 폴더 깔끔.
    if (!opts.localSkip)
      try {
        const localPath = path.join(localRawRoot, ctx, fileName); // ⚠️ 수정금지(승인필요) 2026-06-16 = 버전판정과 동일 localRawRoot 기준 (= cwd 비의존, 두 곳 기준 통일).
        fs.mkdirSync(path.dirname(localPath), { recursive: true });
        fs.writeFileSync(localPath, body);
      } catch {}
  } catch {}
}
