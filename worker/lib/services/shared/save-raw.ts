// ⚠️ 수정금지(승인필요) 2026-09-28 사장님 결정 = 외부호출 raw = 로컬 docs/raw/{맥락} + R2 {도시}/raw 2곳 저장 (정본 K3)

import fs from "fs";
import path from "path";
import { rawDirOf } from "./local-paths";
// ⚠️ 수정금지(승인필요) 2026-06-16 = raw 버전순번 헬퍼 = 정적 top-level import (= CJS 번들 import.meta.url 깨짐 회피).
import { rawHash, versionedNameR2 } from "./raw-filename";
import { uploadToR2, isR2Configured } from "./r2-client";
import { fileStamp, rawPlace } from "../../../../shared/r2-paths";

export interface SaveRawOpts {
  // ⚠️ 수정금지(승인필요) 2026-10-29 사장님 결정 = 원본 출처 = TS · 제미니 · 구글 Routes · 구글맵 페이지 · 판단 AI Clef (정본 Clef)
  source: "ts" | "gemini" | "routes" | "gmaps" | "clef";

  contextId?: string | number | null; // 도시 번호 · itinerary-{번호} · user-{번호} (shared/r2-paths rawPlace)
  tag?: string | null; // 호출 맥락 식별(파일명) — 미지정 시 'call'
  request: any; // 호출 입력 (= 비밀 제외, 재현용)
  raw: any; // 외부 응답 원본 (= 진짜 raw)
  // ⚠️ 수정금지(승인필요) 2026-06-19 사장님 SSOT = 건건 raw 로컬 skip(스토리지만) = 로컬 폴더 가독성·공간 낭비 방지.
  localSkip?: boolean;
}

export async function saveRaw(opts: SaveRawOpts): Promise<string | null> {
  try {
    if (!isR2Configured()) return null; // R2 설정 없으면 조용히 skip (best-effort, 옛 Supabase 키 검사 대체 2026-08-06)

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
    // ⚠️ 수정금지(승인필요) 2026-10-23 사장님 결정 = 로컬 원본 자리 = process.cwd() 기준 rawDirOf 1벌(CJS 번들 import.meta.url 깨짐 회피, throw 없음) (정본 §18)
    const localDir = rawDirOf(ctx);
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

    let stored = true;
    // ⚠️ 2026-07-07 무성실패 제거(사장님 승인) 원칙 유지 = R2 업로드 실패도 반드시 로그(raw 증발 로그0 재발방지). S3 SDK 는 실패 시 throw.
    try {
      await uploadToR2(
        `${place.dir}/${fileName}`,
        Buffer.from(body, "utf8"),
        "application/json",
      );
    } catch (e: any) {
      stored = false;
      console.error(
        `[saveRaw] ❌ R2 PUT 실패 = ${place.dir}/${fileName} = ${String(e?.message || e).slice(0, 200)}`,
      );
    }

    //   ⚠️ 2026-06-19 사장님 SSOT = localSkip=true(건건 TS) 시 로컬 생략 = 스토리지(위 PUT)만 보존 = 로컬 폴더 깔끔.
    if (!opts.localSkip)
      try {
        const localPath = path.join(localDir, fileName); // ⚠️ 수정금지(승인필요) 2026-10-23 = 로컬 자리 = rawDirOf 1벌 (정본 §18).
        fs.mkdirSync(path.dirname(localPath), { recursive: true });
        fs.writeFileSync(localPath, body);
      } catch {}
    return stored ? `${place.dir}/${fileName}` : null;
  } catch {
    return null;
  }
}
