// === 보관함 코드를 그대로 복사한 공유 페이지 ===

// ⭐ 2025-12-27: window.playAudio 즉시 덮어쓰기 (인라인 스크립트보다 먼저!)
// 이 IIFE는 스크립트 로드 시 즉시 실행됨 - DOMContentLoaded 대기 없음
(function() {
    // legacyPlayAudio 함수는 아직 정의되지 않았으므로 나중에 호출
    window.playAudio = async function(text, voiceLang) {
        // legacyPlayAudio가 정의되면 호출, 아니면 대기
        if (typeof legacyPlayAudio === 'function') {
            await legacyPlayAudio();
        } else {
            // DOMContentLoaded 후 다시 시도
            await new Promise(resolve => {
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', resolve);
                } else {
                    resolve();
                }
            });
            if (typeof legacyPlayAudio === 'function') {
                await legacyPlayAudio();
            } else {
            }
        }
    };
})();

// 🌐 2025-12-27: 수신자 디바이스 언어 감지 우선 (앱 미설치 사용자 지원)
// 우선순위: appLanguage (앱 설치 사용자) > navigator.language (디바이스 언어) > 'ko' (기본값)
(function() {
    try {
        // 🎯 언어 감지 로직: 앱 설정 > 디바이스 언어 > 기본값
        var storedLang = localStorage.getItem('appLanguage');
        var deviceLang = (navigator.language || navigator.userLanguage || 'ko').split('-')[0];
        
        // 지원 언어 목록
        var supportedLangs = ['ko', 'en', 'ja', 'zh-CN', 'fr', 'de', 'es'];
        
        // zh는 zh-CN으로 매핑
        if (deviceLang === 'zh') deviceLang = 'zh-CN';
        
        // 지원 언어가 아니면 영어로 fallback
        if (!supportedLangs.includes(deviceLang)) deviceLang = 'en';
        
        var targetLang = storedLang || deviceLang;
        var domain = window.location.hostname;
        
        // googtrans 쿠키 설정 (원본 언어는 auto-detect)
        document.cookie = 'googtrans=/auto/' + targetLang + ';path=/;domain=' + domain;
        document.cookie = 'googtrans=/auto/' + targetLang + ';path=/';
        
        // 전역 변수로 저장 (다른 함수에서 사용)
        window.__detectedUserLang = targetLang;
    } catch(e) {
        window.__detectedUserLang = 'ko';
    }
})();

// 🔊 2025-12-25: 변수 충돌 방지 - window 객체에 직접 할당
// synth 선언 제거 → window.speechSynthesis 직접 사용
(function() {
    // 기존 인라인 코드가 이미 선언한 변수들과 충돌 방지
    if (typeof window.__shareTTSInit === 'undefined') {
        window.__shareTTSInit = true;
        window.__shareUtteranceQueue = [];
        window.__shareIsSpeaking = false;
        window.__shareIsPaused = false;
        window.__shareCurrentElement = null;
        window.__shareLastClickTime = 0;
    }
})();

// 간편 접근용 (IIFE 외부에서도 사용)
var utteranceQueue = window.__shareUtteranceQueue;
var isSpeaking = window.__shareIsSpeaking;
var isPaused = window.__shareIsPaused;
var currentlySpeakingElement = window.__shareCurrentElement;
var lastAudioClickTime = window.__shareLastClickTime;
var voices = [];

// Android Chrome 감지 (Chromium bug #679437: pause/resume TTS 완전 먹통)
var isAndroidChrome = /Android/i.test(navigator.userAgent) && /Chrome/i.test(navigator.userAgent);

// ═══════════════════════════════════════════════════════════════
// 🔊 표준 음성 로직 (2025-12-24) - guideDetailPage.js와 동일
// ═══════════════════════════════════════════════════════════════
let voiceConfigsCache = null;
let voiceConfigsLoading = false;

