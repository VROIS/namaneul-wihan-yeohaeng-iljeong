// ═══════════════════════════════════════════════════════════════
// ⚠️ CRITICAL: 표준 공유페이지 템플릿 - 1000+회 테스트된 핵심 파일
// ═══════════════════════════════════════════════════════════════
// 🔴 DO NOT MODIFY WITHOUT USER APPROVAL
// 🔴 이 파일은 신규 유입자가 앱으로 오는 **유일한 통로**입니다
// 🔴 임의 수정 시 전체 공유페이지 시스템이 깨집니다
// 
// 작업 이력:
// - 2025-11-23: appOrigin 하드코딩 (개발본/배포본 동일 작동 보장)
// - 출처: public/index.js의 generateShareHTML 함수 (373-900번 라인)
// ═══════════════════════════════════════════════════════════════

export interface StandardTemplateData {
  title: string;
  sender: string;
  location: string;
  date: string;
  guideItems: GuideItem[];
  appOrigin: string;
  isFeatured?: boolean;
  creatorReferralCode?: string;
}

export interface GuideItem {
  id?: string; // Guide UUID (optional, fallback to index)
  title?: string; // 🎤 음성키워드 폴백용 (voiceQuery 없으면 title 사용)
  imageDataUrl: string;
  description: string;
  voiceLang?: string; // TTS 언어 코드 (예: ko-KR, fr-FR)
  locationName?: string; // 📍 GPS 위치 이름 (이미지 모드)
  voiceQuery?: string; // 🎤 음성 질문/키워드 (음성 모드)
  voiceName?: string; // 🔊 저장된 음성 이름
}

