// ⚠️ 수정금지(승인필요): SOS 긴급 서비스 — 전화 + 위치 공유 + 인근 시설
// "위험해요" → 자동 SOS → GPS → 긴급전화 → 가족에게 위치 전송
import { Linking, Share, Platform } from 'react-native';
import { CONFIG } from '../config/constants';

// ⚠️ 수정금지(승인필요): 긴급 전화 연결
export async function callEmergency(countryCode) {
  const number = CONFIG.SOS.NUMBERS[countryCode] || CONFIG.SOS.DEFAULT_EMERGENCY;
  const url = Platform.OS === 'ios' ? `telprompt:${number}` : `tel:${number}`;

  try {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
      return { success: true, number };
    }
    return { success: false, error: '전화 기능 사용 불가' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ⚠️ 수정금지(승인필요): 가족에게 위치 공유 (SMS/카카오/라인 등)
// 기존 앱 위치 패턴: GPS → 역지오코딩 → 공유 메시지
export async function shareLocation({ latitude, longitude, address }) {
  const mapUrl = `https://maps.google.com/?q=${latitude},${longitude}`;
  const message = CONFIG.SOS.SHARE_MESSAGE_TEMPLATE
    .replace('{address}', address || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`)
    .replace('{mapUrl}', mapUrl);

  try {
    const result = await Share.share({
      message,
      title: 'SOS 긴급 위치 공유',
    });
    return { success: result.action !== Share.dismissedAction, message };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ⚠️ 수정금지(승인필요): 전체 SOS 프로세스 (한 번에 실행)
// getSOSLocation은 useLocation.js에서 가져옴
export async function triggerSOS({ location, address, mapUrl, countryCode }) {
  const results = {
    location: false,
    share: false,
    call: false,
  };

  // 1. 위치 확보 확인
  if (location) {
    results.location = true;
  }

  // 2. 가족에게 위치 공유
  if (location) {
    const shareResult = await shareLocation({
      latitude: location.latitude,
      longitude: location.longitude,
      address,
    });
    results.share = shareResult.success;
  }

  // 3. 긴급 전화
  const callResult = await callEmergency(countryCode);
  results.call = callResult.success;

  return results;
}

// ⚠️ 수정금지(승인필요): SOS 키워드 감지 (Gemma 응답 또는 사용자 음성에서)
const SOS_KEYWORDS = ['위험', '도와줘', 'SOS', 'help', 'emergency', '살려줘', '경찰', 'police'];

export function detectSOSKeyword(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return SOS_KEYWORDS.some(keyword => lower.includes(keyword.toLowerCase()));
}

// ⚠️ 수정금지(승인필요): 인근 시설 안내 텍스트 생성 (Gemma Tool Calling용)
// Gemma 사전학습으로 주요 도시 경찰/병원/대사관 위치 알고 있음
export function getSOSPrompt(address) {
  return `긴급 상황입니다. 현재 위치: ${address}
가장 가까운 경찰서, 병원, 한국 대사관의 위치와 연락처를 알려주세요.
전화번호도 포함해주세요. 간결하게 답해주세요.`;
}