const DEFAULT_VOICE_PRIORITIES = {
    'ko-KR': { default: ['Microsoft Heami', 'Yuna'] },
    'en-US': { default: ['Samantha', 'Microsoft Zira', 'Google US English', 'English'] },
    'ja-JP': { default: ['Kyoko', 'Microsoft Haruka', 'Google 日本語', 'Japanese'] },
    'zh-CN': { default: ['Ting-Ting', 'Microsoft Huihui', 'Google 普通话', 'Chinese'] },
    'fr-FR': { default: ['Thomas', 'Microsoft Hortense', 'Google français', 'French'] },
    'de-DE': { default: ['Anna', 'Microsoft Hedda', 'Google Deutsch', 'German'] },
    'es-ES': { default: ['Monica', 'Microsoft Helena', 'Google español', 'Spanish'] }
};

function detectPlatform() {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
    if (/Android/.test(ua)) return 'android';
    return 'windows';
}

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

function getVoicePriorityFromDB(langCode) {
    const platform = detectPlatform();
    
    if (voiceConfigsCache && voiceConfigsCache[langCode]) {
        const config = voiceConfigsCache[langCode][platform] || voiceConfigsCache[langCode]['default'];
        if (config) {
            return { priorities: config.priorities, excludeVoices: config.excludeVoices };
        }
    }
    
    const fallback = DEFAULT_VOICE_PRIORITIES[langCode];
    if (fallback) {
        const priorities = fallback[platform] || fallback['default'] || fallback[Object.keys(fallback)[0]];
        return { priorities, excludeVoices: [] };
    }
    
    return { priorities: [], excludeVoices: [] };
}

function getVoiceForLanguage(userLang) {
    const langMap = {
        'ko': 'ko-KR', 'en': 'en-US', 'ja': 'ja-JP',
        'zh-CN': 'zh-CN', 'fr': 'fr-FR', 'de': 'de-DE', 'es': 'es-ES'
    };
    
    const fullLang = langMap[userLang] || 'ko-KR';
    const langCode = fullLang.substring(0, 2);
    
    const voiceConfig = getVoicePriorityFromDB(fullLang);
    const priorities = voiceConfig.priorities;
    const excludeVoices = voiceConfig.excludeVoices;
    
    const allVoices = window.speechSynthesis.getVoices();
    let targetVoice = null;
    
    for (const voiceName of priorities) {
        targetVoice = allVoices.find(v => 
            v.name.includes(voiceName) && !excludeVoices.some(ex => v.name.includes(ex))
        );
        if (targetVoice) break;
    }
    
    if (!targetVoice) {
        targetVoice = allVoices.find(v => 
            v.lang.replace('_', '-').startsWith(langCode) && !excludeVoices.some(ex => v.name.includes(ex))
        );
    }
    
    return targetVoice || allVoices[0];
}

function populateVoiceList() {
    voices = window.speechSynthesis.getVoices();
}

// 앱 시작 시 음성 설정 로드
loadVoiceConfigsFromDB();
populateVoiceList();
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = populateVoiceList;
}

// 번역 완료 대기 시스템 (2025-12-06)
let translationState = {
    complete: false,
    observer: null,
    timeoutId: null
};

