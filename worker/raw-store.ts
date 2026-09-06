// ⚠️ 수정금지(승인필요) 2026-09-06 사장님 결정 = §18 외부호출 raw 저장의 Worker 판 = R2 네이티브 바인딩 1벌 (정본 §18)

// 원본 = server/services/shared/save-raw.ts (+ raw-filename.ts 의 rawHash·versionedName).
// 그 파일이 잠근 것 = ① 키 규칙 `{PREFIX}/{ctx}/{YYYY-MM-DD}_{source}-{tag}.json`
//                    ② JSON 구조 savedAt·source·contextId·request·raw
//                    ③ pretty 들여쓰기 2 (§18 금지1 = minified 저장 금지)
//                    ④ 같은 날·같은 tag 재호출 = 내용 같으면 덮어쓰기 / 다르면 _N 순번 보존
// 이 파일은 위 4가지를 Worker 런타임(파일시스템 없음)에서 그대로 재현한다.

import { createHash } from "node:crypto";

// 근거: 원본 save-raw.ts:10 `const PREFIX = "raw-responses"` = 서버와 같은 프리픽스여야 같은 창고에서 대조된다.
const PREFIX = "raw-responses";

export interface SaveRawToR2Params {
  // 근거: 원본 save-raw.ts:13 SaveRawOpts.source = "ts" | "gemini" | "routes"
  source: "ts" | "gemini" | "routes";
  // 근거: 원본 save-raw.ts:15 = cityId(발굴) 또는 'runtime'(cityId 없는 호출)
  contextId?: string | number | null;
  // 근거: 원본 save-raw.ts:16 = 호출 맥락 식별(파일명), 미지정 시 'call'
  tag?: string | null;
  // 근거: 원본 save-raw.ts:17-18 = request(재현용 입력) / raw(외부 응답 원본)
  request: unknown;
  raw: unknown;
}

// 근거: 원본 raw-filename.ts:33-38 rawHash = md5(JSON.stringify(rawPart ?? {})) 의 hex.
//   md5 는 workerd 에서 실측 확인함(nodejs_compat + node:crypto createHash("md5") → md5("abc")=9001...7f72).
//   ※ 서버와 같은 해시를 써야 같은 raw 를 같은 파일로 인식(= 중복 0)하므로 알고리즘 교체 금지.
function rawHash(rawPart: unknown): string {
  return createHash("md5")
    .update(JSON.stringify(rawPart ?? {}))
    .digest("hex");
}

// 근거: 원본 raw-filename.ts:25-30 RAW_NAME_RE / parseRawName = `{base}[_N].json` 분해, 무순번은 n=0.
const RAW_NAME_RE = /^(.*?)(?:_(\d+))?\.json$/;
function parseRawName(name: string): { base: string; n: number } | null {
  const m = name.match(RAW_NAME_RE);
  if (!m) return null;
  return { base: m[1], n: m[2] != null ? parseInt(m[2], 10) : 0 };
}

/**
 * §18 raw 를 R2 에 저장한다. 원본 saveRaw() 와 키·내용·순번 규칙이 동일하다.
 *
 * 근거: rules.md:172-190 "Use bindings for Cloudflare services, not REST APIs"
 *   = @aws-sdk/client-s3 대신 네이티브 바인딩. bucket 은 인자로 받는다(= env 직접 import 금지, 테스트·재사용 가능).
 */
