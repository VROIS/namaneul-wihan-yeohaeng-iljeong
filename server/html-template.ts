interface ShareItem {
  id: string;
  title: string;
  description: string;
  imageBase64: string;
  location?: string;
  locationName?: string; // 🗺️ GPS 위치 이름 (2025-10-26)
}

interface SharePageData {
  title: string;
  items: ShareItem[];
  createdAt: string;
  location?: string;
  sender?: string;
  includeAudio: boolean;
  isFeatured?: boolean; // Featured 공유페이지 여부 (X 버튼 표시용)
}

// ═══════════════════════════════════════════════════════════════
// ⭐ 템플릿 v2: 외부 JS/CSS 참조 (Phase 1, 2025-11-13)
// ⚠️ 이 함수를 우선적으로 사용하여 새 공유페이지 생성!
// ═══════════════════════════════════════════════════════════════
export function generateShareHtmlV2(data: SharePageData): string {
  const { title, items, createdAt, location, sender, includeAudio, isFeatured } = data;
  
  // 최대 20개 아이템으로 제한
  const limitedItems = items.slice(0, 20);
  
  // 갤러리 아이템 생성 (2열 그리드)
  const galleryItemsHtml = limitedItems.map((item, index) => `
    <div class="gallery-item" data-id="${index}">
      <img src="data:image/jpeg;base64,${item.imageBase64}" alt="가이드 ${index + 1}" loading="lazy">
      <p>가이드 ${index + 1}</p>
    </div>
  `).join('');

  // 데이터 JSON (window.GUIDE_DATA로 주입)
  const dataJSON = JSON.stringify(limitedItems.map((item, index) => ({
    id: index,
    imageDataUrl: `data:image/jpeg;base64,${item.imageBase64}`,
    description: item.description,
    locationName: item.locationName || null
  })));

  // 앱 origin
  const appOrigin = '/#archive';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>${title} - 손안에 가이드</title>
    <meta property="og:title" content="${title} - 내손가이드">
    <meta property="og:description" content="${limitedItems[0]?.description?.substring(0, 100) || '친구가 공유한 여행 가이드'}">
    <meta property="og:type" content="website">
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        'gemini-blue': '#4285F4'
                    }
                }
            }
        }
    </script>
    <script>
        // ✕ 페이지 닫기 버튼
        function handleSmartClose() {
            console.log('🔵 X 버튼 클릭됨');
            console.log('✅ 창 닫기 (백그라운드 앱 유지)');
            window.close();
        }
    </script>
    <link rel="stylesheet" href="/shared-template/v2.css">