function initTranslationWatcher() {
    // 🌐 2025-12-27: 수신자 디바이스 언어 감지 우선
    const userLang = window.__detectedUserLang || localStorage.getItem('appLanguage') || 'ko';
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
    // 🌐 2025-12-27: 수신자 디바이스 언어 감지 우선
    const userLang = window.__detectedUserLang || localStorage.getItem('appLanguage') || 'ko';
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

// 🌐 동적 콘텐츠 강제 재번역 함수 (2025-12-24)
let retranslationPending = false;

async function retranslateNewContent() {
    // 🌐 2025-12-24: userLang 체크 제거 - Google Translate 드롭다운 활성화 여부만 확인
    return new Promise((resolve) => {
        const selectElement = document.querySelector('.goog-te-combo');
        
        if (!selectElement || !selectElement.value) {
            resolve();
            return;
        }
        
        const currentLang = selectElement.value;
        retranslationPending = true;
        
        selectElement.value = '';
        selectElement.dispatchEvent(new Event('change'));
        
        setTimeout(() => {
            selectElement.value = currentLang;
            selectElement.dispatchEvent(new Event('change'));
            
            setTimeout(() => {
                retranslationPending = false;
                window.dispatchEvent(new CustomEvent('shareRetranslationComplete'));
                resolve();
            }, 800);
        }, 100);
    });
}

async function waitForRetranslation() {
    if (!retranslationPending) return;
    
    await new Promise(resolve => {
        const handler = () => {
            window.removeEventListener('shareRetranslationComplete', handler);
            resolve();
        };
        window.addEventListener('shareRetranslationComplete', handler);
        setTimeout(resolve, 2000);
    });
}

// 공유 페이지 로딩
document.addEventListener('DOMContentLoaded', async () => {
    // 🔧 2025-12-27: 구글 번역 스피너 동적 숨김 (기존 DB 페이지 지원)
    const spinnerHideStyle = document.createElement('style');
    spinnerHideStyle.textContent = `
        .goog-te-spinner-pos { display: none !important; }
        .goog-te-spinner { display: none !important; }
        .goog-te-spinner-animation { display: none !important; }
    `;
    document.head.appendChild(spinnerHideStyle);
    
    // 번역 감시 초기화
    initTranslationWatcher();
    
    const contentContainer = document.getElementById('guidebook-content');
    const loader = document.getElementById('loader');
    const descriptionEl = document.getElementById('guidebook-description');

    const showError = (message) => {
        if (loader) loader.style.display = 'none';
        if (contentContainer) contentContainer.innerHTML = `<div class="text-center py-10 text-red-600">${message}</div>`;
    };

    try {
        // 공유 ID 가져오기
        const urlParams = new URLSearchParams(window.location.search);
        const shareId = urlParams.get('id');

        if (!shareId) {
            throw new Error('공유 ID가 없습니다.');
        }

        // API에서 데이터 가져오기
        const response = await fetch(`/api/share?id=${shareId}`);
        if (!response.ok) {
            throw new Error('공유된 가이드북을 찾을 수 없습니다.');
        }

        const shareData = response.json ? await response.json() : response;
        
        
        // 🔄 오프라인 지원: 로컬스토리지에 데이터 저장
        try {
            localStorage.setItem(`share-${shareId}`, JSON.stringify(shareData));
        } catch (e) {
        }
        
        if (!shareData || !shareData.contents || shareData.contents.length === 0) {
            throw new Error('유효하지 않은 공유 데이터입니다.');
        }

        // 🔥 새로운 헤더 시스템 적용
        const titleEl = document.getElementById('guidebook-title');
        const locationEl = document.getElementById('guidebook-location');
        const createdDateEl = document.getElementById('guidebook-created-date');
        
        // 링크 이름을 타이틀로 사용
        const linkName = shareData.name || shareData.linkName || '공유된 가이드북';
        titleEl.textContent = linkName;
        
        // 🔥 페이지 타이틀과 메타태그 동적 업데이트
        document.title = `${linkName} - 내손가이드`;
        document.getElementById('page-title').textContent = `${linkName} - 내손가이드`;
        document.getElementById('og-title').setAttribute('content', `${linkName} - 내손가이드`);
        document.getElementById('twitter-title').setAttribute('content', `${linkName} - 내손가이드`);
        
        // GPS 위치 정보 표시 (사진촬영시만, 업로드시 제외)
        if (shareData.location && shareData.location.trim() !== '') {
            locationEl.textContent = `📍 ${shareData.location}`;
            locationEl.style.display = 'block';
        } else {
            locationEl.style.display = 'none';
        }
        
        // 생성일자 표시 (인간적인 형태로)
        if (shareData.createdAt) {
            const date = new Date(shareData.createdAt);
            const formattedDate = date.toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            createdDateEl.textContent = `${formattedDate}에 생성`;
        }

        // 로더 숨기고 그리드 생성 - 보관함과 동일한 방식
        loader.style.display = 'none';

        shareData.contents.forEach((content, index) => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'archive-item cursor-pointer'; // 보관함과 동일한 클래스
            itemDiv.dataset.id = `content-item-${index}`;

            const img = document.createElement('img');
            img.src = content.imageDataUrl;
            img.alt = content.description.substring(0, 30);
            img.loading = 'lazy';
            img.className = 'w-full h-full object-cover aspect-square'; // 보관함과 동일한 스타일

            itemDiv.appendChild(img);
            contentContainer.appendChild(itemDiv);

            // 보관함과 동일한 클릭 이벤트
            itemDiv.addEventListener('click', () => {
                populateShareDetailPage(content);
            });
        });

        // 상세페이지 이벤트 리스너 - 보관함과 100% 동일
        setupDetailPageEventListeners();

    } catch (error) {
        console.error('가이드북 로딩 오류:', error);
        
        // 🔄 오프라인 지원: 로컬스토리지에서 데이터 복구 시도
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const shareId = urlParams.get('id');
            const cachedData = localStorage.getItem(`share-${shareId}`);
            
            if (cachedData) {
                const shareData = JSON.parse(cachedData);
                
                // 타이틀과 설명 설정
                descriptionEl.textContent = shareData.name || '공유된 가이드북 (오프라인)';
                
                // 로더 숨기고 그리드 생성
                loader.style.display = 'none';
                
                shareData.contents.forEach((content, index) => {
                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'archive-item cursor-pointer';
                    itemDiv.dataset.id = `content-item-${index}`;

                    const img = document.createElement('img');
                    img.src = content.imageDataUrl;
                    img.alt = content.description.substring(0, 30);
                    img.loading = 'lazy';
                    img.className = 'w-full h-full object-cover aspect-square';

                    itemDiv.appendChild(img);
                    contentContainer.appendChild(itemDiv);

                    itemDiv.addEventListener('click', () => {
                        populateShareDetailPage(content);
                    });
                });

                setupDetailPageEventListeners();
                return; // 성공적으로 복구됨
            }
        } catch (localError) {
        }
        
        // 로컬스토리지에서도 복구 실패
        showError(`가이드북을 불러오는 중 오류가 발생했습니다: ${error.message}`);
    }
});