export async function saveRawToR2(
  bucket: R2Bucket,
  params: SaveRawToR2Params,
): Promise<void> {
  try {
    // 근거: 원본 save-raw.ts:28-31 = contextId 가 비면 'runtime'
    const ctx =
      params.contextId != null && String(params.contextId).trim() !== ""
        ? String(params.contextId)
        : "runtime";

    // 근거: 원본 save-raw.ts:32-36 = 영숫자 외 문자를 '-' 로, 48자 컷, 빈 값이면 'call'
    const tag =
      (params.tag ?? "call")
        .toString()
        .replace(/[^0-9a-z]+/gi, "-")
        .slice(0, 48) || "call";

    // 근거: 원본 save-raw.ts:38-39 = 날짜가 앞(YYYY-MM-DD), stem = `{date}_{source}-{tag}.json`
    const date = new Date().toISOString().slice(0, 10);
    const stemFileName = `${date}_${params.source}-${tag}.json`;

    // 근거: 원본 save-raw.ts:40 = `${ctx}/${stemFileName}` 이 기본(무순번) 경로
    let filePath = `${ctx}/${stemFileName}`;

    // ── 버전 순번(_N) 판정 ────────────────────────────────────────────────
    // 원본(save-raw.ts:45-63)은 로컬 docs/raw 디렉토리를 fs.readdirSync 로 훑어
    // 같은 stem 계열 파일들의 `raw` md5 를 비교한다(raw-filename.ts:41-65 versionedName).
    // Worker 에는 파일시스템이 없으므로 같은 판정을 R2 로 한다:
    //   readdirSync(dir)            → bucket.list({ prefix })   (api.md:54-69 / 공식 workers-api-reference list())
    //   readFileSync(p) 후 .raw md5 → bucket.get(key).json()    (api.md:28-38)
    // 알고리즘(계열 일치 판정·해시 동일 시 그 이름 재사용·아니면 maxN+1)은 원본과 1:1로 같다.
    try {
      const prefix = `${PREFIX}/${ctx}/`;
      const newHash = rawHash(params.raw);
      const base = stemFileName.replace(/\.json$/, "");

      // 근거: gotchas.md:3-16 "Always use truncated property" = objects.length 로 루프 돌리지 말 것.
      const siblings: string[] = [];
      let cursor: string | undefined = undefined;
      for (;;) {
        const listed: R2Objects = await bucket.list({ prefix, cursor });
        for (const o of listed.objects)
          siblings.push(o.key.slice(prefix.length));
        if (!listed.truncated) break;
        cursor = listed.cursor;
      }

      // 근거: 원본 raw-filename.ts:55-64 = maxN 은 -1 로 시작(계열 없음), 같은 base 만 비교,
      //   해시가 같으면 그 파일명을 그대로 재사용(= 덮어쓰기 = 중복 0), 아니면 maxN+1.
      let maxN = -1;
      let matchedName: string | null = null;
      for (const name of siblings) {
        const p = parseRawName(name);
        if (!p || p.base !== base) continue;
        // 기존 파일의 `raw` 부분만 해시 (= 원본 save-raw.ts:55 `JSON.parse(...).raw`)
        let h: string | null = null;
        try {
          const obj = await bucket.get(`${prefix}${name}`);
          if (obj) {
            const parsed = await obj.json<{ raw?: unknown }>();
            h = rawHash(parsed?.raw);
          }
        } catch {
          h = null; // 못 열면 null (= 원본 save-raw.ts:56-58 의 catch → null 과 동치)
        }
        if (h !== null && h === newHash) {
          matchedName = name;
          break;
        }
        if (p.n > maxN) maxN = p.n;
      }

      const versioned =
        matchedName ?? (maxN < 0 ? `${base}.json` : `${base}_${maxN + 1}.json`);
      filePath = `${ctx}/${versioned}`;
    } catch {
      // 순번 판정 실패는 저장 자체를 막지 않는다 (= 원본 save-raw.ts:63 의 빈 catch 와 동치).
    }

    // 근거: 원본 save-raw.ts:64-75 = pretty 들여쓰기 2 + 필드 5개(savedAt·source·contextId·request·raw) 순서까지 동일.
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

    // 근거: 원본 save-raw.ts:78-88 = PUT 실패는 삼키지 말고 반드시 로그(raw 증발 로그0 재발방지, 2026-07-07 승인).
    // 근거: api.md:7-23 / 공식 workers-api-reference put(key, value, options) = value 에 string 허용,
    //   httpMetadata.contentType 으로 원본의 "application/json"(save-raw.ts:82) 을 그대로 지정.
    //   ※ gotchas.md:80-98 "Stream Length Requirement" = 길이 모르는 스트림 금지 → 여기선 string 이라 해당 없음.
    try {
      await bucket.put(`${PREFIX}/${filePath}`, body, {
        httpMetadata: { contentType: "application/json" },
      });
    } catch (e) {
      console.error(
        `[saveRawToR2] ❌ R2 PUT 실패 = ${PREFIX}/${filePath} = ${String(
          (e as { message?: string })?.message || e,
        ).slice(0, 200)}`,
      );
    }
  } catch {
    // 근거: 원본 save-raw.ts:98 = 최상위 catch = raw 저장 실패가 본 호출을 죽이지 않는다(best-effort).
  }
}
