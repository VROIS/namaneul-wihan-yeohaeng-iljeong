// ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = 이 PC 도구(시드발굴 v3)가 클라우드플레어 워커의 후처리 큐에 일을 넣는 길 1벌 = 관리자 스위치 POST /api/debug/gmaps-post. 워커 주소 = TRIPIS_API_URL(.env, 없으면 로컬 8787), 관리자 = users.role='admin' 1명 (정본 §)
export async function enqueueViaWorker(body: {
  cityId: number;
  reportKey?: string;
  reason?: string;
}): Promise<any> {
  const { pool } = await import("../../db");
  const admin = (
    await pool!.query(
      "SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1",
    )
  ).rows[0];
  if (!admin) throw new Error("관리자 계정(users.role=admin) 없음");
  const base = (process.env.TRIPIS_API_URL || "http://127.0.0.1:8787").replace(
    /\/+$/,
    "",
  );
  const res = await fetch(`${base}/api/debug/gmaps-post`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer simple_auth_token_v1_${admin.id}`,
    },
    body: JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(`큐 등록 실패 ${res.status}: ${JSON.stringify(json)}`);
  return json;
}