// === 보관함에서 그대로 복사한 TTS 시스템 ===

// ⭐ 한국어 하드코딩 (iOS: Yuna/Sora, Android: 유나/소라, Windows: Heami)
function getOptimalKoreanVoice() {
    const allVoices = (voices && voices.length > 0) ? voices : window.speechSynthesis.getVoices();
    const koVoices = allVoices.filter(v => v.lang.startsWith('ko'));
    
    // Yuna → Sora → 유나 → 소라 → Heami → 첫 번째 한국어 음성
    const targetVoice = koVoices.find(v => v.name.includes('Yuna'))
                     || koVoices.find(v => v.name.includes('Sora'))
                     || koVoices.find(v => v.name.includes('유나'))
                     || koVoices.find(v => v.name.includes('소라'))
                     || koVoices.find(v => v.name.includes('Heami'))
                     || koVoices[0];
    
    return targetVoice;
}

function resetSpeechState() {
    utteranceQueue = [];
    isSpeaking = false;
    isPaused = false;
    if (currentlySpeakingElement) {
        currentlySpeakingElement.classList.remove('speaking');
    }
    currentlySpeakingElement = null;
    
    // 모든 speaking 클래스 제거 (중복 방지)
    const allSpeakingElements = document.querySelectorAll('.speaking');
    allSpeakingElements.forEach(el => el.classList.remove('speaking'));
}

function stopSpeech() {
    // 즉시 음성 중지 (타이머 없음)
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
    }
    
    // 상태 완전 초기화
    resetSpeechState();
}

function queueForSpeech(text, element) {
    const utterance = new SpeechSynthesisUtterance(text);
    
    // 🔊 2025-12-27: 수신자 디바이스 언어 감지 우선
    const userLang = window.__detectedUserLang || localStorage.getItem('appLanguage') || 'ko';
    const langCodeMap = { 'ko': 'ko-KR', 'en': 'en-US', 'ja': 'ja-JP', 'zh-CN': 'zh-CN', 'fr': 'fr-FR', 'de': 'de-DE', 'es': 'es-ES' };
    const langCode = langCodeMap[userLang] || 'ko-KR';
    
    let targetVoice = null;
    
    if (langCode === 'ko-KR') {
        // ⭐ 한국어 하드코딩 (iOS: Yuna/Sora, Android: 유나/소라, Windows: Heami)
        targetVoice = getOptimalKoreanVoice();
    } else {
        // 다른 언어: DB voice_configs 또는 기본값
        targetVoice = getVoiceForLanguage(userLang);
    }
    
    utterance.voice = targetVoice;
    utterance.lang = langCode;
    utteranceQueue.push({ utterance, element });

    if (!isSpeaking && !window.speechSynthesis.speaking && !isPaused) {
        updateAudioButton('pause');
        playNextInQueue();
    }
}

