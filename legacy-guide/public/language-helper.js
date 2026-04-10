/**
 * 📍 중앙화된 언어 설정 헬퍼
 * 모든 페이지에서 공유하는 언어 관리 시스템
 * 
 * 기능:
 * 1. localStorage에 선택한 언어 저장
 * 2. Google Translate 쿠키 설정 (reload 없이!)
 * 3. 페이지 로드 시 저장된 언어 자동 적용
 * 
 * 사용법:
 * - HTML: <script src="language-helper.js"></script>
 * - 언어 선택: LanguageHelper.setLanguage('en')
 * - 현재 언어: LanguageHelper.getCurrentLanguage()
 */

const LanguageHelper = {
  /**
   * 지원하는 언어 목록
   */
  LANGUAGES: {
    ko: '🇰🇷 한국어',
    en: '🇺🇸 English',
    ja: '🇯🇵 日本語',
    'zh-CN': '🇨🇳 中文 (简体)',
    fr: '🇫🇷 Français',
    de: '🇩🇪 Deutsch',
    es: '🇪🇸 Español'
  },

  /**
   * 저장된 언어 반환 (기본값: 'ko')
   */
  getCurrentLanguage: function() {
    return localStorage.getItem('appLanguage') || 'ko';
  },

  /**
   * 언어 설정 저장 + Google Translate 쿠키 설정 + DB 저장
   * @param {string} lang - 언어 코드 (예: 'en', 'fr' 등)
   */
  setLanguage: function(lang) {
    if (!this.LANGUAGES[lang]) {
      return;
    }

    
    // 1. localStorage에 저장
    localStorage.setItem('appLanguage', lang);
    
    // 2. Google Translate 쿠키 설정
    const domain = window.location.hostname;
    document.cookie = `googtrans=/ko/${lang}; path=/; domain=${domain}`;
    document.cookie = `googtrans=/ko/${lang}; path=/`;
    
    // 3. Google Translate 수동 활성화 (즉시 번역!)
    if (window.google && window.google.translate && window.google.translate.TranslateService) {
      try {
        window.google.translate.TranslateService.getInstance().translate('ko', lang);
      } catch (e) {
      }
    }
    
    // 2026-01-22: DB 저장 제거 → localStorage만 사용
    
    // 4. 🎤 음성 인식 언어도 동시 업데이트
    if (window.updateRecognitionLang) {
      window.updateRecognitionLang();
    }
  },
  
  /**
   * 페이지 로드 시 저장된 언어 초기화
   * - HTML <head>에서 호출
   * - Google Translate 로드 전에 쿠키 설정
   */
  initializeLanguage: function() {
    // localStorage에 값이 있으면 사용, 없으면 기기 언어 감지 (저장 안 함!)
    let savedLang = localStorage.getItem('appLanguage');
    if (!savedLang) {
      // ⚠️ 수정금지(승인필요): 2026-03-14 네이티브 디바이스 언어 우선 — 앱에서는 expo-localization, 웹은 navigator.language
      const deviceLang = (window.__nativeLocale?.languageCode) || navigator.language?.split('-')[0] || 'ko';
      const supportedLangs = Object.keys(this.LANGUAGES);
      savedLang = supportedLangs.includes(deviceLang) ? deviceLang : 'ko';
    }
    
    if (savedLang !== 'ko') {
      const domain = window.location.hostname;
      document.cookie = `googtrans=/ko/${savedLang}; path=/; domain=${domain}`;
      document.cookie = `googtrans=/ko/${savedLang}; path=/`;
    } else {
      document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=' + window.location.hostname;
    }
  },

  /**
   * 언어 선택 셀렉트 엘리먼트에 이벤트 리스너 등록
   * @param {string} selectElementId - select 엘리먼트의 ID
   */
  bindLanguageSelect: function(selectElementId = 'languageSelect') {
    const select = document.getElementById(selectElementId);
    if (!select) {
      // 셀렉트 엘리먼트 없으면 무시 (SPA에서 정상)
      return;
    }

    // 현재 언어 표시
    select.value = this.getCurrentLanguage();

    // 언어 변경 이벤트
    select.addEventListener('change', (e) => {
      const selectedLang = e.target.value;
      this.setLanguage(selectedLang);
      
      // 토스트 메시지 (있으면)
      if (window.showToast) {
        window.showToast(`언어가 ${this.LANGUAGES[selectedLang]}로 변경됩니다...`);
      }
      
      // ⚠️ reload 제거! (Google Translate가 자동으로 번역)
    });
  }
};

// 페이지 로드 시 자동 초기화
document.addEventListener('DOMContentLoaded', () => {
  LanguageHelper.initializeLanguage();
});
