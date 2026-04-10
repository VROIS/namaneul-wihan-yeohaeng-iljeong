import { StatusBar } from 'expo-status-bar';
import { StyleSheet, SafeAreaView, Platform, BackHandler, PermissionsAndroid, Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import { useRef, useEffect, useCallback } from 'react';
import Constants from 'expo-constants';
// ⚠️ 수정금지(승인필요): 2026-03-12 Google OAuth 외부 브라우저 + Stripe 결제용
import * as WebBrowser from 'expo-web-browser';
// ⚠️ 수정금지(승인필요): 2026-03-20 네이티브 음성인식 활성화 — expo-speech-recognition v3.0.1 (Expo 54 호환)
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';

// ⚠️ 수정금지(승인필요): 2026-03-11 네이티브 브릿지용 모듈 import
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import * as Localization from 'expo-localization';

// ⚠️ 수정금지(승인필요): 2026-03-14 미연결 모듈 풀연결 — 네이티브 우선 + 웹 fallback 구조
import { Audio } from 'expo-audio';
import { CameraView } from 'expo-camera';
import { useVideoPlayer } from 'expo-video';
import * as KeepAwake from 'expo-keep-awake';
import * as Network from 'expo-network';
import * as FileSystem from 'expo-file-system';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as DocumentPicker from 'expo-document-picker';
import * as Brightness from 'expo-brightness';
import * as Battery from 'expo-battery';
import * as Crypto from 'expo-crypto';
import * as MailComposer from 'expo-mail-composer';
import * as Print from 'expo-print';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as SMS from 'expo-sms';
import * as TaskManager from 'expo-task-manager';
import * as Updates from 'expo-updates';

// ⚠️ 수정금지(승인필요): 2026-03-11 fallback URL에 "1" 누락 수정 — 실제 도메인은 my-handyguide1.replit.app
const WEB_APP_URL = Constants.expoConfig?.extra?.webAppUrl || 'https://my-handyguide1.replit.app';

// ⚠️ 수정금지(승인필요): 2026-03-12 iOS 최적 음성 매핑 (한국어=Yuna 강제, Roko 방지)
const IOS_VOICE_MAP = {
  'ko-KR': 'com.apple.ttsbundle.Yuna-compact',
  'en-US': 'com.apple.ttsbundle.Samantha-compact',
  'ja-JP': 'com.apple.ttsbundle.Kyoko-compact',
  'zh-CN': 'com.apple.ttsbundle.Ting-Ting-compact',
  'fr-FR': 'com.apple.ttsbundle.Thomas-compact',
  'de-DE': 'com.apple.ttsbundle.Anna-compact',
  'es-ES': 'com.apple.ttsbundle.Monica-compact',
};

// ⚠️ 수정금지(승인필요): 2026-03-17 플랫폼별 UA 설정
// Android: Chrome UA 강제 (WebView 호환성)
// iOS: Safari UA 설정 — WKWebView 기본 UA로는 Google OAuth 403 차단됨
// Google은 embedded WebView에서 OAuth를 차단하므로 Safari UA로 우회 필요
const ANDROID_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 10; Android SDK built for x86) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36';
const IOS_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

// ⚠️ 수정금지(승인필요): 2026-03-12 SafeAreaView가 safe-area 처리하므로 CSS 이중 패딩 제거
// Z Fold 등 큰 safe-area-inset-bottom 기기에서 하단 버튼 밀림 방지
// touch-action: manipulation → 300ms 터치 딜레이 제거
const INJECTED_JS = `
(function() {
  var style = document.createElement('style');
  // ⚠️ 수정금지(승인필요): 2026-03-24 touch-action:manipulation 제거 — Android WebView click 합성 방해 (Issue #2478)
  style.textContent =
    '.footer-safe-area { padding-bottom: 0 !important; }' +
    '.gallery-footer { padding-bottom: 0 !important; }' +
    '.bottom-nav { padding-bottom: 0 !important; }';
  document.head.appendChild(style);
})();
true;
`;

