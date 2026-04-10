// ═══════════════════════════════════════════════════════════════
// ❌❌❌ 봉인됨 (2025-12-09) - 사용 금지! ❌❌❌
// ═══════════════════════════════════════════════════════════════
// 이유: 자동화 시도 중 실패한 로직
// 현재 상태: V1이 최적화된 상태 (components/ 폴더 사용)
// AI 주의: 이 파일을 참조하거나 수정하지 말 것!
// ═══════════════════════════════════════════════════════════════
// ⭐ 공유 페이지 템플릿 v2 (2025-11-13)
// ⚠️ CRITICAL: Phase 1 템플릿 시스템 - DO NOT MODIFY WITHOUT USER APPROVAL
// ═══════════════════════════════════════════════════════════════
// 작업 시간: 3-4시간
// 목적: 공유페이지 JavaScript를 외부 파일로 분리 → 속성 변경 시 일괄 적용
// 
// 사용 방법:
// 1. HTML에서 <script src="/shared-template/v2.js"></script> 로드
// 2. window.GUIDE_DATA로 개별 데이터 주입
// 3. 모든 공유페이지가 이 파일의 로직 공유
// 
// 효과:
// - v2.js 한 번만 수정 → 모든 공유페이지에 즉시 적용
// - 26개 → 1000개로 확장 준비 완료
// - 카카오톡 리다이렉트 로직 보존 (수정 금지!)
// - 음성 정지 로직 보존 (수정 금지!)
// ═══════════════════════════════════════════════════════════════

// 데이터 로드
const appData = window.GUIDE_DATA || [];
const galleryView = document.getElementById('gallery-view');
const detailView = document.getElementById('detail-view');
const header = document.querySelector('.header');
const includeAudio = window.INCLUDE_AUDIO || false;

// ═══════════════════════════════════════════════════════════════
// 🎤 Web Speech API (음성 재생)
// ═══════════════════════════════════════════════════════════════
if (includeAudio) {
    const synth = window.speechSynthesis;
    let voices = [];
    let currentUtterance = null;
    
    function populateVoiceList() {
        voices = synth.getVoices().filter(v => v.lang.startsWith('ko'));
    }
    
    window.stopAudio = function() {
        if (synth.speaking) synth.cancel();
        const playIcon = document.getElementById('play-icon');
        const pauseIcon = document.getElementById('pause-icon');
        if (playIcon) playIcon.style.display = 'block';
        if (pauseIcon) pauseIcon.style.display = 'none';
    };
    
    window.playAudio = function(text) {
        window.stopAudio();
        currentUtterance = new SpeechSynthesisUtterance(text);
        
        // ⭐ 한국어 하드코딩 (iOS: Yuna/Sora, Android: 유나/소라, Windows: Heami)
        const koVoices = voices.filter(v => v.lang.startsWith('ko'));
        // Yuna → Sora → 유나 → 소라 → Heami → 첫 번째 한국어 음성
        const targetVoice = koVoices.find(v => v.name.includes('Yuna'))
                         || koVoices.find(v => v.name.includes('Sora'))
                         || koVoices.find(v => v.name.includes('유나'))
                         || koVoices.find(v => v.name.includes('소라'))
                         || koVoices.find(v => v.name.includes('Heami'))
                         || koVoices[0];
        if (targetVoice) currentUtterance.voice = targetVoice;
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
    };
    
    populateVoiceList();
    if (synth.onvoiceschanged !== undefined) {
        synth.onvoiceschanged = populateVoiceList;
    }
}

// ═══════════════════════════════════════════════════════════════
// 📸 갤러리 아이템 클릭 (앱과 100% 동일한 로직)
// ═══════════════════════════════════════════════════════════════
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
        
        // 설명 텍스트 설정
        document.getElementById('detail-description').textContent = itemData.description;
        
        // 뷰 전환 (갤러리 숨김, 상세뷰 표시)
        galleryView.classList.add('hidden');
        if (header) header.classList.add('hidden');
        detailView.classList.remove('hidden');
        
        // 상세뷰 초기 상태: 텍스트/버튼 숨김
        document.getElementById('detail-text').classList.add('hidden');
        document.getElementById('detail-footer').classList.add('hidden');
        
        // 배경 이미지 로드 완료 대기
        const bgImg = document.getElementById('detail-bg');
        if (bgImg.complete) {
            onBackgroundReady();
        } else {
            bgImg.onload = onBackgroundReady;
        }
        
        function onBackgroundReady() {
            setTimeout(() => {
                document.getElementById('detail-text').classList.remove('hidden');
                document.getElementById('detail-footer').classList.remove('hidden');
            }, 100);
        }
    });
});

// ═══════════════════════════════════════════════════════════════
// 🔙 뒤로가기 버튼 (상세 → 갤러리)
// ⚠️ 음성 정지 로직 보존 (2025-10-26)
// ═══════════════════════════════════════════════════════════════
document.getElementById('detail-back').addEventListener('click', () => {
    // ⚠️ 음성 정지: 200ms setTimeout 필수!
    // 이유: iOS Safari에서 synth.cancel() 즉시 호출 시 작동 안 함
    if (includeAudio && window.stopAudio) {
        setTimeout(() => {
            const synth = window.speechSynthesis;
            if (synth.speaking) {
                const isAndroidChrome = /Android/i.test(navigator.userAgent) && /Chrome/i.test(navigator.userAgent);
                if (!isAndroidChrome) { synth.pause(); }
                synth.cancel();
            }
        }, 200);
    }
    
    // 뷰 전환
    detailView.classList.add('hidden');
    galleryView.classList.remove('hidden');
    if (header) header.classList.remove('hidden');
    
    // 텍스트/버튼 리셋
    document.getElementById('detail-text').classList.add('hidden');
    document.getElementById('detail-footer').classList.add('hidden');
});

// ═══════════════════════════════════════════════════════════════
// 📖 텍스트 토글 버튼
// ═══════════════════════════════════════════════════════════════
document.getElementById('text-toggle').addEventListener('click', () => {
    const textContent = document.getElementById('detail-text');
    textContent.classList.toggle('hidden');
});

// ═══════════════════════════════════════════════════════════════
// 🎤 오디오 재생 버튼
// ═══════════════════════════════════════════════════════════════
if (includeAudio) {
    const audioBtn = document.getElementById('detail-audio');
    if (audioBtn) {
        audioBtn.addEventListener('click', () => {
            const synth = window.speechSynthesis;
            const playIcon = document.getElementById('play-icon');
            const pauseIcon = document.getElementById('pause-icon');
            
            if (synth.speaking) {
                window.stopAudio();
            } else {
                const text = document.getElementById('detail-description').textContent;
                window.playAudio(text);
            }
        });
    }
}
