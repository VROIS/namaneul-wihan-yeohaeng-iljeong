// ⚠️ 수정금지(승인필요) 2026-08-06 사장님 SSOT = 발굴형 raw(모음/parsedPlaces) 저장 단일 헬퍼 (= §18 로컬+R2 2곳. 원격지 = 옛 Supabase Storage → R2 대체 = Cloudflare 이전계획 1단계 §19).
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

export async function saveCollectedRaw(
  opts: SaveCollectedRawOpts,
): Promise<void> {
  try {
    if (!opts.cityId) return; // 도시 미확정 = 저장 skip(runtime 재발 방지 = 사장님 SSOT)

    const stem = rawName(opts.stepNum, opts.stepName, opts.content, opts.date); // {date}_{NN-step}_{content}.json
    const newHash = rawHash((opts.body as any)?.[opts.hashKey] ?? {}); // 판정 기준 필드만 해싱(§18 버전순번)
    const ctx = String(opts.cityId);

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
    } catch {}
    const filePath = `${ctx}/${fileName}`;
    const text = JSON.stringify(opts.body, null, 2); // pretty(사장님 눈 검수)

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
    try {
      const localPath = path.join(localRawRoot, filePath);
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      fs.writeFileSync(localPath, text);
    } catch {}
  } catch {}
}
