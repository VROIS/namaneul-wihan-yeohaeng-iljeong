// ⚠️ 수정금지(승인필요) 2026-09-28 사장님 결정 = §18 외부호출 raw 저장의 Worker 판 = R2 네이티브 바인딩 1벌, 자리 = shared/r2-paths rawPlace (정본 K3)

import { createHash } from "node:crypto";
import { fileStamp, rawPlace } from "../shared/r2-paths";

interface SaveRawToR2Params {
  source: "ts" | "gemini" | "routes";
  contextId?: string | number | null;
  tag?: string | null;
  request: unknown;
  raw: unknown;
}

function rawHash(rawPart: unknown): string {
  return createHash("md5")
    .update(JSON.stringify(rawPart ?? {}))
    .digest("hex");
}

const RAW_NAME_RE = /^(.*?)(?:_(\d+))?\.json$/;
function parseRawName(name: string): { base: string; n: number } | null {
  const m = name.match(RAW_NAME_RE);
  if (!m) return null;
  return { base: m[1], n: m[2] != null ? parseInt(m[2], 10) : 0 };
}

/** §18 raw 를 R2 에 저장한다. 원본 saveRaw() 와 키·내용·순번 규칙이 동일하다. */
export async function saveRawToR2(
  bucket: R2Bucket,
  params: SaveRawToR2Params,
): Promise<void> {
  try {
    const ctx =
      params.contextId != null && String(params.contextId).trim() !== ""
        ? String(params.contextId)
        : "runtime";

    const tag =
      (params.tag ?? "call")
        .toString()
        .replace(/[^0-9a-z]+/gi, "-")
        .slice(0, 48) || "call";

    const place = rawPlace(ctx);
    const stemFileName = `${fileStamp()}_${params.source}-${tag}${place.suffix}.json`;

    let fileName = stemFileName;

    // ⚠️ 수정금지(승인필요) 2026-09-28 사장님 결정 = R2 로 판정하되 같은 이름 앞부분(base)까지만 훑는다(raw-filename.ts versionedNameR2 와 같음) (정본 K3)
    try {
      const prefix = `${place.dir}/`;
      const newHash = rawHash(params.raw);
      const base = stemFileName.replace(/\.json$/, "");

      const siblings: string[] = [];
      let cursor: string | undefined = undefined;
      for (;;) {
        const listed: R2Objects = await bucket.list({
          prefix: `${prefix}${base}`,
          cursor,
        });
        for (const o of listed.objects)
          siblings.push(o.key.slice(prefix.length));
        if (!listed.truncated) break;
        cursor = listed.cursor;
      }

      let maxN = -1;
      let matchedName: string | null = null;
      for (const name of siblings) {
        const p = parseRawName(name);
        if (!p || p.base !== base) continue;
        let h: string | null = null;
        try {
          const obj = await bucket.get(`${prefix}${name}`);
          if (obj) {
            const parsed = await obj.json<{ raw?: unknown }>();
            h = rawHash(parsed?.raw);
          }
        } catch {
          h = null; // 못 열면 null (= save-raw.ts 의 catch → null 과 동치)
        }
        if (h !== null && h === newHash) {
          matchedName = name;
          break;
        }
        if (p.n > maxN) maxN = p.n;
      }

      fileName =
        matchedName ?? (maxN < 0 ? `${base}.json` : `${base}_${maxN + 1}.json`);
    } catch {}

    //   §18 "minified(한 줄) 저장" 금지 = 사장님 눈 검수 가능해야 함.
    const body = JSON.stringify(
      {
        savedAt: new Date().toISOString(),
        source: params.source,
        contextId: ctx,
        request: params.request,
        raw: params.raw,
      },
      null,
      2,
    );

    try {
      await bucket.put(`${place.dir}/${fileName}`, body, {
        httpMetadata: { contentType: "application/json" },
      });
    } catch (e) {
      console.error(
        `[saveRawToR2] ❌ R2 PUT 실패 = ${place.dir}/${fileName} = ${String(
          (e as { message?: string })?.message || e,
        ).slice(0, 200)}`,
      );
    }
  } catch {}
}
