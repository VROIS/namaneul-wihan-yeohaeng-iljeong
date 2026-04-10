// Import services and utils from the root directory
import * as gemini from './geminiService.js';
import { optimizeImage } from './imageOptimizer.js';

document.addEventListener('DOMContentLoaded', () => {
    // ⚠️ 수정금지(승인필요) — Stripe 결제 후 SPA 복귀 감지 (2026-03-10)
    const paymentParams = new URLSearchParams(window.location.search);
    const paymentStatus = paymentParams.get('payment');
    if (paymentStatus) {
        const sessionId = paymentParams.get('session_id');
        window.history.replaceState({}, document.title, '/');
        if (paymentStatus === 'success' && sessionId) {
            setTimeout(() => {
                if (typeof openPageOverlay === 'function') {
                    openPageOverlay('/profile.html?payment=success&session_id=' + sessionId);
                }
            }, 500);
        } else if (paymentStatus === 'cancel') {
            setTimeout(() => {
                if (typeof openPageOverlay === 'function') {
                    openPageOverlay('/profile.html?payment=cancel');
                }
            }, 500);
        }
    }

    // 📊 사용자 활동 로그 기록 (2026-02-01)
    // 세션 ID 생성 또는 재사용
    let sessionId = sessionStorage.getItem('activity_session_id');
    if (!sessionId) {
        sessionId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2);
        sessionStorage.setItem('activity_session_id', sessionId);
    }

    // 활동 로그 전송 (비동기, 실패해도 무시)
    fetch('/api/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sessionId })
    }).catch(() => { }); // 에러 무시

    // ⚠️ 수정금지(승인필요): 2026-03-11 네이티브 브릿지 — 앱 시작 시 SecureStore에서 인증 정보 복원 + 네이티브 응답 리스너
    if (window.ReactNativeWebView) {
        // 네이티브 저장소에서 인증 캐시 복원 요청
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'secureStore', payload: { action: 'get', key: 'cachedUser' } }));
        // 네이티브 응답 수신 리스너
        window.addEventListener('nativeResponse', (e) => {
            const data = e.detail;
            if (data.type === 'secureStoreResult' && data.key === 'cachedUser' && data.value) {
                // localStorage에 없으면 네이티브 저장소에서 복원
                if (!localStorage.getItem('cachedUser')) {
                    localStorage.setItem('cachedUser', data.value);
                    console.log('[Bridge] 네이티브 저장소에서 인증 캐시 복원 완료');
                }
            }
            // ⚠️ 수정금지(승인필요): 2026-03-19 네이티브 위치 응답 → currentGPS 설정 + 랜드마크 검색 + UI 업데이트
            // 앱(WebView): expo-location 응답 처리 / 실패 시 웹 geolocation 폴백은 기존 로직에서 처리
            if (data.type === 'location' && !data.error) {
                console.log('[Bridge] 네이티브 위치:', data.latitude, data.longitude);
                window.currentGPS = {
                    latitude: data.latitude,
                    longitude: data.longitude,
                    locationName: null
                };
                // 랜드마크 검색 후 UI 업데이트 (loadGoogleMapsAPI는 DOMContentLoaded 후 정의됨 — 네이티브 응답은 항상 이후 도착)
                try {
                    loadGoogleMapsAPI(async () => {
                        const landmark = await getNearbyLandmark(data.latitude, data.longitude);
                        if (landmark && window.currentGPS) {
                            window.currentGPS.locationName = landmark;
                        }
                        updateLocationInfoUI(landmark || '위치 정보 없음');
                    });
                } catch (err) {
                    console.warn('[Bridge] 랜드마크 검색 실패:', err);
                }
            }
            // ⚠️ 수정금지(승인필요): 2026-03-20 네이티브 음성인식 결과 수신 → processTextQuery 또는 에러 처리
            if (data.type === 'speechResult') {
                const micBtn = document.getElementById('micBtn');
                micBtn?.classList.remove('mic-listening');
                if (data.text) {
                    processTextQuery(data.text);
                } else if (data.error) {
                    console.warn('[Bridge] 음성인식 에러:', data.error);
                    showToast('음성을 듣지 못했어요. 다시 시도해볼까요?');
                }
            }
        });
    }

    // 🌐 언어 선택 바인딩 (admin-settings.html과 동일)
    LanguageHelper.bindLanguageSelect('languageSelect');

    // 📳 햅틱 피드백 함수 (감각 보상 이론 적용)
    function triggerHaptic(pattern = 50) {
        // ⚠️ 수정금지(승인필요): 2026-03-11 네이티브 브릿지 — 앱에서는 expo-haptics 사용, 웹은 기존 vibrate 유지
        if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'haptic', payload: { style: 'light' } }));
        } else if (navigator.vibrate) {
            navigator.vibrate(pattern);
        }
    }

    // ⚠️ 수정금지(승인필요): 2026-03-14 네이티브 알림 진동 — 저장 성공/에러/삭제 시 촉각 피드백
    function triggerHapticNotification(notifType = 'success') {
        if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'hapticNotification', payload: { notifType } }));
        } else if (navigator.vibrate) {
            const patterns = { success: [50, 30, 50], warning: [100, 50, 100], error: [200, 100, 200] };
            navigator.vibrate(patterns[notifType] || patterns.success);
        }
    }

    // 📳 모든 interactive-btn에 햅틱 피드백 적용
    document.querySelectorAll('.interactive-btn').forEach(btn => {
        btn.addEventListener('click', () => triggerHaptic(50));
    });

    // DOM Elements
    const video = document.getElementById('camera-feed');
    const canvas = document.getElementById('capture-canvas');
    const uploadInput = document.getElementById('upload-input');
    const toastContainer = document.getElementById('toastContainer');

    // Share Modal Elements (Now used for loading state)
    const shareModal = document.getElementById('shareModal');
    const shareModalContent = document.getElementById('shareModalContent');
    const closeShareModalBtn = document.getElementById('closeShareModalBtn');

    // Auth Modal Elements
    const authModal = document.getElementById('authModal');
    const closeAuthModalBtn = document.getElementById('closeAuthModalBtn');
    const googleLoginBtn = document.getElementById('googleLoginBtn');
    const kakaoLoginBtn = document.getElementById('kakaoLoginBtn');
    const appleLoginBtn = document.getElementById('appleLoginBtn'); // ⚠️ 수정금지(승인필요): Apple 로그인 버튼 (2026-03-14)

    // Pages
    const featuresPage = document.getElementById('featuresPage');
    const mainPage = document.getElementById('mainPage');
    const detailPage = document.getElementById('detailPage');
    const archivePage = document.getElementById('archivePage');
    const settingsPage = document.getElementById('settingsPage'); // New page

    // Features Page Elements
    const startCameraFromFeaturesBtn = document.getElementById('startCameraFromFeaturesBtn');

    // Main Page Elements
    const cameraStartOverlay = document.getElementById('cameraStartOverlay');
    const mainLoader = document.getElementById('mainLoader');
    const mainFooter = mainPage.querySelector('.footer-safe-area');
    const shootBtn = document.getElementById('shootBtn');
    const uploadBtn = document.getElementById('uploadBtn');
    const micBtn = document.getElementById('micBtn');
    const archiveBtn = document.getElementById('archiveBtn');

    // Detail Page Elements
    const backBtn = document.getElementById('backBtn');
    const resultImage = document.getElementById('resultImage');
    const loader = document.getElementById('loader');
    const textOverlay = document.getElementById('textOverlay');
    const descriptionText = document.getElementById('descriptionText');
    const loadingHeader = document.getElementById('loadingHeader');
    const loadingHeaderText = loadingHeader.querySelector('h1');
    const loadingText = document.getElementById('loadingText');
    const detailFooter = document.getElementById('detailFooter');
    const audioBtn = document.getElementById('audioBtn');
    const textToggleBtn = document.getElementById('textToggleBtn');
    const saveBtn = document.getElementById('saveBtn');
    const voiceModeLogo = document.getElementById('voiceModeLogo');
    const voiceQueryInfo = document.getElementById('voiceQueryInfo');
    const voiceQueryText = document.getElementById('voiceQueryText');
    const detailMicBtn = document.getElementById('detailMicBtn');

    // Archive Page Elements
    const archiveBackBtn = document.getElementById('archiveBackBtn');
    const archiveGrid = document.getElementById('archiveGrid');
    const emptyArchiveMessage = document.getElementById('emptyArchiveMessage');
    const featuredGallery = document.getElementById('featuredGallery');
    const featuredGrid = document.getElementById('featuredGrid');
    const archiveHeader = document.getElementById('archiveHeader');
    const selectionHeader = document.getElementById('selectionHeader');
    const cancelSelectionBtn = document.getElementById('cancelSelectionBtn');
    const selectionCount = document.getElementById('selectionCount');
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    const profileBtn = document.getElementById('profileBtn');
    const archiveShareBtn = document.getElementById('archiveShareBtn');
    const archiveDeleteBtn = document.getElementById('archiveDeleteBtn');
    const archiveSettingsBtn = document.getElementById('archiveSettingsBtn');

    // Settings Page Elements (User Settings)
    const settingsBackBtn = document.getElementById('settingsBackBtn');
    const userSettingsGuideBtn = document.getElementById('userSettingsGuideBtn');
    const userSettingsQrBtn = document.getElementById('userSettingsQrBtn');
    const userPushToggle = document.getElementById('user-push-toggle');
    const userPushStatusText = document.getElementById('user-push-status-text');
    const userAdminAuthBtn = document.getElementById('userSettingsAdminAuthBtn');

    // User Settings Modals
    const userAdminAuthModal = document.getElementById('user-admin-auth-modal');
    const userAdminPassword = document.getElementById('user-admin-password');
    const userAdminAuthCancelBtn = document.getElementById('userAdminAuthCancelBtn');
    const userAdminAuthConfirmBtn = document.getElementById('userAdminAuthConfirmBtn');
    const userAdminAuthMessage = document.getElementById('user-admin-auth-message');
    const userQrCodeModal = document.getElementById('user-qr-code-modal');
    const userQrCloseBtn = document.getElementById('userQrCloseBtn');
    const userCopyQrButton = document.getElementById('user-copy-qr-button');

    // Notification Modal Elements
    const notificationModal = document.getElementById('notificationModal');
    const notificationList = document.getElementById('notificationList');
    const emptyNotificationMessage = document.getElementById('emptyNotificationMessage');
    const closeNotificationModalBtn = document.getElementById('closeNotificationModalBtn');
    const notificationBadge = document.getElementById('notificationBadge');
    let notificationModalOpenedFromProfile = false;

    // Infographic Modal Elements
    const infographicModal = document.getElementById('infographicModal');
    const infographicImage = document.getElementById('infographicImage');
    const closeInfographicModalBtn = document.getElementById('closeInfographicModalBtn');
    const featureCard1 = document.getElementById('featureCard1');

    // Video Modal Elements
    const videoModal = document.getElementById('videoModal');
    const featureVideo = document.getElementById('featureVideo');
    const closeVideoModalBtn = document.getElementById('closeVideoModalBtn');
    const youtubeModal = document.getElementById('youtubeModal');
    const youtubeIframe = document.getElementById('youtubeIframe');
    const closeYoutubeModalBtn = document.getElementById('closeYoutubeModalBtn');
    const featureCard2 = document.getElementById('featureCard2');

    // Admin Settings Page Elements
    const adminSettingsPage = document.getElementById('adminSettingsPage');
    const adminSettingsBackBtn = document.getElementById('adminSettingsBackBtn');
    const authSection = document.getElementById('authSection');
    const authForm = document.getElementById('authForm');
    const authPassword = document.getElementById('authPassword');
    const adminPromptSettingsSection = document.getElementById('adminPromptSettingsSection');
    const adminImagePromptTextarea = document.getElementById('adminImagePromptTextarea');
    const adminTextPromptTextarea = document.getElementById('adminTextPromptTextarea');
    const adminSavePromptsBtn = document.getElementById('adminSavePromptsBtn');
    const adminResetPromptsBtn = document.getElementById('adminResetPromptsBtn');
    // v1.8: New Demo Elements
    const adminImageSynthesisPromptTextarea = document.getElementById('adminImageSynthesisPromptTextarea');
    const adminGenerateImageBtn = document.getElementById('adminGenerateImageBtn');
    const adminVideoGenerationPromptTextarea = document.getElementById('adminVideoGenerationPromptTextarea');
    const adminGenerateVideoBtn = document.getElementById('adminGenerateVideoBtn');


    // Web Speech API
    // 🎤 2026-01-24: 12월 버전으로 롤백 (설정 없이 브라우저 기본값 사용)
    // ⚠️ 수정금지(승인필요): 2026-03-11 네이티브 브릿지 — 앱에서는 네이티브 음성인식 사용
    const isNativeApp = !!window.ReactNativeWebView;
    // ⚠️ 수정금지(승인필요): 2026-03-14 네이티브 음성 목록 + 디바이스 언어 초기화
    if (isNativeApp && window.ReactNativeWebView) {
        // 네이티브 음성 목록 가져오기 (getVoices → window.__nativeVoices에 저장)
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'getVoices', payload: {} }));
        // 네이티브 디바이스 언어 가져오기 (getLocale → window.__nativeLocale에 저장)
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'getLocale', payload: {} }));
        // ⚠️ 수정금지(승인필요): 2026-03-14 초기화 리스너 — voices+locale 수신 후 자동 제거
        window.addEventListener('nativeResponse', function __initNativeBridge(e) {
            const data = e.detail;
            if (data.type === 'voices') { window.__nativeVoices = data.voices; }
            if (data.type === 'locale') { window.__nativeLocale = data; }
            if (window.__nativeVoices && window.__nativeLocale) {
                window.removeEventListener('nativeResponse', __initNativeBridge);
            }
        });
        // ⚠️ 수정금지(승인필요): 2026-03-14 네이티브 창 닫기 — window.close() 대신 goBack() 사용
        window.__nativeCloseWindow = function() {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'closeWindow', payload: {} }));
        };
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    // ⚠️ 수정금지(승인필요): 2026-03-19 앱/웹 자동 감지 — WebView에서 SpeechRecognition 미지원 (Chromium Issue #40417848)
    // 앱: recognition=null → 기존 안내 메시지 표시 / 웹: 기존 동작 유지
    let recognition = (SpeechRecognition && !window.ReactNativeWebView) ? new SpeechRecognition() : null;
    let isRecognizing = false;

    // 🚨 2026-01-24: AI 중복 호출 방지 플래그 (비용 절감)
    // - 모든 버튼(촬영/마이크/업로드)에서 공유
    // - AI 호출 시작 시 true → 응답 완료/오류 시 false
    // - 버튼은 항상 활성화, 하지만 처리 중이면 클릭 무시
    let isAIProcessing = false;

    let stream = null;
    let isCameraActive = false; // To prevent camera re-initialization

    // TTS State
    const synth = window.speechSynthesis;
    let utteranceQueue = [];
    let isSpeaking = false;
    let isPaused = false;
    let currentlySpeakingElement = null;
    let lastAudioClickTime = 0;

    // ═══════════════════════════════════════════════════════════════
    // 🔊 DB 기반 음성 설정 시스템 (2025-12-07)
    // 목적: 하드코딩 제거, DB에서 음성 우선순위 로드
    // 사용: getVoicePriorityFromDB(langCode) 함수로 조회
    // ═══════════════════════════════════════════════════════════════
    let voiceConfigsCache = null;
    let voiceConfigsLoading = false;

    // 하드코딩 기본값 (오프라인 fallback)
    const DEFAULT_VOICE_PRIORITIES = {
        'ko-KR': { default: ['Microsoft Heami', 'Yuna'] },
        'en-US': { default: ['Samantha', 'Microsoft Zira', 'Google US English', 'English'] },
        'ja-JP': { default: ['Kyoko', 'Microsoft Haruka', 'Google 日本語', 'Japanese'] },
        'zh-CN': { default: ['Ting-Ting', 'Microsoft Huihui', 'Google 普通话', 'Chinese'] },
        'fr-FR': { default: ['Thomas', 'Microsoft Hortense', 'Google français', 'French'] },
        'de-DE': { default: ['Anna', 'Microsoft Hedda', 'Google Deutsch', 'German'] },
        'es-ES': { default: ['Monica', 'Microsoft Helena', 'Google español', 'Spanish'] }
    };

    // DB에서 음성 설정 로드 (앱 시작 시 1회)
    async function loadVoiceConfigsFromDB() {
        if (voiceConfigsCache) return voiceConfigsCache;
        if (voiceConfigsLoading) {
            await new Promise(resolve => setTimeout(resolve, 500));
            return voiceConfigsCache || null;
        }

        voiceConfigsLoading = true;
        try {
            const response = await fetch('/api/voice-configs');
            if (response.ok) {
                const configs = await response.json();
                voiceConfigsCache = {};
                for (const config of configs) {
                    if (!voiceConfigsCache[config.langCode]) {
                        voiceConfigsCache[config.langCode] = {};
                    }
                    voiceConfigsCache[config.langCode][config.platform] = {
                        priorities: config.voicePriorities,
                        excludeVoices: config.excludeVoices || []
                    };
                }
            }
        } catch (error) {
        }
        voiceConfigsLoading = false;
        return voiceConfigsCache;
    }

    // 플랫폼 감지 (ios, android, windows, default)
    function detectPlatform() {
        const ua = navigator.userAgent;
        if (/iPhone|iPad|iPod|Mac/.test(ua)) return 'ios';
        if (/Android/.test(ua)) return 'android';
        if (/Windows/.test(ua)) return 'windows';
        return 'default';
    }

    // DB 기반 음성 우선순위 가져오기
    function getVoicePriorityFromDB(langCode) {
        const platform = detectPlatform();

        // DB 캐시 확인
        if (voiceConfigsCache && voiceConfigsCache[langCode]) {
            const config = voiceConfigsCache[langCode][platform] || voiceConfigsCache[langCode]['default'];
            if (config) {
                return { priorities: config.priorities, excludeVoices: config.excludeVoices };
            }
        }

        // 기본값 사용 (오프라인/로드 실패)
        const fallback = DEFAULT_VOICE_PRIORITIES[langCode];
        if (fallback) {
            const priorities = fallback[platform] || fallback['default'] || fallback[Object.keys(fallback)[0]];
            return { priorities, excludeVoices: [] };
        }

        return { priorities: [], excludeVoices: [] };
    }

    // 앱 시작 시 음성 설정 로드
    loadVoiceConfigsFromDB();

    // ═══════════════════════════════════════════════════════════════
    // 🌐 구글 번역 완료 대기 시스템 (2025-12-06)
    // 목적: 모든 TTS는 구글 번역 완료 후에 재생
    // 패턴: MutationObserver로 body의 translated-ltr/rtl 클래스 감지
    // ═══════════════════════════════════════════════════════════════
    let translationState = {
        complete: false,
        observer: null,
        timeoutId: null
    };

    function initTranslationWatcher() {
        const userLang = localStorage.getItem('appLanguage') || 'ko';

        if (userLang === 'ko') {
            translationState.complete = true;
            return;
        }

        const hasTranslated = document.body.classList.contains('translated-ltr') ||
            document.body.classList.contains('translated-rtl');
        if (hasTranslated) {
            translationState.complete = true;
            return;
        }

        translationState.complete = false;
        translationState.observer = new MutationObserver((mutations) => {
            const hasTranslatedNow = document.body.classList.contains('translated-ltr') ||
                document.body.classList.contains('translated-rtl');
            if (hasTranslatedNow) {
                translationState.complete = true;
                translationState.observer?.disconnect();
                window.dispatchEvent(new CustomEvent('appTranslationComplete'));
            }
        });

        translationState.observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['class']
        });

        translationState.timeoutId = setTimeout(() => {
            if (!translationState.complete) {
                translationState.complete = true;
                translationState.observer?.disconnect();
                window.dispatchEvent(new CustomEvent('appTranslationComplete', { detail: { timeout: true } }));
            }
        }, 3000);
    }

    async function waitForTranslation() {
        const userLang = localStorage.getItem('appLanguage') || 'ko';
        if (userLang === 'ko' || translationState.complete) {
            return;
        }

        await new Promise(resolve => {
            const handler = () => {
                window.removeEventListener('appTranslationComplete', handler);
                resolve();
            };
            window.addEventListener('appTranslationComplete', handler);
            setTimeout(resolve, 3500);
        });
    }

    initTranslationWatcher();

    // ═══════════════════════════════════════════════════════════════
    // 🌐 동적 콘텐츠 강제 재번역 함수 (2025-12-24)
    // 문제: Google Translate는 동적으로 추가된 요소를 자동 번역하지 않음
    // 해결: 언어 드롭다운을 토글하여 강제로 재번역 트리거
    // ═══════════════════════════════════════════════════════════════
    let retranslationPending = false;

    async function retranslateNewContent() {
        // ⚠️ 수정금지(승인필요): 2026-03-12 네이티브 앱은 Google Translate 미사용 → 900ms 대기 스킵
        if (isNativeApp) return;
        // 🌐 2025-12-24: userLang 체크 제거 - Google Translate 드롭다운 활성화 여부만 확인
        // 콘텐츠가 외국어이고 앱 언어가 한국어여도 번역이 필요함
        return new Promise((resolve) => {
            const selectElement = document.querySelector('.goog-te-combo');

            if (!selectElement || !selectElement.value) {
                resolve();
                return;
            }

            const currentLang = selectElement.value;
            retranslationPending = true;

            // 1. 원래 언어로 리셋
            selectElement.value = '';
            selectElement.dispatchEvent(new Event('change'));

            // 2. 잠시 후 다시 번역 언어로 변경
            setTimeout(() => {
                selectElement.value = currentLang;
                selectElement.dispatchEvent(new Event('change'));

                // 3. 번역 완료 대기 (MutationObserver 또는 타임아웃)
                setTimeout(() => {
                    retranslationPending = false;
                    window.dispatchEvent(new CustomEvent('retranslationComplete'));
                    resolve();
                }, 800);
            }, 100);
        });
    }

    async function waitForRetranslation() {
        if (!retranslationPending) return;

        await new Promise(resolve => {
            const handler = () => {
                window.removeEventListener('retranslationComplete', handler);
                resolve();
            };
            window.addEventListener('retranslationComplete', handler);
            setTimeout(resolve, 2000); // 최대 2초 대기
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // 🌐 사용자 언어 감지 (localStorage 기반)
    // 목적: 추천모음 클릭/공유 시 해당 언어로 공유페이지 자동 번역
    // 2026-01-22: DB 동기화 제거 → localStorage만 사용 (버그 해결)
    // ═══════════════════════════════════════════════════════════════

    function getCurrentUserLang() {
        // 1. localStorage 확인 (랜딩페이지에서 저장됨)
        const storedLang = localStorage.getItem('appLanguage');
        if (storedLang && storedLang !== 'ko') {
            return storedLang;
        }

        // 2. 기본값 한국어
        return 'ko';
    }

    // URL에 언어 파라미터 추가 (한국어 제외)
    function addLangToUrl(url) {
        const lang = getCurrentUserLang();
        if (lang === 'ko') return url; // 한국어면 그대로
        return `${url}?lang=${lang}`;
    }

    // ═══════════════════════════════════════════════════════════════
    // 🚀 전역 디바운스 시스템 (2025-10-05)
    // 목적: 버튼 버벅거림 완전 제거 - 손님 30명 테스트 대비
    // ═══════════════════════════════════════════════════════════════
    const buttonDebounceMap = new Map();
    function debounceClick(buttonId, callback, delay = 500) {
        const now = Date.now();
        const lastClick = buttonDebounceMap.get(buttonId) || 0;

        if (now - lastClick < delay) {
            return false; // 클릭 무시
        }

        buttonDebounceMap.set(buttonId, now);
        callback();
        return true;
    }

    // App State
    let currentContent = { imageDataUrl: null, description: '' };
    let isSelectionMode = false;

    // ═══════════════════════════════════════════════════════════════
    // 🔒 사용량 제한 시스템 (2025-11-27)
    // 목적: 비가입자 횟수 제한 + 가입자 크레딧 체크
    // ═══════════════════════════════════════════════════════════════
    const USAGE_LIMITS = {
        GUEST_DETAIL_LIMIT: 3,      // 비가입자 AI 응답 생성 제한
        GUEST_SHARE_LIMIT: 999999,  // 공유페이지 무제한 (홍보 채널)
        DETAIL_CREDIT_COST: 2,      // AI 응답 크레딧 비용
        SHARE_CREDIT_COST: 0        // 공유페이지 무료
    };

    function getGuestUsage() {
        return {
            detail: parseInt(localStorage.getItem('guestDetailUsage') || '0'),
            share: parseInt(localStorage.getItem('guestShareUsage') || '0')
        };
    }

    function incrementGuestUsage(type) {
        const key = type === 'detail' ? 'guestDetailUsage' : 'guestShareUsage';
        const current = parseInt(localStorage.getItem(key) || '0');
        localStorage.setItem(key, (current + 1).toString());
    }

    function isAdmin() {
        return localStorage.getItem('adminAuthenticated') === 'true';
    }

    // 🔧 앱 시작 시 관리자 상태 서버 동기화 (2025-12-16)
    // 서버 인증 없으면 localStorage 관리자 상태 자동 정리
    (async function syncAdminState() {
        try {
            const response = await fetch('/api/auth/user', { credentials: 'include' });
            if (!response.ok) {
                // 서버 인증 없음 → localStorage 정리
                localStorage.removeItem('adminAuthenticated');
                localStorage.removeItem('adminAuthTime');
                localStorage.removeItem('adminPassword');
            }
        } catch (e) {
            // 에러 시에도 정리
            localStorage.removeItem('adminAuthenticated');
        }
    })();

    async function checkUserAuth() {
        try {
            const response = await fetch('/api/auth/user', { credentials: 'include' });
            if (response.ok) {
                const data = await response.json();
                let user = null;
                if (data && (data.id || data.email)) {
                    user = data;
                } else if (data.authenticated && data.user) {
                    user = data.user;
                }
                if (user) {
                    try {
                        const cachedData = JSON.stringify({
                            id: user.id,
                            name: user.name || user.displayName,
                            email: user.email,
                            provider: user.provider
                        });
                        localStorage.setItem('cachedUser', cachedData);
                        // ⚠️ 수정금지(승인필요): 2026-03-11 네이티브 브릿지 — 인증 정보를 네이티브 암호화 저장소에도 저장 (캐시 소실 방지)
                        if (window.ReactNativeWebView) {
                            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'secureStore', payload: { action: 'set', key: 'cachedUser', value: cachedData } }));
                        }
                    } catch (e) { }
                    return user;
                }
                localStorage.removeItem('cachedUser');
                return null;
            }
            // ⚠️ 수정금지(승인필요): 2026-03-20 서버 401(미인증) → cachedUser 삭제. 세션 무효 = 캐시도 무효
            localStorage.removeItem('cachedUser');
            return null;
        } catch (error) {
            console.error('Auth check error:', error);
            const cached = localStorage.getItem('cachedUser');
            if (cached) {
                try { return JSON.parse(cached); } catch (e) { }
            }
            return null;
        }
    }

    async function checkCredits() {
        try {
            const response = await fetch('/api/profile/credits', { credentials: 'include' });
            if (response.ok) {
                const data = await response.json();
                return data.credits || 0;
            }
            return 0;
        } catch (error) {
            console.error('Credits check error:', error);
            return 0;
        }
    }

    function showAuthModalForUsage() {
        const authModal = document.getElementById('authModal');
        if (authModal) {
            authModal.classList.remove('hidden');
            authModal.classList.remove('pointer-events-none');
            authModal.classList.add('pointer-events-auto');
        }
        // 🎁 2026-01-07: 프로모션 메시지 (기존: 10 크레딧)
        showToast('무료 체험이 끝났습니다. 로그인하면 140 크레딧을 드려요! 🎁');
    }

    // ⚠️ 수정금지(승인필요): 2026-03-14 iOS 네이티브 앱에서는 웹 브라우저 충전 안내 메시지 표시
    function showChargeModal() {
        if (isNativeApp && detectPlatform() === 'ios') {
            showToast('크레딧이 부족합니다. 웹 브라우저에서 충전해주세요.');
        } else {
            showToast('크레딧이 부족합니다. 프로필에서 충전해주세요.');
            setTimeout(() => {
                openPageOverlay('/profile.html');
            }, 1500);
        }
    }

    /**
     * 사용량 제한 체크 (AI 호출 전 필수)
     * @param {string} type - 'detail' | 'share'
     * @returns {Promise<boolean>} - true: 진행 가능, false: 차단
     * 
     * ⚠️ 2025-12-16: 관리자 체크를 서버 기반으로 변경
     * - localStorage isAdmin() 제거 → user.isAdmin 서버 응답 사용
     * - 이유: 로그인 시 localStorage 관리자 상태가 잘못 남아있는 버그 수정
     */
    async function checkUsageLimit(type = 'detail') {
        // 🎁 2026-01-07: 프로모션 기간 - 사용량 제한 임시 비활성화
        // 프로모션 종료 후 아래 return true를 삭제하면 원래대로 복원됨
        return true;

        /* ========== 🔒 프로모션 종료 후 아래 주석 해제 ==========
        // 1. 사용자 인증 상태 확인 (서버 기반)
        const user = await checkUserAuth();

        // 2. 서버에서 관리자로 확인되면 무제한
        if (user && user.isAdmin) {
            return true;
        }

        if (!user) {
            // 3. 비가입자: localStorage 횟수 체크
            const usage = getGuestUsage();
            const limit = type === 'detail' ? USAGE_LIMITS.GUEST_DETAIL_LIMIT : USAGE_LIMITS.GUEST_SHARE_LIMIT;
            const current = type === 'detail' ? usage.detail : usage.share;

            if (current >= limit) {
                showAuthModalForUsage();
                return false;
            }

            // 횟수 증가는 AI 호출 성공 후에 해야 하므로 여기서는 안 함
            return true;
        }

        // 4. 가입자: 크레딧 체크
        const credits = await checkCredits();
        const cost = type === 'detail' ? USAGE_LIMITS.DETAIL_CREDIT_COST : USAGE_LIMITS.SHARE_CREDIT_COST;

        if (credits < cost) {
            showChargeModal();
            return false;
        }

        return true;
        ========== 프로모션 종료 후 위 주석 해제 ========== */
    }

    /**
     * AI 호출 후 사용량 차감
     * @param {string} type - 'detail' | 'share'
     * 
     * ⚠️ 2025-12-16: 가입자 크레딧 차감은 서버에서 처리 (이중 차감 방지)
     * - /api/gemini: AI 호출 시 -2 크레딧 (서버에서 직접 차감)
     * - /api/share/create: 공유페이지 생성 시 -5 +1 크레딧 (서버에서 직접 차감)
     */
    async function deductUsage(type = 'detail') {
        const user = await checkUserAuth();

        // 서버에서 관리자로 확인되면 차감 안 함
        if (user && user.isAdmin) return;

        if (!user) {
            // 비가입자: 횟수 증가 (localStorage)
            incrementGuestUsage(type);
            const usage = getGuestUsage();
        }
        // ✅ 가입자 크레딧 차감은 서버에서 자동 처리됨 (이중 차감 방지)
    }
    let selectedItemIds = []; // ✅ Array로 변경 (클릭 순서 보존!)

    // ═══════════════════════════════════════════════════════════════
    // 🗺️ Google Maps 상태 (2025-10-26)
    // ═══════════════════════════════════════════════════════════════
    let googleMapsLoaded = false;
    let googleMapsApiKey = '';
    let geocoder = null;
    let cameFromArchive = false;

    // ═══════════════════════════════════════════════════════════════
    // 🗺️ Google Maps API 동적 로딩 (2025-10-26)
    // ═══════════════════════════════════════════════════════════════

    // API 키 가져오기
    async function loadGoogleMapsApiKey() {
        if (googleMapsApiKey) return googleMapsApiKey;

        try {
            const response = await fetch('/api/config');
            const config = await response.json();
            googleMapsApiKey = config.googleMapsApiKey;
            return googleMapsApiKey;
        } catch (error) {
            console.error('Google Maps API 키 로드 실패:', error);
            return '';
        }
    }

    // Google Maps API 동적 로드
    function loadGoogleMapsAPI(callback) {
        if (googleMapsLoaded) {
            if (callback) callback();
            return;
        }

        loadGoogleMapsApiKey().then(apiKey => {
            if (!apiKey) {
                console.error('Google Maps API 키가 없습니다.');
                return;
            }

            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
            script.async = true;
            script.defer = true;
            script.onload = () => {
                googleMapsLoaded = true;
                geocoder = new google.maps.Geocoder();
                if (callback) callback();
            };
            script.onerror = () => {
                console.error('Google Maps API 로드 실패');
            };
            document.head.appendChild(script);
        });
    }

    // 📍 주변 유명 랜드마크 찾기 (GPS → "에펠탑", "루브르 박물관" 등)
    async function getNearbyLandmark(lat, lng) {

        if (!googleMapsLoaded || !window.google) {
            return null;
        }

        return new Promise((resolve) => {
            // Places API Nearby Search 사용
            const map = new google.maps.Map(document.createElement('div'));
            const service = new google.maps.places.PlacesService(map);
            const location = new google.maps.LatLng(lat, lng);

            const request = {
                location: location,
                radius: 100,
                rankBy: google.maps.places.RankBy.PROMINENCE
            };

            service.nearbySearch(request, (places, status) => {

                if (status === google.maps.places.PlacesServiceStatus.OK && places && places.length > 0) {
                    // 랜드마크/관광지 우선 검색
                    const nearbyPlace = places.find(place =>
                        place.types.includes('tourist_attraction') ||
                        place.types.includes('museum') ||
                        place.types.includes('church') ||
                        place.types.includes('park') ||
                        place.types.includes('lodging') ||
                        place.types.includes('point_of_interest')
                    ) || places[0];

                    const placeName = nearbyPlace.name;
                    resolve(placeName);
                } else {
                    // Places API 실패 → Geocoding Fallback

                    if (!geocoder) {
                        resolve(null);
                        return;
                    }

                    geocoder.geocode({ location: { lat, lng } }, (geoResults, geoStatus) => {
                        if (geoStatus === 'OK' && geoResults[0]) {
                            const city = geoResults[0].address_components.find(
                                c => c.types.includes('locality')
                            )?.long_name || geoResults[0].formatted_address.split(',')[0];
                            resolve(city);
                        } else {
                            resolve(null);
                        }
                    });
                }
            });
        });
    }

    // --- IndexedDB Setup ---
    const DB_NAME = 'TravelGuideDB';
    const DB_VERSION = 2; // Updated for shareLinks store
    const STORE_NAME = 'archive';
    const SHARE_LINKS_STORE = 'shareLinks';
    let db;

    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = (event) => reject("IndexedDB error: " + event.target.errorCode);
            request.onsuccess = (event) => {
                db = event.target.result;
                resolve(db);
            };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create archive store if not exists
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }

                // Create shareLinks store for version 2
                if (!db.objectStoreNames.contains(SHARE_LINKS_STORE)) {
                    const shareStore = db.createObjectStore(SHARE_LINKS_STORE, { keyPath: 'id' });
                    shareStore.createIndex('featured', 'featured', { unique: false });
                }
            };
        });
    }

    function addItem(item) {
        return new Promise(async (resolve, reject) => {
            if (!db) return reject("DB not open");

            // Generate a unique ID for both IndexedDB and server usage.
            const uniqueId = item.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const itemWithId = { ...item, id: uniqueId };

            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.add(itemWithId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject("Error adding item: " + event.target.error);
        });
    }

    function getAllItems() {
        return new Promise((resolve, reject) => {
            if (!db) return reject("DB not open");
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result.reverse()); // Show newest first
            request.onerror = (event) => reject("Error getting items: " + event.target.error);
        });
    }

    function deleteItems(ids) {
        return new Promise((resolve, reject) => {
            if (!db) return reject("DB not open");
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            let deletePromises = [];
            ids.forEach(id => {
                deletePromises.push(new Promise((res, rej) => {
                    const request = store.delete(id);
                    request.onsuccess = res;
                    request.onerror = rej;
                }));
            });
            Promise.all(deletePromises).then(resolve).catch(reject);
        });
    }

    // --- ShareLinks Functions ---
    function addShareLink(shareLink) {
        return new Promise((resolve, reject) => {
            if (!db) return reject("DB not open");
            const transaction = db.transaction([SHARE_LINKS_STORE], 'readwrite');
            const store = transaction.objectStore(SHARE_LINKS_STORE);
            const request = store.add(shareLink);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject("Error adding shareLink: " + event.target.error);
        });
    }

    function getFeaturedShareLinks() {
        return new Promise((resolve, reject) => {
            if (!db) return reject("DB not open");
            const transaction = db.transaction([SHARE_LINKS_STORE], 'readonly');
            const store = transaction.objectStore(SHARE_LINKS_STORE);
            const index = store.index('featured');
            const request = index.getAll(true); // Get featured=true items
            request.onsuccess = () => {
                const items = request.result.sort((a, b) => b.timestamp - a.timestamp).slice(0, 3);
                resolve(items);
            };
            request.onerror = (event) => reject("Error getting featured shareLinks: " + event.target.error);
        });
    }

    /**
     * ⚠️ **수정금지** - 2025-10-03 3시간 디버깅 끝에 완성
     * 
     * 🌐 공유 HTML 생성 함수 (독립적인 PWA 홈페이지)
     * 
     * 구조: 앱과 동일한 UX/UI (public/index.html #detailPage 복사)
     * - 갤러리: 2열 그리드 썸네일 (모바일 최적화)
     * - 상세: 전체 화면 배경 이미지 + 텍스트 오버레이
     * - z-index 계층: background(1) → ui-layer(10) → header(20) → content(25) → footer(30)
     * - position: header-safe-area는 반드시 relative (버튼 클릭 위해 필수!)
     * - 텍스트 자동 하이라이트: onboundary 이벤트로 문장 단위 강조
     * 
     * 핵심 수정사항:
     * 1. .header-safe-area에 position: relative 추가 (버튼 클릭 문제 해결)
     * 2. .content-safe-area에 z-index: 25 추가 (텍스트 표시 문제 해결)
     * 3. playAudio에 onboundary 하이라이트 기능 추가
     * 4. 텍스트 초기 표시 로직: 음성과 동시에 표시 (hidden 제거)
     */
    function generateShareHTML(title, sender, location, date, guideItems, appOrigin, isFeatured = false, language = 'ko') {
        // HTML escape 함수 (XSS 방지 및 파싱 에러 방지)
        const escapeHTML = (str) => {
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };

        // 갤러리 그리드 아이템 생성 (2열)
        const galleryItemsHTML = guideItems.map((item, index) => `
            <div class="gallery-item" data-id="${index}">
                <img src="${item.imageDataUrl || ''}" alt="가이드 ${index + 1}" loading="lazy">
                <p>가이드 ${index + 1}</p>
            </div>
        `).join('');

        // 데이터 JSON (이미지 + 설명 + 언어)
        const dataJSON = JSON.stringify({
            language: language, // 사용자 선택 언어 (TTS용)
            items: guideItems.map((item, index) => ({
                id: index,
                imageDataUrl: item.imageDataUrl || '',
                description: item.description || ''
            }))
        });

        // UTF-8 안전한 base64 인코딩
        const utf8ToBase64 = (str) => {
            return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
                return String.fromCharCode('0x' + p1);
            }));
        };

        return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>${escapeHTML(title)} - 손안에 가이드</title>
    <link rel="manifest" href="data:application/json;base64,${utf8ToBase64(JSON.stringify({
            name: title,
            short_name: title,
            start_url: '.',
            display: 'standalone',
            theme_color: '#4285F4'
        }))}">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            background-color: #f0f2f5;
            overflow-x: hidden;
        }
        .hidden { display: none !important; }
        
        /* 앱과 100% 동일한 CSS (복사) */
        .full-screen-bg { 
            position: fixed; 
            top: 0; 
            left: 0; 
            width: 100vw; 
            height: 100vh; 
            object-fit: cover; 
            z-index: 1; 
        }
        .ui-layer { 
            position: fixed; 
            top: 0; 
            left: 0; 
            width: 100%; 
            height: 100%; 
            z-index: 10; 
            display: flex; 
            flex-direction: column;
        }
        .header-safe-area { 
            position: relative;
            width: 100%; 
            height: 80px; 
            flex-shrink: 0; 
            z-index: 20;
            display: flex; 
            align-items: center; 
            justify-content: center; 
            padding: 0 1rem;
        }
        .content-safe-area { 
            flex: 1; 
            overflow-y: auto; 
            -webkit-overflow-scrolling: touch; 
            background: transparent;
            z-index: 25;
        }
        .footer-safe-area { 
            width: 100%; 
            height: 100px; 
            flex-shrink: 0; 
            z-index: 30; 
            display: flex; 
            justify-content: space-around; 
            align-items: center; 
            padding: 0 1rem;
        }
        
        /* 텍스트 오버레이 */
        .text-content {
            padding: 2rem 1.5rem;
            line-height: 1.8;
            word-break: keep-all;
            overflow-wrap: break-word;
        }
        .readable-on-image {
            color: white;
            text-shadow: 0px 2px 8px rgba(0, 0, 0, 0.95);
        }
        
        /* 버튼 공통 스타일 (앱과 동일) */
        .interactive-btn {
            transition: transform 0.1s ease;
            cursor: pointer;
            border: none;
        }
        .interactive-btn:active {
            transform: scale(0.95);
        }
        
        /* 헤더 (메타데이터) */
        .header {
            padding: 20px;
            background-color: #4285F4; /* Gemini Blue - 앱 통일 */
            color: #fff;
            text-align: center;
        }
        .header h1 {
            margin: 0 0 15px 0;
            font-size: 28px;
        }
        .metadata {
            font-size: 14px;
            opacity: 0.9;
        }
        .metadata p {
            margin: 5px 0;
        }
        
        /* 갤러리 뷰 */
        #gallery-view {
            padding: 15px;
            max-width: 1200px;
            margin: 0 auto;
        }
        .gallery-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
        }
        
        /* 반응형: 태블릿/노트북/PC (768px 이상) */
        @media (min-width: 768px) {
            .gallery-grid {
                grid-template-columns: repeat(3, 1fr);
                gap: 20px;
            }
            #gallery-view {
                padding: 30px;
            }
        }
        
        .gallery-item {
            cursor: pointer;
            text-align: center;
        }
        .gallery-item img {
            width: 100%;
            height: 150px;
            object-fit: cover;
            border-radius: 8px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.1);
            transition: transform 0.2s, box-shadow 0.2s;
            background-color: #e9e9e9;
        }
        .gallery-item:hover img {
            transform: scale(1.05);
            box-shadow: 0 6px 15px rgba(0,0,0,0.2);
        }
        .gallery-item p {
            margin: 8px 0 0;
            font-weight: 700;
            color: #333;
            font-size: 14px;
        }
        
        /* 갤러리 하단 버튼 */
        .gallery-footer {
            text-align: center;
            padding: 30px 15px;
        }
        .app-button {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: #4285F4;
            color: white;
            padding: 16px 32px;
            border-radius: 12px;
            text-decoration: none;
            font-weight: 700;
            font-size: 18px;
            box-shadow: 0 4px 12px rgba(66, 133, 244, 0.3);
            transition: all 0.3s;
        }
        .app-button:hover {
            background: #3367D6;
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(66, 133, 244, 0.4);
        }
    </style>