async function playNextInQueue() {
    if (isPaused || utteranceQueue.length === 0) {
        if (utteranceQueue.length === 0) {
            isSpeaking = false;
            isPaused = false;
            if(currentlySpeakingElement) currentlySpeakingElement.classList.remove('speaking');
            currentlySpeakingElement = null;
            updateAudioButton('play');
        }
        return;
    }
    
    // 번역 완료 대기 후 TTS 재생
    await waitForTranslation();
    
    // 🌐 2025-12-24: 동적 콘텐츠 재번역 완료 대기 (언어 무관 - 조건 제거)
    await waitForRetranslation();
    if (retranslationPending) {
    }
    
    isSpeaking = true;
    const { utterance, element } = utteranceQueue.shift();
    
    // 🌐 2025-12-25: Google Translate의 <font> 태그에서 번역된 텍스트 추출 (index.js와 동일)
    let translatedText = utterance.text;
    const fontEl = element.querySelector('font');
    if (fontEl) {
        translatedText = fontEl.innerText.trim() || fontEl.textContent.trim() || utterance.text;
    } else {
        translatedText = element.innerText.trim() || utterance.text;
    }
    utterance.text = translatedText;
    
    // 🌐 2025-12-27: 수신자 디바이스 언어 감지 우선 (앱 미설치 사용자 지원)
    const userLang = window.__detectedUserLang || localStorage.getItem('appLanguage') || 'ko';
    const langCodeMap = { 'ko': 'ko-KR', 'en': 'en-US', 'ja': 'ja-JP', 'zh-CN': 'zh-CN', 'fr': 'fr-FR', 'de': 'de-DE', 'es': 'es-ES' };
    const langCode = langCodeMap[userLang] || 'ko-KR';
    
    
    // 🌐 앱 언어 기준 음성 선택 (onvoiceschanged 캐시 우선, Android 초기 빈 배열 방지)
    const allVoices = (voices && voices.length > 0) ? voices : window.speechSynthesis.getVoices();
    let targetVoice = null;
    
    if (langCode === 'ko-KR') {
        // ⭐ 한국어 하드코딩 (iOS: Yuna/Sora, Android: 유나/소라, Windows: Heami)
        const koVoices = allVoices.filter(v => v.lang.startsWith('ko'));
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
        
        for (const voiceName of priorities) {
            targetVoice = allVoices.find(v => 
                v.name.includes(voiceName) && !excludeVoices.some(ex => v.name.includes(ex))
            );
            if (targetVoice) break;
        }
        
        if (!targetVoice) {
            targetVoice = allVoices.find(v => v.lang.replace('_', '-').startsWith(langCode.substring(0, 2)));
        }
    }
    
    utterance.voice = targetVoice || null;
    utterance.lang = langCode;
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    
    if (currentlySpeakingElement) {
        currentlySpeakingElement.classList.remove('speaking');
    }
    element.classList.add('speaking');
    currentlySpeakingElement = element;
    
    utterance.onend = () => {
        element.classList.remove('speaking');
        playNextInQueue();
    };
    
    utterance.onerror = () => {
        element.classList.remove('speaking');
        playNextInQueue();
    };

    window.speechSynthesis.speak(utterance);
}

function restartAudio() {
    stopSpeech();
    
    const descriptionText = document.getElementById('shareDescriptionText');
    if (!descriptionText) return;

    const spans = Array.from(descriptionText.querySelectorAll('span'));
    spans.forEach(span => {
        const text = span.textContent.trim();
        if (text) {
            queueForSpeech(text, span);
        }
    });
    updateAudioButton('pause');
}