export function generateStandardShareHTML(data: StandardTemplateData): string {
  const { title, sender, location, date, guideItems, isFeatured = false, creatorReferralCode = '' } = data;
  
  // ⚠️ 2025-11-23: appOrigin 하드코딩 (개발본/배포본 동일 작동 보장)
  // 홈 버튼 2개 (메인 하단 "손안에 가이드 시작하기", 가이드 페이지 하단)에서 사용
  const appOrigin = 'https://My-handyguide1.replit.app';
  
  // HTML escape 함수 (XSS 방지 및 파싱 에러 방지)
  const escapeHTML = (str: string) => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };
  
  // 갤러리 그리드 아이템 생성 (2열)
  // ✅ 2025-11-26: data-id는 인덱스 (클릭 핸들러용), data-guid는 UUID (parseGuidesFromHtml용)
  // ⚠️ CRITICAL: data-id는 반드시 숫자 인덱스여야 함! parseInt(data-id)로 appData 접근하기 때문
  // 🎤 2025-12-15: 음성 모드일 때 보관함 형식 적용 (마이크+키워드+워터마크)
  const galleryItemsHTML = guideItems.map((item, index) => {
    // 🎤 음성 모드 판별: 이미지 없거나 1x1 투명 PNG면 음성 모드
    const hasImage = item.imageDataUrl && !item.imageDataUrl.includes('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAY');
    const isVoiceGuide = !hasImage && (item.voiceQuery || item.title);
    
    if (isVoiceGuide) {
      // 🎤 음성 모드: 보관함 형식 적용 (마이크 아이콘 + 키워드 + 워터마크)
      return `
            <div class="gallery-item" data-id="${index}" data-guid="${item.id || ''}">
                <div class="voice-thumbnail">
                    <img src="/images/landing-logo.jpg" alt="내손가이드 로고" class="voice-bg-logo">
                    <div class="voice-content">
                        <svg class="voice-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                        <span class="voice-keyword">${escapeHTML(item.voiceQuery || item.title || '음성 질문')}</span>
                    </div>
                </div>
                <p>가이드 ${index + 1}</p>
            </div>`;
    } else {
      // 이미지 모드: 기존 형식
      return `
            <div class="gallery-item" data-id="${index}" data-guid="${item.id || ''}">
                <img src="${item.imageDataUrl || ''}" alt="가이드 ${index + 1}" loading="lazy">
                <p>가이드 ${index + 1}</p>
            </div>`;
    }
  }).join('');

  // 데이터 JSON (이미지 + 설명 + 음성정보)
  // ✅ 2025-11-26: id는 인덱스 (클릭 핸들러용), guid는 UUID (parseGuidesFromHtml용)
  // ✅ 2025-12-03: voiceLang 추가 (저장된 언어로 TTS 재생)
  const dataJSON = JSON.stringify(guideItems.map((item, index) => ({
    id: index,
    guid: item.id || '',
    title: item.title || '',  // 🎤 음성키워드 폴백용
    imageDataUrl: item.imageDataUrl || '',
    description: item.description || '',
    voiceLang: item.voiceLang || 'ko-KR',
    locationName: item.locationName || null,
    voiceQuery: item.voiceQuery || null,
    voiceName: item.voiceName || null
  })));

  // UTF-8 안전한 base64 인코딩
  const utf8ToBase64 = (str: string) => {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
      return String.fromCharCode(parseInt('0x' + p1));
    }));
  };

  return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <!-- 🎤🔒 2025.12.04: TTS 강제 차단 + 번역 완료 후 재생 (speechSynthesis.speak 가로채기) -->
    <script>
        (function() {
            'use strict';
            
            // 언어코드 매핑
            var LANG_MAP = {
                'ko': 'ko-KR', 'en': 'en-US', 'ja': 'ja-JP',
                'zh-CN': 'zh-CN', 'fr': 'fr-FR', 'de': 'de-DE', 'es': 'es-ES'
            };
            
            // 🌐 2025.12.05: URL 파라미터 + localStorage 모두 체크
            var params = new URLSearchParams(window.location.search);
            var urlLang = params.get('lang');
            var storedLang = null;
            try { storedLang = localStorage.getItem('appLanguage'); } catch(e) {}
            
            // URL 파라미터 우선, 없으면 localStorage
            var activeLang = urlLang || storedLang || 'ko';
            var targetLang = LANG_MAP[activeLang] || LANG_MAP[activeLang.split('-')[0]] || null;
            
            // 한국어가 아니면 → 번역 필요, TTS 대기
            var needsTranslation = activeLang !== 'ko' && targetLang;
            window.__translationComplete = !needsTranslation;
            window.__ttsTargetLang = targetLang;
            window.__ttsQueue = [];
            
            if (needsTranslation) {
                console.log('🎤🔒 [TTS 차단] 번역 대기 중... 대상:', targetLang);
            }
            
            // 🔒 speechSynthesis.speak 원본 백업 및 가로채기
            var originalSpeak = window.speechSynthesis.speak.bind(window.speechSynthesis);
            
            window.speechSynthesis.speak = function(utterance) {
                if (!window.__translationComplete) {
                    console.log('🎤🔒 [TTS 차단] 대기열 추가 (번역 미완료)');
                    window.__ttsQueue.push(utterance);
                    return;
                }
                
                if (window.__ttsTargetLang) {
                    var descEl = document.getElementById('detail-description');
                    if (descEl) {
                        // 🌐 Google Translate의 <font> 태그에서 번역된 텍스트 추출
                        var fontEl = descEl.querySelector('font');
                        var translatedText = fontEl ? (fontEl.innerText || fontEl.textContent) : (descEl.innerText || descEl.textContent);
                        utterance.text = translatedText;
                        utterance.lang = window.__ttsTargetLang;
                        console.log('🎤✅ [TTS 재생] 언어:', window.__ttsTargetLang, fontEl ? '(font태그)' : '(innerText)', '길이:', translatedText.length);
                    }
                }
                
                originalSpeak(utterance);
            };
            
            // 번역 완료 감지
            function watchForTranslation() {
                if (!needsTranslation) return;
                
                var observer = new MutationObserver(function() {
                    var hasTranslateClass = document.body.classList.contains('translated-ltr') || 
                                            document.body.classList.contains('translated-rtl');
                    
                    if (hasTranslateClass) {
                        console.log('🎤✅ [번역 완료] TTS 차단 해제!');
                        window.__translationComplete = true;
                        observer.disconnect();
                        
                        if (window.__ttsQueue.length > 0) {
                            console.log('🎤✅ [대기열 재생]', window.__ttsQueue.length + '개');
                            // 🌐 2025-12-24: 번역 클래스 감지 후 실제 텍스트 변환까지 500ms 추가 대기
                            setTimeout(function() {
                                console.log('[TTS] 번역 텍스트 적용 대기 완료 (500ms)');
                                window.__ttsQueue.forEach(function(utt) {
                                    var descEl = document.getElementById('detail-description');
                                    if (descEl) {
                                        // 🌐 Google Translate의 <font> 태그에서 번역된 텍스트 추출
                                        var fontEl = descEl.querySelector('font');
                                        utt.text = fontEl ? (fontEl.innerText || fontEl.textContent) : (descEl.innerText || descEl.textContent);
                                        utt.lang = window.__ttsTargetLang;
                                    }
                                    originalSpeak(utt);
                                });
                                window.__ttsQueue = [];
                            }, 500);
                        }
                    }
                });
                
                observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
                
                setTimeout(function() {
                    if (!window.__translationComplete) {
                        console.log('🎤⚠️ [번역 타임아웃] 원본으로 재생');
                        window.__translationComplete = true;
                        observer.disconnect();
                        window.__ttsQueue.forEach(function(utt) { originalSpeak(utt); });
                        window.__ttsQueue = [];
                    }
                }, 5000);
            }
            
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', watchForTranslation);
            } else {
                watchForTranslation();
            }
        })();
    </script>
    <!-- 🌐 2025.12.03: 쿼리 파라미터로 구글 번역 쿠키 설정 (자동 번역용) -->
    <script>
        (function() {
            var storedLang = null;
            try { storedLang = localStorage.getItem('appLanguage'); } catch(e) {}
            var urlParams = new URLSearchParams(window.location.search);
            var urlLang = urlParams.get('lang');
            var lang = storedLang || urlLang || 'ko';
            if (lang && lang !== 'ko' && /^[a-z]{2}(-[A-Z]{2})?$/.test(lang)) {
                var domain = window.location.hostname;
                document.cookie = 'googtrans=/ko/' + lang + ';path=/;domain=' + domain;
                document.cookie = 'googtrans=/ko/' + lang + ';path=/';
                console.log('🌐 [Gallery] googtrans 쿠키 설정 (appLanguage 우선):', lang);
            }
        })();
    </script>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover, user-scalable=no">
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
        /* ⚠️ 수정금지(승인필요) — 공유페이지 footer safe-area: 브라우저용 env() 추가 (2026-03-10) */
        .footer-safe-area { 
            width: 100%; 
            height: 100px; 
            flex-shrink: 0; 
            z-index: 30; 
            display: flex; 
            justify-content: space-around; 
            align-items: center; 
            padding: 0 1rem;
            padding-bottom: env(safe-area-inset-bottom, 0px); /* ⚠️ 수정금지(승인필요) — safe-area 브라우저 CSS (2026-03-10) */
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
        
        /* 🎤 음성 가이드 썸네일 (보관함 형식) */
        .voice-thumbnail {
            width: 100%;
            height: 150px;
            background: #000;
            border-radius: 8px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            position: relative;
            overflow: hidden;
            box-shadow: 0 4px 10px rgba(0,0,0,0.1);
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .gallery-item:hover .voice-thumbnail {
            transform: scale(1.05);
            box-shadow: 0 6px 15px rgba(0,0,0,0.2);
        }
        .voice-bg-logo {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            opacity: 0.1;
        }
        .voice-content {
            position: relative;
            z-index: 10;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 12px;
            text-align: center;
        }
        .voice-icon {
            width: 32px;
            height: 32px;
            color: #4285F4;
            margin-bottom: 8px;
        }
        .voice-keyword {
            color: white;
            font-size: 12px;
            line-height: 1.3;
            overflow: hidden;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
        }
        
        /* ⚠️ 수정금지(승인필요) — 갤러리 하단 버튼: 브라우저용 safe-area 추가 (2026-03-10) */
        .gallery-footer {
            text-align: center;
            padding: 30px 15px;
            padding-bottom: calc(30px + env(safe-area-inset-bottom, 0px));
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
        <!-- ⚠️ 수정금지(승인필요) — 공유페이지 X 닫기 버튼: position:fixed, 부모 display:none 시 함께 숨김, SPA 오버레이이므로 postMessage 사용 (Claude Sonnet 4.6, 2026-03-10) -->
        <!-- ⚠️ 수정금지(승인필요): 2026-03-19 parent→top 변경 — 2중 iframe(admin-dashboard→공유페이지) 대비 안전장치 -->
        <button id="gallery-close" onclick="if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify({type:'closeWindow',payload:{}}))}else if(window.top!==window){window.top.postMessage({type:'closeOverlay'},'*')}else{window.close()}" style="position: fixed; top: 1rem; right: 1rem; z-index: 10000; width: 3rem; height: 3rem; display: flex; align-items: center; justify-content: center; border-radius: 9999px; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(8px); color: #4285F4; border: none; cursor: pointer; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3); transition: all 0.2s ease;" aria-label="닫기">
            <svg xmlns="http://www.w3.org/2000/svg" style="width: 1.5rem; height: 1.5rem;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
        </button>
        <div class="gallery-grid">
            ${galleryItemsHTML}
        </div>
        <div class="gallery-footer">
            <a href="${appOrigin}${creatorReferralCode ? `?ref=${creatorReferralCode}` : ''}" class="app-button" id="home-button">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width: 24px; height: 24px;">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                나도 만들어보기 ✨
            </a>
        </div>
    </div>
    
    <!-- 상세 뷰 (앱과 100% 동일한 구조) -->
    <div id="detail-view" class="ui-layer hidden">
        <img id="detail-bg" src="" class="full-screen-bg">
        <header class="header-safe-area">
            <button id="detail-back" class="interactive-btn" style="width: 3rem; height: 3rem; display: flex; align-items: center; justify-content: center; border-radius: 9999px; background: rgba(0,0,0,0.6); backdrop-filter: blur(12px); color: #4285F4; box-shadow: 0 4px 12px rgba(0,0,0,0.3); position: fixed; top: 1rem; right: 1rem; z-index: 10000;" aria-label="뒤로가기">
                <svg xmlns="http://www.w3.org/2000/svg" style="width: 1.5rem; height: 1.5rem;" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                </svg>
            </button>
        </header>
        <div class="content-safe-area">
            <div id="detail-text" class="text-content hidden">
                <!-- 📍 위치정보창 (이미지 모드) -->
                <div id="detail-location-info" class="hidden" style="margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem; background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(8px); border-radius: 0.5rem; padding: 0.75rem 1rem; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);">
                    <svg xmlns="http://www.w3.org/2000/svg" style="width: 1.25rem; height: 1.25rem; color: #4285F4; flex-shrink: 0;" viewBox="0 0 24 24" fill="currentColor">
                        <path fill-rule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" />
                    </svg>
                    <span id="detail-location-name" style="font-size: 1rem; font-weight: 600; color: #1f2937;"></span>
                </div>
                <!-- 🎤 음성키워드창 (음성 모드) -->
                <div id="detail-voice-query-info" class="hidden" style="margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem; background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(8px); border-radius: 0.5rem; padding: 0.75rem 1rem; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);">
                    <svg xmlns="http://www.w3.org/2000/svg" style="width: 1.25rem; height: 1.25rem; color: #4285F4; flex-shrink: 0;" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
                        <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-1.5A.75.75 0 016 10.5z" />
                    </svg>
                    <span id="detail-voice-query-text" style="font-size: 1rem; font-weight: 600; color: #1f2937; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px;"></span>
                </div>
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
            <a href="${appOrigin}${creatorReferralCode ? `?ref=${creatorReferralCode}` : ''}" id="detail-home" class="interactive-btn" style="width: 4rem; height: 4rem; display: flex; align-items: center; justify-content: center; border-radius: 9999px; background: rgba(0,0,0,0.6); backdrop-filter: blur(12px); color: #4285F4; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); text-decoration: none;" aria-label="앱으로 이동">
                <svg xmlns="http://www.w3.org/2000/svg" style="width: 2rem; height: 2rem;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
            </a>
        </footer>
    </div>
    
    <!-- 데이터 저장 -->
    <script id="app-data" type="application/json">${dataJSON}</script>
    
    <script>
        // ═══════════════════════════════════════════════════════════════
        // 🎯 리워드 시스템: Referral 쿠키 저장 (2025-11-28)
        // URL의 ?ref=XXXX 파라미터를 감지하여 30일간 쿠키에 저장
        // 나중에 회원가입 시 서버에서 쿠키 확인하여 추천인 연결
        // ═══════════════════════════════════════════════════════════════
        (function() {
            const urlParams = new URLSearchParams(window.location.search);
            const refCode = urlParams.get('ref');
            if (refCode) {
                // 30일간 쿠키 저장
                const expires = new Date();
                expires.setDate(expires.getDate() + 30);
                document.cookie = 'referralCode=' + encodeURIComponent(refCode) + ';expires=' + expires.toUTCString() + ';path=/;SameSite=Lax';
                console.log('🎁 Referral code saved:', refCode);
            }
        })();
        
        // 데이터 로드
        const appData = JSON.parse(document.getElementById('app-data').textContent);
        const galleryView = document.getElementById('gallery-view');
        const detailView = document.getElementById('detail-view');
        const header = document.querySelector('.header');
        
        // Web Speech API
        const synth = window.speechSynthesis;
        // ⚠️ 수정금지(승인필요): 2026-03-13 네이티브 TTS 브릿지 감지
        const isNativeApp = !!window.ReactNativeWebView;
        // ⚠️ 수정금지(승인필요) — voices→_tplVoices: share-page.js 전역 스코프 충돌 방지 (2026-03-10)
        let _tplVoices = [];
        let currentUtterance = null;
        
        // ═══════════════════════════════════════════════════════════════
        // 🔊 표준 음성 로직 (2025-12-24) - guideDetailPage.js와 동일
        // ═══════════════════════════════════════════════════════════════
        // ⚠️ 수정금지(승인필요) — 변수명 _tpl 접두어: share-page.js 전역 스코프 충돌 방지 (2026-03-10)
        let _tplVoiceConfigsCache = null;
        let _tplVoiceConfigsLoading = false;
        
        const _TPL_DEFAULT_VOICE_PRIORITIES = {
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
            if (_tplVoiceConfigsCache) return _tplVoiceConfigsCache;
            if (_tplVoiceConfigsLoading) {
                await new Promise(resolve => setTimeout(resolve, 500));
                return _tplVoiceConfigsCache || null;
            }
            
            _tplVoiceConfigsLoading = true;
            try {
                const response = await fetch('/api/voice-configs');
                if (response.ok) {
                    const configs = await response.json();
                    _tplVoiceConfigsCache = {};
                    for (const config of configs) {
                        if (!_tplVoiceConfigsCache[config.langCode]) {
                            _tplVoiceConfigsCache[config.langCode] = {};
                        }
                        _tplVoiceConfigsCache[config.langCode][config.platform] = {
                            priorities: config.voicePriorities,
                            excludeVoices: config.excludeVoices || []
                        };
                    }
                    console.log('🔊 [ShareTemplate Voice DB] 설정 로드 완료:', Object.keys(_tplVoiceConfigsCache));
                }
            } catch (error) {
                console.warn('🔊 [ShareTemplate Voice DB] 로드 실패, 기본값 사용:', error.message);
            }
            _tplVoiceConfigsLoading = false;
            return _tplVoiceConfigsCache;
        }
        
        function getVoicePriorityFromDB(langCode) {
            const platform = detectPlatform();
            
            if (_tplVoiceConfigsCache && _tplVoiceConfigsCache[langCode]) {
                const config = _tplVoiceConfigsCache[langCode][platform] || _tplVoiceConfigsCache[langCode]['default'];
                if (config) {
                    return { priorities: config.priorities, excludeVoices: config.excludeVoices };
                }
            }
            
            const fallback = _TPL_DEFAULT_VOICE_PRIORITIES[langCode];
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
            
            const allVoices = synth.getVoices();
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
            
            console.log('[ShareTemplate TTS] userLang:', userLang, 'fullLang:', fullLang, '→ voice:', targetVoice?.name);
            return targetVoice || allVoices[0];
        }
        
        // 앱 시작 시 음성 설정 로드
        loadVoiceConfigsFromDB();
        
        function populateVoiceList() {
            _tplVoices = synth.getVoices();
        }
        
        function stopAudio() {
            // ⚠️ 수정금지(승인필요): 2026-03-13 네이티브 TTS 정지 + pause 상태 초기화
            window.__galleryNativeSpeaking = false;
            window.__galleryNativePaused = false;
            window.__galleryNativePausedText = null;
            if (isNativeApp && window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'stopSpeech', payload: {} }));
                if (window.__galleryNativeSpeakDoneListener) {
                    window.removeEventListener('nativeResponse', window.__galleryNativeSpeakDoneListener);
                    window.__galleryNativeSpeakDoneListener = null;
                }
            } else {
                if (synth.speaking) {
                    synth.pause();
                    synth.cancel();
                }
            }
            const playIcon = document.getElementById('play-icon');
            const pauseIcon = document.getElementById('pause-icon');
            if (playIcon) playIcon.style.display = 'block';
            if (pauseIcon) pauseIcon.style.display = 'none';
        }
        
        // 🎤 2025-12-24: 표준 음성 로직 - 사용자 언어 기준 TTS 재생
        function playAudio(text, voiceLang) {
            stopAudio();
            
            // ⚠️ **핵심 로직 - 절대 수정 금지!** (2025-10-03 치명적 버그 해결)
            const cleanText = text.replace(new RegExp('<br\\s*/?>', 'gi'), ' ');
            
            // 문장 분리 및 하이라이트 준비
            const sentences = cleanText.match(/[^.!?]+[.!?]+/g) || [cleanText];
            const textElement = document.getElementById('detail-description');
            
            // 원본 텍스트 저장
            const originalText = cleanText;
            
            currentUtterance = new SpeechSynthesisUtterance(cleanText);
            
            // 🔊 표준 음성 로직: URL lang 파라미터 또는 appLanguage 기준
            const urlParams = new URLSearchParams(window.location.search);
            const urlLang = urlParams.get('lang');
            const userLang = urlLang || localStorage.getItem('appLanguage') || 'ko';
            const langCodeMap = { 'ko': 'ko-KR', 'en': 'en-US', 'ja': 'ja-JP', 'zh-CN': 'zh-CN', 'fr': 'fr-FR', 'de': 'de-DE', 'es': 'es-ES' };
            const langCode = langCodeMap[userLang] || 'ko-KR';
            
            const allVoices = synth.getVoices();
            let targetVoice = null;
            
            // ⭐ 한국어 하드코딩 (Yuna → Sora → 유나 → 소라 → Heami)
            if (langCode === 'ko-KR' || langCode.startsWith('ko')) {
                const koVoices = allVoices.filter(v => v.lang.startsWith('ko'));
                targetVoice = koVoices.find(v => v.name.includes('Yuna'))
                           || koVoices.find(v => v.name.includes('Sora'))
                           || koVoices.find(v => v.name.includes('유나'))
                           || koVoices.find(v => v.name.includes('소라'))
                           || koVoices.find(v => v.name.includes('Heami'))
                           || koVoices[0];
                console.log('[ShareTemplate TTS] 한국어 음성:', targetVoice?.name || 'default');
            } else {
                // 다른 언어: DB voice_configs 또는 기본값
                targetVoice = getVoiceForLanguage(userLang);
            }
            
            currentUtterance.voice = targetVoice || null;
            currentUtterance.lang = langCode;
            currentUtterance.rate = 1.0;
            
            console.log('[ShareTemplate TTS] 언어:', langCode, '음성:', targetVoice ? targetVoice.name : 'default');
            
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
                            return '<span class="current-sentence" style="background-color: rgba(66, 133, 244, 0.3); font-weight: 600;">' + sentence + '</span>';
                        }
                        return sentence;
                    }).join('');
                    
                    textElement.innerHTML = highlightedHTML;
                    currentSentenceIndex++;
                    
                    // 🔄 2025-01-21: 하이라이트된 문장으로 자동 스크롤 (부드럽게)
                    const currentSpan = textElement.querySelector('.current-sentence');
                    if (currentSpan) {
                        currentSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }
            };
            
            currentUtterance.onend = () => {
                playIcon.style.display = 'block';
                pauseIcon.style.display = 'none';
                // 하이라이트 제거, 원본 복원
                textElement.textContent = originalText;
            };
            
            // ⚠️ 수정금지(승인필요): 2026-03-13 3단계 TTS 전략
            // 1단계: 앱(WebView) → 네이티브 TTS (expo-speech)
            if (isNativeApp && window.ReactNativeWebView) {
                window.__galleryNativeSpeaking = true;
                playIcon.style.display = 'none';
                pauseIcon.style.display = 'block';
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'speak',
                    payload: { text: cleanText, language: langCode, rate: 1.0, pitch: 1.0 }
                }));
                if (window.__galleryNativeSpeakDoneListener) {
                    window.removeEventListener('nativeResponse', window.__galleryNativeSpeakDoneListener);
                }
                window.__galleryNativeSpeakDoneListener = function(e) {
                    if (e.detail && e.detail.type === 'speakDone') {
                        window.removeEventListener('nativeResponse', window.__galleryNativeSpeakDoneListener);
                        window.__galleryNativeSpeakDoneListener = null;
                        window.__galleryNativeSpeaking = false;
                        window.__galleryNativePaused = false;
                        window.__galleryNativePausedText = null;
                        playIcon.style.display = 'block';
                        pauseIcon.style.display = 'none';
                        textElement.textContent = originalText;
                    }
                };
                window.addEventListener('nativeResponse', window.__galleryNativeSpeakDoneListener);
                return;
            }

            // 2단계: 웹 브라우저 → synth.speak() 시도 + 자동재생 감지
            let autoplayStarted = false;
            const origOnstart = currentUtterance.onstart;
            currentUtterance.onstart = () => {
                autoplayStarted = true;
                if (origOnstart) origOnstart();
            };
            synth.speak(currentUtterance);
            setTimeout(() => {
                if (!autoplayStarted) {
                    console.log('[ShareTemplate Gallery TTS] 자동재생 차단 감지 → ▶ 버튼 대기');
                    synth.cancel();
                    playIcon.style.display = 'block';
                    pauseIcon.style.display = 'none';
                }
            }, 1200);
        }
        
        populateVoiceList();
        if (synth.onvoiceschanged !== undefined) {
            synth.onvoiceschanged = populateVoiceList;
        }
        
        // 🎤 현재 보고 있는 아이템의 voiceLang 저장
        let currentVoiceLang = null;
        
        // 🌐 2025-12-24: 동적 콘텐츠 강제 재번역 함수
        // 변수명 _tpl 접두어: share-page.js의 retranslationPending와 전역 스코프 충돌 방지
        let _tplRetranslationPending = false;
        
        function retranslateNewContent() {
            // 🌐 2025-12-24: userLang 체크 제거 - Google Translate 드롭다운 활성화 여부만 확인
            return new Promise((resolve) => {
                const selectElement = document.querySelector('.goog-te-combo');
                
                if (!selectElement || !selectElement.value) {
                    console.log('[Gallery Retranslate] Google Translate 드롭다운 비활성 - 스킵');
                    resolve();
                    return;
                }
                
                const currentLang = selectElement.value;
                console.log('[Gallery Retranslate] 🔄 강제 재번역 시작:', currentLang);
                _tplRetranslationPending = true;
                
                selectElement.value = '';
                selectElement.dispatchEvent(new Event('change'));
                
                setTimeout(() => {
                    selectElement.value = currentLang;
                    selectElement.dispatchEvent(new Event('change'));
                    
                    setTimeout(() => {
                        console.log('[Gallery Retranslate] ✅ 재번역 완료');
                        _tplRetranslationPending = false;
                        window.dispatchEvent(new CustomEvent('galleryRetranslationComplete'));
                        resolve();
                    }, 800);
                }, 100);
            });
        }
        
        // 갤러리 아이템 클릭 (앱과 100% 동일한 로직)
        document.querySelectorAll('.gallery-item').forEach(item => {
            item.addEventListener('click', () => {
                const itemData = appData[parseInt(item.dataset.id)];
                
                // 🎤 현재 아이템의 voiceLang 저장 (DB에서 가져온 값 그대로)
                currentVoiceLang = itemData.voiceLang;
                
                // 🎤 음성 모드 판별: 이미지 없고 voiceQuery 있으면 음성 모드
                const hasImage = itemData.imageDataUrl && !itemData.imageDataUrl.includes('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAY');
                const isVoiceGuide = !hasImage && itemData.voiceQuery;
                
                // 🎨 배경 이미지 설정 (음성 모드면 로고 이미지 사용)
                const bgElement = document.getElementById('detail-bg');
                if (hasImage) {
                    bgElement.src = itemData.imageDataUrl;
                    bgElement.style.filter = '';
                } else {
                    // 음성 모드: 로고 이미지 + blur 효과
                    bgElement.src = '/images/landing-logo.jpg';
                    bgElement.style.filter = 'blur(8px) brightness(0.7)';
                }
                
                // 📍 위치정보창 / 🎤 음성키워드창 처리
                const locationInfo = document.getElementById('detail-location-info');
                const locationName = document.getElementById('detail-location-name');
                const voiceQueryInfo = document.getElementById('detail-voice-query-info');
                const voiceQueryText = document.getElementById('detail-voice-query-text');
                
                if (isVoiceGuide) {
                    // 음성 모드: voiceQueryInfo 표시, locationInfo 숨김
                    locationInfo.classList.add('hidden');
                    locationInfo.style.display = 'none';
                    if (voiceQueryInfo && voiceQueryText) {
                        // 🎤 voiceQuery || title 폴백 (DB에 voiceQuery 없으면 title 사용)
                        voiceQueryText.textContent = itemData.voiceQuery || itemData.title || '';
                        voiceQueryInfo.classList.remove('hidden');
                        voiceQueryInfo.style.display = 'flex';
                    }
                    console.log('[Share] 음성 모드:', itemData.voiceQuery || itemData.title);
                } else {
                    // 이미지 모드: locationInfo 항상 표시 (없으면 '위치 정보 없음'), voiceQueryInfo 숨김
                    voiceQueryInfo.classList.add('hidden');
                    voiceQueryInfo.style.display = 'none';
                    // 📍 locationName이 없어도 패널 표시 (위치 정보 없음)
                    locationName.textContent = itemData.locationName || '위치 정보 없음';
                    locationInfo.classList.remove('hidden');
                    locationInfo.style.display = 'flex';
                    console.log('[Share] 이미지 모드:', itemData.locationName || '(위치 정보 없음)');
                }
                
                // 텍스트 설정
                document.getElementById('detail-description').textContent = itemData.description;
                
                // 상세 뷰 진입
                galleryView.classList.add('hidden');
                header.classList.add('hidden');
                detailView.classList.remove('hidden');
                document.getElementById('detail-footer').classList.remove('hidden');
                
                // 텍스트는 표시 상태로 시작 (음성과 동시에 보임)
                document.getElementById('detail-text').classList.remove('hidden');
                
                // 🌐 2025-12-24: 동적 콘텐츠 재번역 후 TTS 재생
                retranslateNewContent().then(() => {
                    // 🎤 음성 자동 재생 (저장된 언어 사용)
                    playAudio(itemData.description, currentVoiceLang);
                });
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
        
        // ⚠️ 수정금지(승인필요): 2026-03-13 네이티브 pause/resume 포함 음성 토글
        document.getElementById('detail-audio').addEventListener('click', () => {
            if (window.__galleryNativeSpeaking) {
                // 네이티브 재생 중 → 일시정지 (stopAudio 호출 안함 — pause 상태 초기화 방지)
                window.__galleryNativeSpeaking = false;
                window.__galleryNativePausedText = document.getElementById('detail-description').textContent;
                window.__galleryNativePaused = true;
                if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'stopSpeech', payload: {} }));
                }
                if (window.__galleryNativeSpeakDoneListener) {
                    window.removeEventListener('nativeResponse', window.__galleryNativeSpeakDoneListener);
                    window.__galleryNativeSpeakDoneListener = null;
                }
                const playIcon = document.getElementById('play-icon');
                const pauseIcon = document.getElementById('pause-icon');
                if (playIcon) playIcon.style.display = 'block';
                if (pauseIcon) pauseIcon.style.display = 'none';
            } else if (window.__galleryNativePaused) {
                // 네이티브 일시정지 → 재개 (처음부터 재시작)
                const resumeText = window.__galleryNativePausedText;
                window.__galleryNativePaused = false;
                window.__galleryNativePausedText = null;
                playAudio(resumeText, currentVoiceLang);
            } else if (synth.speaking) {
                stopAudio();
            } else {
                const text = document.getElementById('detail-description').textContent;
                playAudio(text, currentVoiceLang);
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
        // Service Worker 지원 확인 및 등록 (v10 - 공유페이지 전용 Network First)
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw-share.js')
                    .then(registration => {
                        console.log('✅ [SW-Share] v10 등록 성공:', registration.scope);
                    })
                    .catch(error => {
                        console.log('❌ [SW-Share] 등록 실패:', error);
                    });
            });
        }
    </script>

    <!-- Google Translate Widget (숨김) -->
    <div id="google_translate_element" style="display:none;"></div>

    <!-- Google Translate Initialization -->
    <!-- 🌐 쿠키는 <head>에서 미리 설정됨 (구글 번역 로드 전) -->
    <script type="text/javascript">
        function googleTranslateElementInit() {
            new google.translate.TranslateElement({
                pageLanguage: 'auto', // 🌐 2025-12-24: 양방향 번역
                includedLanguages: 'ko,en,ja,zh-CN,fr,de,es',
                autoDisplay: false
            }, 'google_translate_element');
        }
    </script>
    <script type="text/javascript" src="//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit"></script>

    <!-- Google Translate CSS 숨김 -->
    <style>
        .goog-te-banner-frame { display: none !important; }
        body { top: 0px !important; }
        .goog-te-gadget { font-size: 0px !important; color: transparent !important; }
        .goog-logo-link { display: none !important; }
        .skiptranslate { display: none !important; }
        /* 구글 번역 스피너 완전 숨김 */
        .goog-te-spinner-pos { display: none !important; }
        .goog-te-spinner { display: none !important; }
        .goog-te-spinner-animation { display: none !important; }
    </style>
    
    <!-- 🔊 2025-12-25: 외부 TTS 로직 (기존 DB 페이지도 동적 업데이트) -->
    <script src="/share-page.js"></script>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════
