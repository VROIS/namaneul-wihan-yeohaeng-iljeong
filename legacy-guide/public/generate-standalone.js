// 단일 HTML 파일 생성기
const fs = require('fs');
const path = require('path');

function generateStandaloneHTML(shareData, shareId) {
    const htmlTemplate = `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${shareData.name || '공유된 가이드북'} - 내손가이드</title>
    <style>
        :root { --gemini-blue: #4285F4; }
        body {
            font-family: 'MaruBuri', sans-serif;
            margin: 0; padding: 0;
            background-color: #FFFEFA;
        }
        
        .full-screen-bg { 
            position: fixed; top: 0; left: 0; 
            width: 100vw; height: 100vh; 
            object-fit: cover; z-index: 1; 
        }
        
        .ui-layer { 
            position: fixed; top: 0; left: 0; 
            width: 100%; height: 100%; z-index: 10; 
            display: flex; flex-direction: column; 
            opacity: 0; transition: opacity 0.15s ease-out;
            visibility: hidden;
        }
        
        .ui-layer.visible { opacity: 1; visibility: visible; }
        
        .header-safe-area { 
            width: 100%; height: 80px; flex-shrink: 0; 
            display: flex; align-items: center; justify-content: center;
            padding: 0 1rem; position: relative;
        }
        
        .content-safe-area { 
            flex: 1; overflow-y: auto; 
            -webkit-overflow-scrolling: touch; 
            background: transparent; z-index: 20;
        }
        
        .footer-safe-area { 
            width: 100%; height: 100px; flex-shrink: 0; 
            display: flex; justify-content: space-around; 
            align-items: center; padding: 0 1rem;
        }
        
        .text-content {
            padding: 2rem 1.5rem; line-height: 1.8;
            word-break: keep-all; overflow-wrap: break-word;
        }
        
        .interactive-btn {
            transition: transform 0.1s ease, background-color 0.2s ease;
        }
        
        .interactive-btn:active { transform: scale(0.95); }
        
        .readable-on-image {
            color: white;
            text-shadow: 0px 2px 8px rgba(0, 0, 0, 0.95);
        }
        
        .text-gemini-blue { color: var(--gemini-blue); }
        
        .speaking {
            background-color: rgba(0, 0, 0, 0.4);
            transition: background-color 0.3s ease-in-out;
            border-radius: 6px; padding: 0.1em 0.2em;
            box-decoration-break: clone;
            -webkit-box-decoration-break: clone;
        }
        
        .container { max-width: 6xl; margin: 0 auto; padding: 1rem 2rem; }
        .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
        .guidebook-item { 
            transition: all 0.3s ease; cursor: pointer;
            aspect-ratio: 1; overflow: hidden; border-radius: 0.5rem;
        }
        .guidebook-item:hover { transform: translateY(-2px); }
        .guidebook-item img { 
            width: 100%; height: 100%; object-fit: cover; 
        }
        
        .hidden { display: none !important; }
        
        .close-window-btn {
            position: fixed;
            top: 1rem;
            right: 1rem;
            z-index: 1000;
            width: 3rem;
            height: 3rem;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(8px);
            border-radius: 50%;
            color: var(--gemini-blue);
            cursor: pointer;
            transition: all 0.2s ease;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            border: none;
        }
        
        .close-window-btn:hover {
            background: rgba(0, 0, 0, 0.8);
            transform: scale(1.1);
        }
        
        .close-window-btn:active {
            transform: scale(0.95);
        }
    </style>
</head>
<body>
    <!-- 닫기 버튼 (모든 공유 페이지에 표시) -->
    <button id="closeWindowBtn" class="close-window-btn" onclick="window.close()" title="페이지 닫기">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
    </button>

    <div class="container">
        <header class="text-center mb-8">
            <h1 class="text-3xl font-bold text-gray-800">${shareData.name || '공유된 가이드북'}</h1>
            <p class="text-gray-600 mt-2">AI가 만들어준 여행 가이드북을 확인해보세요</p>
        </header>

        <main class="grid">
            ${shareData.contents.map((item, index) => `
                <div class="guidebook-item" onclick="openDetail(${index})">
                    <img src="${item.imageDataUrl}" alt="가이드 이미지 ${index + 1}" loading="lazy">
                </div>
            `).join('')}
        </main>
    </div>

    <!-- 상세페이지 -->
    <div id="detailPage" class="ui-layer">
        <img id="detailImage" src="" alt="상세 이미지" class="full-screen-bg">
        <header class="header-safe-area">
            <button onclick="closeDetail()" class="w-12 h-12 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-md text-gemini-blue interactive-btn shadow-2xl absolute top-1/2 left-4 -translate-y-1/2">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                </svg>
            </button>
        </header>
        <div class="content-safe-area">
            <div id="textOverlay" class="text-content">
                <p id="descriptionText" class="readable-on-image text-xl leading-relaxed"></p>
            </div>
        </div>
        <footer class="footer-safe-area" style="background: transparent;">
            <button id="audioBtn" onclick="toggleAudio()" class="w-16 h-16 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-md text-gemini-blue interactive-btn shadow-2xl">
                <svg id="playIcon" xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" viewBox="0 0 24 24" fill="currentColor">
                    <path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.648c1.295.748 1.295 2.538 0 3.286L7.279 20.99c-1.25.717-2.779-.217-2.779-1.643V5.653z" clip-rule="evenodd" />
                </svg>
                <svg id="pauseIcon" xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 hidden" viewBox="0 0 24 24" fill="currentColor">
                    <path fill-rule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z" clip-rule="evenodd" />
                </svg>
            </button>
            <button onclick="toggleText()" class="w-16 h-16 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-md text-gemini-blue interactive-btn shadow-2xl">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            </button>
        </footer>
    </div>

    <script>
        // 공유 데이터
        const shareData = ${JSON.stringify(shareData, null, 2)};
        
        let currentIndex = 0;
        let speechSynthesis = window.speechSynthesis;
        let utterance = null;
        let isSpeaking = false;
        let textVisible = true;
        
        // 번역 완료 대기 시스템 (2025-12-06)
        let translationState = {
            complete: false,
            observer: null,
            timeoutId: null
        };

        function initTranslationWatcher() {
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
            if (translationState.complete) {
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

        // 초기화
        initTranslationWatcher();
        
        function openDetail(index) {
            currentIndex = index;
            const item = shareData.contents[index];
            
            document.getElementById('detailImage').src = item.imageDataUrl;
            document.getElementById('descriptionText').textContent = item.description;
            document.getElementById('detailPage').classList.add('visible');
        }
        
        function closeDetail() {
            document.getElementById('detailPage').classList.remove('visible');
            stopSpeech();
        }
        
        function toggleAudio() {
            if (isSpeaking) {
                stopSpeech();
            } else {
                startSpeech();
            }
        }
        
        async function startSpeech() {
            // 번역 완료 대기 후 TTS 재생
            await waitForTranslation();
            
            // 번역된 텍스트를 DOM에서 읽기 (번역된 경우 DOM이 업데이트됨)
            const descriptionEl = document.getElementById('descriptionText');
            const text = descriptionEl ? descriptionEl.textContent : shareData.contents[currentIndex].description;
            
            utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'ko-KR';
            utterance.rate = 0.9;
            
            utterance.onstart = () => {
                isSpeaking = true;
                updateAudioButton();
            };
            
            utterance.onend = () => {
                isSpeaking = false;
                updateAudioButton();
            };
            
            speechSynthesis.speak(utterance);
        }
        
        function stopSpeech() {
            if (speechSynthesis.speaking) {
                speechSynthesis.cancel();
            }
            isSpeaking = false;
            updateAudioButton();
        }
        
        function updateAudioButton() {
            const playIcon = document.getElementById('playIcon');
            const pauseIcon = document.getElementById('pauseIcon');
            
            if (isSpeaking) {
                playIcon.classList.add('hidden');
                pauseIcon.classList.remove('hidden');
            } else {
                playIcon.classList.remove('hidden');
                pauseIcon.classList.add('hidden');
            }
        }
        
        function toggleText() {
            const textOverlay = document.getElementById('textOverlay');
            textVisible = !textVisible;
            textOverlay.style.display = textVisible ? 'block' : 'none';
        }
        
        // 키보드 이벤트
        document.addEventListener('keydown', (e) => {
            if (document.getElementById('detailPage').classList.contains('visible')) {
                if (e.key === 'Escape') closeDetail();
                if (e.key === ' ') { e.preventDefault(); toggleAudio(); }
                if (e.key === 'ArrowLeft' && currentIndex > 0) openDetail(currentIndex - 1);
                if (e.key === 'ArrowRight' && currentIndex < shareData.contents.length - 1) openDetail(currentIndex + 1);
            }
        });
        
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
        
        console.log('독립형 가이드북이 로드되었습니다!');
    </script>
</body>
</html>`;

    return htmlTemplate;
}

// 사용 예시
async function createStandaloneFile(shareId) {
    try {
        // JSON 파일에서 데이터 읽기
        const jsonPath = path.join(__dirname, 'shared_guidebooks', `${shareId}.json`);
        const shareData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        
        // 단일 HTML 생성
        const html = generateStandaloneHTML(shareData, shareId);
        
        // 파일 저장
        const outputPath = path.join(__dirname, 'standalone', `${shareId}.html`);
        fs.writeFileSync(outputPath, html);
        
        console.log(`독립형 HTML 파일이 생성되었습니다: ${outputPath}`);
        return outputPath;
    } catch (error) {
        console.error('독립형 HTML 생성 실패:', error);
        throw error;
    }
}

module.exports = { generateStandaloneHTML, createStandaloneFile };