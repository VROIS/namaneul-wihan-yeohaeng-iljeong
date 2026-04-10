/**
 * 🌐 공유페이지 번역+TTS 컴포넌트 (Share Page Translation Component)
 * 
 * 2025-12-04 V1 표준화
 * 
 * 기능:
 * - ?lang= 파라미터로 언어 감지
 * - 구글 번역 완료 감지 (MutationObserver)
 * - 번역 후 TTS 재생 (번역된 텍스트)
 * - 한국어는 바로 재생 (번역 없음)
 * - 언어별 최적화된 음성 선택
 * 
 * 사용법:
 * 1. HTML에 sharePageTranslation.getScript() 삽입
 * 2. 페이지 로드 시 자동 초기화
 */

const SharePageTranslation = {
    // 언어코드 매핑 (2자리 → 전체)
    LANG_MAP: {
        'ko': 'ko-KR',
        'en': 'en-US',
        'ja': 'ja-JP',
        'zh-CN': 'zh-CN',
        'fr': 'fr-FR',
        'de': 'de-DE',
        'es': 'es-ES'
    },

    // 플랫폼별 최적 음성 우선순위 (2025-12-07: 한국어 iOS/Android 분기)
    // 주의: 이 객체는 런타임에 getVoicePriority()로 동적 생성
    VOICE_PRIORITY_BASE: {
        'en-US': ['Samantha', 'Microsoft Zira', 'Google US English', 'English'],
        'ja-JP': ['Kyoko', 'Microsoft Haruka', 'Google 日本語', 'Japanese'],
        'zh-CN': ['Ting-Ting', 'Microsoft Huihui', 'Google 普通话', 'Chinese'],
        'fr-FR': ['Thomas', 'Microsoft Hortense', 'Google français', 'French'],
        'de-DE': ['Anna', 'Microsoft Hedda', 'Google Deutsch', 'German'],
        'es-ES': ['Monica', 'Microsoft Helena', 'Google español', 'Spanish']
    },
    
    // ⭐ 한국어 하드코딩 (iOS: Yuna/Sora, Android: 유나/소라, Windows: Heami)
    getKoreanVoicePriority: function() {
        return ['Yuna', 'Sora', '유나', '소라', 'Heami'];
    },

    // 인라인 스크립트 반환 (standard-template.ts에서 사용)
    getScript: function() {
        return `
    <!-- 🌐 2025-12-04: 공유페이지 번역+TTS 컴포넌트 V1 -->
    <script>
    (function() {
        'use strict';
        
        // 언어코드 매핑
        var LANG_MAP = {
            'ko': 'ko-KR', 'en': 'en-US', 'ja': 'ja-JP',
            'zh-CN': 'zh-CN', 'fr': 'fr-FR', 'de': 'de-DE', 'es': 'es-ES'
        };
        
        // ?lang= 파라미터 감지
        var params = new URLSearchParams(window.location.search);
        var urlLang = params.get('lang');
        var targetLang = urlLang ? (LANG_MAP[urlLang] || LANG_MAP[urlLang.split('-')[0]] || null) : null;
        
        // 전역 변수 설정
        window.__sharePageLang = targetLang;
        window.__translationComplete = !targetLang || urlLang === 'ko'; // 한국어면 바로 완료
        
        if (targetLang && urlLang !== 'ko') {
        }
        
        // 번역 완료 감지 (MutationObserver)
        function watchForTranslation() {
            if (!targetLang || urlLang === 'ko') {
                window.__translationComplete = true;
                return;
            }
            
            var observer = new MutationObserver(function(mutations) {
                // 구글 번역이 적용되면 html 태그에 lang 속성 변경됨
                var htmlLang = document.documentElement.lang;
                var hasTranslateClass = document.body.classList.contains('translated-ltr') || 
                                        document.body.classList.contains('translated-rtl');
                
                if (hasTranslateClass || (htmlLang && htmlLang !== 'ko')) {
                    window.__translationComplete = true;
                    observer.disconnect();
                    
                    // 번역 완료 이벤트 발생
                    window.dispatchEvent(new CustomEvent('translationComplete', { detail: { lang: targetLang } }));
                }
            });
            
            observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'class'] });
            observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
            
            // 3초 후에도 번역 안되면 타임아웃 (오프라인 등)
            setTimeout(function() {
                if (!window.__translationComplete) {
                    window.__translationComplete = true;
                    observer.disconnect();
                    window.dispatchEvent(new CustomEvent('translationComplete', { detail: { lang: targetLang, timeout: true } }));
                }
            }, 3000);
        }
        
        // 번역된 텍스트로 TTS 재생
        window.playTranslatedAudio = function(originalText, voiceLang, textElementId) {
            // 번역 완료 대기
            if (!window.__translationComplete) {
                window.addEventListener('translationComplete', function handler() {
                    window.removeEventListener('translationComplete', handler);
                    window.playTranslatedAudio(originalText, voiceLang, textElementId);
                });
                return;
            }
            
            // 언어 결정 (URL 파라미터 우선)
            var finalLang = window.__sharePageLang || voiceLang || 'ko-KR';
            
            // 텍스트 결정 (DOM에서 번역된 텍스트 가져오기)
            var textEl = textElementId ? document.getElementById(textElementId) : null;
            var finalText = textEl ? textEl.textContent : originalText;
            
            
            // 기존 playAudio 호출 (voiceLang 오버라이드)
            if (window.__originalPlayAudio) {
                window.__originalPlayAudio(finalText, finalLang);
            } else if (window.playAudio) {
                window.playAudio(finalText, finalLang);
            }
        };
        
        // 페이지 로드 시 초기화
        document.addEventListener('DOMContentLoaded', function() {
            watchForTranslation();
            
            // 기존 playAudio 백업 및 오버라이드
            if (window.playAudio && !window.__originalPlayAudio) {
                window.__originalPlayAudio = window.playAudio;
                
                window.playAudio = function(text, voiceLang) {
                    window.playTranslatedAudio(text, voiceLang, 'detail-description');
                };
            }
        });
    })();
    </script>`;
    },

    // 구글 번역 위젯 스크립트 반환
    getGoogleTranslateScript: function() {
        return `
    <!-- 🌐 2025-12-04: 구글 번역 위젯 -->
    <div id="google_translate_element" style="display:none;"></div>
    <script type="text/javascript">
        function googleTranslateElementInit() {
            new google.translate.TranslateElement({
                pageLanguage: 'ko',
                includedLanguages: 'ko,en,ja,zh-CN,fr,de,es',
                autoDisplay: false
            }, 'google_translate_element');
        }
    </script>
    <script type="text/javascript" src="//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit"></script>
    <style>
        .skiptranslate { display: none !important; }
        body { top: 0 !important; }
    </style>`;
    },

    // 쿠키 설정 스크립트 반환 (head에 삽입)
    getCookieScript: function() {
        return `
    <!-- 🌐 2025-12-24: 구글 번역 쿠키 사전 설정 (appLanguage 우선) -->
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
            }
        })();
    </script>`;
    }
};

// Node.js 환경에서 export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SharePageTranslation;
}