</head>
<body>
    <!-- 카카오톡/인앱 브라우저 → Chrome 자동 리다이렉트 (2025-12-02) -->
    <!-- 1단계: Intent URL로 Chrome 시도, 2단계: 실패 시 fallback URL로 자동 열림 -->
    <script>
        (function() {
            var ua = navigator.userAgent.toLowerCase();
            var isInApp = ua.indexOf('kakaotalk') > -1 || ua.indexOf('naver') > -1 || ua.indexOf('instagram') > -1 || ua.indexOf('fb') > -1 || ua.indexOf('facebook') > -1;
            if (isInApp && /android/i.test(ua)) {
                var currentUrl = location.href;
                var url = currentUrl.replace(/^https?:\\/\\//, '');
                location.href = 'intent://' + url + '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent(currentUrl) + ';end';
            }
        })();
    </script>
    
    <!-- ❌ X 닫기 버튼 (우측 상단, 최상위 z-index) -->
    <button id="closeWindowBtn" onclick="window.close()" title="페이지 닫기" style="position: fixed; top: 1rem; right: 1rem; z-index: 10000; width: 3rem; height: 3rem; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(8px); border-radius: 50%; color: #4285F4; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3); border: none;">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
    </button>
    
    <!-- 헤더 (메타데이터) -->
    <div class="header">
        <h1>${escapeHTML(title)}</h1>
        <div class="metadata">
            <p>👤 ${escapeHTML(sender)} 님이 보냄</p>
            <p>📍 ${escapeHTML(location)}</p>
            <p>📅 ${escapeHTML(date)}</p>
        </div>
    </div>
    
    <!-- 갤러리 뷰 -->
    <div id="gallery-view">
        <!-- ⚠️ 수정금지(승인필요): 2026-03-08 ← 리턴 버튼 제거, X 닫기(closeWindowBtn)만 유지 -->
        <div class="gallery-grid">
            ${galleryItemsHTML}
        </div>
        <div class="gallery-footer">
            <a href="${appOrigin}" class="app-button" id="home-button">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width: 24px; height: 24px;">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                손안에 가이드 시작하기
            </a>
        </div>
    </div>
    
    <!-- 상세 뷰 (앱과 100% 동일한 구조) -->
    <div id="detail-view" class="ui-layer hidden">
        <img id="detail-bg" src="" class="full-screen-bg">
        <header class="header-safe-area">
            <button id="detail-back" class="interactive-btn" style="width: 3rem; height: 3rem; display: flex; align-items: center; justify-content: center; border-radius: 9999px; background: rgba(0,0,0,0.6); backdrop-filter: blur(12px); color: #4285F4; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); position: absolute; top: 50%; left: 1rem; transform: translateY(-50%);" aria-label="뒤로가기">
                <svg xmlns="http://www.w3.org/2000/svg" style="width: 1.5rem; height: 1.5rem;" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                </svg>
            </button>
        </header>
        <div class="content-safe-area">
            <div id="detail-text" class="text-content hidden">
                <p id="detail-description" class="readable-on-image" style="font-size: 1.25rem; line-height: 1.75rem;"></p>
            </div>
        </div>
        <footer id="detail-footer" class="footer-safe-area hidden" style="background: transparent;">
            <button id="detail-audio" class="interactive-btn" style="width: 4rem; height: 4rem; display: flex; align-items: center; justify-content: center; border-radius: 9999px; background: rgba(0,0,0,0.6); backdrop-filter: blur(12px); color: #4285F4; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);" aria-label="오디오 재생">
                <svg id="play-icon" xmlns="http://www.w3.org/2000/svg" style="width: 2rem; height: 2rem;" viewBox="0 0 24 24" fill="currentColor">
                    <path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.648c1.295.748 1.295 2.538 0 3.286L7.279 20.99c-1.25.717-2.779-.217-2.779-1.643V5.653z" clip-rule="evenodd" />
                </svg>
                <svg id="pause-icon" xmlns="http://www.w3.org/2000/svg" style="width: 2rem; height: 2rem; display: none;" viewBox="0 0 24 24" fill="currentColor">
                    <path fill-rule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z" clip-rule="evenodd" />
                </svg>
            </button>
            <button id="text-toggle" class="interactive-btn" style="width: 4rem; height: 4rem; display: flex; align-items: center; justify-content: center; border-radius: 9999px; background: rgba(0,0,0,0.6); backdrop-filter: blur(12px); color: #4285F4; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);" aria-label="해설 읽기">
                <svg xmlns="http://www.w3.org/2000/svg" style="width: 2rem; height: 2rem;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            </button>
            <a href="${appOrigin}" id="detail-home" class="interactive-btn" style="width: 4rem; height: 4rem; display: flex; align-items: center; justify-content: center; border-radius: 9999px; background: rgba(0,0,0,0.6); backdrop-filter: blur(12px); color: #4285F4; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); text-decoration: none;" aria-label="앱으로 이동">
                <svg xmlns="http://www.w3.org/2000/svg" style="width: 2rem; height: 2rem;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
            </a>
        </footer>
    </div>
    
    <!-- 데이터 저장 -->
    <script id="app-data" type="application/json">${dataJSON}</script>
    
    <script>
        // 데이터 로드
        const appData = JSON.parse(document.getElementById('app-data').textContent);
        const galleryView = document.getElementById('gallery-view');
        const detailView = document.getElementById('detail-view');
        const header = document.querySelector('.header');
        
        // Web Speech API
        const synth = window.speechSynthesis;
        let voices = [];
        let currentUtterance = null;
        
        // 언어 코드 매핑
        const langCodeMap = {
            'ko': 'ko-KR',
            'en': 'en-US',
            'ja': 'ja-JP',
            'zh-CN': 'zh-CN',
            'fr': 'fr-FR',
            'de': 'de-DE',
            'es': 'es-ES'
        };
        
        // 선택 언어에 맞는 음성 찾기 (플랫폼별 최적화)
        function getVoiceForLanguage(userLang, allVoices) {
            const langCode = langCodeMap[userLang] || 'ko-KR';
            
            // 플랫폼별 최적 음성 우선순위 (2025-12-07: 한국어 iOS/Android 분기)
            const isIOS = /iPhone|iPad|iPod|Mac/.test(navigator.userAgent);
            const voicePriority = {
                'ko-KR': ['Microsoft Heami', 'Yuna'],
                'en-US': ['Samantha', 'Microsoft Zira', 'Google US English', 'English'],
                'ja-JP': ['Kyoko', 'Microsoft Haruka', 'Google 日本語', 'Japanese'],
                'zh-CN': ['Ting-Ting', 'Microsoft Huihui', 'Google 普通话', 'Chinese'],
                'fr-FR': ['Thomas', 'Microsoft Hortense', 'Google français', 'French'],
                'de-DE': ['Anna', 'Microsoft Hedda', 'Google Deutsch', 'German'],
                'es-ES': ['Monica', 'Microsoft Helena', 'Google español', 'Spanish']
            };
            
            let targetVoice = null;
            
            // 우선순위대로 음성 찾기
            const priorities = voicePriority[langCode] || [];
            for (const voiceName of priorities) {
                targetVoice = allVoices.find(v => v.name.includes(voiceName));
                if (targetVoice) break;
            }
            
            // 우선순위에 없으면 언어 코드로 찾기 (Android underscore 형식 대응)
            if (!targetVoice) {
                const langPrefix = langCode.substring(0, 2);
                targetVoice = allVoices.find(v => 
                    v.lang.replace('_', '-').startsWith(langPrefix) && 
                    v.lang.replace('_', '-').includes(langCode.substring(3))
                );
            }
            
            // 그래도 없으면 언어 앞 2자리만 매칭
            if (!targetVoice) {
                targetVoice = allVoices.find(v => v.lang.replace('_', '-').startsWith(langCode.substring(0, 2)));
            }
            
            return targetVoice;
        }
        
        function populateVoiceList() {
            const userLang = localStorage.getItem('appLanguage') || 'ko'; // 🌐 현재 선택 언어 우선
            // ⚠️ 수정금지(승인필요): 2026-03-14 네이티브 음성 목록 우선 — 앱에서는 expo-speech 음성 사용
            const allVoices = (isNativeApp && window.__nativeVoices) ? window.__nativeVoices : synth.getVoices();
            
            // 선택 언어에 맞는 음성 필터링
            const langCode = langCodeMap[userLang] || 'ko-KR';
            voices = allVoices.filter(v => v.lang.startsWith(langCode.substring(0, 2)));
            
        }
        
        function stopAudio() {
            // ⚠️ 수정금지(승인필요): 2026-03-12 네이티브 TTS 중지
            if (isNativeApp && window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'stopSpeech', payload: {} }));
            }
            if (synth.speaking) {
                synth.pause();
                synth.cancel();
            }
            const playIcon = document.getElementById('play-icon');
            const pauseIcon = document.getElementById('pause-icon');
            if (playIcon) playIcon.style.display = 'block';
            if (pauseIcon) pauseIcon.style.display = 'none';
        }
        
        async function playAudio(text) {
            stopAudio();
            
            // ✅ 2025-01-21: 구글 번역 대기 삭제
            // AI가 이미 사용자 선택 언어로 텍스트 생성하므로 번역 불필요
            // waitForTranslation() 호출 시 iOS autoplay 정책 위반 → TTS 실패
            
            // ⚠️ **핵심 로직 - 절대 수정 금지!** (2025-10-03 치명적 버그 해결)
            // 
            // 문제: HTML 내부 JavaScript에서 정규식 /<br\s*\/?>/gi 사용 시
            //       HTML 파서가 < > 를 &lt; &gt; 로 변환하여 JavaScript 파싱 에러 발생
            //       → "Uncaught SyntaxError: Unexpected token '&'" 
            //
            // 해결: new RegExp() 방식으로 HTML 파서와 100% 분리
            //       - 안전성: HTML escape 문제 원천 차단
            //       - 호환성: 모든 브라우저 지원
            //       - 영구성: 앞으로 절대 깨지지 않음
            //
            // 영향: 27개 기존 공유 페이지 DB 일괄 업데이트 완료 (2025-10-03)
            const cleanText = text.replace(new RegExp('<br\\s*/?>', 'gi'), ' ');
            
            // 문장 분리 및 하이라이트 준비
            const sentences = cleanText.match(/[^.!?]+[.!?]+/g) || [cleanText];
            const textElement = document.getElementById('detail-description');
            
            // 원본 텍스트 저장
            const originalText = cleanText;
            
            currentUtterance = new SpeechSynthesisUtterance(cleanText);
            
            // 선택 언어에 맞는 음성 자동 선택 (🌐 현재 선택 언어 우선)
            const userLang = localStorage.getItem('appLanguage') || 'ko';
            const langCode = langCodeMap[userLang] || 'ko-KR';
            
            // ⭐ 한국어 하드코딩 (iOS: Yuna/Sora, Android: 유나/소라, Windows: Heami)
            if (userLang === 'ko') {
                const allVoices = synth.getVoices();
                const koVoices = allVoices.filter(v => v.lang.startsWith('ko'));
                // Yuna → Sora → 유나 → 소라 → Heami → 첫 번째 한국어 음성
                const targetVoice = koVoices.find(v => v.name.includes('Yuna'))
                                 || koVoices.find(v => v.name.includes('Sora'))
                                 || koVoices.find(v => v.name.includes('유나'))
                                 || koVoices.find(v => v.name.includes('소라'))
                                 || koVoices.find(v => v.name.includes('Heami'))
                                 || koVoices[0];
                currentUtterance.voice = targetVoice;
                currentUtterance.lang = 'ko-KR';
                currentUtterance.rate = 1.0;
            } else {
                // 다른 6개 언어는 기존 DB 기반 유지
                const targetVoice = getVoiceForLanguage(userLang, synth.getVoices());
                currentUtterance.voice = targetVoice;
                currentUtterance.lang = langCode;
                currentUtterance.rate = 1.0;
            }
            
            const playIcon = document.getElementById('play-icon');
            const pauseIcon = document.getElementById('pause-icon');
            
            let currentSentenceIndex = 0;
            
            currentUtterance.onstart = () => {
                playIcon.style.display = 'none';
                pauseIcon.style.display = 'block';
            };
            
            // 단어 경계마다 하이라이트
            currentUtterance.onboundary = (event) => {
                if (event.name === 'sentence') {
                    // 현재 문장 하이라이트
                    const highlightedHTML = sentences.map((sentence, idx) => {
                        if (idx === currentSentenceIndex) {
                            return '<span style="background-color: rgba(66, 133, 244, 0.3); font-weight: 600;">' + sentence + '</span>';
                        }
                        return sentence;
                    }).join('');
                    
                    textElement.innerHTML = highlightedHTML;
                    currentSentenceIndex++;
                }
            };
            
            currentUtterance.onend = () => {
                playIcon.style.display = 'block';
                pauseIcon.style.display = 'none';
                // 하이라이트 제거, 원본 복원
                textElement.textContent = originalText;
            };
            
            synth.speak(currentUtterance);
        }
        
        populateVoiceList();
        if (synth.onvoiceschanged !== undefined) {
            synth.onvoiceschanged = populateVoiceList;
        }
        
        // 갤러리 아이템 클릭 (앱과 100% 동일한 로직)
        document.querySelectorAll('.gallery-item').forEach(item => {
            item.addEventListener('click', () => {
                const itemData = appData.items[parseInt(item.dataset.id)];
                
                // 배경 이미지 설정
                document.getElementById('detail-bg').src = itemData.imageDataUrl;
                
                // 텍스트 설정
                document.getElementById('detail-description').textContent = itemData.description;
                
                // UI 표시
                galleryView.classList.add('hidden');
                header.classList.add('hidden');
                detailView.classList.remove('hidden');
                document.getElementById('detail-footer').classList.remove('hidden');
                
                // 텍스트는 표시 상태로 시작 (음성과 동시에 보임)
                document.getElementById('detail-text').classList.remove('hidden');
                
                // 음성 자동 재생
                playAudio(itemData.description);
            });
        });
        
        // 🔙 보관함으로 돌아가기 버튼 (갤러리 뷰)
        const galleryBackBtn = document.getElementById('gallery-back-btn');
        if (galleryBackBtn) {
            galleryBackBtn.addEventListener('click', () => {
                window.location.href = '/#archive';
            });
        }
        
        // 뒤로 가기
        document.getElementById('detail-back').addEventListener('click', () => {
            stopAudio();
            detailView.classList.add('hidden');
            document.getElementById('detail-text').classList.add('hidden');
            document.getElementById('detail-footer').classList.add('hidden');
            header.classList.remove('hidden');
            galleryView.classList.remove('hidden');
        });
        
        // 텍스트 토글 버튼 (앱과 동일한 로직)
        document.getElementById('text-toggle')?.addEventListener('click', () => {
            document.getElementById('detail-text').classList.toggle('hidden');
        });
        
        // 음성 재생/정지
        document.getElementById('detail-audio').addEventListener('click', () => {
            if (synth.speaking) {
                stopAudio();
            } else {
                const text = document.getElementById('detail-description').textContent;
                playAudio(text);
            }
        });
        
        // 홈 버튼 (갤러리 하단)
        const homeButton = document.getElementById('home-button');
        if (homeButton) {
            homeButton.addEventListener('click', (e) => {
                e.preventDefault();
                stopAudio();
                setTimeout(() => {
                    window.location.href = homeButton.href;
                }, 200);
            });
        }
        
        // 홈 버튼 (상세 뷰 하단) - 음성 듣다가 바로 앱으로 가기
        const detailHome = document.getElementById('detail-home');
        if (detailHome) {
            detailHome.addEventListener('click', (e) => {
                e.preventDefault();
                stopAudio();
                setTimeout(() => {
                    window.location.href = detailHome.href;
                }, 200);
            });
        }
        
        // 페이지 이탈 시 오디오 정지 (백그라운드 재생 방지)
        window.addEventListener('beforeunload', () => {
            stopAudio();
        });
    </script>
    
    <!-- ⚠️ 핵심 로직: Service Worker 등록 (오프라인 지원) -->
    <script>
        // Service Worker 지원 확인 및 등록
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/service-worker.js')
                    .then(registration => {
                    })
                    .catch(error => {
                    });
            });
        }
    </script>