</head>
<body>
    <!-- 🔧 2026-01-01: 안드로이드 카카오톡/인앱 브라우저 → Chrome 자동 리다이렉트 -->
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
    
    <!-- 헤더 (메타데이터) -->
    <div class="header">
        <h1>${title}</h1>
        <div class="metadata">
            <p>👤 ${sender || '여행자'} 님이 보냄</p>
            ${location ? `<p>📍 ${location}</p>` : ''}
            <p>📅 ${new Date(createdAt).toLocaleDateString('ko-KR')}</p>
        </div>
    </div>
    
    <!-- 갤러리 뷰 -->
    <div id="gallery-view">
        <div class="gallery-grid">
            ${galleryItemsHtml}
        </div>
    </div>
    
    <!-- 상세 뷰 -->
    <div id="detail-view" class="ui-layer hidden">
        <img id="detail-bg" src="" class="full-screen-bg">
        <header class="header-safe-area">
            <button id="detail-back" class="w-12 h-12 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-md text-gemini-blue interactive-btn shadow-2xl absolute top-1/2 right-4 -translate-y-1/2" style="z-index: 10001; pointer-events: auto;" aria-label="뒤로가기">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                </svg>
            </button>
        </header>
        <div class="content-safe-area">
            <div id="detail-text" class="text-content hidden">
                <div id="detail-location-info" class="hidden mb-4 flex items-center gap-2 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-md">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gemini-blue flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                        <path fill-rule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" />
                    </svg>
                    <span id="detail-location-name" class="text-base font-semibold text-gray-800"></span>
                </div>
                <p id="detail-description" class="readable-on-image text-xl leading-relaxed"></p>
            </div>
        </div>
        <footer id="detail-footer" class="footer-safe-area hidden" style="background: transparent;">
            ${includeAudio ? `
            <button id="detail-audio" class="w-16 h-16 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-md text-gemini-blue interactive-btn shadow-2xl" aria-label="오디오 재생">
                <svg id="play-icon" xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" viewBox="0 0 24 24" fill="currentColor">
                    <path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.648c1.295.748 1.295 2.538 0 3.286L7.279 20.99c-1.25.717-2.779-.217-2.779-1.643V5.653z" clip-rule="evenodd" />
                </svg>
                <svg id="pause-icon" xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 hidden" viewBox="0 0 24 24" fill="currentColor">
                    <path fill-rule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z" clip-rule="evenodd" />
                </svg>
            </button>
            ` : ''}
            <button id="text-toggle" class="w-16 h-16 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-md text-gemini-blue interactive-btn shadow-2xl" aria-label="해설 읽기">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            </button>
            <a href="${appOrigin}" ${includeAudio ? 'onclick="if(window.stopAudio) window.stopAudio();"' : ''} class="w-16 h-16 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-md text-gemini-blue interactive-btn shadow-2xl no-underline" aria-label="앱으로 이동">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
            </a>
        </footer>
    </div>
    
    <!-- 데이터 주입 -->
    <script>
        window.GUIDE_DATA = ${dataJSON};
        window.INCLUDE_AUDIO = ${includeAudio ? 'true' : 'false'};
        window.IS_FEATURED = ${isFeatured ? 'true' : 'false'};
    </script>
    
    <!-- v2 템플릿 스크립트 로드 -->
    <script src="/shared-template/v2.js"></script>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════