async function requestAndroidPermissions() {
  if (Platform.OS !== 'android') return;
  try {
    await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.CAMERA,
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);
  } catch (err) {
    console.warn('Permission request error:', err);
  }
}

export default function App() {
  const webViewRef = useRef(null);

  useEffect(() => {
    requestAndroidPermissions();

    // ⚠️ 수정금지(승인필요): 2026-03-22 OTT 딥링크 수신 — 토큰으로 WebView 세션 교환
    // 외부 브라우저에서 sonanie-guide://auth-callback?token=xxx 수신
    // → WebView를 /api/auth/exchange?token=xxx 로 이동 → 서버가 세션 생성 + 쿠키 설정
    const handleDeepLink = (event) => {
      const { url } = event;
      if (url && url.includes('auth-callback')) {
        WebBrowser.dismissBrowser().catch(() => {});
        // URL에서 토큰 추출
        const tokenMatch = url.match(/[?&]token=([^&]+)/);
        if (tokenMatch && tokenMatch[1] && webViewRef.current) {
          // ⚠️ 수정금지(승인필요): OTT 토큰 → WebView에서 서버로 직접 교환 (쿠키 정상 설정됨)
          // encodeURIComponent로 토큰 이스케이프 — 인젝션 방지
          const safeToken = encodeURIComponent(tokenMatch[1]);
          const exchangeUrl = WEB_APP_URL + '/api/auth/exchange?token=' + safeToken;
          webViewRef.current.injectJavaScript(
            'window.location.replace("' + exchangeUrl.replace(/"/g, '\\"') + '"); true;'
          );
        } else if (webViewRef.current) {
          // 토큰 없는 이전 방식 fallback
          webViewRef.current.injectJavaScript(`
            localStorage.setItem('auth_success', 'true');
            localStorage.setItem('landingVisited', 'true');
            window.location.replace('/');
            true;
          `);
        }
      }
    };
    const linkingSub = Linking.addEventListener('url', handleDeepLink);

    if (Platform.OS === 'android') {
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        if (webViewRef.current) {
          webViewRef.current.goBack();
          return true;
        }
        return false;
      });
      return () => {
        backHandler.remove();
        linkingSub.remove();
      };
    }
    return () => linkingSub.remove();
  }, []);

  // ⚠️ 수정금지(승인필요): 2026-03-11 네이티브 → 웹 응답 전송 함수
  const sendToWeb = useCallback((type, payload) => {
    if (webViewRef.current) {
      const data = JSON.stringify({ type, ...payload });
      webViewRef.current.injectJavaScript(`
        (function() {
          window.dispatchEvent(new CustomEvent('nativeResponse', { detail: ${data} }));
        })();
        true;
      `);
    }
  }, []);

  // ⚠️ 수정금지(승인필요): 2026-03-20 네이티브 음성인식 결과/에러 → 웹에 전달
  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results?.[0]?.transcript || '';
    if (text) sendToWeb('speechResult', { text });
  });
  useSpeechRecognitionEvent('error', (event) => {
    sendToWeb('speechResult', { error: event.error || 'unknown' });
  });

  // ⚠️ 수정금지(승인필요): 2026-03-11 웹 → 네이티브 메시지 처리 (onMessage 핸들러)
  const handleMessage = useCallback(async (event) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      const { type, payload } = message;

      switch (type) {
        // --- TTS (텍스트 음성 변환) ---
        case 'speak': {
          // ⚠️ 수정금지(승인필요): 2026-03-12 네이티브 TTS + 언어별 최적 음성 하드코딩 강제
          const { text, language = 'en-US', rate = 1.0, pitch = 1.0 } = payload;
          const speakOpts = { language, rate, pitch };
          if (Platform.OS === 'ios' && IOS_VOICE_MAP[language]) {
            speakOpts.voice = IOS_VOICE_MAP[language];
          }
          speakOpts.onDone = () => sendToWeb('speakDone', { success: true });
          speakOpts.onError = (err) => sendToWeb('speakDone', { error: err?.message || 'unknown' });
          Speech.speak(text, speakOpts);
          break;
        }
        case 'stopSpeech': {
          Speech.stop();
          break;
        }
        case 'isSpeaking': {
          const speaking = await Speech.isSpeakingAsync();
          sendToWeb('isSpeaking', { speaking });
          break;
        }
        case 'getVoices': {
          const voices = await Speech.getAvailableVoicesAsync();
          sendToWeb('voices', { voices });
          break;
        }

        // --- 햅틱 (진동 피드백) ---
        case 'haptic': {
          // ⚠️ 수정금지(승인필요): expo-haptics 네이티브 햅틱
          const style = payload?.style || 'light';
          const styles = {
            light: Haptics.ImpactFeedbackStyle.Light,
            medium: Haptics.ImpactFeedbackStyle.Medium,
            heavy: Haptics.ImpactFeedbackStyle.Heavy,
          };
          await Haptics.impactAsync(styles[style] || styles.light);
          break;
        }
        case 'hapticNotification': {
          const notifType = payload?.notifType || 'success';
          const types = {
            success: Haptics.NotificationFeedbackType.Success,
            warning: Haptics.NotificationFeedbackType.Warning,
            error: Haptics.NotificationFeedbackType.Error,
          };
          await Haptics.notificationAsync(types[notifType] || types.success);
          break;
        }

        // --- 공유 ---
        case 'share': {
          // ⚠️ 수정금지(승인필요): expo-sharing 네이티브 공유 시트
          const { url, title } = payload;
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(url, { dialogTitle: title });
          }
          break;
        }

        // --- 클립보드 ---
        case 'clipboard': {
          // ⚠️ 수정금지(승인필요): expo-clipboard 네이티브 클립보드
          const { action, text: clipText } = payload;
          if (action === 'copy') {
            await Clipboard.setStringAsync(clipText);
            sendToWeb('clipboardResult', { success: true });
          } else if (action === 'paste') {
            const content = await Clipboard.getStringAsync();
            sendToWeb('clipboardResult', { content });
          }
          break;
        }

        // --- 위치 ---
        case 'getLocation': {
          // ⚠️ 수정금지(승인필요): expo-location 네이티브 위치
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const location = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            sendToWeb('location', {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              accuracy: location.coords.accuracy,
            });
          } else {
            sendToWeb('location', { error: 'permission_denied' });
          }
          break;
        }

        // --- 이미지 피커 (카메라/갤러리) ---
        case 'pickImage': {
          // ⚠️ 수정금지(승인필요): expo-image-picker 네이티브 이미지 선택
          const { source = 'gallery' } = payload;
          let result;
          if (source === 'camera') {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
              sendToWeb('imageResult', { error: 'permission_denied' });
              break;
            }
            result = await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              quality: 0.8,
              base64: true,
            });
          } else {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
              sendToWeb('imageResult', { error: 'permission_denied' });
              break;
            }
            result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              quality: 0.8,
              base64: true,
            });
          }
          if (!result.canceled && result.assets?.[0]) {
            sendToWeb('imageResult', {
              uri: result.assets[0].uri,
              base64: result.assets[0].base64,
              width: result.assets[0].width,
              height: result.assets[0].height,
            });
          } else {
            sendToWeb('imageResult', { canceled: true });
          }
          break;
        }

        // --- 인증 캐시 (SecureStore) ---
        case 'secureStore': {
          // ⚠️ 수정금지(승인필요): expo-secure-store 네이티브 암호화 저장소 (인증 캐시 영구 보관)
          const { action: storeAction, key, value } = payload;
          if (storeAction === 'set') {
            await SecureStore.setItemAsync(key, value);
            sendToWeb('secureStoreResult', { success: true, key });
          } else if (storeAction === 'get') {
            const storedValue = await SecureStore.getItemAsync(key);
            sendToWeb('secureStoreResult', { key, value: storedValue });
          } else if (storeAction === 'delete') {
            await SecureStore.deleteItemAsync(key);
            sendToWeb('secureStoreResult', { success: true, key });
          }
          break;
        }

        // --- 언어/로케일 ---
        case 'getLocale': {
          // ⚠️ 수정금지(승인필요): expo-localization 디바이스 언어 정보
          const locales = Localization.getLocales();
          sendToWeb('locale', {
            languageCode: locales[0]?.languageCode,
            languageTag: locales[0]?.languageTag,
            regionCode: locales[0]?.regionCode,
          });
          break;
        }

        // --- 네이티브 음성인식 (마이크 입력) ---
        case 'startSpeechRecognition': {
          // ⚠️ 수정금지(승인필요): 2026-03-20 네이티브 음성인식 시작 — expo-speech-recognition 활성화
          const lang = payload?.language || 'ko-KR';
          try {
            const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
            if (!granted) {
              sendToWeb('speechResult', { error: '마이크 권한이 필요합니다' });
              break;
            }
            ExpoSpeechRecognitionModule.start({ lang, interimResults: false });
          } catch (e) {
            sendToWeb('speechResult', { error: e.message });
          }
          break;
        }
        case 'stopSpeechRecognition': {
          // ⚠️ 수정금지(승인필요): 2026-03-20 네이티브 음성인식 중지
          ExpoSpeechRecognitionModule.stop();
          break;
        }

        // --- 오버레이 닫기 (추천갤러리 리턴 문제 해결) ---
        case 'closeWindow': {
          // ⚠️ 수정금지(승인필요): window.close() 대신 네이티브에서 뒤로가기 처리
          if (webViewRef.current) {
            webViewRef.current.goBack();
          }
          break;
        }

        // ⚠️ 수정금지(승인필요): 2026-03-14 미연결 모듈 풀연결 — 네이티브 핸들러

        // --- 화면 꺼짐 방지 (TTS 재생 중) ---
        case 'keepAwake': {
          KeepAwake.activateKeepAwakeAsync().catch(() => {});
          break;
        }
        case 'allowSleep': {
          KeepAwake.deactivateKeepAwake();
          break;
        }

        // --- 네트워크 상태 ---
        case 'getNetworkState': {
          const netState = await Network.getNetworkStateAsync();
          sendToWeb('networkState', {
            isConnected: netState.isConnected,
            isInternetReachable: netState.isInternetReachable,
            type: netState.type,
          });
          break;
        }

        // --- 디바이스 정보 ---
        case 'getDeviceInfo': {
          sendToWeb('deviceInfo', {
            brand: Device.brand,
            modelName: Device.modelName,
            osName: Device.osName,
            osVersion: Device.osVersion,
            deviceType: Device.deviceType,
          });
          break;
        }

        // --- 파일 다운로드 ---
        case 'downloadFile': {
          const { url: fileUrl, filename } = payload;
          const downloadPath = FileSystem.documentDirectory + (filename || 'download');
          try {
            const downloadResult = await FileSystem.downloadAsync(fileUrl, downloadPath);
            sendToWeb('downloadResult', { uri: downloadResult.uri, status: downloadResult.status });
          } catch (dlErr) {
            sendToWeb('downloadResult', { error: dlErr.message });
          }
          break;
        }

        // --- 파일 읽기 ---
        case 'readFile': {
          const { uri: readUri, encoding = 'utf8' } = payload;
          try {
            const fileContent = await FileSystem.readAsStringAsync(readUri, { encoding });
            sendToWeb('fileContent', { content: fileContent });
          } catch (readErr) {
            sendToWeb('fileContent', { error: readErr.message });
          }
          break;
        }

        // --- 문서 선택 ---
        case 'pickDocument': {
          try {
            const docResult = await DocumentPicker.getDocumentAsync({ type: '*/*' });
            if (!docResult.canceled && docResult.assets?.[0]) {
              sendToWeb('documentResult', {
                uri: docResult.assets[0].uri,
                name: docResult.assets[0].name,
                size: docResult.assets[0].size,
                mimeType: docResult.assets[0].mimeType,
              });
            } else {
              sendToWeb('documentResult', { canceled: true });
            }
          } catch (docErr) {
            sendToWeb('documentResult', { error: docErr.message });
          }
          break;
        }

        // --- 화면 밝기 ---
        case 'getBrightness': {
          try {
            const brightness = await Brightness.getBrightnessAsync();
            sendToWeb('brightnessResult', { brightness });
          } catch (brightErr) {
            sendToWeb('brightnessResult', { error: brightErr.message });
          }
          break;
        }
        case 'setBrightness': {
          const { level } = payload;
          try {
            await Brightness.setBrightnessAsync(level);
            sendToWeb('brightnessResult', { success: true });
          } catch (brightSetErr) {
            sendToWeb('brightnessResult', { error: brightSetErr.message });
          }
          break;
        }

        // --- 배터리 ---
        case 'getBatteryLevel': {
          try {
            const batteryLevel = await Battery.getBatteryLevelAsync();
            const batteryState = await Battery.getBatteryStateAsync();
            sendToWeb('batteryResult', { level: batteryLevel, state: batteryState });
          } catch (batErr) {
            sendToWeb('batteryResult', { error: batErr.message });
          }
          break;
        }

        // --- 암호화 해시 ---
        case 'generateHash': {
          const { data: hashData, algorithm = 'SHA-256' } = payload;
          try {
            const algMap = { 'SHA-256': Crypto.CryptoDigestAlgorithm.SHA256, 'SHA-512': Crypto.CryptoDigestAlgorithm.SHA512, 'MD5': Crypto.CryptoDigestAlgorithm.MD5 };
            const digest = await Crypto.digestStringAsync(algMap[algorithm] || algMap['SHA-256'], hashData);
            sendToWeb('hashResult', { hash: digest, algorithm });
          } catch (hashErr) {
            sendToWeb('hashResult', { error: hashErr.message });
          }
          break;
        }

        // --- 메일 작성 ---
        case 'composeMail': {
          const { recipients, subject, body: mailBody } = payload;
          try {
            const isAvail = await MailComposer.isAvailableAsync();
            if (isAvail) {
              await MailComposer.composeAsync({ recipients, subject, body: mailBody });
              sendToWeb('mailResult', { success: true });
            } else {
              sendToWeb('mailResult', { error: 'mail_not_available' });
            }
          } catch (mailErr) {
            sendToWeb('mailResult', { error: mailErr.message });
          }
          break;
        }

        // --- 인쇄 ---
        case 'printContent': {
          const { html: printHtml } = payload;
          try {
            await Print.printAsync({ html: printHtml });
            sendToWeb('printResult', { success: true });
          } catch (printErr) {
            sendToWeb('printResult', { error: printErr.message });
          }
          break;
        }

        // --- 화면 방향 ---
        case 'lockOrientation': {
          const { orientation: orient = 'DEFAULT' } = payload;
          try {
            const orientMap = { 'PORTRAIT': ScreenOrientation.OrientationLock.PORTRAIT, 'LANDSCAPE': ScreenOrientation.OrientationLock.LANDSCAPE, 'DEFAULT': ScreenOrientation.OrientationLock.DEFAULT };
            await ScreenOrientation.lockAsync(orientMap[orient] || orientMap['DEFAULT']);
            sendToWeb('orientationResult', { success: true });
          } catch (orientErr) {
            sendToWeb('orientationResult', { error: orientErr.message });
          }
          break;
        }

        // --- SMS ---
        case 'sendSMS': {
          const { addresses, message: smsMsg } = payload;
          try {
            const isAvail = await SMS.isAvailableAsync();
            if (isAvail) {
              await SMS.sendSMSAsync(addresses, smsMsg);
              sendToWeb('smsResult', { success: true });
            } else {
              sendToWeb('smsResult', { error: 'sms_not_available' });
            }
          } catch (smsErr) {
            sendToWeb('smsResult', { error: smsErr.message });
          }
          break;
        }

        // --- 푸시 알림 ---
        case 'scheduleNotification': {
          const { title: notifTitle, body: notifBody, seconds = 1 } = payload;
          try {
            await Notifications.scheduleNotificationAsync({
              content: { title: notifTitle, body: notifBody },
              trigger: { type: 'timeInterval', seconds, repeats: false },
            });
            sendToWeb('notificationResult', { success: true });
          } catch (notifErr) {
            sendToWeb('notificationResult', { error: notifErr.message });
          }
          break;
        }

        // --- OTA 업데이트 확인 ---
        case 'checkForUpdates': {
          try {
            const update = await Updates.checkForUpdateAsync();
            sendToWeb('updateResult', { isAvailable: update.isAvailable });
          } catch (updateErr) {
            sendToWeb('updateResult', { error: updateErr.message });
          }
          break;
        }

        default:
          console.log('[Bridge] 알 수 없는 메시지 타입:', type);
      }
    } catch (error) {
      console.error('[Bridge] 메시지 처리 오류:', error);
    }
  }, [sendToWeb]);

  // ⚠️ 수정금지(승인필요): 2026-03-11 Android WebView 권한 요청 자동 허용 (카메라/마이크)
  const handlePermissionRequest = useCallback((request) => {
    request.grant(request.resources);
  }, []);

  // ⚠️ 수정금지(승인필요): 2026-03-12 Google OAuth + Stripe → 시스템 브라우저로 열기
  // Google: WebView 내 OAuth 차단 (403 disallowed_useragent) → 외부 브라우저 필수 (RFC 8252)
  // Stripe: WebView 결제 비권장 → 시스템 브라우저로 전환
  const openExternal = useCallback((url) => {
    WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url));
  }, []);

  const handleNavigationRequest = useCallback((request) => {
    const { url } = request;

    // ⚠️ 수정금지(승인필요): 2026-03-24 Google/Apple OAuth → WebView 내부 처리 (카카오와 동일 패턴)
    // 이전: 외부 브라우저 → 쿠키 미공유 → 앱 복귀 불가. UserAgent Chrome/120으로 disallowed_useragent 우회
    // Stripe만 외부 브라우저 유지 (결제 보안)
    if (url.includes('checkout.stripe.com')) {
      openExternal(url);
      return false; // WebView 내 이동 차단
    }

    return true; // 나머지 URL은 WebView 내에서 정상 이동
  }, [openExternal]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" backgroundColor="#4285F4" />
      <WebView
        ref={webViewRef}
        source={{ uri: WEB_APP_URL }}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        allowsBackForwardNavigationGestures={true}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback={true}
        geolocationEnabled={true}
        cacheEnabled={true}
        originWhitelist={['*']}
        mixedContentMode="compatibility"
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={true}
        mediaCapturePermissionGrantType="grant"  // ⚠️ 수정금지(승인필요): 2026-03-24 카메라/마이크 무조건 허용 (grantIfSameHostElsePrompt → grant)
        injectedJavaScript={INJECTED_JS}
        onShouldStartLoadWithRequest={handleNavigationRequest}
        onMessage={handleMessage}
        androidLayerType="software"  // ⚠️ 수정금지(승인필요): 2026-03-24 software — SurfaceView→TextureView 전환, 카메라 video 터치 가로채기 방지
        nestedScrollEnabled={true}  // ⚠️ 수정금지(승인필요): 2026-03-24 Android onClick 미발동 워크어라운드 (Issue #2478)
        onAndroidPermissionRequest={handlePermissionRequest}
        // ⚠️ 수정금지(승인필요): 2026-03-17 플랫폼별 UA 적용 (Google OAuth 403 방지)
        userAgent={Platform.OS === 'android' ? ANDROID_USER_AGENT : IOS_USER_AGENT}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#4285F4',
  },
  webview: {
    flex: 1,
  },
});