// ⭐ 단일 가이드 상세페이지 템플릿 (프로필 페이지에서 새 탭으로 열기용)
// 2025-12-09: 표준 상세페이지 - DB에서 가져온 단일 가이드를 새 탭에서 표시
// ═══════════════════════════════════════════════════════════════

export interface SingleGuidePageData {
  id: string;
  imageUrl: string;
  description: string;
  locationName?: string;
  voiceQuery?: string;  // 🎤 음성 키워드 (2025-12-15 추가)
  voiceLang?: string;
  voiceName?: string;
  createdAt?: string;
}

export function generateSingleGuideHTML(data: SingleGuidePageData): string {
  const { id, imageUrl, description, locationName, voiceQuery, voiceLang, voiceName, createdAt } = data;
  
  const escapeHTML = (str: string) => {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover, user-scalable=no">
    <title>${escapeHTML(locationName || '상세 가이드')} - 내손가이드</title>
    <meta property="og:title" content="${escapeHTML(locationName || '상세 가이드')} - 내손가이드">
    <meta property="og:description" content="${escapeHTML(description?.substring(0, 100) || '나만의 여행 가이드')}">
    
    <!-- 🎤🔒 2025-12-24: TTS 강제 차단 + 번역 완료 후 재생 (SingleGuide용) -->
    <script>
        (function() {
            'use strict';
            
            var LANG_MAP = {
                'ko': 'ko-KR', 'en': 'en-US', 'ja': 'ja-JP',
                'zh-CN': 'zh-CN', 'fr': 'fr-FR', 'de': 'de-DE', 'es': 'es-ES'
            };
            
            var params = new URLSearchParams(window.location.search);
            var urlLang = params.get('lang');
            var storedLang = null;
            try { storedLang = localStorage.getItem('appLanguage'); } catch(e) {}
            
            var activeLang = urlLang || storedLang || 'ko';
            var targetLang = LANG_MAP[activeLang] || LANG_MAP[activeLang.split('-')[0]] || null;
            
            var needsTranslation = activeLang !== 'ko' && targetLang;
            window.__translationComplete = !needsTranslation;
            window.__ttsTargetLang = targetLang;
            window.__ttsQueue = [];
            
            if (needsTranslation) {
                console.log('🎤🔒 [SingleGuide TTS 차단] 번역 대기 중... 대상:', targetLang);
            }
            
            var originalSpeak = window.speechSynthesis.speak.bind(window.speechSynthesis);
            
            window.speechSynthesis.speak = function(utterance) {
                if (!window.__translationComplete) {
                    console.log('🎤🔒 [SingleGuide TTS 차단] 대기열 추가');
                    window.__ttsQueue.push(utterance);
                    return;
                }
                
                if (window.__ttsTargetLang) {
                    var descEl = document.getElementById('detail-description');
                    if (descEl) {
                        // 🌐 Google Translate의 <font> 태그에서 번역된 텍스트 추출
                        var fontEl = descEl.querySelector('font');
                        var translatedText = fontEl ? (fontEl.innerText || fontEl.textContent) : (descEl.innerText || descEl.textContent);
                        utterance.text = translatedText;
                        utterance.lang = window.__ttsTargetLang;
                        console.log('🎤✅ [SingleGuide TTS 재생] 언어:', window.__ttsTargetLang, fontEl ? '(font태그)' : '(innerText)', '길이:', translatedText.length);
                    }
                }
                
                originalSpeak(utterance);
            };
            
            function watchForTranslation() {
                if (!needsTranslation) return;
                
                var observer = new MutationObserver(function() {
                    var hasTranslateClass = document.body.classList.contains('translated-ltr') || 
                                            document.body.classList.contains('translated-rtl');
                    
                    if (hasTranslateClass) {
                        console.log('🎤✅ [SingleGuide 번역 완료] TTS 차단 해제!');
                        window.__translationComplete = true;
                        observer.disconnect();
                        
                        if (window.__ttsQueue.length > 0) {
                            // 🌐 2025-12-24: 번역 클래스 감지 후 실제 텍스트 변환까지 500ms 추가 대기
                            setTimeout(function() {
                                console.log('[TTS] 번역 텍스트 적용 대기 완료 (500ms)');
                                window.__ttsQueue.forEach(function(utt) {
                                    var descEl = document.getElementById('detail-description');
                                    if (descEl) {
                                        // 🌐 Google Translate의 <font> 태그에서 번역된 텍스트 추출
                                        var fontEl = descEl.querySelector('font');
                                        utt.text = fontEl ? (fontEl.innerText || fontEl.textContent) : (descEl.innerText || descEl.textContent);
                                        utt.lang = window.__ttsTargetLang;
                                    }
                                    originalSpeak(utt);
                                });
                                window.__ttsQueue = [];
                            }, 500);
                        }
                    }
                });
                
                observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
                
                setTimeout(function() {
                    if (!window.__translationComplete) {
                        console.log('🎤⚠️ [SingleGuide 번역 타임아웃] 원본으로 재생');
                        window.__translationComplete = true;
                        observer.disconnect();
                        window.__ttsQueue.forEach(function(utt) { originalSpeak(utt); });
                        window.__ttsQueue = [];
                    }
                }, 5000);
            }
            
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', watchForTranslation);
            } else {
                watchForTranslation();
            }
        })();
    </script>
    
    <!-- 🌐 구글 번역 쿠키 사전 설정 -->
    <script>
        (function() {
            var storedLang = null;
            try { storedLang = localStorage.getItem('appLanguage'); } catch(e) {}
            var urlParams = new URLSearchParams(window.location.search);
            var urlLang = urlParams.get('lang');
            var lang = storedLang || urlLang || 'ko';
            if (lang && lang !== 'ko' && /^[a-z]{2}(-[A-Z]{2})?$/.test(lang)) {
                var domain = window.location.hostname;
                document.cookie = 'googtrans=/ko/' + lang + ';path=/;domain=' + domain;
                document.cookie = 'googtrans=/ko/' + lang + ';path=/';
                console.log('🌐 [SingleGuide] googtrans 쿠키 설정 (appLanguage 우선):', lang);
            }
        })();
    </script>
    
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            background-color: #000;
            overflow-x: hidden;
        }
        .hidden { display: none !important; }
        
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
        /* ⚠️ 수정금지(승인필요) — 공유페이지 footer safe-area: 브라우저용 env() 추가 (2026-03-10) */
        .footer-safe-area { 
            width: 100%; 
            height: 100px; 
            flex-shrink: 0; 
            z-index: 30; 
            display: flex; 
            justify-content: center; 
            align-items: center; 
            padding: 0 1rem;
            padding-bottom: env(safe-area-inset-bottom, 0px); /* ⚠️ 수정금지(승인필요) — safe-area 브라우저 CSS (2026-03-10) */
            gap: 1.5rem;
        }
        
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
        
        .interactive-btn {
            transition: transform 0.1s ease;
            cursor: pointer;
            border: none;
        }
        .interactive-btn:active {
            transform: scale(0.95);
        }
        
        .location-info {
            margin-bottom: 1rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            background: rgba(255, 255, 255, 0.9);
            backdrop-filter: blur(8px);
            border-radius: 0.5rem;
            padding: 0.75rem 1rem;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        .location-info svg {
            width: 1.25rem;
            height: 1.25rem;
            color: #4285F4;
            flex-shrink: 0;
        }
        .location-info span {
            font-size: 1rem;
            font-weight: 600;
            color: #1f2937;
        }
    </style>
</head>
<body>
    <!-- 배경 이미지 -->
    <img id="detail-bg" src="${imageUrl}" alt="가이드 이미지" class="full-screen-bg">
    
    <!-- UI 레이어 -->
    <div class="ui-layer">
        <!-- 헤더 (리턴 버튼) -->
        <header class="header-safe-area">
            <button id="detail-back" onclick="window.speechSynthesis.cancel(); history.back()" class="interactive-btn" style="width: 3rem; height: 3rem; display: flex; align-items: center; justify-content: center; border-radius: 9999px; background: rgba(0,0,0,0.6); backdrop-filter: blur(12px); color: #4285F4; box-shadow: 0 4px 12px rgba(0,0,0,0.3); position: fixed; top: 1rem; right: 1rem; z-index: 10001;" aria-label="닫기">
                <svg xmlns="http://www.w3.org/2000/svg" style="width: 1.5rem; height: 1.5rem;" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                </svg>
            </button>
        </header>
        
        <!-- 콘텐츠 영역 -->
        <div class="content-safe-area">
            <div id="detail-text" class="text-content">
                ${locationName ? `
                <div class="location-info">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                        <path fill-rule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" />
                    </svg>
                    <span>${escapeHTML(locationName)}</span>
                </div>
                ` : ''}
                ${voiceQuery ? `
                <div class="voice-query-info" style="margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem; background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(8px); border-radius: 0.5rem; padding: 0.75rem 1rem; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);">
                    <svg xmlns="http://www.w3.org/2000/svg" style="width: 1.25rem; height: 1.25rem; color: #4285F4; flex-shrink: 0;" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
                        <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-1.5A.75.75 0 016 10.5z" />
                    </svg>
                    <span style="font-size: 1rem; font-weight: 600; color: #1f2937;">${escapeHTML(voiceQuery)}</span>
                </div>
                ` : ''}
                <p id="detail-description" class="readable-on-image" style="font-size: 1.25rem; line-height: 1.75rem;">${escapeHTML(description)}</p>
            </div>
        </div>
        
        <!-- 푸터 (표준 3버튼: 재생 + 텍스트 + 저장) -->
        <footer class="footer-safe-area" style="background: transparent;">
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
            <button id="save-btn" class="interactive-btn" style="width: 4rem; height: 4rem; display: flex; align-items: center; justify-content: center; border-radius: 9999px; background: rgba(0,0,0,0.6); backdrop-filter: blur(12px); color: #4285F4; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);" aria-label="보관함에 저장">
                <svg xmlns="http://www.w3.org/2000/svg" style="width: 2rem; height: 2rem;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
            </button>
        </footer>
    </div>
    
    <script>
        // Web Speech API
        const synth = window.speechSynthesis;
        // ⚠️ 수정금지(승인필요): 2026-03-13 네이티브 TTS 브릿지 감지
        const isNativeApp = !!window.ReactNativeWebView;
        // ⚠️ 수정금지(승인필요) — voices→_tplVoices: share-page.js 전역 스코프 충돌 방지 (2026-03-10)
        let _tplVoices = [];
        let currentUtterance = null;
        
        // ═══════════════════════════════════════════════════════════════
        // 🔊 표준 음성 로직 (2025-12-24) - guideDetailPage.js와 동일
        // ═══════════════════════════════════════════════════════════════
        // ⚠️ 수정금지(승인필요) — 변수명 _tpl 접두어: share-page.js 전역 스코프 충돌 방지 (2026-03-10)
        let _tplVoiceConfigsCache = null;
        let _tplVoiceConfigsLoading = false;
        
        const _TPL_DEFAULT_VOICE_PRIORITIES = {
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
            if (_tplVoiceConfigsCache) return _tplVoiceConfigsCache;
            if (_tplVoiceConfigsLoading) {
                await new Promise(resolve => setTimeout(resolve, 500));
                return _tplVoiceConfigsCache || null;
            }
            
            _tplVoiceConfigsLoading = true;
            try {
                const response = await fetch('/api/voice-configs');
                if (response.ok) {
                    const configs = await response.json();
                    _tplVoiceConfigsCache = {};
                    for (const config of configs) {
                        if (!_tplVoiceConfigsCache[config.langCode]) {
                            _tplVoiceConfigsCache[config.langCode] = {};
                        }
                        _tplVoiceConfigsCache[config.langCode][config.platform] = {
                            priorities: config.voicePriorities,
                            excludeVoices: config.excludeVoices || []
                        };
                    }
                    console.log('🔊 [SingleGuide Voice DB] 설정 로드 완료:', Object.keys(_tplVoiceConfigsCache));
                }
            } catch (error) {
                console.warn('🔊 [SingleGuide Voice DB] 로드 실패, 기본값 사용:', error.message);
            }
            _tplVoiceConfigsLoading = false;
            return _tplVoiceConfigsCache;
        }
        
        function getVoicePriorityFromDB(langCode) {
            const platform = detectPlatform();
            
            if (_tplVoiceConfigsCache && _tplVoiceConfigsCache[langCode]) {
                const config = _tplVoiceConfigsCache[langCode][platform] || _tplVoiceConfigsCache[langCode]['default'];
                if (config) {
                    return { priorities: config.priorities, excludeVoices: config.excludeVoices };
                }
            }
            
            const fallback = _TPL_DEFAULT_VOICE_PRIORITIES[langCode];
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
            
            const allVoices = synth.getVoices();
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
            
            console.log('[SingleGuide TTS] userLang:', userLang, 'fullLang:', fullLang, '→ voice:', targetVoice?.name);
            return targetVoice || allVoices[0];
        }
        
        // 앱 시작 시 음성 설정 로드
        loadVoiceConfigsFromDB();
        
        function populateVoiceList() {
            _tplVoices = synth.getVoices();
        }
        
        function stopAudio() {
            // ⚠️ 수정금지(승인필요): 2026-03-13 네이티브 TTS 정지 + pause 상태 초기화
            window.__singleGuideNativeSpeaking = false;
            window.__singleGuideNativePaused = false;
            if (isNativeApp && window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'stopSpeech', payload: {} }));
                if (window.__singleGuideNativeSpeakDoneListener) {
                    window.removeEventListener('nativeResponse', window.__singleGuideNativeSpeakDoneListener);
                    window.__singleGuideNativeSpeakDoneListener = null;
                }
            } else {
                if (synth.speaking) {
                    synth.pause();
                    synth.cancel();
                }
            }
            document.getElementById('play-icon').style.display = 'block';
            document.getElementById('pause-icon').style.display = 'none';
        }
        
        function playAudio() {
            const textElement = document.getElementById('detail-description');
            const text = textElement.textContent;
            if (!text) return;
            
            stopAudio();
            
            const cleanText = text.replace(/<br\\s*\\/?>/gi, ' ');
            
            // 🔄 2025-01-21: 문장 분리 및 하이라이트 준비
            const sentences = cleanText.match(/[^.!?]+[.!?]+/g) || [cleanText];
            const originalText = cleanText;
            
            currentUtterance = new SpeechSynthesisUtterance(cleanText);
            
            // 🔊 표준 음성 로직: URL lang 파라미터 또는 appLanguage 기준
            const urlParams = new URLSearchParams(window.location.search);
            const urlLang = urlParams.get('lang');
            const userLang = urlLang || localStorage.getItem('appLanguage') || 'ko';
            const langCodeMap = { 'ko': 'ko-KR', 'en': 'en-US', 'ja': 'ja-JP', 'zh-CN': 'zh-CN', 'fr': 'fr-FR', 'de': 'de-DE', 'es': 'es-ES' };
            const langCode = langCodeMap[userLang] || 'ko-KR';
            
            const allVoices = synth.getVoices();
            let targetVoice = null;
            
            // ⭐ 한국어 하드코딩 (Yuna → Sora → 유나 → 소라 → Heami)
            if (langCode === 'ko-KR' || langCode.startsWith('ko')) {
                const koVoices = allVoices.filter(v => v.lang.startsWith('ko'));
                targetVoice = koVoices.find(v => v.name.includes('Yuna'))
                           || koVoices.find(v => v.name.includes('Sora'))
                           || koVoices.find(v => v.name.includes('유나'))
                           || koVoices.find(v => v.name.includes('소라'))
                           || koVoices.find(v => v.name.includes('Heami'))
                           || koVoices[0];
                console.log('[SingleGuide TTS] 한국어 음성:', targetVoice?.name || 'default');
            } else {
                // 다른 언어: DB voice_configs 또는 기본값
                targetVoice = getVoiceForLanguage(userLang);
            }
            
            currentUtterance.voice = targetVoice || null;
            currentUtterance.lang = langCode;
            currentUtterance.rate = 1.0;
            
            console.log('[SingleGuide TTS] 언어:', langCode, '음성:', targetVoice ? targetVoice.name : 'default');
            
            let currentSentenceIndex = 0;
            
            currentUtterance.onstart = () => {
                document.getElementById('play-icon').style.display = 'none';
                document.getElementById('pause-icon').style.display = 'block';
            };
            
            // 🔄 2025-01-21: 문장별 하이라이트 + 자동 스크롤
            currentUtterance.onboundary = (event) => {
                if (event.name === 'sentence') {
                    const highlightedHTML = sentences.map((sentence, idx) => {
                        if (idx === currentSentenceIndex) {
                            return '<span class="current-sentence" style="background-color: rgba(66, 133, 244, 0.3); font-weight: 600;">' + sentence + '</span>';
                        }
                        return sentence;
                    }).join('');
                    
                    textElement.innerHTML = highlightedHTML;
                    currentSentenceIndex++;
                    
                    const currentSpan = textElement.querySelector('.current-sentence');
                    if (currentSpan) {
                        currentSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }
            };
            
            currentUtterance.onend = () => {
                document.getElementById('play-icon').style.display = 'block';
                document.getElementById('pause-icon').style.display = 'none';
                // 하이라이트 제거, 원본 복원
                textElement.textContent = originalText;
            };
            
            // ⚠️ 수정금지(승인필요): 2026-03-13 3단계 TTS 전략
            // 1단계: 앱(WebView) → 네이티브 TTS (expo-speech)
            if (isNativeApp && window.ReactNativeWebView) {
                window.__singleGuideNativeSpeaking = true;
                document.getElementById('play-icon').style.display = 'none';
                document.getElementById('pause-icon').style.display = 'block';
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'speak',
                    payload: { text: cleanText, language: langCode, rate: 1.0, pitch: 1.0 }
                }));
                if (window.__singleGuideNativeSpeakDoneListener) {
                    window.removeEventListener('nativeResponse', window.__singleGuideNativeSpeakDoneListener);
                }
                window.__singleGuideNativeSpeakDoneListener = function(e) {
                    if (e.detail && e.detail.type === 'speakDone') {
                        window.removeEventListener('nativeResponse', window.__singleGuideNativeSpeakDoneListener);
                        window.__singleGuideNativeSpeakDoneListener = null;
                        window.__singleGuideNativeSpeaking = false;
                        window.__singleGuideNativePaused = false;
                        document.getElementById('play-icon').style.display = 'block';
                        document.getElementById('pause-icon').style.display = 'none';
                        textElement.textContent = originalText;
                    }
                };
                window.addEventListener('nativeResponse', window.__singleGuideNativeSpeakDoneListener);
                return;
            }

            // 2단계: 웹 브라우저 → synth.speak() 시도 + 자동재생 감지
            let autoplayStarted = false;
            const origOnstart = currentUtterance.onstart;
            currentUtterance.onstart = () => {
                autoplayStarted = true;
                if (origOnstart) origOnstart();
            };
            synth.speak(currentUtterance);
            setTimeout(() => {
                if (!autoplayStarted) {
                    console.log('[SingleGuide TTS] 자동재생 차단 감지 → ▶ 버튼 대기');
                    synth.cancel();
                    document.getElementById('play-icon').style.display = 'block';
                    document.getElementById('pause-icon').style.display = 'none';
                }
            }, 1200);
        }
        
        populateVoiceList();
        if (synth.onvoiceschanged !== undefined) {
            synth.onvoiceschanged = populateVoiceList;
        }
        
        // ⚠️ 수정금지(승인필요): 2026-03-13 네이티브 pause/resume 포함 음성 토글
        document.getElementById('detail-audio').addEventListener('click', () => {
            if (window.__singleGuideNativeSpeaking) {
                // 네이티브 재생 중 → 일시정지 (stopAudio 호출 안함 — pause 상태 초기화 방지)
                window.__singleGuideNativeSpeaking = false;
                window.__singleGuideNativePaused = true;
                if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'stopSpeech', payload: {} }));
                }
                if (window.__singleGuideNativeSpeakDoneListener) {
                    window.removeEventListener('nativeResponse', window.__singleGuideNativeSpeakDoneListener);
                    window.__singleGuideNativeSpeakDoneListener = null;
                }
                document.getElementById('play-icon').style.display = 'block';
                document.getElementById('pause-icon').style.display = 'none';
            } else if (window.__singleGuideNativePaused) {
                // 네이티브 일시정지 → 재개 (처음부터 재시작)
                window.__singleGuideNativePaused = false;
                playAudio();
            } else if (synth.speaking) {
                stopAudio();
            } else {
                playAudio();
            }
        });
        
        // 텍스트 토글 버튼 클릭
        let isTextVisible = true;
        document.getElementById('text-toggle').addEventListener('click', () => {
            isTextVisible = !isTextVisible;
            document.getElementById('detail-text').style.opacity = isTextVisible ? '1' : '0';
        });
        
        // 저장 버튼 클릭 - IndexedDB에 저장 (메인 앱 handleSaveClick 동작 복사)
        document.getElementById('save-btn').addEventListener('click', async () => {
            const saveBtn = document.getElementById('save-btn');
            saveBtn.disabled = true;
            saveBtn.style.opacity = '0.5';
            
            const guideData = {
                imageDataUrl: '${imageUrl}',
                description: \`${escapeHTML(description).replace(/`/g, '\\`')}\`,
                locationName: '${locationName ? escapeHTML(locationName).replace(/'/g, "\\'") : ''}',
                voiceLang: '${voiceLang || 'ko-KR'}',
                voiceName: '${voiceName || ''}',
                timestamp: Date.now()
            };
            
            try {
                // IndexedDB 열기 (메인 앱과 동일한 DB 이름 사용)
                const dbRequest = indexedDB.open('MyAppDB', 1);
                dbRequest.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('archive')) {
                        db.createObjectStore('archive', { keyPath: 'id', autoIncrement: true });
                    }
                };
                dbRequest.onsuccess = (e) => {
                    const db = e.target.result;
                    const tx = db.transaction('archive', 'readwrite');
                    const store = tx.objectStore('archive');
                    store.add(guideData);
                    tx.oncomplete = () => {
                        alert('보관함에 저장되었습니다!');
                        // 현재 도메인의 보관함으로 이동
                        window.location.href = window.location.origin + '/#archive';
                    };
                    tx.onerror = () => {
                        alert('저장에 실패했습니다.');
                        saveBtn.disabled = false;
                        saveBtn.style.opacity = '1';
                    };
                };
                dbRequest.onerror = () => {
                    alert('저장에 실패했습니다.');
                    saveBtn.disabled = false;
                    saveBtn.style.opacity = '1';
                };
            } catch (err) {
                console.error('저장 오류:', err);
                alert('저장에 실패했습니다.');
                saveBtn.disabled = false;
                saveBtn.style.opacity = '1';
            }
        });
        
        // 페이지 이탈 시 오디오 정지
        window.addEventListener('beforeunload', () => {
            stopAudio();
        });
    </script>

    <!-- Google Translate Widget (숨김) - SingleGuide용 -->
    <div id="google_translate_element" style="display:none;"></div>

    <!-- Google Translate Initialization -->
    <script type="text/javascript">
        function googleTranslateElementInit() {
            new google.translate.TranslateElement({
                pageLanguage: 'auto', // 🌐 2025-12-24: 양방향 번역
                includedLanguages: 'ko,en,ja,zh-CN,fr,de,es',
                autoDisplay: false
            }, 'google_translate_element');
        }
    </script>
    <script type="text/javascript" src="//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit"></script>

    <!-- Google Translate CSS 숨김 -->
    <style>
        .goog-te-banner-frame { display: none !important; }
        body { top: 0px !important; }
        .goog-te-gadget { font-size: 0px !important; color: transparent !important; }
        .goog-logo-link { display: none !important; }
        .skiptranslate { display: none !important; }
        /* 구글 번역 스피너 완전 숨김 */
        .goog-te-spinner-pos { display: none !important; }
        .goog-te-spinner { display: none !important; }
        .goog-te-spinner-animation { display: none !important; }
    </style>
    
    <!-- 🔊 2025-12-25: 외부 TTS 로직 (기존 DB 페이지도 동적 업데이트) -->
    <script src="/share-page.js"></script>
</body>
</html>`;
}
