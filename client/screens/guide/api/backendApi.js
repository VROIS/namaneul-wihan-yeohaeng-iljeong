// ⚠️ 수정금지(승인필요): 기존 백엔드 API 호출 — 현재 앱과 동일한 엔드포인트
// server/routes.ts와 1:1 매칭
import { CONFIG } from '../config/constants';
const BASE_URL = CONFIG.API.SERVER_URL;

// ⚠️ 수정금지(승인필요): 보관함 저장 — POST /api/guides/batch
// 현재 앱 public/index.js:3075 handleSaveClick과 동일
export async function saveGuides({ userId, language, guides }) {
  const response = await fetch(`${BASE_URL}/api/guides/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, language, guides }),
  });
  if (!response.ok) throw new Error(`보관함 저장 실패: ${response.status}`);
  return response.json();
}

// ⚠️ 수정금지(승인필요): 보관함 목록 조회 — GET /api/guides
export async function getGuides(userId) {
  const response = await fetch(`${BASE_URL}/api/guides?userId=${userId}`);
  if (!response.ok) throw new Error(`보관함 조회 실패: ${response.status}`);
  return response.json();
}

// ⚠️ 수정금지(승인필요): 보관함 삭제 — DELETE /api/guides/:id
export async function deleteGuide(guideId, userId) {
  const response = await fetch(`${BASE_URL}/api/guides/${guideId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  if (!response.ok) throw new Error(`보관함 삭제 실패: ${response.status}`);
  return response.json();
}

// ⚠️ 수정금지(승인필요): 크레딧 확인 — GET /api/user/credits
export async function checkCredits(userId) {
  const response = await fetch(`${BASE_URL}/api/user/credits?userId=${userId}`);
  if (!response.ok) throw new Error(`크레딧 조회 실패: ${response.status}`);
  return response.json();
}

// ⚠️ 수정금지(승인필요): 이미지 분석 (서버 Gemini API 경유 — Gemma 실패 시 폴백)
export async function analyzeImageViaServer(imageBase64, prompt, language = 'ko') {
  const response = await fetch(`${BASE_URL}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageBase64, prompt, language }),
  });
  if (!response.ok) throw new Error(`서버 분석 실패: ${response.status}`);
  return response.json();
}
