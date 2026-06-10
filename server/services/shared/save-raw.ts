// ⚠️ 수정금지(승인필요) 2026-06-09 사용자 SSOT = 외부호출 raw 단일 저장소 = Supabase Storage 'raw-responses' 버킷.
//   = 발굴(로컬)·런타임(배포·읽기전용 FS) 둘 다 동작(어디서든 HTTP PUT) + DB 테이블 안 늘림(3테이블 원칙) + 이미지와 동일 방식.
//   = 모든 외부 클라이언트(ts-client·geminiClient)가 응답 직후 이 함수로 raw 저장 → 이후 사용/DB 입력 = 소 안 잃음, 맥락 무관.
//   = 강제는 각 관문(클라이언트)에 박음. best-effort(저장 실패가 유료 호출 결과를 깨지 않음).
//   경로 = {source}/{contextId|runtime}/{tag}-{timestamp}.json

const BUCKET = 'raw-responses';

export interface SaveRawOpts {
  source: 'ts' | 'gemini';
  contextId?: string | number | null; // cityId(발굴) 또는 'runtime'(동선·메인앱 등 cityId 없는 호출)
  tag?: string | null;                // 호출 맥락 식별(파일명) — 미지정 시 'call'
  request: any;                       // 호출 입력 (= 비밀 제외, 재현용)
  raw: any;                           // 외부 응답 원본 (= 진짜 raw)
}

export async function saveRaw(opts: SaveRawOpts): Promise<void> {
  try {
    const storageKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
    const supaPublicUrl = process.env.SUPABASE_PUBLIC_URL || 'https://wxebceflvuythuodemro.supabase.co';
    if (!storageKey || !supaPublicUrl) return; // 키 없으면 조용히 skip (best-effort)

    const ctx = opts.contextId != null && String(opts.contextId).trim() !== '' ? String(opts.contextId) : 'runtime';
    const tag = (opts.tag ?? 'call').toString().replace(/[^0-9a-z]+/gi, '-').slice(0, 48) || 'call';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = `${opts.source}/${ctx}/${tag}-${stamp}.json`;
    const body = JSON.stringify({
      savedAt: new Date().toISOString(),
      source: opts.source,
      contextId: ctx,
      request: opts.request,
      raw: opts.raw,
    });

    await fetch(`${supaPublicUrl}/storage/v1/object/${BUCKET}/${filePath}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${storageKey}`, 'Content-Type': 'application/json', 'x-upsert': 'true' },
      body,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    // best-effort: raw 저장 실패가 유료 외부호출 결과를 깨면 안 됨 (단일 관문이라 정상 시 항상 저장).
  }
}
