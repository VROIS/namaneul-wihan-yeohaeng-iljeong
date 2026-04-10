// utils/imageOptimizer.js

/**
 * ⚡ 이미지 압축 최적화 로직 - AI Agent (2025-10-07)
 * 
 * 🎯 2026-01-24 업데이트: 1024px + 0.85 (Gemini 3.0 최적화)
 * - 구형 기기 처리 속도 개선을 위해 크기 유지 + 품질 감소
 * - Gemini 3.0 모델은 작은 이미지에서도 인식률 우수
 * 
 * 📊 압축 테스트 결과:
 * - 0.9: 파일 커서 느림 (원본)
 * - 0.85: 1024px에서 ~100KB, 인식 정확 ✅
 * - 0.6: ~80KB, 인식 정확
 * - 0.5 이하: Gemini 인식 속도 저하
 * 
 * 🔑 핵심 인사이트:
 * - 네트워크가 최대 병목 (클라우드 API 한계)
 * - 1024px + 0.85가 속도/인식률 최적 밸런스
 * - 구형 기기 첫 업로드 속도 개선
 * 
 * ⚠️ 후임자에게:
 * - localStorage 'imageQuality'로 테스트 가능
 * - PWA→앱 전환시 온디바이스 모델 고려
 * 
 * 데이터 URL로부터 이미지를 리사이즈하여 가로/세로 비율을 유지합니다.
 * @param {string} dataUrl 이미지의 데이터 URL입니다.
 * @param {number} maxWidth 결과 이미지의 최대 너비입니다.
 * @param {number} maxHeight 결과 이미지의 최대 높이입니다.
 * @returns {Promise<string>} 리사이즈된 이미지의 데이터 URL을 포함하는 Promise를 반환합니다.
 */
export function optimizeImage(dataUrl, maxWidth = 1024, maxHeight = 1024) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let { width, height } = img;

            if (width <= maxWidth && height <= maxHeight) {
                // 리사이즈 필요 없음
                resolve(dataUrl);
                return;
            }

            if (width > height) {
                if (width > maxWidth) {
                    height = Math.round(height * (maxWidth / width));
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width = Math.round(width * (maxHeight / height));
                    height = maxHeight;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            
            if (!ctx) {
                return reject(new Error('Canvas context를 가져올 수 없습니다.'));
            }

            ctx.drawImage(img, 0, 0, width, height);
            
            // 🔍 압축률 테스트용 - localStorage에서 설정 읽기
            // 2026-01-24: 기본값 0.85 (Gemini 3.0 최적화, 구형 기기 속도 개선)
            const testQuality = parseFloat(localStorage.getItem('imageQuality')) || 0.85;
            
            // 리사이즈된 이미지를 JPEG 데이터 URL로 가져옵니다.
            const result = canvas.toDataURL('image/jpeg', testQuality);
            const fileSizeKB = Math.round((result.length * 3/4) / 1024);
            
            resolve(result);
        };
        img.onerror = (error) => {
            console.error("이미지 로딩 오류:", error);
            reject(new Error("최적화를 위해 이미지를 로드하는 데 실패했습니다."));
        };
        img.src = dataUrl;
    });
}