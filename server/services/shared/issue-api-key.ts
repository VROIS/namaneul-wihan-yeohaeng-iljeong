// ⚠️ 수정금지(승인필요) 2026-06-18 사장님 SSOT = 출입증 검문소 키 발급 단일 진입점 (= 헌법 §16 재발명 차단)
// ───────────────────────────────────────────────────────────────────────────
// 【원리】 모든 외부호출(Gemini·TS·PM) 스크립트가 키를 받을 때 이 함수 하나만 통과.
//   = DB 검문소 함수 public.issue_api_key 호출 = 출입증(도시·행·날짜) 정식이면 키, 아니면 throw.
//   = SQL 문자열·인자 순서 = 여기 1곳에만 존재 (= 22곳 분산 -> 1곳 SSOT = 오타·순서 실수 0).
//
// 【검문 = DB 함수가 함】 도시(있음=cities 검증/없음=신규 면제) · 행(채움=확인/발굴=면제) · 날짜(형식).
//   미달 = DB 가 RAISE EXCEPTION = 이 함수가 그대로 throw = 외부호출 불가.
//
// 【사용】 const { issueApiKey } = await import(pathToFileURL('.../issue-api-key.ts').href);
//        const KEY = await issueApiKey(c, 'GEMINI_API_KEY', cityId, today, true);
//   client = pg Client(= c.query 패턴). keyName = api_keys.key_name. hasRow = 채움 true / 발굴 false.

export async function issueApiKey(
  client: any, // pg Client/pool (= c.query)
  keyName: string, // 'GEMINI_API_KEY' | 'GOOGLE_MAPS_API_KEY' (api_keys.key_name)
  cityId: number | null, // 도시 id (있음 >0 / 없음 NULL=완전 신규)
  inputDate: string, // 'YYYY-MM-DD' (호출 시점 날짜)
  hasRow: boolean, // 채움 true / 발굴 false
): Promise<string> {
  const r = await client.query(
    "SELECT public.issue_api_key($1, $2, $3, $4) AS k",
    [keyName, cityId, inputDate, hasRow],
  );
  return (r as any).rows?.[0]?.k;
}