function handleAudioButtonClick() {
    if (!isSpeaking && !isPaused && utteranceQueue.length === 0) {
        restartAudio();
    } else if (isSpeaking && !isPaused) {
        if (isAndroidChrome) {
            // Android Chrome: pause()가 TTS를 완전히 멈춤 (Chromium bug #679437)
            // 대신 완전 정지 → 버튼 누르면 처음부터 재시작
            stopSpeech();
            updateAudioButton('play');
        } else {
            isPaused = true;
            window.speechSynthesis.pause();
            updateAudioButton('play');
        }
    } else if (isSpeaking && isPaused) {
        if (isAndroidChrome) {
            // Android Chrome: resume()도 동작 안 함 → 처음부터 재시작
            restartAudio();
        } else {
            isPaused = false;
            window.speechSynthesis.resume();
            updateAudioButton('pause');
        }
    }
}

function onShareAudioBtnClick() {
    const now = Date.now();
    if (now - lastAudioClickTime < 350) {
        restartAudio();
    } else {
        handleAudioButtonClick();
    }
    lastAudioClickTime = now;
}

function updateAudioButton(state) {
    const audioBtn = document.getElementById('shareAudioBtn');
    if (!audioBtn) return;
    
    const playIcon = '<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.648c1.295.748 1.295 2.538 0 3.286L7.279 20.99c-1.25.717-2.779-.217-2.779-1.643V5.653z" clip-rule="evenodd" /></svg>';
    const pauseIcon = '<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M6.75 5.25a.75 .75 0 01.75-.75H9a.75 .75 0 01.75.75v13.5a.75 .75 0 01-.75.75H7.5a.75 .75 0 01-.75-.75V5.25zm7.5 0a.75 .75 0 01.75-.75h1.5a.75 .75 0 01.75.75v13.5a.75 .75 0 01-.75.75h-1.5a.75 .75 0 01-.75-.75V5.25z" clip-rule="evenodd" /></svg>';
    const loadingIcon = '<div class="w-8 h-8 rounded-full animate-spin loader-blue"></div>';

    audioBtn.disabled = state === 'loading' || state === 'disabled';
    
    switch (state) {
        case 'play':
        case 'resume':
            audioBtn.innerHTML = playIcon;
            audioBtn.setAttribute('aria-label', '오디오 재생');
            break;
        case 'pause':
            audioBtn.innerHTML = pauseIcon;
            audioBtn.setAttribute('aria-label', '오디오 일시정지');
            break;
        case 'loading':
            audioBtn.innerHTML = loadingIcon;
             audioBtn.setAttribute('aria-label', '오디오 로딩 중');
            break;
        case 'disabled':
             audioBtn.innerHTML = playIcon;
             audioBtn.setAttribute('aria-label', '오디오 재생 불가');
            break;
    }
}

// === 보관함의 populateDetailPageFromArchive를 그대로 복사 ===
async function populateShareDetailPage(item) {
    
    // 보관함과 100% 동일한 음성 중지 로직
    stopSpeech();
    
    const shareDetailPage = document.getElementById('shareDetailPage');
    const shareResultImage = document.getElementById('shareResultImage');
    const shareDescriptionText = document.getElementById('shareDescriptionText');
    const shareTextOverlay = document.getElementById('shareTextOverlay');
    const shareLoader = document.getElementById('shareLoader');
    const shareLoadingHeader = document.getElementById('shareLoadingHeader');
    const shareDetailFooter = document.getElementById('shareDetailFooter');
    
    if (!shareDetailPage || !shareResultImage || !shareDescriptionText) {
        console.error('Required share page elements not found');
        return;
    }
    
    // 이미지 설정
    shareResultImage.src = item.imageDataUrl || '';
    shareResultImage.classList.toggle('hidden', !item.imageDataUrl);

    // 친화적 배경 제거 (보관함과 동일)
    shareDetailPage.classList.remove('bg-friendly');

    // 텍스트 초기화
    shareDescriptionText.innerHTML = '';
    
    // 보관함과 100% 동일한 요소 표시/숨김 순서
    shareLoader.classList.add('hidden');
    shareTextOverlay.classList.remove('hidden');
    shareTextOverlay.classList.remove('animate-in');
    shareLoadingHeader.classList.add('hidden');
    shareDetailFooter.classList.remove('hidden');
    
    const description = item.description || '';
    
    // 🌐 2025-12-24: DOM에 콘텐츠 먼저 추가
    const sentences = description.match(/[^.?!]+[.?!]+/g) || [description];
    const spans = [];
    sentences.forEach(sentence => {
        if (!sentence) return;
        const span = document.createElement('span');
        span.textContent = sentence.trim() + ' ';
        shareDescriptionText.appendChild(span);
        spans.push({ text: sentence.trim(), span });
    });
    
    // 🌐 2025-12-24: 재번역 완료 후 TTS 큐에 추가
    await retranslateNewContent();
    
    // 재번역 완료 후 TTS 큐에 추가
    spans.forEach(({ text, span }) => {
        queueForSpeech(text, span);
    });

    // 상세페이지 표시 (보관함과 동일)
    shareDetailPage.classList.add('visible');
}