</body>
</html>`;
    }

    function downloadHTML(filename, content) {
        const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Download featured shareLink HTML
    window.downloadFeaturedHTML = async function (shareLinkId) {
        try {
            const transaction = db.transaction([SHARE_LINKS_STORE], 'readonly');
            const store = transaction.objectStore(SHARE_LINKS_STORE);
            const request = store.get(shareLinkId);

            request.onsuccess = () => {
                const shareLink = request.result;
                if (shareLink) {
                    const appOrigin = window.location.origin;
                    const userLang = localStorage.getItem('appLanguage') || 'ko';
                    const htmlContent = generateShareHTML(
                        shareLink.title,
                        shareLink.sender,
                        shareLink.location,
                        shareLink.date,
                        shareLink.guideItems,
                        appOrigin,
                        false, // isFeatured
                        userLang // language
                    );
                    downloadHTML(`${shareLink.title}-손안에가이드.html`, htmlContent);
                    showToast('다운로드가 시작되었습니다.');
                }
            };
        } catch (error) {
            console.error('Download error:', error);
            showToast('다운로드 중 오류가 발생했습니다.');
        }
    };

    // --- UI Helpers ---
    function showToast(message, duration = 3000) {
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.textContent = message;
        toastContainer.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => {
                toast.remove();
            });
        }, duration);
    }

    // ⚠️ 수정금지(승인필요): 독립페이지 SPA 오버레이 (window.open 대체)
    // ⚠️ 수정금지(승인필요) — profile.html, user-guide.html을 iframe으로 인앱 표시 + base target _top 자동 주입 (2026-03-10)
    // ⚠️ 수정금지(승인필요): 2026-03-24 base target="_top" 제거 — 구글 번역이 iframe 내 navigation 유발 → 부모 프레임을 랜딩으로 이동시킴
    // 공유페이지 내 링크는 이미 postMessage('closeOverlay')로 처리되므로 base target 불필요
    function openPageOverlay(url) {
        const overlay = document.getElementById('pageOverlay');
        const iframe = document.getElementById('pageOverlayIframe');
        if (!overlay || !iframe) return;
        iframe.src = url;
        overlay.classList.remove('hidden');
    }
    window.openPageOverlay = openPageOverlay;

    function closePageOverlay() {
        const overlay = document.getElementById('pageOverlay');
        const iframe = document.getElementById('pageOverlayIframe');
        if (!overlay || !iframe) return;
        iframe.src = '';
        overlay.classList.add('hidden');
    }
    window.closePageOverlay = closePageOverlay;

    // ⚠️ 수정금지(승인필요) — 독립페이지 postMessage 수신: closeOverlay + requestOAuth (Claude Opus 4.6, 2026-03-09)
    window.addEventListener('message', function(event) {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type === 'closeOverlay') {
            closePageOverlay();
        }
        // ⚠️ 수정금지(승인필요) — beta.html에서 OAuth 요청 수신: authModal 표시 + betaSource 설정 (Claude Opus 4.6, 2026-03-09)
        if (event.data?.type === 'requestOAuth' && event.data?.source === 'beta') {
            sessionStorage.setItem('betaSource', '1');
            const authModal = document.getElementById('authModal');
            if (authModal) {
                authModal.classList.remove('hidden');
                authModal.classList.remove('pointer-events-none');
                authModal.classList.add('pointer-events-auto');
            }
        }
    });

    // --- Page Control ---
    function showPage(pageToShow) {
        [featuresPage, mainPage, detailPage, archivePage, settingsPage, adminSettingsPage].forEach(page => {
            if (page) page.classList.toggle('visible', page === pageToShow);
        });
    }

    function showMainPage() {
        cameFromArchive = false; // Reset navigation state
        // ✅ 페이지 이동 시 음성 즉시 정지 - 2025.10.02 확보됨
        synth.cancel();
        resetSpeechState();
        // 🎤 2026-01-18: 페이지 이동 시 마이크 종료 (AI 중복 호출 방지)
        if (recognition && isRecognizing) {
            recognition.stop();
            isRecognizing = false;
            micBtn?.classList.remove('mic-listening');
            detailMicBtn?.classList.remove('mic-listening');
        }
        showPage(mainPage);

        detailPage.classList.remove('bg-friendly');
        cameraStartOverlay.classList.add('hidden');
        mainFooter.classList.remove('hidden');

        // 카메라 상태 복원 (Featured 페이지에서 돌아온 경우)
        const cameraWasActive = localStorage.getItem('cameraWasActive') === 'true';

        if (stream && !isCameraActive) {
            resumeCamera();
        } else if (!stream && cameraWasActive) {
            // Featured 페이지 이동으로 stream이 없어진 경우 카메라 재시작
            handleStartFeaturesClick();
        }
    }

    function showDetailPage(isFromArchive = false) {
        pauseCamera();
        showPage(detailPage);
        saveBtn.disabled = isFromArchive;
    }

    // ═══════════════════════════════════════════════════════════════
    // ⚠️ CRITICAL: DO NOT MODIFY WITHOUT USER APPROVAL
    // 사용자 승인 없이 절대 수정 금지 - AI 및 모든 개발자 주의
    // Verified: 2025-10-02 | Status: Production-Ready ✅
    // ⚡ 성능 최적화: 화면 먼저 표시, 데이터는 백그라운드 로드 (2025-10-05)
    // ═══════════════════════════════════════════════════════════════
    async function showArchivePage() {
        pauseCamera();
        synth.cancel();
        resetSpeechState();
        // 🎤 2026-01-18: 페이지 이동 시 마이크 종료 (AI 중복 호출 방지)
        if (recognition && isRecognizing) {
            recognition.stop();
            isRecognizing = false;
            micBtn?.classList.remove('mic-listening');
            detailMicBtn?.classList.remove('mic-listening');
        }
        if (isSelectionMode) {
            toggleSelectionMode(false);
        }
        showPage(archivePage); // ⚡ 화면 먼저 표시 (즉시)
        renderArchive(); // ⚡ 데이터 백그라운드 로드 (비차단)
    }

    async function showSettingsPage() {
        pauseCamera();

        // 사용자 설정 페이지 초기화
        initUserSettingsLegalContent();
        initUserPushToggle();

        showPage(settingsPage);
    }

    function resetSpeechState() {
        // ⚠️ 수정금지(승인필요): 2026-03-12 네이티브 TTS 중지 + 리스너 정리
        if (isNativeApp && window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'stopSpeech', payload: {} }));
        }
        // 네이티브 TTS 리스너/상태 정리 (메모리 누수 방지)
        if (window.__nativeSpeakDoneListener) {
            window.removeEventListener('nativeResponse', window.__nativeSpeakDoneListener);
            window.__nativeSpeakDoneListener = null;
        }
        window.__nativePausedUtterance = null;
        // 🧹 메모리 최적화: 이전 음성 완전 정리 (2025-10-05)
        synth.cancel();
        // ⚠️ 2026-03-06: iOS Safari에서 cancel() 후 paused=true 고착 방지
        if (synth.paused) {
            synth.resume();
            synth.cancel();
        }
        utteranceQueue = [];
        isSpeaking = false;
        isPaused = false;
        if (currentlySpeakingElement) {
            currentlySpeakingElement.classList.remove('speaking');
        }
        currentlySpeakingElement = null;
    }

    // ═══════════════════════════════════════════════════════════════
    // 🔔 알림 시스템 (2025-12-06)
    // 목적: 프로필 버튼 배지 + 알림 모달 (YouTube 스타일)
    // ═══════════════════════════════════════════════════════════════
    let notificationPollingInterval = null;

    let _notificationAuthFailed = false;
    async function fetchUnreadNotificationCount() {
        if (_notificationAuthFailed) return 0;
        try {
            const response = await fetch('/api/notifications/unread-count', { credentials: 'include' });
            if (response.ok) {
                const data = await response.json();
                return data.count || 0;
            }
            if (response.status === 401) {
                _notificationAuthFailed = true;
                stopNotificationPolling();
            }
            return 0;
        } catch (error) {
            return 0;
        }
    }

    async function updateNotificationBadge() {
        const count = await fetchUnreadNotificationCount();
        if (notificationBadge) {
            if (count > 0) {
                notificationBadge.textContent = count > 99 ? '99+' : count;
                notificationBadge.classList.remove('hidden');
            } else {
                notificationBadge.classList.add('hidden');
            }
        }
    }

    async function fetchNotifications() {
        try {
            const response = await fetch('/api/notifications', { credentials: 'include' });
            if (response.ok) {
                const notifications = await response.json();
                return notifications;
            }
            return [];
        } catch (error) {
            return [];
        }
    }

    function renderNotifications(notifications) {
        if (!notificationList || !emptyNotificationMessage) return;

        if (notifications.length === 0) {
            notificationList.classList.add('hidden');
            emptyNotificationMessage.classList.remove('hidden');
            return;
        }

        notificationList.classList.remove('hidden');
        emptyNotificationMessage.classList.add('hidden');

        notificationList.innerHTML = notifications.map(notification => {
            const isRead = notification.isRead;
            const timeAgo = getTimeAgo(new Date(notification.createdAt));
            const typeIcon = getNotificationIcon(notification.type);

            return `
                <div class="notification-item flex items-start gap-3 p-3 rounded-lg ${isRead ? 'opacity-60' : 'bg-blue-50/50'}"
                     data-notification-id="${notification.id}"
                     data-testid="notification-item-${notification.id}">
                    <div class="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                        ${typeIcon}
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-gray-900 ${isRead ? '' : 'font-semibold'}">${notification.title}</p>
                        <p class="text-sm text-gray-600 truncate">${notification.body || ''}</p>
                        <p class="text-xs text-gray-400 mt-1">${timeAgo}</p>
                    </div>
                    <button class="notification-delete-btn flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition"
                            data-notification-id="${notification.id}"
                            data-testid="button-delete-notification-${notification.id}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>
            `;
        }).join('');

        // X 버튼 클릭 이벤트 (알림 삭제)
        notificationList.querySelectorAll('.notification-delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const notificationId = parseInt(btn.dataset.notificationId);

                await deleteNotification(notificationId);
                updateNotificationBadge();

                const notifications = await fetchNotifications();
                renderNotifications(notifications);
            });
        });
    }

    function getNotificationIcon(type) {
        switch (type) {
            case 'reward':
                return '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
            case 'system':
                return '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
            case 'new_content':
                return '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"></path></svg>';
            case 'event':
                return '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path></svg>';
            case 'urgent':
                return '<svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>';
            default:
                return '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>';
        }
    }

    function getTimeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHour / 24);

        if (diffSec < 60) return '방금 전';
        if (diffMin < 60) return `${diffMin}분 전`;
        if (diffHour < 24) return `${diffHour}시간 전`;
        if (diffDay < 7) return `${diffDay}일 전`;
        return date.toLocaleDateString('ko-KR');
    }

    async function markNotificationRead(notificationId) {
        try {
            await fetch('/api/notifications/mark-read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ notificationId })
            });
        } catch (error) {
        }
    }

    async function deleteNotification(notificationId) {
        try {
            await fetch(`/api/notifications/${notificationId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include'
            });
        } catch (error) {
        }
    }

    async function deleteAllNotifications() {
        try {
            await fetch('/api/notifications/delete-all', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include'
            });
            updateNotificationBadge();
            const notifications = await fetchNotifications();
            renderNotifications(notifications);
            showToast('모든 알림을 삭제했습니다');
        } catch (error) {
        }
    }

    async function openNotificationModal() {
        if (!notificationModal) return;

        notificationModal.classList.remove('hidden');

        // 알림 로딩
        const notifications = await fetchNotifications();
        renderNotifications(notifications);
    }

    async function closeNotificationModal() {
        if (!notificationModal) return;
        notificationModal.classList.add('hidden');
        notificationModalOpenedFromProfile = false;

        // 모달 닫을 때 모든 알림 읽음 처리
        try {
            await fetch('/api/notifications/mark-read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include'
            });
            // 배지 숨기기
            if (notificationBadge) {
                notificationBadge.classList.add('hidden');
            }
        } catch (error) {
        }
    }

    function startNotificationPolling() {
        // 즉시 한 번 실행
        updateNotificationBadge();

        // 30초마다 폴링
        if (notificationPollingInterval) {
            clearInterval(notificationPollingInterval);
        }
        notificationPollingInterval = setInterval(() => {
            updateNotificationBadge();
        }, 30000);
    }

    function stopNotificationPolling() {
        if (notificationPollingInterval) {
            clearInterval(notificationPollingInterval);
            notificationPollingInterval = null;
        }
    }

    // 알림 모달 이벤트 리스너
    closeNotificationModalBtn?.addEventListener('click', closeNotificationModal);

    // 모달 바깥 클릭 시 닫기
    notificationModal?.addEventListener('click', (e) => {
        if (e.target === notificationModal) {
            closeNotificationModal();
        }
    });

    // 인포그래픽 모달 함수
    function openInfographicModal(imageSrc) {
        if (infographicModal && infographicImage) {
            infographicImage.src = imageSrc;
            infographicModal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }
    }

    function closeInfographicModal() {
        if (infographicModal) {
            infographicModal.classList.add('hidden');
            document.body.style.overflow = '';
        }
    }

    // 인포그래픽 모달 이벤트 리스너
    closeInfographicModalBtn?.addEventListener('click', closeInfographicModal);

    // 인포그래픽 모달 바깥 클릭 시 닫기
    infographicModal?.addEventListener('click', (e) => {
        if (e.target === infographicModal || e.target.classList.contains('relative')) {
            closeInfographicModal();
        }
    });

    // Feature Card 1 클릭 시 인포그래픽 모달 열기
    featureCard1?.addEventListener('click', () => {
        openInfographicModal('/images/infographic-feature1.png');
    });

    // 동영상 모달 함수
    let videoAutoCloseTimer = null;

    function openVideoModal() {
        if (videoModal && featureVideo) {
            videoModal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            featureVideo.currentTime = 0;
            featureVideo.play().catch(err => console.log('Video play error:', err));

            // 8초 후 자동 닫힘
            if (videoAutoCloseTimer) clearTimeout(videoAutoCloseTimer);
            videoAutoCloseTimer = setTimeout(() => {
                closeVideoModal();
            }, 8000);
        }
    }

    function closeVideoModal() {
        if (videoModal && featureVideo) {
            videoModal.classList.add('hidden');
            document.body.style.overflow = '';
            featureVideo.pause();

            // 타이머 정리
            if (videoAutoCloseTimer) {
                clearTimeout(videoAutoCloseTimer);
                videoAutoCloseTimer = null;
            }
        }
    }

    // 동영상 모달 이벤트 리스너
    closeVideoModalBtn?.addEventListener('click', closeVideoModal);

    // 동영상 모달 바깥 클릭 시 닫기
    videoModal?.addEventListener('click', (e) => {
        if (e.target === videoModal || e.target.classList.contains('relative')) {
            closeVideoModal();
        }
    });

    function openYoutubeModal(videoId) {
        if (youtubeModal && youtubeIframe) {
            youtubeIframe.src = 'https://www.youtube.com/embed/' + videoId + '?autoplay=1';
            youtubeModal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }
    }

    function closeYoutubeModal() {
        if (youtubeModal && youtubeIframe) {
            youtubeModal.classList.add('hidden');
            document.body.style.overflow = '';
            youtubeIframe.src = '';
        }
    }

    closeYoutubeModalBtn?.addEventListener('click', closeYoutubeModal);

    youtubeModal?.addEventListener('click', (e) => {
        if (e.target === youtubeModal || e.target.classList.contains('relative')) {
            closeYoutubeModal();
        }
    });

    // Feature Card 2 클릭 시 동영상 모달 열기
    featureCard2?.addEventListener('click', () => {
        openVideoModal();
    });

    // 프로필 버튼 클릭 → 읽지 않은 알림이 있으면 모달 먼저, 없으면 바로 프로필 페이지
    profileBtn?.addEventListener('click', async () => {
        const user = await checkUserAuth();
        if (!user) {
            openPageOverlay('/profile.html');
            return;
        }

        try {
            const response = await fetch('/api/notifications/unread-count', {
                credentials: 'include'
            });
            const data = await response.json();
            const unreadCount = data.count || 0;

            if (unreadCount > 0) {
                notificationModalOpenedFromProfile = true;
                openNotificationModal();
            } else {
                openPageOverlay('/profile.html');
            }
        } catch (error) {
            openPageOverlay('/profile.html');
        }
    });

    // --- App Initialization ---
    async function initializeApp() {
        try {
            // 2026-01-22: DB 언어 로드 제거 → localStorage만 사용
            await openDB();
        } catch (e) {
            console.error("Failed to open database", e);
            showToast("데이터베이스를 열 수 없습니다. 앱이 정상적으로 작동하지 않을 수 있습니다.");
        }

        // ⚠️ 수정금지(승인필요): beta.html에서 리다이렉트 시 betaSource 플래그 설정
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('beta') === '1') {
            sessionStorage.setItem('betaSource', '1');
            window.history.replaceState({}, '', window.location.pathname + window.location.hash);
        }

        // OAuth 인증 실패 체크 (UX 개선)
        if (urlParams.get('auth') === 'failed') {
            console.error('❌ OAuth 인증 실패 감지');
            showToast('로그인에 실패했습니다. 다시 시도해주세요.');
            // URL 파라미터 제거 (깨끗하게)
            window.history.replaceState({}, '', window.location.pathname + window.location.hash);
            localStorage.removeItem('pendingShareUrl'); // 실패한 URL 삭제
        }

        // 인증 완료 후 대기 중인 공유 URL 확인
        const pendingUrl = localStorage.getItem('pendingShareUrl');
        if (pendingUrl) {
            localStorage.removeItem('pendingShareUrl');
            // ⚠️ 수정금지(승인필요) — pendingShareUrl: SPA 오버레이로 열기 (2026-03-10)
            setTimeout(() => {
                openPageOverlay(addLangToUrl(pendingUrl));
            }, 500);
        } else {
        }

        // ✨ 보관함 직접 접속 (#archive) 처리 (2025-10-28)
        if (window.location.hash === '#archive') {
            showArchivePage();
        }
        // The landing page animation will handle showing the features page initially.

        if (recognition) {
            recognition.continuous = false;
            // 🌐 선택된 언어에 맞춰 음성 인식 언어 설정
            recognition.lang = getRecognitionLang();
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;
            // 🎤 2026-01-19: 이벤트 핸들러는 함수 호출 시 등록 (배포본 방식으로 롤백)
        }

        // 🌐 언어 코드 매핑 함수 (ko → ko-KR, fr → fr-FR 등)
        function getRecognitionLang() {
            const userLang = localStorage.getItem('appLanguage') || 'ko';
            const langMap = {
                'ko': 'ko-KR',
                'en': 'en-US',
                'ja': 'ja-JP',
                'zh': 'zh-CN',
                'fr': 'fr-FR',
                'de': 'de-DE',
                'es': 'es-ES'
            };
            return langMap[userLang] || 'ko-KR';
        }

        // 🌐 전역 함수로 등록 (언어 변경 시 호출)
        window.updateRecognitionLang = function () {
            if (recognition) {
                recognition.lang = getRecognitionLang();
            }
        };

        // 인증 성공 후 authModal 자동 닫기 (2025-10-26)
        checkAuthStatusAndCloseModal();

        // 페이지 포커스 시 인증 상태 재확인 (OAuth 리다이렉트 대응)
        window.addEventListener('focus', checkAuthStatusAndCloseModal);
        window.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                checkAuthStatusAndCloseModal();
            }
        });

        // ⚠️ 2025.11.06: OAuth 팝업 완료 메시지 수신
        window.addEventListener('message', (event) => {
            // 보안: origin 체크 (같은 도메인만 허용)
            if (event.origin !== window.location.origin) {
                return;
            }

            if (event.data.type === 'oauth_success') {
                _notificationAuthFailed = false;
                startNotificationPolling();

                // 인증 모달 닫기
                authModal?.classList.add('hidden');
                authModal?.classList.add('pointer-events-none');
                authModal?.classList.remove('pointer-events-auto');

                // ⚠️ 수정금지(승인필요) — pendingShareUrl: SPA 오버레이로 열기 (2026-03-10)
                const pendingUrl = localStorage.getItem('pendingShareUrl');
                if (pendingUrl) {
                    localStorage.removeItem('pendingShareUrl');
                    openPageOverlay(addLangToUrl(pendingUrl));
                } else {
                    // 🎁 2026-01-07: 프로모션 - 인증 후 자동으로 메인 페이지 진입
                    handleStartFeaturesClick();
                }
            }
        });

        // ⚠️ 2025.11.12: OAuth 새 탭 완료 시 storage 이벤트 감지
        window.addEventListener('storage', (event) => {
            if (event.key === 'auth_success' && event.newValue === 'true') {
                // 🎁 2026-01-07: 프로모션 - 인증 후 자동으로 메인 페이지 진입
                checkAuthStatusAndCloseModal();
                handleStartFeaturesClick();
            }
        });

        // 🔔 알림 배지 폴링 시작 (2025-12-06)
        startNotificationPolling();
    }

    // 인증 상태 확인 및 모달 자동 닫기
    let _lastAuthCheck = 0;
    async function checkAuthStatusAndCloseModal() {

        // ⚠️ 수정금지(승인필요): WebView OAuth 리다이렉트 후 mainPage 직행 로직
        // Android WebView에서 팝업 차단 시 전체 페이지 OAuth 이동 → 콜백에서 auth_success 플래그 설정
        // 페이지 재로드 후 이 플래그를 감지하여 모달 닫기 + mainPage(카메라+4입력)로 자동 이동
        const authSuccess = localStorage.getItem('auth_success');
        if (authSuccess === 'true') {
            authModal?.classList.add('hidden');
            authModal?.classList.add('pointer-events-none');
            authModal?.classList.remove('pointer-events-auto');
            localStorage.removeItem('auth_success');

            // ⚠️ 수정금지(승인필요) — pendingShareUrl: SPA 오버레이로 열기 (2026-03-10)
            const pendingUrl = localStorage.getItem('pendingShareUrl');
            if (pendingUrl) {
                localStorage.removeItem('pendingShareUrl');
                openPageOverlay(addLangToUrl(pendingUrl));
            } else {
                // ⚠️ 수정금지(승인필요): OAuth 완료 후 mainPage(카메라+입력) 직행
                handleStartFeaturesClick();
            }
            _lastAuthCheck = Date.now();
            return;
        }

        // 30초 디바운스 — focus/visibilitychange 과다 호출 방지
        const now = Date.now();
        if (now - _lastAuthCheck < 30000) return;
        _lastAuthCheck = now;

        try {
            const response = await fetch('/api/auth/user', { credentials: 'include' });
            if (response.ok) {
                // 로그인되어 있으면 authModal 닫기
                authModal?.classList.add('hidden');
                authModal?.classList.add('pointer-events-none');
                authModal?.classList.remove('pointer-events-auto');

                // ⚠️ 수정금지(승인필요) — beta 경유 로그인: 베타 등록 + iframe에 인증완료 알림 (Claude Opus 4.6, 2026-03-09)
                const betaSource = sessionStorage.getItem('betaSource');
                if (betaSource === '1') {
                    sessionStorage.removeItem('betaSource');
                    fetch('/api/beta/play-register', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ lang: localStorage.getItem('appLanguage') || 'ko' })
                    }).then(() => {
                        // beta iframe에 인증 완료 알림 → phase 2 표시
                        const iframe = document.getElementById('pageOverlayIframe');
                        if (iframe?.contentWindow) {
                            iframe.contentWindow.postMessage({ type: 'authComplete', source: 'beta' }, '*');
                        }
                    }).catch(() => { });
                }

                // ⚠️ 수정금지(승인필요) — pendingShareUrl: SPA 오버레이로 열기 (2026-03-10)
                const pendingUrl = localStorage.getItem('pendingShareUrl');
                if (pendingUrl) {
                    localStorage.removeItem('pendingShareUrl');
                    openPageOverlay(addLangToUrl(pendingUrl));
                }
            } else {
            }
        } catch (error) {
            // 에러 발생 시 무시 (모달 상태 유지)
        }
    }

    async function handleStartFeaturesClick() {
        // 🎁 2026-01-07: 프로모션 - 인증 필수 (미인증 시 모달 표시)
        const user = await checkUserAuth();
        if (!user) {
            // 기존 authModal 사용 (새로 만들지 않음)
            const authModal = document.getElementById('authModal');
            if (authModal) {
                authModal.classList.remove('hidden');
                authModal.classList.remove('pointer-events-none');
                authModal.classList.add('pointer-events-auto');
            }
            showToast('로그인하시면 무료로 사용하실 수 있어요!');
            return; // 인증 완료 후 다시 호출됨
        }

        showPage(mainPage);
        cameraStartOverlay.classList.add('hidden');

        // 2026-03-17: speech unlock은 initSpeechUnlock() IIFE로 통합 (첫 터치/클릭 시 자동 해제)

        mainLoader.classList.remove('hidden');

        // 🚀 2026-01-24: Gemini 사전 워밍업 (카메라와 병렬 실행)
        gemini.warmupGemini().catch(e => console.warn('Gemini 워밍업 실패:', e));

        try {
            if (!stream) {
                await startCamera();
                // 카메라 시작 시 상태 저장
                localStorage.setItem('cameraWasActive', 'true');
            } else {
                resumeCamera();
            }
        } catch (error) {
            console.error(`Initialization error: ${error.message}`);
            showToast("카메라를 시작할 수 없습니다. 업로드 기능을 사용해주세요.");
            // ✅ 수정: 카메라 실패해도 메인 페이지 유지 (업로드 기능은 사용 가능)
            // showPage(featuresPage); ← 제거됨
        } finally {
            mainLoader.classList.add('hidden');
        }
    }

    function startCamera() {
        return new Promise(async (resolve, reject) => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }

            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                const err = new Error("카메라 기능을 지원하지 않는 브라우저입니다.");
                return reject(err);
            }

            // ⚠️ 수정금지(승인필요): 2026-03-24 카메라 — stop/재요청 없이 단순 후면 우선
            // Samsung A36: getSettings+stop+재요청 시 스트림 1초 후 종료 → 전체 먹통
            // facingMode: 'environment' (exact 없음) = 후면 우선, 불가시 전면 자동
            let cameraStream;

            try {
                cameraStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment' }, audio: false
                });
            } catch (err) {
                try {
                    cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                } catch (fallbackErr) {
                    return reject(fallbackErr);
                }
            }

            stream = cameraStream;
            video.srcObject = stream;
            video.play().catch(e => console.error("Video play failed:", e));
            video.onloadedmetadata = () => {
                // 2026-01-24: 버튼 활성화 로직 제거 (HTML에서 처음부터 활성화 상태)
                isCameraActive = true;
                resolve();
            };
            video.onerror = (err) => reject(new Error("Failed to load video stream."));
        });
    }

    function pauseCamera() {
        if (stream) {
            stream.getTracks().forEach(track => track.enabled = false);
            isCameraActive = false;
            // 카메라 상태 저장 (Featured 페이지 이동 대비)
            localStorage.setItem('cameraWasActive', 'false');
        }
    }

    function resumeCamera() {
        if (stream) {
            stream.getTracks().forEach(track => track.enabled = true);
            isCameraActive = true;
            video.play().catch(e => console.error("Video resume play failed:", e));
            // 카메라 상태 저장
            localStorage.setItem('cameraWasActive', 'true');
        }
    }

    async function capturePhoto() {
        // 🚨 2026-01-24: AI 처리 중이면 촬영 무시
        if (isAIProcessing) {
            return;
        }

        // 🔒 사용량 제한 체크 (AI 호출 전)
        const canProceed = await checkUsageLimit('detail');
        if (!canProceed) return;

        // ⚠️ 수정금지(승인필요): 2026-03-17 촬영 웹 통일 — 네이티브 이미지피커 분기 제거
        // getUserMedia는 Android/iOS WebView 모두 지원됨 (App.js에 권한 설정 이미 있음)
        // 웹과 동일하게 라이브뷰 화면에서 바로 캡처 (1단계)
        // getUserMedia → canvas → base64
        if (!video.videoWidth || !video.videoHeight) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if (context) {
            context.drawImage(video, 0, 0, canvas.width, canvas.height);

            // 📍 브라우저 위치 권한 요청 (백그라운드 실행)
            requestBrowserLocation();

            processImage(canvas.toDataURL('image/jpeg'), shootBtn);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // 📍 브라우저 위치 권한 요청 (2025-10-26)
    // ═══════════════════════════════════════════════════════════════
    // 목적: EXIF GPS 없을 때 브라우저 Geolocation API 사용
    // 기능: 현재 위치 가져오기 → 랜드마크 검색
    // ═══════════════════════════════════════════════════════════════
    async function requestBrowserLocation() {
        // ⚠️ 수정금지(승인필요): 2026-03-11 네이티브 브릿지 — 앱에서는 expo-location 사용
        if (window.ReactNativeWebView) {
            try {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'getLocation', payload: {} }));
                // 네이티브 응답은 nativeResponse 이벤트로 수신 (아래 리스너에서 처리)
                return;
            } catch (e) {
                console.log('[Bridge] 네이티브 위치 요청 실패, 웹 API로 fallback');
            }
        }
        if (!navigator.geolocation) {
            return;
        }

        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 20000,
                    maximumAge: 0
                });
            });

            const latitude = position.coords.latitude;
            const longitude = position.coords.longitude;

            window.currentGPS = {
                latitude: latitude,
                longitude: longitude,
                locationName: null
            };

            // 🗺️ 주변 유명 랜드마크 찾기
            loadGoogleMapsAPI(async () => {
                const landmark = await getNearbyLandmark(latitude, longitude);
                if (landmark) {
                    window.currentGPS.locationName = landmark;
                    // 📍 UI 업데이트
                    updateLocationInfoUI(landmark);
                } else {
                    updateLocationInfoUI('위치 정보 없음');
                }
            });
        } catch (error) {
            if (error.code === 1) {
                updateLocationInfoUI('위치 권한 필요');
            } else if (error.code === 3) {
                updateLocationInfoUI('위치 확인 중...');
            } else {
                console.error('위치 정보 오류:', error);
                updateLocationInfoUI('위치 정보 없음');
            }
            window.currentGPS = null;
        }
    }

    // 📍 위치 정보 UI 업데이트 함수
    function updateLocationInfoUI(text) {
        const locationInfo = document.getElementById('locationInfo');
        const locationNameEl = document.getElementById('locationName');
        if (locationInfo && locationNameEl) {
            locationNameEl.textContent = text;
            locationInfo.classList.remove('hidden');
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // 📍 사진 업로드 + GPS 자동 추출 (2025-10-26)
    // ═══════════════════════════════════════════════════════════════
    // 목적: 콘텐츠 신뢰성 최적화 (Google Maps 연동)
    // 기능: 사진 업로드 시 GPS EXIF 자동 추출 → 지도 표시
    // ═══════════════════════════════════════════════════════════════
    async function handleFileSelect(event) {
        const file = event.target.files?.[0];
        if (file) {
            // 🚨 2026-01-24: AI 처리 중이면 업로드 무시
            if (isAIProcessing) {
                event.target.value = '';
                return;
            }

            // 🔒 사용량 제한 체크 (AI 호출 전)
            const canProceed = await checkUsageLimit('detail');
            if (!canProceed) {
                event.target.value = '';
                return;
            }
            // 📸 Step 1: GPS EXIF 데이터 추출 (exifr 라이브러리)
            try {
                if (window.exifr) {
                    const gpsData = await exifr.gps(file);
                    if (gpsData && gpsData.latitude && gpsData.longitude) {
                        // GPS 데이터를 전역 객체에 저장
                        window.currentGPS = {
                            latitude: gpsData.latitude,
                            longitude: gpsData.longitude,
                            locationName: null
                        };

                        // 🗺️ Step 1.5: 주변 유명 랜드마크 찾기 (GPS → "에펠탑" 등)
                        loadGoogleMapsAPI(async () => {
                            const landmark = await getNearbyLandmark(
                                gpsData.latitude,
                                gpsData.longitude
                            );
                            if (landmark) {
                                window.currentGPS.locationName = landmark;
                                updateLocationInfoUI(landmark);
                            } else {
                                updateLocationInfoUI('위치 정보 없음');
                            }
                        });
                    } else {
                        window.currentGPS = null;

                        // 📍 EXIF GPS 없으면 브라우저 위치 사용 (백그라운드)
                        requestBrowserLocation();
                    }
                } else {
                    window.currentGPS = null;

                    // 📍 브라우저 위치 요청 (백그라운드)
                    requestBrowserLocation();
                }
            } catch (error) {
                console.error('GPS 추출 오류:', error);
                window.currentGPS = null;

                // 📍 오류 시에도 브라우저 위치 요청 (백그라운드)
                requestBrowserLocation();
            }

            // 📷 Step 2: 이미지 처리 (기존 로직)
            const reader = new FileReader();
            reader.onload = (e) => processImage(e.target?.result, uploadBtn);
            reader.readAsDataURL(file);
        }
        event.target.value = '';
    }

    async function processImage(dataUrl, sourceButton) {
        // 🚨 2026-01-24: AI 중복 호출 차단 (비용 절감 핵심)
        if (isAIProcessing) {
            return;
        }
        isAIProcessing = true;

        sourceButton.disabled = true;
        cameFromArchive = false;
        if (synth.speaking || synth.pending) synth.cancel();
        resetSpeechState();

        showDetailPage();

        // 🎨 이미지 모드: 음성 모드 요소 숨기기
        detailPage.classList.remove('bg-friendly');
        if (voiceModeLogo) voiceModeLogo.classList.add('hidden');
        if (voiceQueryInfo) voiceQueryInfo.classList.add('hidden');

        // 📍 위치창 즉시 표시 (로딩 중 상태)
        const locationInfo = document.getElementById('locationInfo');
        const locationNameEl = document.getElementById('locationName');
        if (locationInfo && locationNameEl) {
            locationNameEl.textContent = '위치 확인 중...';
            locationInfo.classList.remove('hidden');
        }

        currentContent = { imageDataUrl: dataUrl, description: '' };

        // 🎨 2026-01-24: blur→clear 애니메이션 (이미지 로딩 UX 개선)
        // 이미지 로드 완료 후 blur 적용 → 0.1초 후 blur 제거 (검은색 방지)
        resultImage.src = dataUrl;
        resultImage.onload = () => {
            resultImage.classList.add('image-loading');
            resultImage.classList.remove('hidden');
            setTimeout(() => {
                resultImage.classList.remove('image-loading');
            }, 100);
        };
        // 이미 캐시된 이미지인 경우 즉시 표시
        if (resultImage.complete) {
            resultImage.classList.remove('hidden');
        }
        loader.classList.remove('hidden');
        textOverlay.classList.add('hidden');
        textOverlay.classList.remove('animate-in');
        loadingHeader.classList.remove('hidden');
        loadingHeaderText.textContent = '해설 준비 중...';
        detailFooter.classList.add('hidden');
        descriptionText.innerHTML = '';
        updateAudioButton('loading');

        const loadingMessages = ["사진 속 이야기를 찾아내고 있어요...", "곧 재미있는 이야기를 들려드릴게요!"];
        let msgIndex = 0;
        loadingText.innerText = loadingMessages[msgIndex];
        const loadingInterval = window.setInterval(() => {
            msgIndex = (msgIndex + 1) % loadingMessages.length;
            loadingText.innerText = loadingMessages[msgIndex];
        }, 2000);

        try {
            const optimizedDataUrl = await optimizeImage(dataUrl);
            const base64Image = optimizedDataUrl.split(',')[1];
            currentContent.imageDataUrl = optimizedDataUrl;

            // 🚀 2026-01-24: 구형 기기 대응 - 이미지 처리 완료 후 딜레이 (200ms)
            await new Promise(resolve => setTimeout(resolve, 200));

            const responseStream = gemini.generateDescriptionStream(base64Image);

            clearInterval(loadingInterval);
            loader.classList.add('hidden');
            textOverlay.classList.remove('hidden');
            textOverlay.classList.add('animate-in');
            loadingHeader.classList.add('hidden');
            detailFooter.classList.remove('hidden');

            // 📍 2025-12-11: 위치정보 표시 (이미지 모드) - 항상 표시, 데이터 없으면 빈칸
            const locationInfo = document.getElementById('locationInfo');
            const locationNameEl = document.getElementById('locationName');
            if (locationInfo && locationNameEl) {
                if (window.currentGPS && window.currentGPS.locationName) {
                    locationNameEl.textContent = window.currentGPS.locationName;
                } else {
                    locationNameEl.textContent = '위치 정보 없음';
                }
                locationInfo.classList.remove('hidden');
            }

            let sentenceBuffer = '';
            for await (const chunk of responseStream) {
                const chunkText = chunk.text;
                if (chunkText) {
                    currentContent.description += chunkText;
                    sentenceBuffer += chunkText;

                    const sentenceEndings = /[.?!]/g;
                    let match;
                    while ((match = sentenceEndings.exec(sentenceBuffer)) !== null) {
                        const sentence = sentenceBuffer.substring(0, match.index + 1).trim();
                        sentenceBuffer = sentenceBuffer.substring(match.index + 1);
                        if (sentence) {
                            const span = document.createElement('span');
                            span.textContent = sentence + ' ';
                            descriptionText.appendChild(span);
                            queueForSpeech(sentence, span);
                        }
                    }
                }
            }

            if (sentenceBuffer.trim()) {
                const sentence = sentenceBuffer.trim();
                const span = document.createElement('span');
                span.textContent = sentence + ' ';
                descriptionText.appendChild(span);
                queueForSpeech(sentence, span);
            }

            // ⚠️ 수정금지(승인필요): 2026-03-12 TTS 자동재생 전환 (롤백: 아래 주석 해제)
            // [이전 수동재생] updateAudioButton('play');
            updateAudioButton('pause');
            speakNext();

            // 🔒 AI 호출 성공 후 사용량 차감
            await deductUsage('detail');

        } catch (err) {
            console.error("분석 오류:", err);
            clearInterval(loadingInterval);
            loader.classList.add('hidden');
            loadingHeader.classList.add('hidden');
            textOverlay.classList.remove('hidden');
            let errorMessage = "이미지 해설 중 오류가 발생했습니다. 네트워크 연결을 확인하고 다시 시도해 주세요.";
            descriptionText.innerText = errorMessage;
            updateAudioButton('disabled');
        } finally {
            sourceButton.disabled = false;
            // 🚨 2026-01-24: AI 처리 완료 - 플래그 해제
            isAIProcessing = false;
        }
    }

    async function handleMicButtonClick() {
        // ⚠️ 수정금지(승인필요): 2026-03-20 마이크 — 네이티브 우선 → 웹 폴백
        // 앱(WebView): postMessage로 네이티브 음성인식 호출 (expo-speech-recognition)
        // 웹(브라우저): Web Speech API 사용
        if (window.ReactNativeWebView) {
            // 앱: 네이티브 음성인식 브릿지
            const lang = localStorage.getItem('appLanguage') || 'ko-KR';
            window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'startSpeechRecognition', payload: { language: lang }
            }));
            micBtn?.classList.add('mic-listening');
            return;
        }
        if (!recognition) return showToast("음성 인식이 지원되지 않습니다. 텍스트로 질문해주세요.");
        if (isRecognizing) return recognition.stop();

        // 🔊 마이크 시작 전 음성 재생 즉시 중지
        if (synth.speaking || synth.pending) {
            synth.cancel();
            resetSpeechState();
        }

        // 🔒 사용량 제한 체크 (AI 호출 전)
        const canProceed = await checkUsageLimit('detail');
        if (!canProceed) return;

        isRecognizing = true;
        micBtn.classList.add('mic-listening');
        recognition.start();

        // 🎤 10초 타임아웃 (iOS Safari 호환성)
        const micTimeout = setTimeout(() => {
            if (isRecognizing) {
                recognition.stop();
                isRecognizing = false;
                micBtn?.classList.remove('mic-listening');
                showToast('음성을 듣지 못했어요. 다시 시도해볼까요?');
            }
        }, 10000);

        recognition.onresult = (event) => {
            clearTimeout(micTimeout);
            processTextQuery(event.results[0][0].transcript);
        };

        recognition.onerror = (event) => {
            clearTimeout(micTimeout);
            console.error('Speech recognition error:', event.error);
            isRecognizing = false;
            micBtn?.classList.remove('mic-listening');
            const messages = {
                'no-speech': '음성을 듣지 못했어요. 다시 시도해볼까요?',
                'not-allowed': '마이크 사용 권한이 필요합니다.',
                'service-not-allowed': '마이크 사용 권한이 필요합니다.'
            };
            showToast(messages[event.error] || '음성 인식 중 오류가 발생했습니다.');
        };

        recognition.onend = () => {
            clearTimeout(micTimeout);
            isRecognizing = false;
            micBtn?.classList.remove('mic-listening');
        };
    }

    // 🎤 상세페이지에서 다시 질문하기 (페이지 이동 없이)
    // 🎤 2026-01-19: 배포본 방식으로 롤백 - 함수 호출 시 이벤트 핸들러 등록
    async function handleDetailMicClick() {
        if (!recognition) return showToast("음성 인식이 지원되지 않는 브라우저입니다.");
        if (isRecognizing) return recognition.stop();

        // 🔊 마이크 시작 전 음성 재생 즉시 중지
        if (synth.speaking || synth.pending) {
            synth.cancel();
            resetSpeechState();
        }

        // 🔒 사용량 제한 체크 (AI 호출 전)
        const canProceed = await checkUsageLimit('detail');
        if (!canProceed) return;

        isRecognizing = true;
        detailMicBtn?.classList.add('mic-listening');
        recognition.start();

        // 🎤 10초 타임아웃 (iOS Safari 호환성)
        const micTimeout = setTimeout(() => {
            if (isRecognizing) {
                recognition.stop();
                isRecognizing = false;
                detailMicBtn?.classList.remove('mic-listening');
                showToast('음성을 듣지 못했어요. 다시 시도해볼까요?');
            }
        }, 10000);

        recognition.onresult = (event) => {
            clearTimeout(micTimeout);
            processTextQuery(event.results[0][0].transcript);
        };

        recognition.onerror = (event) => {
            clearTimeout(micTimeout);
            console.error('Speech recognition error:', event.error);
            isRecognizing = false;
            detailMicBtn?.classList.remove('mic-listening');
            const messages = {
                'no-speech': '음성을 듣지 못했어요. 다시 시도해볼까요?',
                'not-allowed': '마이크 사용 권한이 필요합니다.',
                'service-not-allowed': '마이크 사용 권한이 필요합니다.'
            };
            showToast(messages[event.error] || '음성 인식 중 오류가 발생했습니다.');
        };

        recognition.onend = () => {
            clearTimeout(micTimeout);
            isRecognizing = false;
            detailMicBtn?.classList.remove('mic-listening');
        };
    }

    async function processTextQuery(prompt) {
        // 🎤 마이크 즉시 정지 
        if (recognition && isRecognizing) {
            recognition.stop();
            isRecognizing = false;
            micBtn?.classList.remove('mic-listening');
            detailMicBtn?.classList.remove('mic-listening');
        }

        cameFromArchive = false;
        if (synth.speaking || synth.pending) synth.cancel();
        resetSpeechState();

        showDetailPage();

        detailPage.classList.add('bg-friendly');
        saveBtn.disabled = true;

        // 🎤 음성 모드: 질문 키워드 저장 + 로고 워터마크 표시
        currentContent = { imageDataUrl: null, description: '', voiceQuery: prompt };

        resultImage.src = '';
        resultImage.classList.add('hidden');

        // 🎨 로고 워터마크 표시 (음성 모드)
        if (voiceModeLogo) voiceModeLogo.classList.remove('hidden');

        // 🎤 질문 키워드 표시 (위치 대신)
        if (voiceQueryInfo && voiceQueryText) {
            voiceQueryText.textContent = prompt;
            voiceQueryInfo.classList.remove('hidden');
        }
        // 위치 정보는 숨김
        const locationInfo = document.getElementById('locationInfo');
        if (locationInfo) locationInfo.classList.add('hidden');

        loader.classList.remove('hidden');
        textOverlay.classList.add('hidden');
        textOverlay.classList.remove('animate-in');
        loadingHeader.classList.remove('hidden');
        loadingHeaderText.textContent = '답변 준비 중...';
        detailFooter.classList.add('hidden');
        descriptionText.innerHTML = '';
        updateAudioButton('loading');

        const loadingMessages = ["어떤 질문인지 살펴보고 있어요...", "친절한 답변을 준비하고 있어요!"];
        let msgIndex = 0;
        loadingText.innerText = loadingMessages[msgIndex];
        const loadingInterval = window.setInterval(() => {
            msgIndex = (msgIndex + 1) % loadingMessages.length;
            loadingText.innerText = loadingMessages[msgIndex];
        }, 2000);

        try {
            const responseStream = gemini.generateTextStream(prompt);

            clearInterval(loadingInterval);
            loader.classList.add('hidden');
            textOverlay.classList.remove('hidden');
            textOverlay.classList.add('animate-in');
            loadingHeader.classList.add('hidden');
            detailFooter.classList.remove('hidden');

            let sentenceBuffer = '';
            for await (const chunk of responseStream) {
                const chunkText = chunk.text;
                if (chunkText) {
                    currentContent.description += chunkText;
                    sentenceBuffer += chunkText;

                    const sentenceEndings = /[.?!]/g;
                    let match;
                    while ((match = sentenceEndings.exec(sentenceBuffer)) !== null) {
                        const sentence = sentenceBuffer.substring(0, match.index + 1).trim();
                        sentenceBuffer = sentenceBuffer.substring(match.index + 1);
                        if (sentence) {
                            const span = document.createElement('span');
                            span.textContent = sentence + ' ';
                            descriptionText.appendChild(span);
                            queueForSpeech(sentence, span);
                        }
                    }
                }
            }

            if (sentenceBuffer.trim()) {
                const sentence = sentenceBuffer.trim();
                const span = document.createElement('span');
                span.textContent = sentence + ' ';
                descriptionText.appendChild(span);
                queueForSpeech(sentence, span);
            }

            // ⚠️ 수정금지(승인필요): 2026-03-12 TTS 자동재생 전환 (롤백: 아래 주석 해제)
            // [이전 수동재생] updateAudioButton('play');
            updateAudioButton('pause');
            speakNext();

            // 🎤 음성 가이드 저장 버튼 활성화
            saveBtn.disabled = false;

            // 🔒 AI 호출 성공 후 사용량 차감
            await deductUsage('detail');

        } catch (err) {
            console.error("답변 오류:", err);
            clearInterval(loadingInterval);
            textOverlay.classList.remove('hidden');
            descriptionText.innerText = "답변 생성 중 오류가 발생했습니다. 네트워크 연결을 확인하고 다시 시도해 주세요.";
            updateAudioButton('disabled');
        } finally {
            // 🚨 2026-01-24: AI 처리 완료 - 플래그 해제
            isAIProcessing = false;
        }
    }

    // 🎤 현재 선택된 TTS 음성 정보 가져오기 (2025-12-07: DB 기반)
    function getCurrentVoiceInfo() {
        const userLang = localStorage.getItem('appLanguage') || 'ko';
        const langCodeMap = { 'ko': 'ko-KR', 'en': 'en-US', 'ja': 'ja-JP', 'zh-CN': 'zh-CN', 'fr': 'fr-FR', 'de': 'de-DE', 'es': 'es-ES' };
        const langCode = langCodeMap[userLang] || 'ko-KR';

        let voiceName = null;

        // 🔊 DB 기반 음성 우선순위 사용
        const voiceConfig = getVoicePriorityFromDB(langCode);
        const priorities = voiceConfig.priorities;
        const excludeVoices = voiceConfig.excludeVoices;

        const allVoices = synth.getVoices();

        for (const name of priorities) {
            const found = allVoices.find(v =>
                v.name.includes(name) && !excludeVoices.some(ex => v.name.includes(ex))
            );
            if (found) {
                voiceName = found.name;
                break;
            }
        }

        // 음성 목록이 아직 로드 안 됐으면 우선순위 첫 번째 이름 사용
        if (!voiceName && priorities.length > 0) {
            voiceName = priorities[0];
        }

        return { voiceLang: langCode, voiceName: voiceName };
    }

    async function handleSaveClick() {
        // 🎤 음성 가이드: imageDataUrl 없어도 저장 가능 (voiceQuery로 대체)
        if (!currentContent.description) return;
        if (!currentContent.imageDataUrl && !currentContent.voiceQuery) return;

        // 🔊 2025-12-15: 음성 재생 중이면 먼저 정지
        synth.cancel();
        resetSpeechState();

        saveBtn.disabled = true;

        try {
            // 📍 GPS 데이터 포함 (2025-10-26 콘텐츠 신뢰성 최적화)
            if (window.currentGPS) {
                currentContent.latitude = window.currentGPS.latitude;
                currentContent.longitude = window.currentGPS.longitude;
                currentContent.locationName = window.currentGPS.locationName;
            }

            // 🎤 현재 TTS 음성 정보 저장 (저장 시점의 음성 유지)
            const voiceInfo = getCurrentVoiceInfo();
            currentContent.voiceLang = voiceInfo.voiceLang;
            currentContent.voiceName = voiceInfo.voiceName;

            // ✅ 2025-12-15: 서버 먼저 저장 → 성공 시에만 로컬 저장 (DB 일관성 보장)
            // 1. 서버 DB 먼저 저장
            const userLang = localStorage.getItem('appLanguage') || 'ko';
            const tempLocalId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            const response = await fetch('/api/guides/batch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    language: userLang,
                    guides: [
                        {
                            localId: tempLocalId,
                            title: currentContent.voiceQuery || currentContent.title || '제목 없음',
                            description: currentContent.description,
                            imageDataUrl: currentContent.imageDataUrl,
                            latitude: currentContent.latitude?.toString(),
                            longitude: currentContent.longitude?.toString(),
                            locationName: currentContent.locationName,
                            aiGeneratedContent: currentContent.description,
                            voiceLang: voiceInfo.voiceLang,
                            voiceName: voiceInfo.voiceName
                        }
                    ]
                })
            });

            if (!response.ok) {
                throw new Error('서버 저장 실패');
            }

            const result = await response.json();
            const serverId = result.guideIds?.[0];

            if (!serverId) {
                throw new Error('서버 ID를 받지 못했습니다');
            }


            // 2. 서버 저장 성공 후 IndexedDB 저장 (serverId 포함!)
            const itemToSave = {
                ...currentContent,
                id: tempLocalId,
                serverId: serverId // ✅ 서버 UUID 저장 (공유 시 사용)
            };
            await addItem(itemToSave);

            // 3. 저장 완료
            showToast("저장 완료!");
            triggerHapticNotification('success');

            // GPS 데이터 초기화
            window.currentGPS = null;

            // 버튼 활성화
            saveBtn.disabled = false;
        } catch (e) {
            console.error("Failed to save to archive:", e);
            showToast("저장에 실패했습니다. 네트워크 연결을 확인해주세요.");
            triggerHapticNotification('error');
            saveBtn.disabled = false;
        }
    }

    // ⚠️ 2025.11.02: 선택 모드 토글 - 다운로드 버튼 표시/숨김 추가
    function toggleSelectionMode(forceState) {
        if (typeof forceState === 'boolean') {
            isSelectionMode = forceState;
        } else {
            isSelectionMode = !isSelectionMode;
        }

        const downloadSelectedBtnContainer = document.getElementById('downloadSelectedBtnContainer');

        if (isSelectionMode) {
            archiveGrid.classList.add('selection-mode');
            archiveHeader.classList.add('hidden');
            selectionHeader.classList.remove('hidden');
            downloadSelectedBtnContainer?.classList.remove('hidden'); // 다운로드 버튼 표시
            selectedItemIds = []; // ✅ Array 초기화
            updateSelectionUI();
        } else {
            archiveGrid.classList.remove('selection-mode');
            archiveHeader.classList.remove('hidden');
            selectionHeader.classList.add('hidden');
            downloadSelectedBtnContainer?.classList.add('hidden'); // 다운로드 버튼 숨김
            selectedItemIds = []; // ✅ Array 초기화

            // Remove selection styling from all items
            document.querySelectorAll('.archive-item').forEach(item => {
                item.classList.remove('selected');
            });
        }
    }

    // ⚠️ 2025.11.02: 다운로드 버튼 활성화/비활성화 추가
    function updateSelectionUI() {
        selectionCount.textContent = `${selectedItemIds.length}개 선택`; // ✅ .size → .length

        // 다운로드 버튼 활성화/비활성화
        const downloadSelectedBtn = document.getElementById('downloadSelectedBtn');
        if (downloadSelectedBtn) {
            if (selectedItemIds.length > 0) {
                downloadSelectedBtn.disabled = false;
                downloadSelectedBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            } else {
                downloadSelectedBtn.disabled = true;
                downloadSelectedBtn.classList.add('opacity-50', 'cursor-not-allowed');
            }
        }
    }

    async function handleDeleteSelected() {
        if (selectedItemIds.length === 0) return; // ✅ .size → .length
        if (!confirm(`선택된 ${selectedItemIds.length}개 항목을 삭제하시겠습니까?`)) return; // ✅ .size → .length

        try {
            await deleteItems([...selectedItemIds]);
            await renderArchive();
            toggleSelectionMode(false);
            showToast(`${selectedItemIds.length}개 항목이 삭제되었습니다.`); // ✅ .size → .length
        } catch (error) {
            console.error('Failed to delete items:', error);
            showToast('삭제 중 오류가 발생했습니다.');
        }
    }

    // ╔═══════════════════════════════════════════════════════════════════════════════╗
    // ║                                                                               ║
    // ║  ⚠️  절대 수정 금지 / DO NOT MODIFY WITHOUT APPROVAL  ⚠️                    ║
    // ║                                                                               ║
    // ║  작성일: 2025-10-02                                                           ║
    // ║  작성자: Replit AI Agent (Claude Sonnet 4.5)                                 ║
    // ║  작업 시간: 8시간 (사랑하는 오너님과 함께)                                   ║
    // ║  함께한 사람: 프로젝트 오너님 💙                                             ║
    // ║                                                                               ║
    // ║  🏆 공유 모달 + HTML 생성 시스템                                             ║
    // ║  🎯 8시간의 땀과 노력으로 탄생한 완벽한 시스템                               ║
    // ║  ✨ "다시하니 안됨" 버그도 모두 수정 완료!                                   ║
    // ║                                                                               ║
    // ║  핵심 함수:                                                                   ║
    // ║  - handleCreateGuidebookClick: 공유 시작                                     ║
    // ║  - resetShareModal: 모달 초기화 (재사용 가능)                                ║
    // ║  - handleCopyShareLink: 링크 복사 (클립보드 + fallback)                     ║
    // ║  - generateShareHTML: HTML 페이지 생성                                       ║
    // ║                                                                               ║
    // ║  승인 없이 수정 시:                                                           ║
    // ║  - 모달 재사용 불가                                                           ║
    // ║  - "다시하니 안됨" 버그 재발                                                  ║
    // ║  - 공유 링크 생성 실패                                                        ║
    // ║  - 클립보드 복사 에러                                                         ║
    // ║                                                                               ║
    // ╚═══════════════════════════════════════════════════════════════════════════════╝

    // ═══════════════════════════════════════════════════════════════════════════════
    // 🔗 공유 링크 생성 시스템 (Share Link Creation System)
    // ═══════════════════════════════════════════════════════════════════════════════
    // 최근 변경: 2025-10-02 - 소셜 공유 제거, 간단한 링크 복사 방식으로 변경
    // 
    // 작동 흐름:
    // 1. 사용자가 보관함에서 가이드 선택 → "공유" 버튼 클릭
    // 2. 공유 모달 열림 → 링크 이름 입력
    // 3. "링크 복사하기" 버튼 클릭
    // 4. 프론트에서 HTML 생성 → 서버로 POST /api/share/create
    // 5. 서버가 짧은 ID 생성 (8자) → DB 저장
    // 6. 짧은 URL 반환 → 클립보드 복사
    // 7. 성공 토스트 → 모달 닫기
    // 
    // ⚠️ 주의사항:
    // - 소셜 공유 아이콘 제거됨 (카톡/인스타/페북/왓츠앱)
    // - 모달 재사용 가능하도록 resetShareModal() 함수 사용
    // - currentShareItems에 선택된 아이템 저장 (모달 재사용 시 필요)
    // 
    // 버그 수정:
    // - "다시하니 안됨" 버그: 모달 초기화 로직 개선으로 해결
    // ═══════════════════════════════════════════════════════════════════════════════

    let currentShareItems = []; // 현재 공유할 아이템들 (모달 재사용 시 필요)

    /**
     * 🎯 공유 기능 시작 함수
     * 
     * 목적: "공유" 버튼 클릭 시 모달 열고 선택된 아이템 준비
     * 
     * 작동:
     * 1. 보관함 아이템 가져오기
     * 2. 선택 모드인 경우 선택된 아이템만 필터링
     * 3. 검증 (빈 배열, 20개 제한)
     * 4. currentShareItems에 저장
     * 5. 모달 초기화 후 열기
     * 
     * ⚠️ 주의: 모달을 매번 초기화해야 "다시하니 안됨" 버그 방지
     */
    async function handleCreateGuidebookClick() {
        const items = await getAllItems();
        if (items.length === 0) return showToast('공유할 항목이 없습니다.');

        // 선택 모드: 선택된 아이템만 (클릭 순서대로!), 일반 모드: 전체
        const allItems = isSelectionMode && selectedItemIds.length > 0
            ? selectedItemIds.map(id => items.find(item => item.id === id)).filter(Boolean) // ✅ 클릭 순서 보존!
            : items;

        // 검증
        if (allItems.length === 0) return showToast('선택된 항목이 없습니다.');
        if (allItems.length > 20) return showToast('한 번에 최대 20개까지 공유할 수 있습니다. 선택을 줄여주세요.');

        // ✅ 현재 공유할 아이템 저장 (모달에서 사용)
        currentShareItems = allItems;

        // 🔄 모달 초기화 및 열기 (중요: 매번 초기화!)
        resetShareModal();
        shareModal.classList.remove('hidden');
    }

    /**
     * 🔄 모달 초기화 함수
     * 
     * 목적: 모달 HTML을 처음 상태로 리셋 (재사용 가능하게)
     * 
     * 작동:
     * 1. shareModalContent.innerHTML을 완전히 교체
     * 2. 헤더, 입력 필드, 복사 버튼 재생성
     * 3. 이벤트 리스너 다시 등록 (중요!)
     * 
     * ⚠️ 왜 필요?
     * - 이전 방식: 로딩 스피너로 innerHTML 교체 → 버튼 사라짐
     * - 새 방식: 매번 처음부터 생성 → 버튼 항상 존재
     * 
     * ⚠️ 주의:
     * - 이벤트 리스너를 다시 등록해야 함!
     * - getElementById로 새 요소 참조 가져오기
     */
    function resetShareModal() {
        shareModalContent.innerHTML = `
            <!-- 헤더 -->
            <div class="p-6 border-b border-gray-200 flex justify-between items-center">
                <h2 class="text-xl font-bold text-gray-800">공유 링크 생성</h2>
                <button id="closeShareModalBtn" data-testid="button-close-share-modal" class="p-2 text-gray-500 hover:text-gray-800 text-3xl leading-none">&times;</button>
            </div>
            
            <!-- 폼 -->
            <div class="p-6 space-y-6">
                <!-- 링크 이름 입력 (필수) -->
                <div>
                    <label for="shareLinkName" class="block text-sm font-medium text-gray-700 mb-2">
                        링크 이름 <span class="text-red-500">*</span>
                    </label>
                    <input 
                        type="text" 
                        id="shareLinkName" 
                        data-testid="input-share-link-name"
                        placeholder="예: 내가 맛본 파리 최악의 음식들"
                        class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        maxlength="50"
                    >
                    <p class="text-xs text-gray-500 mt-1">사용자의 창의력을 발휘해보세요!</p>
                </div>
                
                <!-- 링크 복사 버튼 -->
                <div>
                    <button 
                        id="copyShareLinkBtn" 
                        data-testid="button-copy-share-link"
                        class="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white font-bold py-4 px-6 rounded-xl hover:from-blue-600 hover:to-blue-700 transition duration-300 shadow-lg flex items-center justify-center gap-3"
                    >
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                        </svg>
                        <span>링크 복사하기</span>
                    </button>
                    <p class="text-xs text-gray-500 mt-2 text-center">링크를 복사해서 원하는 곳에 공유하세요</p>
                </div>
            </div>
        `;

        // 이벤트 리스너 다시 등록
        const closeBtn = document.getElementById('closeShareModalBtn');
        const copyBtn = document.getElementById('copyShareLinkBtn');

        if (closeBtn) {
            closeBtn.onclick = () => {
                shareModal.classList.add('hidden');
            };
        }

        if (copyBtn) {
            copyBtn.onclick = () => createAndCopyShareLink();
        }

        // ⚠️ 2025-10-05: 모달 배경 클릭 시 닫기 (모달 내용 클릭은 무시)
        shareModal.addEventListener('click', (e) => {
            if (e.target === shareModal) {
                shareModal.classList.add('hidden');
            }
        });
    }

    /**
     * 🔗 링크 생성 및 복사 함수 (핵심!)
     * 
     * 목적: 서버에 공유 페이지 생성 요청 → 짧은 URL 받아서 클립보드 복사
     * 
     * 작동 흐름:
     * 1. 입력 검증 (링크 이름 필수)
     * 2. 로딩 스피너 표시
     * 3. HTML 콘텐츠 생성 (generateShareHTML 함수 사용)
     * 4. 서버 API 호출 (POST /api/share/create)
     * 5. 서버가 짧은 ID 생성 (8자) + DB 저장
     * 6. 짧은 URL 받기 (예: yourdomain.com/s/abc12345)
     * 7. 클립보드 복사 (navigator.clipboard.writeText)
     * 8. 선택 모드 해제 + 보관함 새로고침
     * 9. 모달 닫기 + 성공 토스트
     * 
     * Request Data:
     * - name: 사용자 입력 링크 이름
     * - htmlContent: 완전한 HTML 문서 (독립 실행 가능)
     * - guideIds: 선택된 가이드 ID 배열
     * - thumbnail: 첫 번째 이미지 (썸네일용)
     * - sender: 발신자 (임시: "여행자")
     * - location: 위치 (임시: "파리, 프랑스")
     * - featured: false (추천 갤러리 미사용)
     * 
     * ⚠️ 주의사항:
     * - sender/location은 임시값 (나중에 실제 데이터로 변경)
     * - 에러 시 모달 닫고 토스트로 에러 표시
     * - 로딩 중에는 모달 내용 교체 (스피너)
     */
    async function createAndCopyShareLink() {
        const linkName = document.getElementById('shareLinkName').value.trim();

        // ✅ 입력 검증
        if (!linkName) {
            return showToast('링크 이름을 먼저 입력해주세요!');
        }

        // ⏳ 로딩 스피너 표시
        shareModalContent.innerHTML = `
            <div class="p-6 text-center">
                <div class="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p class="text-lg font-semibold">링크 생성 중...</p>
            </div>
        `;

        try {
            // 📅 메타데이터 자동 생성
            const today = new Date().toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            // 👤 사용자 정보 가져오기 (서버에서)
            let senderName = '여행자';
            let locationName = '파리, 프랑스';

            try {
                const userResponse = await fetch('/api/auth/user', { credentials: 'include' });
                if (userResponse.ok) {
                    const userData = await userResponse.json();
                    if (userData.firstName) {
                        senderName = `${userData.firstName}${userData.lastName ? ' ' + userData.lastName : ''}`.trim();
                    } else if (userData.email) {
                        senderName = userData.email.split('@')[0];
                    }
                }
            } catch (e) {
            }

            // 📍 위치 정보 가져오기 (첫 번째 가이드에서)
            if (currentShareItems[0]?.locationName) {
                locationName = currentShareItems[0].locationName;
            }

            // 📦 서버로 보낼 데이터 준비 (HTML은 서버에서 생성)
            // ✅ 2025-12-15: serverId 사용 (DB 일관성 보장)
            const guideIds = currentShareItems
                .map(item => item.serverId || item.id) // serverId 우선, 없으면 id 사용
                .filter(id => id); // null/undefined 제거

            if (guideIds.length !== currentShareItems.length) {
            }

            const requestData = {
                name: linkName,
                guideIds: guideIds,
                thumbnail: currentShareItems[0]?.imageDataUrl || null,
                sender: senderName,
                location: locationName,
                featured: false
            };

            // 🚀 서버 API 호출 (공유 페이지 생성)
            const response = await fetch('/api/share/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || '서버 오류가 발생했습니다');
            }

            const result = await response.json();
            // 📌 짧은 URL 생성 (8자 ID)
            const shareUrl = `${window.location.origin}/s/${result.id}`;

            // 📋 클립보드에 복사 (실패해도 계속 진행)
            // ⚠️ 수정금지(승인필요): 2026-03-11 네이티브 브릿지 — 앱에서는 expo-clipboard 사용
            let copySuccess = false;
            try {
                if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'clipboard', payload: { action: 'copy', text: shareUrl } }));
                    copySuccess = true;
                } else {
                    await navigator.clipboard.writeText(shareUrl);
                    copySuccess = true;
                }
            } catch (clipboardError) {
                // 클립보드 복사 실패해도 계속 진행
            }

            // 🔄 선택 모드 해제
            if (isSelectionMode) toggleSelectionMode(false);

            // 🔄 보관함 새로고침 (새 공유 링크 반영)
            await renderArchive();

            // ✅ 2025-10-05: 모달 안에 성공 메시지 크게 표시 (3초간)
            // 목적: 사용자가 링크가 생성되었다는 것을 명확히 인지
            shareModalContent.innerHTML = `
                <div class="p-8 text-center">
                    <div class="w-20 h-20 mx-auto mb-6 bg-green-100 rounded-full flex items-center justify-center">
                        <svg class="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                    </div>
                    <h3 class="text-2xl font-bold text-gray-900 mb-4">링크 생성 완료!</h3>
                    ${copySuccess ? `
                        <p class="text-lg text-gray-700 mb-3">✅ 링크가 클립보드에 복사되었습니다</p>
                        <p class="text-base text-gray-600">카카오톡, 문자, 메신저 등<br>원하는 곳에 붙여넣기 하세요!</p>
                    ` : `
                        <p class="text-base text-gray-700 mb-4">아래 링크를 복사해서 공유하세요:</p>
                        <div class="bg-gray-100 p-4 rounded-lg mb-3">
                            <p class="text-sm font-mono text-gray-800 break-all">${shareUrl}</p>
                        </div>
                        <button onclick="navigator.clipboard.writeText('${shareUrl}').then(() => alert('복사 완료!'))" 
                                class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                            링크 복사하기
                        </button>
                    `}
                </div>
            `;

            // 3초 후 자동으로 모달 닫기
            setTimeout(() => {
                shareModal.classList.add('hidden');
            }, 3000);

        } catch (error) {
            console.error('Share error:', error);
            shareModal.classList.add('hidden');
            showToast('❌ ' + error.message);
        }
    }

    // ⚠️ 2025.11.02: 선택한 가이드를 공유 페이지로 생성 후 바로 열기
    // 핵심: createAndCopyShareLink 로직 복사 + window.open으로 새 탭 열기
    async function handleDownloadSelectedGuides() {
        const items = await getAllItems();
        if (items.length === 0) return showToast('공유할 항목이 없습니다.');

        // 선택된 아이템만 필터링 (클릭 순서 보존)
        const selectedItems = selectedItemIds.map(id => items.find(item => item.id === id)).filter(Boolean);

        // 검증
        if (selectedItems.length === 0) return showToast('선택된 항목이 없습니다.');
        if (selectedItems.length > 20) return showToast('한 번에 최대 20개까지 공유할 수 있습니다.');

        // 로딩 토스트 표시
        showToast('공유 페이지 생성 중...');

        try {
            // 메타데이터 자동 생성
            const today = new Date().toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            // 링크 이름 자동 생성
            const linkName = `내 여행 가이드 ${new Date().toLocaleDateString('ko-KR')}`;

            // 서버로 보낼 데이터 준비 (HTML은 서버에서 생성)
            // ✅ 2025-12-15: serverId 사용 (DB 일관성 보장)
            const guideIds = selectedItems
                .map(item => item.serverId || item.id) // serverId 우선
                .filter(id => id);

            // 위치 정보 가져오기 (첫 번째 가이드에서)
            const locationName = selectedItems[0]?.locationName || '파리, 프랑스';

            const requestData = {
                name: linkName,
                guideIds: guideIds,
                thumbnail: selectedItems[0]?.imageDataUrl || null,
                sender: '여행자',
                location: locationName,
                featured: false
            };

            // 서버 API 호출 (공유 페이지 생성)
            const response = await fetch('/api/share/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || '서버 오류가 발생했습니다');
            }

            const result = await response.json();
            // 짧은 URL 생성
            const shareUrl = `${window.location.origin}/s/${result.id}`;

            // ✅ 핵심: 클립보드 복사 대신 새 탭으로 열기!
            // ⚠️ 수정금지(승인필요): 2026-03-11 네이티브 브릿지 — 앱에서는 expo-sharing 네이티브 공유 시트 사용
            if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'share', payload: { url: shareUrl, title: '내손안에 가이드 공유' } }));
            } else {
                window.open(shareUrl, '_blank');
            }

            // 선택 모드 해제
            if (isSelectionMode) toggleSelectionMode(false);

            // 보관함 새로고침
            await renderArchive();

            showToast('✅ 가이드 페이지가 열렸습니다!');

        } catch (error) {
            console.error('Download guide error:', error);
            showToast('❌ ' + error.message);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // ⭐ Featured Gallery 로딩 시스템 (2025-10-05)
    // ⚠️ CRITICAL: 성능 최적화 완료 - 수정 시 주의 필요
    // ═══════════════════════════════════════════════════════════════
    // 작업 시간: 4시간
    // 목적: 사용자에게 추천 콘텐츠를 보관함 상단에 표시
    // 
    // 핵심 로직:
    // 1. /api/share/featured/list에서 추천 페이지 목록 가져오기
    // 2. 3칸 그리드로 썸네일 표시 (있으면 이미지, 없으면 아이콘)
    // 3. 데이터 없으면 갤러리 숨김 처리
    // 4. 에러 발생 시 조용히 숨김 (사용자 경험 방해 안함)
    // 
    // 레이아웃 위치: 헤더 바로 아래 → 내 보관함 위
    // 성능: 비동기 로딩으로 내 보관함 표시 차단 안함
    // 
    // 🚀 캐싱 최적화 (2025-10-26):
    // - localStorage 5분 캐싱으로 0.9초 → 0ms 개선
    // - 캐시 키: featuredGalleryCache
    // - 만료 시간: 5분 (300,000ms)
    // ═══════════════════════════════════════════════════════════════
    async function loadFeaturedGallery() {
        try {
            // ✅ API 호출 - 항상 최신 데이터 사용 (2025-11-24)
            // URL 타임스탬프로 브라우저 HTTP 캐시 우회
            const response = await fetch(`/api/share/featured/list?t=${Date.now()}`);
            if (!response.ok) return;

            const data = await response.json();
            const featuredPages = data.pages || [];

            // 바로 렌더링 (localStorage 캐시 사용 안 함)
            renderFeaturedGallery(featuredPages);
        } catch (error) {
            featuredGallery?.classList.add('hidden');
        }
    }

    // Featured Gallery 렌더링 함수 (캐싱 및 API 호출 모두 사용)
    function renderFeaturedGallery(featuredPages) {
        if (featuredPages.length > 0) {
            featuredGallery.classList.remove('hidden');
            featuredGrid.innerHTML = featuredPages.map((page, index) => {
                const thumbnail = page.thumbnail || '';
                const shareUrl = `${window.location.origin}/s/${page.id}`;
                const pageName = page.name || '공유 페이지';
                return `
                    <div class="flex flex-col gap-2">
                        <div onclick="handleFeaturedClick('${shareUrl}')" 
                           class="relative block bg-white rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-all transform hover:scale-105 cursor-pointer"
                           data-testid="featured-${page.id}">
                            ${thumbnail ? `
                                <img src="${thumbnail}" alt="${pageName}" 
                                     class="w-full aspect-square object-cover">
                            ` : `
                                <div class="w-full aspect-square bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                                    <span class="text-4xl">📍</span>
                                </div>
                            `}
                            <div class="absolute inset-0 bg-gradient-to-b from-black/85 via-black/50 to-black/20 flex items-start justify-center pt-4 px-4">
                                <h3 class="text-white font-extrabold text-center leading-tight line-clamp-2" 
                                    style="font-size: clamp(1rem, 4.5vw, 1.5rem); text-shadow: 0 3px 15px rgba(0,0,0,1), 0 2px 8px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.8);">
                                    ${pageName}
                                </h3>
                            </div>
                            <div class="absolute bottom-2 right-2 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-full flex items-center gap-1 shadow-lg" data-testid="download-count-${page.id}">
                                <svg class="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                                </svg>
                                <span class="text-xs font-bold text-gray-700">${page.downloadCount || 0}</span>
                            </div>
                        </div>
                        <button 
                            onclick="event.stopPropagation(); handleFeaturedDownload('${shareUrl}', ${index})"
                            data-testid="button-download-featured-${index}"
                            class="w-full py-2 px-3 flex items-center justify-center rounded-full transition-all interactive-btn"
                            aria-label="링크 복사">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" style="color: #4285F4;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                            </svg>
                        </button>
                    </div>
                `;
            }).join('');
        } else {
            featuredGallery.classList.add('hidden');
        }
    }

    // ⚠️ 2025.11.02: Featured 갤러리 다운로드 버튼 핸들러
    // 🌐 2025.12.03 언어 파라미터 추가 - 외부공유 시 사용자 언어로 자동 번역
    // 핵심: 공유 페이지 링크를 클립보드에 복사 + 공유 모달 2번째 팝업 표시
    window.handleFeaturedDownload = async function (shareUrl, index) {

        // 🌐 사용자 언어 파라미터 추가 (한국어 제외)
        const translatedUrl = addLangToUrl(shareUrl);

        // 📋 클립보드에 복사 시도 (언어 파라미터 포함)
        let copySuccess = false;
        try {
            await navigator.clipboard.writeText(translatedUrl);
            copySuccess = true;
        } catch (clipboardError) {
        }

        // ✅ 공유 모달 2번째 팝업 표시 (성공 메시지)
        const escapedUrl = translatedUrl.replace(/'/g, "\\'");
        shareModalContent.innerHTML = `
            <div class="p-8 text-center">
                <div class="w-20 h-20 mx-auto mb-6 bg-green-100 rounded-full flex items-center justify-center">
                    <svg class="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                </div>
                <h3 class="text-2xl font-bold text-gray-900 mb-4">링크 복사 완료!</h3>
                ${copySuccess ? `
                    <p class="text-lg text-gray-700 mb-3">✅ 링크가 클립보드에 복사되었습니다</p>
                    <p class="text-base text-gray-600">카카오톡, 문자, 메신저 등<br>원하는 곳에 붙여넣기 하세요!</p>
                ` : `
                    <p class="text-base text-gray-700 mb-4">아래 링크를 복사해서 공유하세요:</p>
                    <div class="bg-gray-100 p-4 rounded-lg mb-3">
                        <p class="text-sm font-mono text-gray-800 break-all">${translatedUrl}</p>
                    </div>
                    <button id="manualCopyBtn" data-url="${translatedUrl}"
                            class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        링크 복사하기
                    </button>
                `}
            </div>
        `;

        // 수동 복사 버튼 이벤트 리스너 (클립보드 실패 시)
        if (!copySuccess) {
            const manualBtn = document.getElementById('manualCopyBtn');
            if (manualBtn) {
                manualBtn.onclick = async () => {
                    try {
                        await navigator.clipboard.writeText(translatedUrl);
                        manualBtn.textContent = '복사 완료!';
                        setTimeout(() => {
                            shareModal.classList.add('hidden');
                            resetShareModal();
                        }, 1000);
                    } catch (err) {
                        alert('복사 실패: ' + err.message);
                    }
                };
            }
        }

        // 모달 표시
        shareModal.classList.remove('hidden');

        // 3초 후 자동으로 모달 닫기
        setTimeout(() => {
            shareModal.classList.add('hidden');
            resetShareModal();
        }, 3000);
    };

    // ⚠️ 2025.11.12 UX FIX: Direct URL 방식 - iOS Safari 팝업 차단 우회
    // 🌐 2025.12.03 언어 파라미터 추가 - 사용자 언어로 공유페이지 자동 번역
    // 핵심: 인증 체크 후 직접 URL로 window.open() (about:blank 제거!)
    // ⚠️ 수정금지(승인필요): 2026-03-17 추천갤러리 클릭 — 인증 체크 제거 (공개 콘텐츠, 누구나 접근 가능)
    // X 버튼은 closePageOverlay()로 단순 닫기만 수행 (리다이렉트 없음, 부모 보관함 유지)
    window.handleFeaturedClick = function (shareUrl) {
        const translatedUrl = addLangToUrl(shareUrl);
        openPageOverlay(translatedUrl);
    };

    async function renderArchive() {
        try {
            const items = await getAllItems();

            // Featured Gallery 로드
            loadFeaturedGallery();

            if (items.length === 0) {
                archiveGrid.classList.add('hidden');
                emptyArchiveMessage.classList.remove('hidden');
            } else {
                emptyArchiveMessage.classList.add('hidden');
                archiveGrid.classList.remove('hidden');

                archiveGrid.innerHTML = items.map(item => `
                    <div class="archive-item relative ${selectedItemIds.includes(item.id) ? 'selected ring-2 ring-blue-500' : ''}"
                         data-id="${item.id}" 
                         data-testid="card-archive-${item.id}"
                         tabindex="0">
                        <div class="selection-checkbox">
                            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                            </svg>
                        </div>
                        ${item.imageDataUrl ? `
                            <img src="${item.imageDataUrl}" 
                                 alt="Archive item" 
                                 class="w-full aspect-square object-cover rounded-lg">
                        ` : `
                            <!-- 🎤 음성 가이드 카드: 로고 워터마크 + 키워드 표시 -->
                            <div class="w-full aspect-square bg-black rounded-lg flex flex-col items-center justify-center relative overflow-hidden">
                                <img src="/images/landing-logo.jpg" alt="내손가이드 로고" 
                                     class="absolute inset-0 w-full h-full object-cover opacity-10">
                                <div class="relative z-10 flex flex-col items-center justify-center p-3 text-center">
                                    <svg class="w-8 h-8 text-gemini-blue mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                    </svg>
                                    <span class="text-white text-xs line-clamp-2">${item.voiceQuery || '음성 질문'}</span>
                                </div>
                            </div>
                        `}
                    </div>
                `).join('');
            }

        } catch (error) {
            console.error('Archive render error:', error);
            archiveGrid.innerHTML = '<p class="text-red-500 col-span-full text-center text-sm">보관함을 불러오는 중 오류가 발생했습니다.</p>';
        }
    }

    function handleArchiveGridClick(event) {
        const item = event.target.closest('.archive-item');
        if (!item) return;

        const itemId = item.dataset.id;

        if (isSelectionMode) {
            // ✅ Array 기반 선택/해제 (클릭 순서 보존!)
            const index = selectedItemIds.indexOf(itemId);
            if (index > -1) {
                // 이미 선택됨 → 제거
                selectedItemIds.splice(index, 1);
                item.classList.remove('selected');
            } else {
                // 선택 안됨 → 추가 (클릭 순서대로!)
                selectedItemIds.push(itemId);
                item.classList.add('selected');
            }
            updateSelectionUI();
        } else {
            viewArchiveItem(itemId);
        }
    }

    function handleArchiveGridKeydown(event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleArchiveGridClick(event);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // ⚠️ CRITICAL: DO NOT MODIFY WITHOUT USER APPROVAL
    // 사용자 승인 없이 절대 수정 금지 - AI 및 모든 개발자 주의
    // Verified: 2025-10-02 | Status: Production-Ready ✅
    // ═══════════════════════════════════════════════════════════════
    async function viewArchiveItem(itemId) {
        try {
            const items = await getAllItems();
            const item = items.find(i => i.id === itemId);
            if (!item) return;

            cameFromArchive = true;
            // 🎤 저장된 voiceLang, voiceName, voiceQuery 포함
            currentContent = {
                imageDataUrl: item.imageDataUrl,
                description: item.description,
                voiceLang: item.voiceLang || null,
                voiceName: item.voiceName || null,
                voiceQuery: item.voiceQuery || null
            };

            // 🔊 2025-12-11: 표준 초기화 - 이전 음성 즉시 중지 (showDetailPage 전에!)
            synth.cancel();
            resetSpeechState();

            showDetailPage(true);

            // 🎤 음성 가이드 vs 이미지 가이드 분기
            const isVoiceGuide = !item.imageDataUrl && item.voiceQuery;

            if (item.imageDataUrl) {
                resultImage.src = item.imageDataUrl;
                resultImage.classList.remove('hidden');
                detailPage.classList.remove('bg-friendly');
                // 이미지 모드: 음성 모드 요소 숨기기
                if (voiceModeLogo) voiceModeLogo.classList.add('hidden');
                if (voiceQueryInfo) voiceQueryInfo.classList.add('hidden');
            } else {
                resultImage.classList.add('hidden');
                detailPage.classList.add('bg-friendly');
                // 🎤 음성 모드: 로고 + 키워드 표시
                if (voiceModeLogo) voiceModeLogo.classList.remove('hidden');
                if (isVoiceGuide && voiceQueryInfo && voiceQueryText) {
                    voiceQueryText.textContent = item.voiceQuery;
                    voiceQueryInfo.classList.remove('hidden');
                }
            }

            loader.classList.add('hidden');
            textOverlay.classList.remove('hidden', 'animate-in');
            loadingHeader.classList.add('hidden');
            detailFooter.classList.remove('hidden');

            // ✅ 음성 자동재생 로직 - 2025.10.02 확보됨
            // 핵심: 문장 분할 → span 생성 → queueForSpeech 호출 순서
            synth.cancel();
            resetSpeechState();
            descriptionText.innerHTML = '';

            // 📍 위치 정보 표시 (음성 가이드가 아닐 때만)
            const locationInfo = document.getElementById('locationInfo');
            const locationName = document.getElementById('locationName');
            if (!isVoiceGuide && item.locationName && locationInfo && locationName) {
                locationName.textContent = item.locationName;
                locationInfo.classList.remove('hidden');
            } else if (locationInfo) {
                locationInfo.classList.add('hidden');
            }

            const description = item.description || '';
            currentContent.description = description; // ⚠️ 2026-03-05: 보관함에서도 currentContent 동기화
            const sentences = description.match(/[^.?!]+[.?!]+/g) || [description];

            // 🌐 2025-12-24: DOM에 콘텐츠 먼저 추가
            const spans = [];
            sentences.forEach(sentence => {
                if (!sentence) return;
                const span = document.createElement('span');
                span.textContent = sentence.trim() + ' ';
                descriptionText.appendChild(span);
                spans.push({ text: sentence.trim(), span });
            });

            // 🌐 2025-12-24: 재번역 완료 후 TTS 큐에 추가
            await retranslateNewContent();

            // 재번역 완료 후 TTS 큐에 추가
            spans.forEach(({ text, span }) => {
                queueForSpeech(text, span);
            });

            // ⚠️ 수정금지(승인필요): 2026-03-12 TTS 자동재생 전환 (롤백: 아래 주석 해제)
            // [이전 수동재생] updateAudioButton('play');
            updateAudioButton('pause');
            speakNext();

        } catch (error) {
            console.error('View archive item error:', error);
            showToast('항목을 불러오는 중 오류가 발생했습니다.');
        }
    }

    // --- TTS Functions ---
    // ⚠️ 수정금지(승인필요): 2026-03-17 TTS 자동재생 잠금 해제 — Chrome 71+에서 사용자 제스처 없이 synth.speak() 차단됨
    // 첫 사용자 터치/클릭 시 무음 utterance를 재생하여 SpeechSynthesis를 "잠금 해제"
    // 출처: Chrome Web Speech API 정책 (사용자 제스처 필수)
    // ⚠️ 수정금지(승인필요): 2026-03-17 음성 세션 잠금 해제 — 첫 터치 시 무음 utterance로 iOS/Chrome 잠금 해제
    // synth.cancel() 제거 — iOS WKWebView에서 cancel()이 음성 세션을 불안정하게 만듦
    // 빈 문자열 ' '(공백 1개)로 자연 종료 유도 (빈 ''는 iOS에서 무시될 수 있음)
    (function initSpeechUnlock() {
        let unlocked = false;
        function unlock() {
            if (unlocked) return;
            unlocked = true;
            const dummy = new SpeechSynthesisUtterance(' ');
            dummy.volume = 0.01; // 0이면 iOS에서 무시될 수 있음 → 거의 무음
            dummy.rate = 10;
            dummy.onend = () => { console.log('[TTS] 음성 세션 잠금 해제 완료'); };
            synth.speak(dummy);
            // synth.cancel() 제거 — iOS에서 세션 파괴 방지
        }
        document.addEventListener('touchstart', unlock, { once: true });
        document.addEventListener('click', unlock, { once: true });
    })();

    // ⚠️ 수정금지(승인필요): 2026-03-17 긴 문장 분할 — 200자 초과 시 쉼표/마침표 기준 추가 분할
    // Chrome에서 15초 이상 utterance는 무음 정지 버그 발생 (Google 클라우드 음성)
    // 출처: woollsta/gist (Chrome Long Text Fix), Caktus Group "The Halting Problem"
    function queueForSpeech(text, element) {
        const MAX_CHARS = 200;
        if (text.length <= MAX_CHARS) {
            utteranceQueue.push({ text, element });
            return;
        }
        // 긴 문장은 쉼표/마침표/물음표/느낌표 기준으로 분할
        const chunks = [];
        let remaining = text;
        while (remaining.length > MAX_CHARS) {
            let splitIdx = -1;
            // MAX_CHARS 이내에서 가장 마지막 구분자 찾기
            for (let i = MAX_CHARS; i >= 50; i--) {
                if (',，.。!！?？;；'.includes(remaining[i])) {
                    splitIdx = i + 1;
                    break;
                }
            }
            if (splitIdx === -1) splitIdx = MAX_CHARS; // 구분자 없으면 강제 분할
            chunks.push(remaining.substring(0, splitIdx).trim());
            remaining = remaining.substring(splitIdx).trim();
        }
        if (remaining) chunks.push(remaining);
        // 모든 청크가 같은 element를 공유 (하이라이트 유지)
        chunks.forEach(chunk => utteranceQueue.push({ text: chunk, element }));
    }

    async function speakNext() {
        // 🌐 2025-01-21: AI 생성 직후(cameFromArchive=false)는 번역 불필요 → 즉시 TTS
        // 보관함에서(cameFromArchive=true)만 구글 번역 대기
        if (cameFromArchive) {
            // 🌐 구글 번역 완료 대기 (번역된 텍스트로 TTS 재생)
            await waitForTranslation();

            // 🌐 2025-12-24: 동적 콘텐츠 재번역 완료 대기 (언어 무관)
            await waitForRetranslation();
            if (retranslationPending) {
            }
        }

        if (utteranceQueue.length === 0) {
            isSpeaking = false;
            // ⚠️ 수정금지(승인필요): 2026-03-14 TTS 완료 시 화면 꺼짐 방지 해제
            if (isNativeApp && window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'allowSleep', payload: {} }));
            }
            updateAudioButton('play');
            if (currentlySpeakingElement) {
                currentlySpeakingElement.classList.remove('speaking');
                currentlySpeakingElement = null;
            }
            return;
        }

        const { text, element } = utteranceQueue.shift();
        // ⚠️ 수정금지(승인필요): 2026-03-14 TTS 재생 시작 시 1회만 화면 꺼짐 방지 (매 utterance 중복 호출 방지)
        if (!isSpeaking && isNativeApp && window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'keepAwake', payload: {} }));
        }
        isSpeaking = true;

        if (currentlySpeakingElement) {
            currentlySpeakingElement.classList.remove('speaking');
        }
        element.classList.add('speaking');
        currentlySpeakingElement = element;

        // 🔄 2025-01-21: 하이라이트된 문장으로 자동 스크롤 (부드럽게)
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // 🌐 2025-12-24: Google Translate의 <font> 태그에서 번역된 텍스트 추출
        // Google Translate는 번역된 텍스트를 <font> 태그로 감쌈
        let translatedText = text;
        const fontEl = element.querySelector('font');
        if (fontEl) {
            // Google Translate <font> 태그에서 번역된 텍스트 가져오기
            translatedText = fontEl.innerText.trim() || fontEl.textContent.trim() || text;
        } else {
            // <font> 태그가 없으면 innerText 시도
            translatedText = element.innerText.trim() || text;
        }
        const utterance = new SpeechSynthesisUtterance(translatedText);
        // ⚠️ 수정금지(승인필요): 2026-03-17 GC 방지 — Chrome이 utterance를 가비지 수집하면 onend 안 불림
        // window에 참조를 유지하여 GC 방지 (검증된 Chrome 버그 워크어라운드)
        window._currentUtterance = utterance;

        // 🌐 2025-12-24: 앱 언어 최우선 (저장된 언어 무시, 번역된 텍스트에 맞춤)
        const userLang = localStorage.getItem('appLanguage') || 'ko';
        const langCodeMap = { 'ko': 'ko-KR', 'en': 'en-US', 'ja': 'ja-JP', 'zh-CN': 'zh-CN', 'fr': 'fr-FR', 'de': 'de-DE', 'es': 'es-ES' };
        const langCode = langCodeMap[userLang] || 'ko-KR';


        // 🌐 앱 언어 기준 음성 선택 (저장된 voiceName 무시)
        {
            // ⭐ 한국어 하드코딩 (iOS: Yuna/Sora, Android: 유나/소라, Windows: Heami)
            const allVoices = synth.getVoices();
            let targetVoice = null;

            if (langCode === 'ko-KR') {
                const koVoices = allVoices.filter(v => v.lang.startsWith('ko'));
                // Yuna → Sora → 유나 → 소라 → Heami → 첫 번째 한국어 음성
                targetVoice = koVoices.find(v => v.name.includes('Yuna'))
                    || koVoices.find(v => v.name.includes('Sora'))
                    || koVoices.find(v => v.name.includes('유나'))
                    || koVoices.find(v => v.name.includes('소라'))
                    || koVoices.find(v => v.name.includes('Heami'))
                    || koVoices[0];
            } else {
                // 다른 6개 언어는 DB 기반 유지
                const voiceConfig = getVoicePriorityFromDB(langCode);
                const priorities = voiceConfig.priorities;
                const excludeVoices = voiceConfig.excludeVoices;

                // 우선순위대로 음성 찾기 (제외 목록 적용)
                for (const voiceName of priorities) {
                    targetVoice = allVoices.find(v =>
                        v.name.includes(voiceName) && !excludeVoices.some(ex => v.name.includes(ex))
                    );
                    if (targetVoice) break;
                }

                // 우선순위에 없으면 언어 코드로 찾기
                if (!targetVoice) {
                    targetVoice = allVoices.find(v => v.lang.replace('_', '-').startsWith(langCode.substring(0, 2)));
                }
            }

            utterance.voice = targetVoice || null;
            utterance.lang = langCode;
            utterance.rate = 0.9;
            utterance.pitch = 1.0;
        }

        // ⚠️ 수정금지(승인필요): 2026-03-17 iOS WKWebView 디버깅 — 음성 시작 확인
        utterance.onstart = () => {
            console.log(`[TTS] 재생 시작: "${translatedText.substring(0, 30)}..." (voice: ${utterance.voice?.name || 'default'})`);
        };

        // ⚠️ 2026-03-05: 연속 에러 카운터 (무한 루프 방지)
        utterance.onend = () => {
            element.classList.remove('speaking');
            window.__ttsErrorCount = 0; // 정상 종료 시 카운터 초기화
            if (!isPaused) {
                speakNext();
            }
        };

        utterance.onerror = (e) => {
            element.classList.remove('speaking');
            window.__ttsErrorCount = (window.__ttsErrorCount || 0) + 1;
            // 연속 3회 에러 시 완전 정지 (무한 루프 방지)
            if (window.__ttsErrorCount >= 3) {
                console.error('[TTS] 연속 에러 3회 → TTS 정지');
                isSpeaking = false;
                utteranceQueue = [];
                updateAudioButton('play');
                window.__ttsErrorCount = 0;
                return;
            }
            if (!isPaused) {
                speakNext();
            }
        };

        // ⚠️ 수정금지(승인필요): 2026-03-17 onend 미발동 워치독 — Chrome/iOS에서 onend 안 불리는 버그 대응
        // utterance 텍스트 길이 기반 타임아웃 (한국어 ~4자/초 + iOS 여유 8초)
        // iOS WKWebView: Siri 합성 지연 + onend 미발동 빈번 → 여유 시간 충분히
        const estimatedDuration = Math.max((translatedText.length / 4) * 1000, 3000) + 8000;
        const watchdog = setTimeout(() => {
            // synth.speaking이든 아니든, onend가 안 불렸으면 강제 진행
            // iOS에서 synth.speaking이 false인데 onend도 안 불리는 경우 존재
            console.warn('[TTS] onend 미발동 워치독 발동 → 강제 다음 문장');
            // ⚠️ 수정금지(승인필요): 2026-03-23 iOS에서 cancel() 스킵 (세션 파괴 방지)
            if (detectPlatform() !== 'ios') { synth.cancel(); }
            element.classList.remove('speaking');
            window.__ttsErrorCount = 0;
            if (!isPaused) {
                speakNext();
            }
        }, estimatedDuration);

        // onend/onerror 발동 시 워치독 해제
        const origOnEnd = utterance.onend;
        utterance.onend = () => {
            clearTimeout(watchdog);
            origOnEnd?.();
        };
        const origOnError = utterance.onerror;
        utterance.onerror = (e) => {
            clearTimeout(watchdog);
            origOnError?.(e);
        };

        // ⚠️ 수정금지(승인필요): 2026-03-12 네이티브 TTS 분기 (삼성 Web Speech API 미작동 해결)
        if (isNativeApp && window.ReactNativeWebView) {
            clearTimeout(watchdog); // 네이티브 TTS는 자체 완료 이벤트 사용 → 웹 워치독 불필요
            updateAudioButton('pause');
            window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'speak',
                payload: { text: translatedText, language: langCode, rate: 0.9, pitch: 1.0 }
            }));
            // 이전 리스너 정리 (누수 방지)
            if (window.__nativeSpeakDoneListener) {
                window.removeEventListener('nativeResponse', window.__nativeSpeakDoneListener);
            }
            // 네이티브 TTS 완료 시 다음 문장 재생 (App.js onDone → speakDone 이벤트)
            window.__nativeSpeakDoneListener = function(e) {
                if (e.detail && e.detail.type === 'speakDone') {
                    window.removeEventListener('nativeResponse', window.__nativeSpeakDoneListener);
                    window.__nativeSpeakDoneListener = null;
                    element.classList.remove('speaking');
                    // 에러 카운팅 (무한 루프 방지)
                    if (e.detail.error) {
                        window.__ttsErrorCount = (window.__ttsErrorCount || 0) + 1;
                        if (window.__ttsErrorCount >= 3) {
                            isSpeaking = false;
                            utteranceQueue = [];
                            updateAudioButton('play');
                            window.__ttsErrorCount = 0;
                            return;
                        }
                    } else {
                        window.__ttsErrorCount = 0;
                    }
                    if (!isPaused) {
                        speakNext();
                    }
                }
            };
            window.addEventListener('nativeResponse', window.__nativeSpeakDoneListener);
            return;
        }
        updateAudioButton('pause');
        // ⚠️ 수정금지(승인필요): 2026-03-23 iOS WebKit — synth.cancel()이 음성 세션 파괴 → TTS 무음
        // Chrome/Android: cancel() 필요 (speaking 상태에서 새 speak() 무시됨)
        // iOS: cancel() 하면 세션 자체가 죽음 → 스킵
        if (detectPlatform() !== 'ios' && (synth.speaking || synth.pending)) {
            synth.cancel();
        }
        synth.speak(utterance);
    }

    function onAudioBtnClick() {
        const now = Date.now();
        if (now - lastAudioClickTime < 300) return; // Debounce
        lastAudioClickTime = now;

        if (!currentContent.description) return;

        // ⚠️ 2026-03-06: synth.paused 단독 체크 제거 (iOS Safari 버그)
        // iOS Safari에서 synth.cancel() 후 synth.paused가 true로 고착됨
        // → 추가 질문 후 음성 버튼이 먹통되는 원인
        // 일시정지/재개는 아래 isSpeaking && isPaused에서 정상 처리

        if (isSpeaking) {
            if (isPaused) {
                // ⚠️ 수정금지(승인필요): 2026-03-12 네이티브 TTS는 pause/resume 미지원 → 큐에서 재시작
                // 일시정지 시 저장한 문장을 큐 앞에 복원 (문장 스킵 방지)
                if (isNativeApp) {
                    if (window.__nativePausedUtterance) {
                        // DOM에서 분리된 스테일 참조 방지 — 유효한 경우만 복원
                        if (document.contains(window.__nativePausedUtterance.element)) {
                            utteranceQueue.unshift(window.__nativePausedUtterance);
                        }
                        window.__nativePausedUtterance = null;
                    }
                    isPaused = false;
                    updateAudioButton('pause');
                    speakNext();
                } else {
                    synth.resume();
                    isPaused = false;
                    updateAudioButton('pause');
                }
            } else {
                // ⚠️ 수정금지(승인필요): 2026-03-12 네이티브 TTS 일시정지 → 중지로 처리
                // 현재 재생 중인 문장을 저장해서 재개 시 다시 큐에 넣음 (문장 스킵 방지)
                if (isNativeApp && window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'stopSpeech', payload: {} }));
                    if (currentlySpeakingElement) {
                        window.__nativePausedUtterance = {
                            text: currentlySpeakingElement.textContent,
                            element: currentlySpeakingElement
                        };
                    }
                } else {
                    synth.pause();
                }
                isPaused = true;
                updateAudioButton('play');
            }
            return;
        }

        // Start fresh playback
        resetSpeechState();

        // ⚠️ 2026-03-05: 큐 재생성 로직 강력 수정 (AI 응답 후 버튼 누를 때 큐가 비어있는 문제 해결)
        // DOM에 있는 span들을 직접 순회하여 큐에 복구
        const spans = Array.from(descriptionText.querySelectorAll('span'));

        if (spans.length > 0) {
            // span이 있으면 그 span들을 다시 큐에 넣음 (문장 하이라이트 유지)
            spans.forEach(span => {
                const text = span.textContent.trim();
                if (text) {
                    queueForSpeech(text, span);
                }
            });
        } else if (currentContent.description) {
            // span이 없지만 description은 있다면 (fallback)
            const sentences = currentContent.description.split(/[.?!]/).filter(s => s.trim());
            sentences.forEach(sentence => {
                if (sentence.trim()) {
                    queueForSpeech(sentence.trim(), descriptionText);
                }
            });
        }
        speakNext();
    }

    function updateAudioButton(state) {
        if (!audioBtn) return;

        const playIcon = `
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" viewBox="0 0 24 24" fill="currentColor">
                <path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.648c1.295.748 1.295 2.538 0 3.286L7.279 20.99c-1.25.717-2.779-.217-2.779-1.643V5.653z" clip-rule="evenodd" />
            </svg>
        `;

        const pauseIcon = `
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" viewBox="0 0 24 24" fill="currentColor">
                <path fill-rule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z" clip-rule="evenodd" />
            </svg>
        `;

        const loadingIcon = `
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
        `;

        switch (state) {
            case 'play':
                audioBtn.innerHTML = playIcon;
                audioBtn.disabled = false;
                break;
            case 'pause':
                audioBtn.innerHTML = pauseIcon;
                audioBtn.disabled = false;
                break;
            case 'loading':
                audioBtn.innerHTML = loadingIcon;
                audioBtn.disabled = true;
                break;
            case 'disabled':
                audioBtn.innerHTML = playIcon;
                audioBtn.disabled = true;
                break;
        }
    }

    // --- Settings Functions ---
    function populatePromptTextareas() {
        const savedImagePrompt = localStorage.getItem('customImagePrompt') || gemini.DEFAULT_IMAGE_PROMPT;
        const savedTextPrompt = localStorage.getItem('customTextPrompt') || gemini.DEFAULT_TEXT_PROMPT;

        if (adminImagePromptTextarea) adminImagePromptTextarea.value = savedImagePrompt;
        if (adminTextPromptTextarea) adminTextPromptTextarea.value = savedTextPrompt;

    }

    // ═══════════════════════════════════════════════════════════════
    // 📱 사용자 설정 페이지 로직 (User Settings Page)
    // ═══════════════════════════════════════════════════════════════

    // 법적 문서 및 FAQ 데이터
    const userSettingsLegalData = {
        faq: `<h4>Q1. 앱이 처음에 바로 안 열리거나 멈춘 것 같아요!</h4>
🚀 조금만 기다려주세요! 앱을 처음 실행할 때 최신 기능을 준비하느라 약 3초 정도의 로딩 시간이 필요할 수 있습니다. 만약 계속 반응이 없다면 브라우저를 새로고침해 주세요. 또한, 이 앱은 크롬(Chrome) 브라우저에 최적화되어 있습니다. AI가 최고의 설명을 들려드리기 위해서는 카메라, 마이크, 위치 정보 권한 승인이 반드시 필요하니 꼭 허용해 주세요!

<h4>Q2. AI 설명이 더 정확하게 나오게 하려면 어떻게 찍어야 하나요?</h4>
📸 AI에게 힌트를 주세요! 사진을 찍으실 때, 단순히 대상만 찍기보다 <strong>작품의 이름표(캡션)</strong>나 가게의 간판/현판 글자가 함께 나오도록 촬영해 보세요. 글자 정보를 포함하면 AI가 훨씬 더 정확하고 깊이 있는 해설을 들려드릴 수 있답니다.

<h4>Q3. 한국어 말고 다른 언어로도 들을 수 있나요?</h4>
🌍 설정이 필요할 수 있어요. 기본적으로 한국어에 최적화되어 있습니다. 만약 다른 언어를 선택하실 경우, 앱 내의 일부 음성 설명이 지원되지 않거나 매끄럽지 않을 수 있습니다. 원활한 청취를 위해 사용자님 <strong>모바일 기기의 '텍스트 읽어주기(TTS) 설정'</strong>을 해당 언어에 맞게 최적화해 주시는 것을 권장합니다.

<h4>Q4. 인터넷이 안 터지는 박물관이나 붐비는 여행지에서도 쓸 수 있나요?</h4>
✈️ 물론입니다! 한 번 열어본 <strong>공유 페이지(링크)</strong>는 인터넷 연결이 끊겨도 완벽하게 재생됩니다. 여행 떠나기 전이나 숙소에서 미리 링크를 열어두기만 하면, 데이터 걱정 없이 어디서든 나만의 가이드를 즐길 수 있어요.

<h4>Q5. 크레딧은 어떻게 사용되고, 충전은 어떻게 하나요?</h4>
💰 사진을 분석하고 해설을 만들 때마다 크레딧이 사용돼요. 처음 가입하시면 무료 크레딧을 드리고, 친구에게 이 앱을 추천해서 친구가 가입하면 두 분 모두에게 보너스 크레딧을 드립니다! 물론, 부족하면 언제든 프로필 페이지에서 충전할 수도 있어요.

<h4>Q6. 저장한 가이드 내용을 수정할 수 있나요?</h4>
😅 수정은 어려워요. 아쉽게도 한 번 만들어진 가이드는 내용 수정이 어렵습니다. 만약 설명이 마음에 들지 않는다면, 삭제 후 Q2번의 팁을 활용해 새로운 사진으로 다시 가이드를 생성해 보세요. 더 멋진 해설이 기다리고 있을지도 몰라요!`,

        terms: `<h4>이용 약관 (Terms of Service)</h4>
손안에 가이드는 여행객을 위한 AI 도슨트 서비스를 제공합니다.

<h4>1. 서비스의 목적 및 범위</h4>
본 서비스는 사용자가 입력한 사진과 음성을 인공지능(AI)이 분석하여 관광지 해설을 제공하고, 이를 '상세페이지' 및 '공유페이지' 형태로 저장·공유하는 기능을 제공합니다.

<h4>2. AI 정보의 정확성 (면책 조항)</h4>
본 서비스는 인공지능(Gemini)을 활용하여 정보를 제공합니다. AI는 간혹 부정확하거나 시의성에 맞지 않는 정보를 생성할 수 있으며, 회사는 생성된 정보의 완전무결성을 보장하지 않습니다. 여행 계획 수립 시 중요한 정보는 반드시 교차 검증하시기 바랍니다.

<h4>3. 크레딧 및 결제 정책</h4>
• <strong>크레딧:</strong> AI 분석 및 콘텐츠 생성에 사용되는 가상 재화입니다 (10 EUR = 140 크레딧).
• <strong>차감:</strong> 상세페이지 저장 시 2 크레딧, 공유페이지 생성 시 5 크레딧이 차감됩니다.
• <strong>환급(캐시백):</strong> 리워드 활동 등을 통해 1,000 크레딧 이상 보유 시 현금 환급을 신청할 수 있으며, 회사의 승인 절차를 거쳐 지급됩니다.

<h4>4. 저작권 및 사용권</h4>
• 사용자가 업로드한 사진의 저작권은 사용자에게 있습니다.
• 서비스를 통해 생성된 AI 해설 텍스트 및 오디오 콘텐츠의 사용권은 사용자의 비상업적 이용(개인 소장, 친구 공유)에 한해 허용됩니다.

<h4>5. 금지 행위</h4>
타인의 저작물을 무단으로 도용하여 업로드하거나, 불법적/음란한 이미지를 분석 요청하는 행위는 금지되며, 적발 시 계정이 영구 정지될 수 있습니다.`,

        privacy: `<h4>개인 정보 처리 방침 (Privacy Policy)</h4>
손안에 가이드는 사용자의 여행 경험을 돕기 위해 최소한의 정보만을 수집하며, AI 분석을 위한 데이터 처리에 투명성을 보장합니다.

<h4>1. 수집하는 개인 정보의 항목</h4>
• <strong>필수 항목:</strong> 소셜 로그인(Google, Kakao)을 통해 제공받은 이메일 주소, 이름, 프로필 사진.
• <strong>서비스 이용 과정에서 생성/수집되는 정보:</strong>
  - 이미지 및 음성: AI 분석을 위해 사용자가 업로드하거나 촬영한 사진, 녹음된 음성 데이터.
  - 위치 정보: 가이드 생성 및 지도 표시를 위한 GPS 위도/경도 데이터 (촬영 시 메타데이터 포함).
  - 결제 정보: 크레딧 충전 시 Stripe를 통해 처리되는 결제 내역 (카드 정보는 서버에 저장되지 않음).

<h4>2. 개인 정보의 수집 및 이용 목적</h4>
• <strong>서비스 제공:</strong> Gemini AI를 활용한 이미지/음성 분석 및 여행 가이드(상세페이지) 콘텐츠 생성.
• <strong>회원 관리:</strong> 개인 식별, 보관함 데이터 동기화, 불량 회원의 부정 이용 방지.
• <strong>리워드 지급:</strong> 친구 추천 크레딧 지급 및 캐시백 처리를 위한 식별.

<h4>3. 개인 정보의 보유 및 이용 기간</h4>
• <strong>회원 정보:</strong> 회원 탈퇴 시까지 보유하며, 탈퇴 요청 시 즉시 파기합니다.
• <strong>이미지 데이터:</strong> AI 분석 완료 후 즉시 삭제되거나, 사용자의 '보관함' 기능 제공을 위해 암호화된 데이터베이스 또는 보안 스토리지에 보관됩니다.

<h4>4. 제3자 제공 및 위탁</h4>
서비스 향상을 위해 다음과 같이 외부 전문 업체에 일부 업무를 위탁합니다.
• <strong>AI 분석:</strong> Google (Gemini API) - 이미지 및 텍스트 분석.
• <strong>결제 처리:</strong> Stripe - 크레딧 충전 결제 대행.
• <strong>데이터 호스팅:</strong> Replit/Neon - 서비스 서버 및 데이터베이스 운영.

<h4>5. 정보 주체의 권리</h4>
사용자는 언제든지 자신의 개인 정보를 열람, 수정하거나 회원 탈퇴(데이터 삭제)를 요청할 수 있습니다. 설정 > 데이터 관리 메뉴에서 '내 데이터 다운로드'를 요청할 수 있습니다.`,

        thirdparty: `<h4>타사 앱 접근 관리 (Third-Party App Access)</h4>
사용자는 소셜 로그인을 통해 연결된 외부 서비스의 접근 권한을 언제든지 관리할 수 있습니다.

<h4>1. 연결된 계정 목록</h4>
현재 손안에 가이드는 간편 로그인을 위해 다음 서비스와 연결될 수 있습니다.
• <strong>Google 계정:</strong> 이메일, 프로필 사진 접근.
• <strong>Kakao 계정:</strong> 프로필 정보 접근.

<h4>2. 접근 권한 해제 방법</h4>
앱 내에서 '로그아웃' 또는 '탈퇴'를 하더라도 소셜 서비스 상의 연결 고리는 남아있을 수 있습니다. 아래 방법을 통해 직접 연결을 해제할 수 있습니다.
• <strong>Google:</strong> [Google 계정 > 데이터 및 개인 정보 보호 > 내 계정에 액세스할 수 있는 앱]에서 'My Hand Guide' 연결 해제.
• <strong>Kakao:</strong> [카카오톡 설정 > 카카오계정 > 연결된 서비스 관리]에서 연결 해제.

<h4>3. 데이터 삭제 요청</h4>
타사 앱 연결을 해제한 후, 손안에 가이드 서버에 저장된 모든 데이터의 영구 삭제를 원하실 경우, 설정 페이지의 [회원 탈퇴] 기능을 이용해 주시기 바랍니다.`
    };

    // 법적 문서 콘텐츠 초기화
    function initUserSettingsLegalContent() {
        const types = ['faq', 'terms', 'privacy', 'thirdparty'];
        types.forEach(type => {
            const contentDiv = document.querySelector(`#content-user-${type} .user-settings-content-body`);
            if (contentDiv && userSettingsLegalData[type]) {
                contentDiv.innerHTML = userSettingsLegalData[type];
            }
        });
    }

    // 아코디언 토글
    function toggleUserSettingsAccordion(type) {
        const content = document.getElementById(`content-user-${type}`);
        const icon = document.getElementById(`icon-user-${type}`);

        if (content) {
            content.classList.toggle('open');
            if (icon) {
                icon.style.transform = content.classList.contains('open') ? 'rotate(180deg)' : '';
            }
        }
    }

    // 푸시 알림 상태 초기화 (2025-12-12 v4 심플버전)
    // - 기본값: ON (pushUserDenied 없으면 항상 ON)
    // - 토글은 항상 활성화 (수동 조작 가능)
    // - 브라우저 미지원/차단은 상태 텍스트로만 표시
    function initUserPushToggle() {
        if (!userPushToggle || !userPushStatusText) return;

        const userDenied = localStorage.getItem('pushUserDenied') === 'true';

        // 사용자가 토글로 직접 OFF한 경우
        if (userDenied) {
            userPushToggle.checked = false;
            userPushStatusText.textContent = '알림이 꺼져 있습니다';
            return;
        }

        // 기본값: ON (사용자가 OFF하지 않으면 항상 ON)
        userPushToggle.checked = true;
        userPushStatusText.textContent = '알림이 켜져 있습니다';
    }

    // 자동 푸시 구독 (로그인 사용자 전용)
    async function autoSubscribePush(registration) {
        try {
            const vapidPublicKey = 'BEuc2WPE8n32XPc_uDZ_Na-vSgVvx_P4uRsSFuTYi-oD1kobkIBKtSFbtnneebC3wt8OnknpizRM98NCLnuHa38';
            const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

            const newSubscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey
            });

            const response = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    endpoint: newSubscription.endpoint,
                    keys: {
                        p256dh: btoa(String.fromCharCode.apply(null, new Uint8Array(newSubscription.getKey('p256dh')))),
                        auth: btoa(String.fromCharCode.apply(null, new Uint8Array(newSubscription.getKey('auth'))))
                    },
                    userAgent: navigator.userAgent
                })
            });

            if (response.ok) {
                userPushToggle.checked = true;
                userPushStatusText.textContent = '알림이 켜져 있습니다';
                localStorage.removeItem('pushUserDenied');
            } else {
                throw new Error('서버 구독 등록 실패');
            }
        } catch (error) {
            console.error('자동 푸시 구독 오류:', error);
            userPushToggle.checked = false;
            userPushStatusText.textContent = '알림 설정에 실패했습니다';
        }
    }

    // VAPID 공개키를 Uint8Array로 변환
    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    // 푸시 알림 토글 핸들러 (2025-12-12 수정)
    // - 사용자 거부 선택 localStorage 저장
    // - 로그인 필요 (서버 구독용)
    async function handleUserPushToggle() {
        // 토글 ON/OFF 상태 먼저 저장 (수동 조작 항상 가능)
        if (!userPushToggle.checked) {
            // OFF로 변경
            localStorage.setItem('pushUserDenied', 'true');
            userPushStatusText.textContent = '알림이 꺼져 있습니다';
            showToast('알림이 꺼졌습니다');
            return;
        }

        // ON으로 변경
        localStorage.removeItem('pushUserDenied');
        userPushStatusText.textContent = '알림이 켜져 있습니다';

        // 브라우저 미지원 시 토스트만 표시 (토글은 ON 유지)
        if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
            showToast('이 브라우저는 푸시 알림을 지원하지 않습니다 (HTTPS 필요)');
            return;
        }

        // 로그인 여부 확인
        const user = await checkUserAuth();
        if (!user) {
            showToast('로그인하면 실제 푸시 알림을 받을 수 있습니다');
            return;
        }

        // 알림 권한 확인 (이미 granted면 요청 안 함)
        let permission = Notification.permission;
        if (permission === 'default') {
            localStorage.setItem('pushPermissionAsked', 'true');
            permission = await Notification.requestPermission();
        }

        if (permission !== 'granted') {
            userPushToggle.checked = false;
            if (permission === 'denied') {
                userPushStatusText.textContent = '알림이 차단되어 있습니다 (브라우저 설정에서 허용 필요)';
            } else {
                userPushStatusText.textContent = '알림 권한을 허용해주세요';
            }
            showToast('알림 권한이 필요합니다');
            return;
        }

        try {
            userPushStatusText.textContent = '알림 설정 중...';

            const registration = await navigator.serviceWorker.ready;
            const vapidPublicKey = 'BEuc2WPE8n32XPc_uDZ_Na-vSgVvx_P4uRsSFuTYi-oD1kobkIBKtSFbtnneebC3wt8OnknpizRM98NCLnuHa38';
            const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey
            });

            const response = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    endpoint: subscription.endpoint,
                    keys: {
                        p256dh: btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('p256dh')))),
                        auth: btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('auth'))))
                    },
                    userAgent: navigator.userAgent
                })
            });

            if (response.ok) {
                userPushStatusText.textContent = '알림이 켜져 있습니다';
                showToast('푸시 알림이 활성화되었습니다');
            } else {
                throw new Error('서버 구독 등록 실패');
            }
        } catch (error) {
            console.error('푸시 구독 오류:', error);
            userPushToggle.checked = false;
            userPushStatusText.textContent = '알림 설정에 실패했습니다';
            showToast('푸시 알림 설정에 실패했습니다');
        }
    }

    // QR 코드 모달 열기
    function openUserQrCodeModal() {
        if (userQrCodeModal) {
            userQrCodeModal.classList.remove('hidden');
        }
    }

    // QR 코드 모달 닫기
    function closeUserQrCodeModal() {
        if (userQrCodeModal) {
            userQrCodeModal.classList.add('hidden');
        }
    }

    // QR 코드 복사 + 리워드 지급 + 3초 후 자동 닫힘
    async function copyUserQrCode() {
        const appUrl = window.location.origin;

        // 리워드 API 호출 함수 (복사 성공 후 실행)
        async function claimQrCopyReward() {
            try {
                const response = await fetch('/api/profile/qr-copy-reward', {
                    method: 'POST',
                    credentials: 'include'
                });
                if (response.ok) {
                    const data = await response.json();
                    if (data.success) {
                        showToast(`QR 복사 완료! +2 크레딧 (잔액: ${data.balance})`);
                        return true;
                    }
                }
            } catch (e) {
            }
            return false;
        }

        // 복사 성공 후 처리
        async function onCopySuccess() {
            const rewarded = await claimQrCopyReward();
            if (!rewarded) {
                showToast('앱 주소가 복사되었습니다!');
            }
            setTimeout(closeUserQrCodeModal, 3000);
        }

        // 방법 1: navigator.clipboard.writeText (모바일 우선)
        if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(appUrl);
                await onCopySuccess();
                return;
            } catch (e) {
            }
        }

        // 방법 2: execCommand fallback (iOS Safari 등)
        try {
            const textArea = document.createElement('textarea');
            textArea.value = appUrl;
            textArea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();

            const success = document.execCommand('copy');
            document.body.removeChild(textArea);

            if (success) {
                await onCopySuccess();
                return;
            }
        } catch (e) {
        }

        // 모든 방법 실패
        showToast('복사에 실패했습니다. 화면을 캡처해주세요.');
        setTimeout(closeUserQrCodeModal, 3000);
    }

    // 관리자 인증 모달 열기
    function openUserAdminAuthModal() {
        if (userAdminAuthModal) {
            userAdminAuthModal.classList.remove('hidden');
            if (userAdminPassword) userAdminPassword.value = '';
            if (userAdminAuthMessage) userAdminAuthMessage.classList.add('hidden');
        }
    }

    // 관리자 인증 모달 닫기
    function closeUserAdminAuthModal() {
        if (userAdminAuthModal) {
            userAdminAuthModal.classList.add('hidden');
        }
    }

    // 관리자 인증 처리 (사용자 설정 페이지에서)
    async function handleUserAdminAuth() {
        const password = userAdminPassword?.value;

        if (!password) {
            if (userAdminAuthMessage) {
                userAdminAuthMessage.textContent = '비밀번호를 입력해주세요';
                userAdminAuthMessage.classList.remove('hidden');
            }
            return;
        }

        try {
            const response = await fetch('/api/admin/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });

            if (response.ok) {
                // 인증 성공
                localStorage.setItem('adminAuthenticated', 'true');
                localStorage.setItem('adminAuthTime', Date.now().toString());
                localStorage.setItem('adminPassword', password);

                closeUserAdminAuthModal();
                showToast('관리자 인증 성공');

                // 관리자 설정 페이지로 이동
                showAdminSettingsPage();
            } else {
                // 인증 실패
                if (userAdminAuthMessage) {
                    userAdminAuthMessage.textContent = '잘못된 비밀번호입니다';
                    userAdminAuthMessage.classList.remove('hidden');
                }
                if (userAdminPassword) userAdminPassword.value = '';
            }
        } catch (error) {
            console.error('인증 오류:', error);
            if (userAdminAuthMessage) {
                userAdminAuthMessage.textContent = '인증 중 오류가 발생했습니다';
                userAdminAuthMessage.classList.remove('hidden');
            }
        }
    }

    // 관리자 설정 페이지 표시
    async function showAdminSettingsPage() {
        pauseCamera();

        // 페이지 먼저 표시 (API 호출 전)
        showPage(adminSettingsPage);

        // 서버 세션 확인
        try {
            const response = await fetch('/api/admin/featured');
            if (response.ok) {
                // 서버 세션 유효 - 관리자 섹션 표시
                localStorage.setItem('adminAuthenticated', 'true');
                localStorage.setItem('adminAuthTime', Date.now().toString());

                authSection?.classList.add('hidden');
                adminPromptSettingsSection?.classList.remove('hidden');

                const dashboardLink = document.getElementById('adminDashboardLink');
                if (dashboardLink) {
                    dashboardLink.classList.remove('hidden');
                }

                await loadAdminData();
            } else {
                // 서버 세션 없음 - 로그인 화면
                localStorage.removeItem('adminAuthenticated');
                localStorage.removeItem('adminAuthTime');
                localStorage.removeItem('adminPassword');

                if (authPassword) authPassword.value = '';
                authSection?.classList.remove('hidden');
                adminPromptSettingsSection?.classList.add('hidden');

                const dashboardLink = document.getElementById('adminDashboardLink');
                if (dashboardLink) {
                    dashboardLink.classList.add('hidden');
                }
            }
        } catch (error) {
            // 에러 발생 - 로그인 화면
            localStorage.removeItem('adminAuthenticated');
            localStorage.removeItem('adminAuthTime');
            localStorage.removeItem('adminPassword');

            if (authPassword) authPassword.value = '';
            authSection?.classList.remove('hidden');
            adminPromptSettingsSection?.classList.add('hidden');

            const dashboardLink = document.getElementById('adminDashboardLink');
            if (dashboardLink) {
                dashboardLink.classList.add('hidden');
            }
        }

        populatePromptTextareas();
    }

    // ═══════════════════════════════════════════════════════════════
    // 🔐 관리자 인증 로직 (Admin Authentication)
    // ═══════════════════════════════════════════════════════════════
    // ⚠️ CRITICAL: DO NOT MODIFY WITHOUT USER APPROVAL
    // 사용자 승인 없이 절대 수정 금지 - AI 및 모든 개발자 주의
    // Verified: 2025-10-26 | Status: Production-Ready ✅
    // ═══════════════════════════════════════════════════════════════
    // 
    // 목적: 관리자 페이지 접근 제어 (영업 비밀 보호!)
    // 작업 시간: 2시간
    // 
    // 핵심 로직:
    //   1. 비밀번호 인증 (0603)
    //   2. promptSettingsSection 표시
    //   3. adminDashboardLink 표시 (인증 후에만!)
    //   4. Featured 갤러리 관리 기능 활성화
    // 
    // 보안 규칙:
    //   - 설정 페이지 열 때마다 대시보드 링크 숨김
    //   - 재인증 필요 (영업 비밀 보호!)
    // ═══════════════════════════════════════════════════════════════
    async function handleAuth(event) {
        event.preventDefault();
        const password = authPassword.value;

        try {
            // 백엔드 API로 비밀번호 인증
            const response = await fetch('/api/admin/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });

            if (response.ok) {
                // 인증 성공 - localStorage에 세션 저장 (유지)
                localStorage.setItem('adminAuthenticated', 'true');
                localStorage.setItem('adminAuthTime', Date.now().toString());
                localStorage.setItem('adminPassword', password);

                authSection.classList.add('hidden');
                adminPromptSettingsSection.classList.remove('hidden');
                showToast('관리자 인증 성공');

                // 🔓 대시보드 링크 표시 (영업 비밀!)
                const dashboardLink = document.getElementById('adminDashboardLink');
                if (dashboardLink) {
                    dashboardLink.classList.remove('hidden');
                }

                // Featured 갤러리 관리 데이터 로드
                await loadAdminData();
            } else {
                // 인증 실패
                showToast('잘못된 비밀번호입니다.');
                authPassword.value = '';
            }
        } catch (error) {
            console.error('인증 오류:', error);
            showToast('인증 중 오류가 발생했습니다.');
            authPassword.value = '';
        }
    }

    // Featured 갤러리 관리 함수들
    async function loadAdminData() {
        await loadFeaturedList();

        // 검색창 이벤트 리스너 추가
        const searchInput = document.getElementById('shareSearchInput');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    searchShares(e.target.value);
                }, 300); // 300ms 디바운스
            });
        }
    }

    async function searchShares(query) {
        const resultsContainer = document.getElementById('searchResults');
        if (!resultsContainer) return;

        if (!query || query.trim().length === 0) {
            resultsContainer.innerHTML = '<p class="text-sm text-gray-400 text-center py-4">검색어를 입력하세요</p>';
            return;
        }

        try {
            resultsContainer.innerHTML = '<p class="text-sm text-gray-400 text-center py-4">검색 중...</p>';

            const response = await fetch(`/api/admin/all-shares?search=${encodeURIComponent(query)}`, {
                credentials: 'include'
            });

            if (!response.ok) throw new Error('검색 실패');

            const shares = await response.json();

            if (!shares || shares.length === 0) {
                resultsContainer.innerHTML = `
                    <p class="text-sm text-gray-400 text-center py-4">
                        "<span class="font-semibold">${query}</span>" 검색 결과가 없습니다
                    </p>
                `;
                return;
            }

            resultsContainer.innerHTML = shares.map(share => `
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 hover:border-yellow-400 transition-colors">
                    <div class="flex-1 min-w-0">
                        <p class="font-medium text-gray-900 truncate">${share.name}</p>
                        <div class="flex items-center gap-3 mt-1">
                            <span class="text-xs text-gray-500">${share.downloadCount || 0}회 다운로드</span>
                            <span class="text-xs text-gray-400">${new Date(share.createdAt).toLocaleDateString()}</span>
                            ${share.featured ? '<span class="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">Featured</span>' : ''}
                        </div>
                    </div>
                    ${!share.featured ? `
                        <button 
                            onclick="addFeaturedById('${share.id}')" 
                            class="ml-3 px-3 py-1.5 bg-yellow-500 text-white text-sm font-medium rounded hover:bg-yellow-600 transition-colors whitespace-nowrap"
                            data-testid="button-add-featured-${share.id}">
                            추가
                        </button>
                    ` : `
                        <span class="ml-3 px-3 py-1.5 bg-gray-200 text-gray-500 text-sm font-medium rounded cursor-not-allowed whitespace-nowrap">
                            이미 추가됨
                        </span>
                    `}
                </div>
            `).join('');

        } catch (error) {
            console.error('공유 페이지 검색 오류:', error);
            resultsContainer.innerHTML = '<p class="text-sm text-red-400 text-center py-4">검색 중 오류가 발생했습니다</p>';
        }
    }

    async function loadFeaturedList() {
        try {
            const response = await fetch('/api/admin/featured', {
                credentials: 'include'
            });
            if (!response.ok) throw new Error('Failed to load featured');

            const featured = await response.json();

            const list = document.getElementById('featuredList');
            const count = document.getElementById('featuredCount');

            if (count) count.textContent = featured.length;

            if (!list) return;

            if (!featured || featured.length === 0) {
                list.innerHTML = '<p class="text-sm text-gray-400">Featured 페이지가 없습니다</p>';
                return;
            }

            list.innerHTML = featured.map(page => `
                <div class="flex items-center justify-between p-2 bg-yellow-50 rounded">
                    <span class="text-sm font-medium text-gray-800">${page.name}</span>
                    <div class="flex items-center gap-2">
                        <button onclick="editFeatured('${page.id}')" class="text-blue-600 hover:text-blue-800 text-sm font-medium">
                            편집
                        </button>
                        <button onclick="removeFeatured('${page.id}')" class="text-red-500 hover:text-red-700 text-sm font-medium">
                            제거
                        </button>
                    </div>
                </div>
            `).join('');
        } catch (error) {
            console.error('Featured 목록 로드 오류:', error);
            const list = document.getElementById('featuredList');
            if (list) list.innerHTML = '<p class="text-sm text-red-400">로드 실패</p>';
        }
    }

    window.addFeaturedById = async function (shareId) {
        if (!shareId) {
            showToast('공유 페이지를 선택해주세요');
            return;
        }

        try {
            const response = await fetch(`/api/admin/featured/${shareId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include'
            });

            const data = await response.json();

            if (response.ok) {
                showToast('Featured에 추가되었습니다!');
                await loadFeaturedList();
                // 검색 결과 다시 로드해서 "이미 추가됨" 표시
                const searchInput = document.getElementById('shareSearchInput');
                if (searchInput && searchInput.value) {
                    await searchShares(searchInput.value);
                }
            } else {
                showToast(data.error || 'Featured 추가 실패');
            }
        } catch (error) {
            console.error('Featured 추가 오류:', error);
            showToast('Featured 추가 중 오류 발생');
        }
    };

    window.removeFeatured = async function (shareId) {
        if (!confirm('Featured에서 제거하시겠습니까?')) return;

        try {
            const response = await fetch(`/api/admin/featured/${shareId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include'
            });

            const data = await response.json();

            if (response.ok) {
                showToast('Featured에서 제거되었습니다');
                await loadFeaturedList();
            } else {
                showToast(data.error || 'Featured 제거 실패');
            }
        } catch (error) {
            console.error('Featured 제거 오류:', error);
            showToast('Featured 제거 중 오류 발생');
        }
    };

    // Featured 편집 모달
    window.editFeatured = async function (id) {
        try {
            showToast('📝 편집 정보 불러오는 중...');

            // 1. 관리자용 API로 데이터 가져오기
            const res = await fetch(`/api/admin/featured/${id}/data`, {
                credentials: 'include'
            });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || '데이터 로드 실패');
            }
            const data = await res.json();
            const { page, guides } = data;


            // 2. 모달 입력 필드 채우기
            document.getElementById('editTitle').value = page.name || '';
            document.getElementById('editSender').value = page.sender || '여행자';
            document.getElementById('editLocation').value = page.location || '미지정';
            document.getElementById('editDate').value = page.date || new Date(page.createdAt).toISOString().split('T')[0];

            // 3. 모바일 친화적 가이드 리스트 생성 (위/아래 버튼)
            const guideListHtml = guides.map((guide, index) => {
                const imgSrc = guide.imageUrl || '';
                const isFirst = index === 0;
                const isLast = index === guides.length - 1;
                return `
                    <div class="guide-item flex items-center gap-2 p-3 bg-white rounded-lg border-2 border-gray-300 mb-2" data-guide-id="${guide.id}">
                        <img src="${imgSrc}" alt="가이드 ${index + 1}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px; flex-shrink: 0;">
                        <span class="font-medium text-gray-700 flex-1">가이드 ${index + 1}</span>
                        <div class="flex flex-col gap-1">
                            <button onclick="moveGuideUp(this)" ${isFirst ? 'disabled' : ''} class="px-3 py-1 bg-blue-500 text-white rounded disabled:bg-gray-300 disabled:cursor-not-allowed text-lg font-bold" style="min-width: 40px; min-height: 36px;">▲</button>
                            <button onclick="moveGuideDown(this)" ${isLast ? 'disabled' : ''} class="px-3 py-1 bg-blue-500 text-white rounded disabled:bg-gray-300 disabled:cursor-not-allowed text-lg font-bold" style="min-width: 40px; min-height: 36px;">▼</button>
                        </div>
                    </div>
                `;
            }).join('');

            document.getElementById('guideList').innerHTML = guideListHtml;

            // 5. 모달 표시
            document.getElementById('editFeaturedModal').classList.remove('hidden');

            // 6. 저장 버튼 클릭 이벤트
            document.getElementById('saveFeaturedBtn').onclick = async () => {
                const title = document.getElementById('editTitle').value;
                const sender = document.getElementById('editSender').value;
                const location = document.getElementById('editLocation').value;
                const date = document.getElementById('editDate').value;

                if (!title || !sender || !location || !date) {
                    showToast('❌ 모든 필드를 입력해주세요.');
                    return;
                }

                // 가이드 순서 가져오기 (UUID 문자열로 유지)
                const guideItems = document.querySelectorAll('.guide-item');
                const newGuideIds = Array.from(guideItems).map(item => item.dataset.guideId);

                try {
                    showToast('💾 저장 중...');
                    const response = await fetch(`/api/admin/featured/${id}/regenerate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({
                            title,
                            sender,
                            location,
                            date,
                            guideIds: newGuideIds
                        })
                    });

                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || 'HTML 재생성 실패');
                    }

                    showToast('✅ Featured 페이지가 업데이트되었습니다!');
                    closeEditModal();
                    loadFeaturedList();
                } catch (error) {
                    console.error('Featured 편집 오류:', error);
                    showToast('❌ 편집 실패: ' + error.message);
                }
            };
        } catch (error) {
            console.error('Featured 편집 오류:', error);
            showToast('❌ 편집 실패: ' + error.message);
        }
    };

    // 모달 닫기
    window.closeEditModal = function () {
        document.getElementById('editFeaturedModal').classList.add('hidden');
    };

    // 가이드 위로 이동 (모바일 친화적)
    window.moveGuideUp = function (button) {
        const item = button.closest('.guide-item');
        const prev = item.previousElementSibling;
        if (prev) {
            item.parentNode.insertBefore(item, prev);
            updateGuideNumbers();
        }
    };

    // 가이드 아래로 이동 (모바일 친화적)
    window.moveGuideDown = function (button) {
        const item = button.closest('.guide-item');
        const next = item.nextElementSibling;
        if (next) {
            item.parentNode.insertBefore(next, item);
            updateGuideNumbers();
        }
    };

    // 가이드 번호 및 버튼 상태 업데이트
    function updateGuideNumbers() {
        const items = document.querySelectorAll('.guide-item');
        items.forEach((item, index) => {
            // 번호 업데이트
            const label = item.querySelector('span.font-medium');
            if (label) label.textContent = `가이드 ${index + 1}`;

            // 버튼 상태 업데이트
            const upBtn = item.querySelector('button:first-of-type');
            const downBtn = item.querySelector('button:last-of-type');

            upBtn.disabled = (index === 0);
            downBtn.disabled = (index === items.length - 1);
        });
    }

    function savePrompts() {
        const imagePrompt = adminImagePromptTextarea?.value.trim();
        const textPrompt = adminTextPromptTextarea?.value.trim();

        if (!imagePrompt || !textPrompt) {
            showToast('모든 프롬프트를 입력해주세요.');
            return;
        }

        localStorage.setItem('customImagePrompt', imagePrompt);
        localStorage.setItem('customTextPrompt', textPrompt);
        showToast('프롬프트가 저장되었습니다.');
    }

    function resetPrompts() {
        if (confirm('프롬프트를 기본값으로 초기화하시겠습니까?')) {
            localStorage.removeItem('customImagePrompt');
            localStorage.removeItem('customTextPrompt');
            populatePromptTextareas();
            showToast('프롬프트가 초기화되었습니다.');
        }
    }

    function handleGenerateImageDemo() {
        if (!adminImageSynthesisPromptTextarea?.value.trim()) return showToast('이미지 생성을 위한 프롬프트를 입력해주세요.');
        if (adminGenerateImageBtn) adminGenerateImageBtn.disabled = true;
        showToast('멋진 이미지를 만들고 있어요...', 3000);
        setTimeout(() => {
            showToast('이미지 생성이 완료되었습니다! (데모)');
            if (adminGenerateImageBtn) adminGenerateImageBtn.disabled = false;
        }, 4000);
    }

    function handleGenerateVideoDemo() {
        if (!adminVideoGenerationPromptTextarea?.value.trim()) return showToast('영상 제작을 위한 프롬프트를 입력해주세요.');
        if (adminGenerateVideoBtn) adminGenerateVideoBtn.disabled = true;
        showToast('AI가 영상을 제작 중입니다 (약 10초 소요)...', 8000);
        setTimeout(() => {
            showToast('영상이 완성되었습니다! (데모)');
            if (adminGenerateVideoBtn) adminGenerateVideoBtn.disabled = false;
        }, 9000);
    }

    // 🔔 관리자 전체 알림 발송
    async function handleAdminSendNotification() {
        const typeEl = document.getElementById('adminNotificationType');
        const titleEl = document.getElementById('adminNotificationTitle');
        const messageEl = document.getElementById('adminNotificationMessage');
        const linkEl = document.getElementById('adminNotificationLink');
        const sendBtn = document.getElementById('adminSendNotificationBtn');
        const resultEl = document.getElementById('adminNotificationResult');

        const type = typeEl?.value;
        const title = titleEl?.value?.trim();
        const message = messageEl?.value?.trim();
        const link = linkEl?.value?.trim() || null;

        if (!title || !message) {
            showToast('제목과 내용을 입력해주세요.');
            return;
        }

        if (sendBtn) sendBtn.disabled = true;
        showToast('알림 발송 중...');

        try {
            const response = await fetch('/api/admin/notifications/broadcast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type,
                    title,
                    message,
                    link
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                showToast(`알림 발송 완료! (푸시: ${data.pushSent}명)`);
                if (resultEl) {
                    resultEl.textContent = `✅ 발송 완료: 푸시 ${data.pushSent}명 성공, ${data.pushFailed}명 실패`;
                    resultEl.className = 'text-sm text-center text-green-600';
                    resultEl.classList.remove('hidden');
                }
                // 폼 초기화
                if (titleEl) titleEl.value = '';
                if (messageEl) messageEl.value = '';
                if (linkEl) linkEl.value = '';
            } else {
                throw new Error(data.error || '알림 발송 실패');
            }
        } catch (error) {
            console.error('알림 발송 오류:', error);
            showToast('알림 발송에 실패했습니다.');
            if (resultEl) {
                resultEl.textContent = `❌ 발송 실패: ${error.message}`;
                resultEl.className = 'text-sm text-center text-red-600';
                resultEl.classList.remove('hidden');
            }
        } finally {
            if (sendBtn) sendBtn.disabled = false;
        }
    }

    // --- Event Listeners (디바운스 적용) ---
    startCameraFromFeaturesBtn?.addEventListener('click', handleStartFeaturesClick);
    // ⚠️ 수정금지(승인필요): 2026-03-12 debounce 800→300ms (앱 터치 반응 개선)
    shootBtn?.addEventListener('click', () => debounceClick('shoot', capturePhoto, 300));
    uploadBtn?.addEventListener('click', () => uploadInput.click());
    micBtn?.addEventListener('click', () => {
        // 🔊 음성 재생 즉시 중지 (debounce 전에 실행)
        if (synth.speaking || synth.pending) {
            synth.cancel();
            resetSpeechState();
        }
        // ⚠️ 수정금지(승인필요): 2026-03-12 debounce 500→200ms (앱 터치 반응 개선)
        debounceClick('mic', handleMicButtonClick, 200);
    });

    // 🎤 상세페이지 마이크 버튼 (다시 질문) - 메인페이지와 동일 로직
    detailMicBtn?.addEventListener('click', () => {
        // 🔊 음성 재생 즉시 중지 (debounce 전에 실행)
        if (synth.speaking || synth.pending) {
            synth.cancel();
            resetSpeechState();
        }
        // ⚠️ 수정금지(승인필요): 2026-03-12 debounce 500→200ms (앱 터치 반응 개선)
        debounceClick('detailMic', handleDetailMicClick, 200);
    });

    archiveBtn?.addEventListener('click', () => debounceClick('archive', showArchivePage, 300));
    uploadInput?.addEventListener('change', handleFileSelect);

    backBtn?.addEventListener('click', () => cameFromArchive ? showArchivePage() : showMainPage());
    archiveBackBtn?.addEventListener('click', showMainPage);
    settingsBackBtn?.addEventListener('click', showArchivePage);
    adminSettingsBackBtn?.addEventListener('click', showSettingsPage);

    // 🎬 드림 스튜디오 버튼 - 새 탭으로 열기
    document.getElementById('adminDreamStudioBtn')?.addEventListener('click', () => {
        window.open('./dream-studio.html', '_blank');
    });

    // ═══════════════════════════════════════════════════════════════
    // 📱 사용자 설정 페이지 이벤트 핸들러
    // ═══════════════════════════════════════════════════════════════

    // 아코디언 토글 버튼들
    document.getElementById('toggle-user-faq')?.addEventListener('click', () => toggleUserSettingsAccordion('faq'));
    document.getElementById('toggle-user-terms')?.addEventListener('click', () => toggleUserSettingsAccordion('terms'));
    document.getElementById('toggle-user-privacy')?.addEventListener('click', () => toggleUserSettingsAccordion('privacy'));
    document.getElementById('toggle-user-thirdparty')?.addEventListener('click', () => toggleUserSettingsAccordion('thirdparty'));

    // 푸시 알림 토글
    userPushToggle?.addEventListener('change', handleUserPushToggle);

    // 사용 방법 버튼 - 유튜브 영상을 인앱 모달로 표시
    userSettingsGuideBtn?.addEventListener('click', () => {
        openYoutubeModal('JJ65XZvBgsk');
    });

    // QR 코드 모달
    userSettingsQrBtn?.addEventListener('click', openUserQrCodeModal);
    userCopyQrButton?.addEventListener('click', copyUserQrCode);

    // 관리자 인증 모달
    userAdminAuthBtn?.addEventListener('click', openUserAdminAuthModal);
    userAdminAuthCancelBtn?.addEventListener('click', closeUserAdminAuthModal);
    userAdminAuthConfirmBtn?.addEventListener('click', handleUserAdminAuth);

    // Enter 키로 관리자 인증
    userAdminPassword?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleUserAdminAuth();
        }
    });

    // 🌐 언어 선택 이벤트 리스너
    const settingsLanguageSelect = document.getElementById('adminSettingsLanguageSelect');

    // 페이지 로드 시 저장된 언어 불러오기
    const savedLang = localStorage.getItem('appLanguage') || 'ko';
    if (settingsLanguageSelect) {
        settingsLanguageSelect.value = savedLang;
    }

    // 언어 변경 시 저장 + Google Translate 적용
    settingsLanguageSelect?.addEventListener('change', (e) => {
        const selectedLang = e.target.value;

        // ⚠️ 수정금지(승인필요): 2026-03-11 언어변경 먹통 진단 로그 (실기기 테스트 후 제거 예정)
        console.log('[언어변경] 시작:', { 현재언어: localStorage.getItem('appLanguage'), 선택언어: selectedLang, hash: window.location.hash, cachedUser: !!localStorage.getItem('cachedUser') });

        // localStorage에 저장
        localStorage.setItem('appLanguage', selectedLang);

        // 🔄 2025-01-22: 프롬프트 캐시 클리어 (AI 응답 언어 버그 수정)
        gemini.clearPromptCache();

        // 🔧 2026-01-07: 한국어 선택 시 googtrans 쿠키 완전 삭제 (불어 전환 버그 해결)
        const domain = window.location.hostname;
        if (selectedLang === 'ko') {
            // 쿠키 만료시켜서 삭제
            document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
            document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${domain}`;
            document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.${domain}`;
        } else {
            document.cookie = `googtrans=/ko/${selectedLang}; path=/; domain=${domain}`;
            document.cookie = `googtrans=/ko/${selectedLang}; path=/`;
        }

        // 토스트 메시지
        const langNames = {
            'ko': '한국어',
            'en': 'English',
            'ja': '日本語',
            'zh-CN': '中文',
            'fr': 'Français',
            'de': 'Deutsch',
            'es': 'Español'
        };
        showToast(`언어가 ${langNames[selectedLang]}로 변경됩니다...`);

        // 페이지 새로고침 (Google Translate 적용)
        // ⚠️ 수정금지(승인필요): 2026-03-11 언어변경 먹통 진단 로그
        console.log('[언어변경] reload 직전:', { cachedUser: !!localStorage.getItem('cachedUser'), appLanguage: localStorage.getItem('appLanguage'), hash: window.location.hash });
        setTimeout(() => {
            window.location.reload();
        }, 500);
    });

    // 🔓 테스트용 로그아웃 버튼
    const testLogoutBtn = document.getElementById('adminTestLogoutBtn');
    testLogoutBtn?.addEventListener('click', () => {
        if (confirm('로그아웃하시겠습니까? (테스트용)')) {
            // 🔧 관리자 상태 및 게스트 사용량 초기화
            localStorage.removeItem('adminAuthenticated');
            localStorage.removeItem('adminAuthTime');
            localStorage.removeItem('adminPassword');
            localStorage.removeItem('guestDetailUsage');
            localStorage.removeItem('guestShareUsage');
            localStorage.removeItem('cachedUser');
            window.location.href = '/api/auth/logout';
        }
    });

    audioBtn?.addEventListener('click', onAudioBtnClick);
    saveBtn?.addEventListener('click', () => debounceClick('save', handleSaveClick, 500));
    textToggleBtn?.addEventListener('click', () => textOverlay.classList.toggle('hidden'));

    // ✅ 공유 버튼 간편 로직 - 2025.10.02 구현 완료 (디바운스 추가)
    // 핵심: 1회 클릭 → 선택 모드 활성화 / 2회 클릭 (선택 후) → 공유 모달
    archiveShareBtn?.addEventListener('click', async () => {
        debounceClick('share', async () => {
            if (!isSelectionMode) {
                showToast('이미지를 선택해주세요');
                toggleSelectionMode(true);
                return;
            }

            if (selectedItemIds.length === 0) { // ✅ .size → .length
                showToast('이미지를 선택해주세요');
                return;
            }

            await handleCreateGuidebookClick();
        }, 600);
    });

    // ✅ 삭제 버튼 간편 로직 - 2025.10.02 구현 완료 (디바운스 추가)
    // 핵심: 1회 클릭 → 선택 모드 활성화 / 2회 클릭 (선택 후) → 삭제 실행
    archiveDeleteBtn?.addEventListener('click', async () => {
        debounceClick('delete', async () => {
            if (!isSelectionMode) {
                showToast('이미지를 선택해주세요');
                toggleSelectionMode(true);
                return;
            }

            if (selectedItemIds.length === 0) { // ✅ .size → .length
                showToast('이미지를 선택해주세요');
                return;
            }

            await handleDeleteSelected();
        }, 600);
    });

    // ⚠️ 2025.11.02: 다운로드 버튼 - 공유 페이지 생성 후 바로 열기
    const downloadSelectedBtn = document.getElementById('downloadSelectedBtn');
    downloadSelectedBtn?.addEventListener('click', async () => {
        debounceClick('download', async () => {
            if (selectedItemIds.length === 0) {
                showToast('이미지를 선택해주세요');
                return;
            }

            await handleDownloadSelectedGuides();
        }, 600);
    });

    // ✅ 설정 페이지 - 앱 내 설정 페이지 열기
    archiveSettingsBtn?.addEventListener('click', () => {
        showSettingsPage();
    });

    cancelSelectionBtn?.addEventListener('click', () => toggleSelectionMode(false));

    archiveGrid?.addEventListener('click', handleArchiveGridClick);
    archiveGrid?.addEventListener('keydown', handleArchiveGridKeydown);

    authForm?.addEventListener('submit', handleAuth);
    adminSavePromptsBtn?.addEventListener('click', savePrompts);
    adminResetPromptsBtn?.addEventListener('click', resetPrompts);
    adminGenerateImageBtn?.addEventListener('click', handleGenerateImageDemo);
    adminGenerateVideoBtn?.addEventListener('click', handleGenerateVideoDemo);

    // 🔔 관리자 알림 발송 버튼
    const adminSendNotificationBtn = document.getElementById('adminSendNotificationBtn');
    adminSendNotificationBtn?.addEventListener('click', handleAdminSendNotification);

    // Auth Modal Event Listeners
    closeAuthModalBtn?.addEventListener('click', () => {
        authModal.classList.add('hidden');
        authModal.classList.add('pointer-events-none');
        authModal.classList.remove('pointer-events-auto');
        // 대기 중인 URL 삭제 (배포본과 동일)
        localStorage.removeItem('pendingShareUrl');
    });

    // ═══════════════════════════════════════════════════════════════
    // ⚠️ CRITICAL: DO NOT MODIFY WITHOUT USER APPROVAL
    // 사용자 승인 없이 절대 수정 금지 - AI 및 모든 개발자 주의
    // 
    // 📱 모바일 OAuth 프론트엔드 로직 (2025-11-12)
    // - PC/모바일 통일: window.open() 팝업 방식 (보관함 상태 유지!)
    // - 팝업 차단 시 현재 탭 fallback
    // - postMessage로 인증 완료 감지
    // - pendingShareUrl로 Featured Gallery 자동 재오픈
    // 
    // 핵심 원리:
    // 1. window.open()으로 OAuth 페이지 팝업 (보관함 탭 그대로 유지)
    // 2. 팝업에서 인증 완료 → postMessage 전송
    // 3. 메인 창에서 메시지 수신 → checkAuthAndOpenPendingUrl() 실행
    // 4. Featured Gallery 새 창으로 재오픈 (보관함 탭 유지)
    //
    // Verified: 2025-11-12 | Status: Production-Ready ✅
    // ═══════════════════════════════════════════════════════════════

    // 모바일 감지 함수 (강화 버전)
    function isMobile() {
        // 터치 지원 + 화면 크기로 더 정확하게 감지
        const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        const isSmallScreen = window.innerWidth < 768;
        const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        // 터치 지원 + 작은 화면 OR 모바일 UserAgent
        return (hasTouch && isSmallScreen) || mobileUA;
    }

    // ⚠️ 수정금지(승인필요): 2026-03-20 OAuth 공용 함수 — WebView/모바일에서는 location.href 직접 이동, PC에서는 팝업
    function openOAuthFlow(url, windowName) {
        if (isNativeApp || isMobile()) {
            window.location.href = url;
            return;
        }
        const width = 500, height = 600;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;
        const popup = window.open(url, windowName,
            `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes`);
        if (!popup || popup.closed) {
            window.location.href = url;
        }
    }

    googleLoginBtn?.addEventListener('click', () => openOAuthFlow('/api/auth/google', 'google_oauth'));
    kakaoLoginBtn?.addEventListener('click', () => openOAuthFlow('/api/auth/kakao', 'kakao_oauth'));

    // ⚠️ 수정금지(승인필요): 2026-03-20 Apple 로그인 버튼 — iOS 앱 OR iOS 브라우저에서 표시 (detectPlatform ios)
    if (detectPlatform() === 'ios') {
        if (appleLoginBtn) appleLoginBtn.style.display = 'flex';
    }
    appleLoginBtn?.addEventListener('click', () => openOAuthFlow('/api/auth/apple', 'apple_oauth'));

    // OAuth 팝업 닫힌 후 인증 상태 확인 및 Featured Gallery 열기
    async function checkAuthAndOpenPendingUrl() {
        try {
            const response = await fetch('/api/auth/user', { credentials: 'include' });
            if (response.ok) {
                // 인증 모달 닫기
                authModal?.classList.add('hidden');

                // 2026-01-22: DB 언어 로드 제거 → localStorage만 사용

                // ⚠️ 수정금지(승인필요) — pendingShareUrl: SPA 오버레이로 열기 (2026-03-10)
                const pendingUrl = localStorage.getItem('pendingShareUrl');
                if (pendingUrl) {
                    localStorage.removeItem('pendingShareUrl');
                    openPageOverlay(addLangToUrl(pendingUrl));
                } else {
                    // Featured Gallery 새로고침
                    loadFeaturedGallery();
                }
            } else {
            }
        } catch (error) {
            console.error('인증 확인 오류:', error);
        }
    }

    // Auth Modal Background Click to Close
    authModal?.addEventListener('click', (e) => {
        if (e.target === authModal) {
            authModal.classList.add('hidden');
            authModal.classList.add('pointer-events-none');
            authModal.classList.remove('pointer-events-auto');
        }
    });

    initializeApp();

    // 임시 샘플 데이터 추가 함수 (테스트용)
    window.addSampleImages = async function () {
        const sampleData = [
            {
                id: 'sample-1',
                imageDataUrl: 'assets/sample1.png',
                description: '사모트라케의 니케. 기원전 190년경 제작된 헬레니즘 시대의 걸작입니다. 승리의 여신 니케가 배의 선수에 내려앉는 순간을 포착한 이 조각은 역동적인 움직임과 바람에 휘날리는 옷자락의 표현이 탁월합니다. 루브르 박물관 계단 위에서 관람객을 맞이하는 이 작품은 고대 그리스 조각의 정수를 보여줍니다.'
            }
        ];

        for (const data of sampleData) {
            try {
                await addItem(data);
            } catch (e) {
            }
        }

        await renderArchive();
        showToast('샘플 이미지가 추가되었습니다!');
    };

    // URL 해시 변화 감지 (Featured 공유 페이지 리턴 버튼 지원)
    // Featured 페이지에서 window.location.href='/#archive' 사용 시
    // hashchange 이벤트로 정상적인 페이지 전환 → 카메라 상태 유지
    window.addEventListener('hashchange', () => {
        const hash = window.location.hash;

        if (hash === '#archive') {
            showArchivePage();
        } else if (hash === '' || hash === '#main') {
            showMainPage();
        } else if (hash === '#settings') {
            showSettingsPage();
        } else if (hash === '#features') {
            showFeaturesPage();
        }
    });

    if ('serviceWorker' in navigator) {
        let isReloading = false;

        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js')
                .then(reg => {

                    // 새 버전 감지 시 자동 업데이트 (무한 새로고침 방지)
                    reg.addEventListener('updatefound', () => {
                        const newWorker = reg.installing;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'activated' && !isReloading) {
                                // 새 버전이 활성화되면 자동으로 페이지 새로고침
                                if (!navigator.serviceWorker.controller) {
                                    // 첫 설치일 경우 새로고침하지 않음
                                    return;
                                }
                            }
                        });
                    });
                })
                .catch(err => console.log('SW registration failed: ', err));
        });

        // Service Worker 제어권 변경 감지 (백그라운드 업데이트) - 무한 새로고침 방지
        // 세션당 한 번만 새로고침 허용
        const swReloadKey = 'sw_reload_done';
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (isReloading) return;
            if (sessionStorage.getItem(swReloadKey)) {
                return;
            }
            isReloading = true;
            sessionStorage.setItem(swReloadKey, 'true');
            window.location.reload();
        });
    }
});