// ⚠️ 수정금지(승인필요) 2026-06-18 사장님 SSOT = 출입증 검문소 키 발급 단일 진입점 (= 헌법 §16 재발명 차단)

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