function hideShareDetailPage() {
    stopSpeech(); // 보관함과 동일한 음성 중지
    
    const shareDetailPage = document.getElementById('shareDetailPage');
    if (shareDetailPage) {
        shareDetailPage.classList.remove('visible');
    }
}

// 이벤트 리스너 설정 함수
function setupDetailPageEventListeners() {
    const shareBackBtn = document.getElementById('shareBackBtn');
    const shareAudioBtn = document.getElementById('shareAudioBtn');
    const shareTextToggleBtn = document.getElementById('shareTextToggleBtn');
    const shareHomeBtn = document.getElementById('shareHomeBtn');
    
    
    if (shareBackBtn) {
        shareBackBtn.addEventListener('click', () => {
            hideShareDetailPage();
        });
    }
    
    if (shareAudioBtn) {
        shareAudioBtn.addEventListener('click', () => {
            onShareAudioBtnClick();
        });
    }
    
    if (shareTextToggleBtn) {
        shareTextToggleBtn.addEventListener('click', () => {
            const textOverlay = document.getElementById('shareTextOverlay');
            if (textOverlay) {
                textOverlay.classList.toggle('hidden');
            } else {
            }
        });
    }
    
    if (shareHomeBtn) {
        shareHomeBtn.addEventListener('click', () => {
            window.open('/', '_blank');
        });
    }
}

// Global 함수 노출 (테스트용)
window.populateShareDetailPage = populateShareDetailPage;
window.hideShareDetailPage = hideShareDetailPage;
window.setupDetailPageEventListeners = setupDetailPageEventListeners;
window.onShareAudioBtnClick = onShareAudioBtnClick;

// 추천 배너 함수들 (기존 유지)
window.showReferralBanner = function(refCode) {
    const banner = document.getElementById('referralBanner');
    const referrerName = document.getElementById('referrerName');
    
    if (banner && referrerName) {
        referrerName.textContent = `${refCode}`;
        banner.classList.remove('hidden');
    }
};

window.signUpWithBonus = function() {
    const referrer = localStorage.getItem('referrer');
    const params = referrer ? `?ref=${referrer}` : '';
    window.open(`/${params}`, '_blank');
};

// ═══════════════════════════════════════════════════════════════
// 🔄 2025-12-27: 구버전 DB 페이지 지원 (detail-audio, detail-description 등)
// ═══════════════════════════════════════════════════════════════

function setupLegacyPageSupport() {
    // 구버전 요소 확인
    const legacyAudioBtn = document.getElementById('detail-audio');
    const legacyDescriptionEl = document.getElementById('detail-description');
    
    // 신버전 요소가 있으면 구버전 로직 스킵
    const newAudioBtn = document.getElementById('shareAudioBtn');
    if (newAudioBtn) {
        return;
    }
    
    if (!legacyAudioBtn && !legacyDescriptionEl) {
        return;
    }
    
    
    // ⭐ window.playAudio는 이미 파일 최상단 IIFE에서 즉시 덮어씀 (DOMContentLoaded 대기 없음)
    // 여기서는 추가 작업 없음
}

