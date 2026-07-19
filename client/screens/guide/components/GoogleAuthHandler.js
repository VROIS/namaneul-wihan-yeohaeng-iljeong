// ⚠️ 수정금지(승인필요): 2026-04-05 구글 OAuth 네이티브 SDK — 외부 브라우저 안 열림 (카카오/애플과 동일 UX)
// 이전: WebBrowser.openAuthSessionAsync → 외부 Safari/Chrome 열림 → 앱 미복귀 (3주간 실패)
// 현재: @react-native-google-signin/google-signin → 네이티브 모달 → idToken 직접 반환
import { useEffect, useRef } from 'react';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import Constants from 'expo-constants';

// ⚠️ 수정금지(승인필요): App.js의 WEB_APP_URL과 동일한 소스 사용 (대소문자 주의)
const WEB_APP_URL = Constants.expoConfig?.extra?.webAppUrl || 'https://my-handyguide1.replit.app';

// ⚠️ 수정금지(승인필요): 2026-04-05 Google Cloud Console에서 생성한 Client ID
GoogleSignin.configure({
  iosClientId: '333291226529-j7ohjt6irc9a10plvcssr3qomlj84v8j.apps.googleusercontent.com',
  webClientId: '333291226529-efo3t9u9jbg38pp42hsavjl7va1bpjcs.apps.googleusercontent.com',
  offlineAccess: false,
});

export default function GoogleAuthHandler({ onSuccess, onCancel, onError }) {
  const callbacksRef = useRef({ onSuccess, onCancel, onError });
  callbacksRef.current = { onSuccess, onCancel, onError };

  useEffect(() => {
    const doAuth = async () => {
      try {
        await GoogleSignin.hasPlayServices();
        const response = await GoogleSignin.signIn();
        const idToken = response.data?.idToken;

        if (idToken) {
          // ⚠️ 수정금지(승인필요): 서버에 idToken 전송 → 검증 → OTT 토큰 반환
          const res = await fetch(`${WEB_APP_URL}/api/auth/google/native-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken }),
          });
          const data = await res.json();
          if (data.token) {
            callbacksRef.current.onSuccess(data.token);
          } else {
            callbacksRef.current.onError?.('서버 토큰 교환 실패');
          }
        } else {
          callbacksRef.current.onError?.('idToken 없음');
        }
      } catch (err) {
        if (err.code === 'SIGN_IN_CANCELLED') {
          callbacksRef.current.onCancel();
        } else {
          console.error('[GoogleAuth Native] error:', err);
          callbacksRef.current.onError?.(err.message || 'unknown');
        }
      }
    };
    doAuth();
  }, []);

  return null;
}
