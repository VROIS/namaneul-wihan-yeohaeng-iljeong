// ⚠️ 수정금지(승인필요): 보관함 서비스 — 로컬(AsyncStorage) + 서버(PostgreSQL) 이중 저장
// 현재 앱과 동일한 구조: IndexedDB → AsyncStorage, /api/guides/batch → 동일 API
// 라이브 중 이미지+대화를 저장 → 언제든 다시 볼 수 있음
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CONFIG } from '../config/constants';

const ARCHIVE_KEY = 'archive_items';
const BASE_URL = CONFIG.API.SERVER_URL;

// ⚠️ 수정금지(승인필요): 보관함에 저장 (로컬 + 서버 동시)
// 현재 앱 public/index.js:3075-3164 handleSaveClick 구조 동일
export async function saveToArchive({
  title,
  description,
  imageBase64,       // Base64 이미지 (촬영/라이브 프레임)
  aiGeneratedContent, // AI 응답 텍스트
  latitude,
  longitude,
  locationName,
  voiceLang,
  voiceName,
  voiceQuery,        // 음성 질문 원문
  userId,
  language = 'ko',
}) {
  const localId = `guide_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const imageDataUrl = imageBase64 ? `data:image/jpeg;base64,${imageBase64}` : '';

  const item = {
    id: localId,
    serverId: null,
    title: voiceQuery || title || '제목 없음',
    description: aiGeneratedContent || description || '',
    imageDataUrl,
    latitude: latitude || null,
    longitude: longitude || null,
    locationName: locationName || '',
    aiGeneratedContent: aiGeneratedContent || '',
    voiceLang: voiceLang || CONFIG.VOICE.LANGUAGE,
    voiceName: voiceName || '',
    voiceQuery: voiceQuery || '',
    language,
    createdAt: new Date().toISOString(),
  };

  // 1. 로컬 저장 (AsyncStorage — 기존 앱의 IndexedDB 역할)
  await saveLocal(item);

  // 2. 서버 저장 (기존 앱과 동일 API: POST /api/guides/batch)
  if (userId) {
    try {
      const serverId = await saveToServer(item, userId, language);
      if (serverId) {
        item.serverId = serverId;
        await updateLocalItem(localId, { serverId });
      }
    } catch (e) {
      console.warn('[ArchiveService] 서버 저장 실패 (로컬만 저장됨):', e.message);
      // 오프라인 — 로컬만 저장, 나중에 동기화
    }
  }

  return item;
}

// ⚠️ 수정금지(승인필요): 서버 저장 — POST /api/guides/batch (현재 앱과 동일)
async function saveToServer(item, userId, language) {
  const response = await fetch(`${BASE_URL}/api/guides/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      language,
      guides: [{
        localId: item.id,
        title: item.title,
        description: item.description,
        imageDataUrl: item.imageDataUrl,
        latitude: item.latitude,
        longitude: item.longitude,
        locationName: item.locationName,
        aiGeneratedContent: item.aiGeneratedContent,
        voiceLang: item.voiceLang,
        voiceName: item.voiceName,
      }],
    }),
  });

  if (!response.ok) throw new Error(`서버 저장 실패: ${response.status}`);
  const data = await response.json();
  // 서버가 guideIds 배열 반환 (현재 앱 routes.ts:1133)
  return data.guideIds?.[0] || null;
}

// ⚠️ 수정금지(승인필요): 로컬 저장 (AsyncStorage)
async function saveLocal(item) {
  const items = await getLocalArchive();
  items.push(item);
  await AsyncStorage.setItem(ARCHIVE_KEY, JSON.stringify(items));
}

// ⚠️ 수정금지(승인필요): 로컬 항목 업데이트 (serverId 등)
async function updateLocalItem(localId, updates) {
  const items = await getLocalArchive();
  const index = items.findIndex(i => i.id === localId);
  if (index >= 0) {
    items[index] = { ...items[index], ...updates };
    await AsyncStorage.setItem(ARCHIVE_KEY, JSON.stringify(items));
  }
}

// ⚠️ 수정금지(승인필요): 로컬 보관함 전체 조회 (최신순)
export async function getLocalArchive() {
  try {
    const data = await AsyncStorage.getItem(ARCHIVE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

// ⚠️ 수정금지(승인필요): 서버 보관함 조회 — GET /api/guides
export async function getServerArchive(userId) {
  try {
    const response = await fetch(`${BASE_URL}/api/guides?userId=${userId}`);
    if (!response.ok) throw new Error(`서버 조회 실패: ${response.status}`);
    return await response.json();
  } catch (e) {
    console.warn('[ArchiveService] 서버 조회 실패:', e.message);
    return [];
  }
}

// ⚠️ 수정금지(승인필요): 보관함 항목 삭제 (로컬 + 서버)
export async function deleteArchiveItem(localId, serverId, userId) {
  // 로컬 삭제
  const items = await getLocalArchive();
  const filtered = items.filter(i => i.id !== localId);
  await AsyncStorage.setItem(ARCHIVE_KEY, JSON.stringify(filtered));

  // 서버 삭제
  if (serverId && userId) {
    try {
      await fetch(`${BASE_URL}/api/guides/${serverId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
    } catch (e) {
      console.warn('[ArchiveService] 서버 삭제 실패:', e.message);
    }
  }
}

// ⚠️ 수정금지(승인필요): 오프라인 동기화 — 로컬에만 있는 항목을 서버에 업로드
export async function syncOfflineItems(userId) {
  const items = await getLocalArchive();
  const unsynced = items.filter(i => !i.serverId);

  for (const item of unsynced) {
    try {
      const serverId = await saveToServer(item, userId, item.language);
      if (serverId) {
        await updateLocalItem(item.id, { serverId });
      }
    } catch {
      // 다음 동기화 시 재시도
    }
  }

  return unsynced.length;
}