// 구버전 페이지용 TTS 재생 함수
async function legacyPlayAudio() {
    const descriptionEl = document.getElementById('detail-description');
    if (!descriptionEl) {
        return;
    }
    
    // 현재 재생 중이면 토글
    if (window.speechSynthesis.speaking) {
        if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
            updateLegacyAudioButton('pause');
        } else {
            window.speechSynthesis.pause();
            updateLegacyAudioButton('play');
        }
        return;
    }
    
    // 새로 재생 시작
    window.speechSynthesis.cancel();
    
    // 🌐 재번역 실행 후 TTS
    await retranslateNewContent();
    
    // 800ms 추가 대기 (번역 완료 보장)
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // 🌐 font 태그에서 번역된 텍스트 추출
    let translatedText = '';
    const fontEl = descriptionEl.querySelector('font');
    if (fontEl) {
        translatedText = fontEl.innerText.trim() || fontEl.textContent.trim();
    } else {
        translatedText = descriptionEl.innerText.trim() || descriptionEl.textContent.trim();
    }
    
    if (!translatedText) {
        return;
    }
    
    
    // 🌐 2025-12-27: 수신자 디바이스 언어 감지 우선 (앱 미설치 사용자 지원)
    // window.__detectedUserLang는 페이지 로드 시 감지됨 (appLanguage > navigator.language > 'ko')
    const userLang = window.__detectedUserLang || localStorage.getItem('appLanguage') || 'ko';
    const langCodeMap = { 'ko': 'ko-KR', 'en': 'en-US', 'ja': 'ja-JP', 'zh-CN': 'zh-CN', 'fr': 'fr-FR', 'de': 'de-DE', 'es': 'es-ES' };
    const langCode = langCodeMap[userLang] || 'ko-KR';
    
    
    // 음성 선택
    const allVoices = window.speechSynthesis.getVoices();
    let targetVoice = null;
    
    if (langCode === 'ko-KR') {
        // ⭐ 한국어 하드코딩
        const koVoices = allVoices.filter(v => v.lang.startsWith('ko'));
        targetVoice = koVoices.find(v => v.name.includes('Yuna'))
                   || koVoices.find(v => v.name.includes('Sora'))
                   || koVoices.find(v => v.name.includes('유나'))
                   || koVoices.find(v => v.name.includes('소라'))
                   || koVoices.find(v => v.name.includes('Heami'))
                   || koVoices[0];
    } else {
        // 다국어 DB 기반
        const voiceConfig = getVoicePriorityFromDB(langCode);
        for (const voiceName of voiceConfig.priorities) {
            targetVoice = allVoices.find(v => 
                v.name.includes(voiceName) && !voiceConfig.excludeVoices.some(ex => v.name.includes(ex))
            );
            if (targetVoice) break;
        }
        if (!targetVoice) {
            targetVoice = allVoices.find(v => v.lang.replace('_', '-').startsWith(langCode.substring(0, 2)));
        }
    }
    
    // TTS 재생
    const utterance = new SpeechSynthesisUtterance(translatedText);
    utterance.voice = targetVoice;
    utterance.lang = langCode;
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    
    utterance.onstart = () => updateLegacyAudioButton('pause');
    utterance.onend = () => updateLegacyAudioButton('play');
    utterance.onerror = () => updateLegacyAudioButton('play');
    
    window.speechSynthesis.speak(utterance);
}

function updateLegacyAudioButton(state) {
    const audioBtn = document.getElementById('detail-audio');
    if (!audioBtn) return;
    
    const playIcon = '<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.648c1.295.746 1.295 2.536 0 3.282L7.279 20.99c-1.25.72-2.779-.218-2.779-1.643V5.653z" clip-rule="evenodd" /></svg>';
    const pauseIcon = '<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z" clip-rule="evenodd" /></svg>';
    
    audioBtn.innerHTML = (state === 'pause') ? pauseIcon : playIcon;
}

// 🔄 페이지 로드 시 구버전 지원 초기화
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        loadVoiceConfigsFromDB().then(() => {
            setupLegacyPageSupport();
        });
    });
} else {
    loadVoiceConfigsFromDB().then(() => {
        setupLegacyPageSupport();
    });
}