// ⭐ 템플릿 v1: 레거시 (모든 JS/CSS 인라인)
// ⚠️ 하위 호환성을 위해 유지, 새 공유페이지는 v2 사용!
// ═══════════════════════════════════════════════════════════════
export function generateShareHtml(data: SharePageData): string {
  const { title, items, createdAt, location, sender, includeAudio } = data;
  
  // 최대 20개 아이템으로 제한
  const limitedItems = items.slice(0, 20);
  
  // 갤러리 아이템 생성 (2열 그리드)
  const galleryItemsHtml = limitedItems.map((item, index) => `
    <div class="gallery-item" data-id="${index}">
      <img src="data:image/jpeg;base64,${item.imageBase64}" alt="가이드 ${index + 1}" loading="lazy">
      <p>가이드 ${index + 1}</p>
    </div>
  `).join('');

  // 데이터 JSON (앱과 동일한 구조)
  const dataJSON = JSON.stringify(limitedItems.map((item, index) => ({
    id: index,
    imageDataUrl: `data:image/jpeg;base64,${item.imageBase64}`,
    description: item.description,
    locationName: item.locationName || null // 🗺️ GPS 위치 이름 (2025-10-26)
  })));

  // 앱 origin - ⚠️ 2025.11.02: 보관함으로 (랜딩 페이지 금지)
  const appOrigin = '/#archive';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>${title} - 손안에 가이드</title>
    <meta property="og:title" content="${title} - 내손가이드">
    <meta property="og:description" content="${limitedItems[0]?.description?.substring(0, 100) || '친구가 공유한 여행 가이드'}">
    <meta property="og:type" content="website">
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        'gemini-blue': '#4285F4'
                    }
                }
            }
        }
    </script>
    <script>
        // ✕ 페이지 닫기 버튼
        function handleSmartClose() {
            console.log('🔵 X 버튼 클릭됨');
            console.log('✅ 창 닫기 (백그라운드 앱 유지)');
            window.close();
        }
    </script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            background-color: #f0f2f5;
            overflow-x: hidden;
        }
        .hidden { display: none !important; }
        
        /* 앱과 동일한 전체 화면 배경 - 최대 높이 제한 */
        .full-screen-bg {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            max-height: 100vh;
            object-fit: contain;
            object-position: center;
            z-index: 1;
            background: #000;
        }
        
        /* UI 오버레이 레이어 */
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
        
        /* 3구역 레이아웃 */
        .header-safe-area {
            width: 100%;
            height: 80px;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0 1rem;
            position: relative;
        }
        .content-safe-area {
            flex: 1;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
            background: transparent;
        }
        .footer-safe-area {
            width: 100%;
            height: 100px;
            flex-shrink: 0;
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
        }
        .gallery-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
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
    <!-- 🔧 2026-01-01: 안드로이드 카카오톡/인앱 브라우저 → Chrome 자동 리다이렉트 -->
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
    
    <!-- ✕ 페이지 닫기 버튼 (모든 공유페이지에서 표시) -->
    <button id="closeWindowBtn" onclick="handleSmartClose()" title="페이지 닫기" style="position: fixed; top: 1rem; right: 1rem; z-index: 1000; width: 3rem; height: 3rem; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(8px); border-radius: 50%; color: #4285F4; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3); border: none;">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
    </button>
    <!-- 헤더 (메타데이터) -->
    <div class="header">
        <h1>${title}</h1>
        <div class="metadata">
            <p>👤 ${sender || '여행자'} 님이 보냄</p>
            ${location ? `<p>📍 ${location}</p>` : ''}
            <p>📅 ${new Date(createdAt).toLocaleDateString('ko-KR')}</p>
        </div>
    </div>
    
    <!-- 갤러리 뷰 -->
    <div id="gallery-view">
        <div class="gallery-grid">
            ${galleryItemsHtml}
        </div>
    </div>
    
    <!-- 상세 뷰 (앱과 100% 동일한 구조) -->
    <div id="detail-view" class="ui-layer hidden">
        <img id="detail-bg" src="" class="full-screen-bg">
        <header class="header-safe-area">
            <button id="detail-back" class="w-12 h-12 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-md text-gemini-blue interactive-btn shadow-2xl absolute top-1/2 right-4 -translate-y-1/2" style="z-index: 10001; pointer-events: auto;" aria-label="뒤로가기">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                </svg>
            </button>
        </header>
        <div class="content-safe-area">
            <div id="detail-text" class="text-content hidden">
                <!-- 📍 위치 정보 표시 (2025-10-26) -->
                <div id="detail-location-info" class="hidden mb-4 flex items-center gap-2 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-md">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gemini-blue flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                        <path fill-rule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" />
                    </svg>
                    <span id="detail-location-name" class="text-base font-semibold text-gray-800"></span>
                </div>
                <p id="detail-description" class="readable-on-image text-xl leading-relaxed"></p>
            </div>
        </div>
        <footer id="detail-footer" class="footer-safe-area hidden" style="background: transparent;">
            ${includeAudio ? `
            <button id="detail-audio" class="w-16 h-16 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-md text-gemini-blue interactive-btn shadow-2xl" aria-label="오디오 재생">
                <svg id="play-icon" xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" viewBox="0 0 24 24" fill="currentColor">
                    <path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.648c1.295.748 1.295 2.538 0 3.286L7.279 20.99c-1.25.717-2.779-.217-2.779-1.643V5.653z" clip-rule="evenodd" />
                </svg>
                <svg id="pause-icon" xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 hidden" viewBox="0 0 24 24" fill="currentColor">
                    <path fill-rule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z" clip-rule="evenodd" />
                </svg>
            </button>
            ` : ''}
            <button id="text-toggle" class="w-16 h-16 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-md text-gemini-blue interactive-btn shadow-2xl" aria-label="해설 읽기">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            </button>
            <a href="${appOrigin}" ${includeAudio ? 'onclick="stopAudio();"' : ''} class="w-16 h-16 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-md text-gemini-blue interactive-btn shadow-2xl no-underline" aria-label="앱으로 이동">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
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
        
        ${includeAudio ? `
        // Web Speech API
        const synth = window.speechSynthesis;
        let voices = [];
        let currentUtterance = null;
        
        function populateVoiceList() {
            voices = synth.getVoices().filter(v => v.lang.startsWith('ko'));
        }
        
        function stopAudio() {
            if (synth.speaking) synth.cancel();
            const playIcon = document.getElementById('play-icon');
            const pauseIcon = document.getElementById('pause-icon');
            if (playIcon) playIcon.style.display = 'block';
            if (pauseIcon) pauseIcon.style.display = 'none';
        }
        
        function playAudio(text) {
            stopAudio();
            currentUtterance = new SpeechSynthesisUtterance(text);
            const koVoice = voices.find(v => v.lang.startsWith('ko'));
            if (koVoice) currentUtterance.voice = koVoice;
            currentUtterance.lang = 'ko-KR';
            currentUtterance.rate = 1.0;
            
            const playIcon = document.getElementById('play-icon');
            const pauseIcon = document.getElementById('pause-icon');
            
            currentUtterance.onstart = () => {
                if (playIcon) playIcon.style.display = 'none';
                if (pauseIcon) pauseIcon.style.display = 'block';
            };
            currentUtterance.onend = () => {
                if (playIcon) playIcon.style.display = 'block';
                if (pauseIcon) pauseIcon.style.display = 'none';
            };
            synth.speak(currentUtterance);
        }
        
        populateVoiceList();
        if (synth.onvoiceschanged !== undefined) {
            synth.onvoiceschanged = populateVoiceList;
        }
        ` : ''}
        
        // 갤러리 아이템 클릭 (앱과 100% 동일한 로직)
        document.querySelectorAll('.gallery-item').forEach(item => {
            item.addEventListener('click', () => {
                const itemData = appData[parseInt(item.dataset.id)];
                
                // 배경 이미지 설정
                document.getElementById('detail-bg').src = itemData.imageDataUrl;
                
                // 📍 위치 정보 표시 (2025-10-26)
                const locationInfo = document.getElementById('detail-location-info');
                const locationName = document.getElementById('detail-location-name');
                if (itemData.locationName && locationInfo && locationName) {
                    locationName.textContent = itemData.locationName;
                    locationInfo.classList.remove('hidden');
                } else if (locationInfo) {
                    locationInfo.classList.add('hidden');
                }
                
                // 텍스트 설정
                document.getElementById('detail-description').textContent = itemData.description;
                
                // UI 표시
                galleryView.classList.add('hidden');
                header.classList.add('hidden');
                detailView.classList.remove('hidden');
                document.getElementById('detail-footer').classList.remove('hidden');
                
                // 텍스트는 숨김 상태로 시작 (앱과 동일)
                document.getElementById('detail-text').classList.add('hidden');
                
                ${includeAudio ? `
                // 음성 자동 재생
                playAudio(itemData.description);
                ` : ''}
            });
        });
        
        // 뒤로 가기 (디테일 뷰 → 갤러리 뷰)
        document.getElementById('detail-back').addEventListener('click', () => {
            ${includeAudio ? 'stopAudio();' : ''}
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
        
        ${includeAudio ? `
        // 음성 재생/정지
        const audioBtn = document.getElementById('detail-audio');
        if (audioBtn) {
            audioBtn.addEventListener('click', () => {
                if (synth.speaking) {
                    stopAudio();
                } else {
                    const text = document.getElementById('detail-description').textContent;
                    playAudio(text);
                }
            });
        }
        ` : ''}
        
        // Service Worker 등록 (오프라인 지원)
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/service-worker.js')
                    .then(registration => {
                        console.log('✅ Service Worker 등록 성공:', registration.scope);
                    })
                    .catch(error => {
                        console.error('❌ Service Worker 등록 실패:', error);
                    });
            });
        }
    </script>
</body>
</html>`;
}
