/**
 * ═══════════════════════════════════════════════════════════════
 * 📄 HTML 파서 유틸리티
 * ═══════════════════════════════════════════════════════════════
 * 
 * 목적: 공유 페이지 HTML에서 가이드 데이터 추출
 * 
 * 지원 형식:
 * 1. shareData JSON (generateShareHTML로 생성)
 * 2. gallery-item 태그 (regenerateFeaturedHtml로 생성)
 * 
 * 사용 예:
 * const guides = parseGuidesFromHtml(htmlContent, {
 *   userId: '...',
 *   guideIds: ['...'],
 *   createdAt: new Date()
 * });
 * 
 * ═══════════════════════════════════════════════════════════════
 */

export interface ParsedGuide {
  id: string;
  userId: string;
  title: string;
  description: string;
  imageUrl: string;
  latitude: number | null;
  longitude: number | null;
  locationName: string;
  aiGeneratedContent: string;
  viewCount: number;
  language: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ParseFallbackData {
  userId: string;
  guideIds: string[];
  location?: string;
  createdAt: Date;
}

/**
 * 🔍 HTML에서 가이드 데이터 추출
 * 
 * ✅ 2025-11-28: appData JSON 파싱 추가 (standard-template.ts 지원)
 * 
 * 지원 형식:
 * 1. #app-data 스크립트 태그 (standard-template.ts) - 우선순위 1
 * 2. shareData JSON (레거시 generateShareHTML)
 * 3. gallery-item 태그 (fallback - description 없음!)
 * 
 * @param htmlContent - HTML 파일 내용
 * @param fallback - Fallback 데이터 (userId, guideIds 등)
 * @returns ParsedGuide 배열
 */
export function parseGuidesFromHtml(
  htmlContent: string, 
  fallback: ParseFallbackData
): ParsedGuide[] {
  console.log('📄 HTML 파싱 시작...');
  
  // ═══════════════════════════════════════════════════════════════
  // 방법 1: #app-data 스크립트 태그 (standard-template.ts 형식) ⭐ 우선!
  // ═══════════════════════════════════════════════════════════════
  // standard-template.ts: <script type="application/json" id="app-data">[{id, guid, imageDataUrl, description}, ...]</script>
  const appDataMatch = htmlContent.match(/<script[^>]*id="app-data"[^>]*>([\s\S]*?)<\/script>/);
  
  if (appDataMatch) {
    try {
      const appData = JSON.parse(appDataMatch[1]);
      console.log('📦 AppData 파싱 성공:', { itemsCount: appData?.length });
      
      if (Array.isArray(appData) && appData.length > 0) {
        const guides = appData.map((item: any, index: number) => ({
          // guid가 있으면 사용 (UUID), 없으면 fallback guideIds 사용
          id: item.guid || fallback.guideIds[index] || `guide-${Date.now()}-${index}`,
          userId: fallback.userId,
          title: item.description?.substring(0, 100) || `가이드 ${index + 1}`,
          description: item.description || '',
          imageUrl: item.imageDataUrl || '',
          latitude: null,
          longitude: null,
          locationName: fallback.location || '',
          aiGeneratedContent: item.description || '',
          viewCount: 0,
          language: 'ko',
          createdAt: fallback.createdAt,
          updatedAt: fallback.createdAt
        }));
        
        console.log('✅ AppData에서 가이드 추출 완료:', { guidesCount: guides.length });
        return guides;
      }
    } catch (parseError) {
      console.error('❌ AppData JSON 파싱 실패:', parseError);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 방법 2: shareData JSON (레거시 generateShareHTML)
  // ═══════════════════════════════════════════════════════════════
  const shareDataMatch = htmlContent.match(/const shareData = ({[\s\S]*?});/);
  
  if (shareDataMatch) {
    try {
      const shareData = JSON.parse(shareDataMatch[1]);
      console.log('📦 ShareData 파싱 성공:', { contentsCount: shareData.contents?.length });
      
      const guides = (shareData.contents || []).map((item: any, index: number) => ({
        id: fallback.guideIds[index] || `guide-${Date.now()}-${index}`,
        userId: fallback.userId,
        title: item.description?.substring(0, 100) || `가이드 ${index + 1}`,
        description: item.description || '',
        imageUrl: item.imageDataUrl || '',
        latitude: null,
        longitude: null,
        locationName: item.location || fallback.location || '',
        aiGeneratedContent: item.description || '',
        viewCount: 0,
        language: 'ko',
        createdAt: fallback.createdAt,
        updatedAt: fallback.createdAt
      }));
      
      console.log('✅ ShareData에서 가이드 추출 완료:', { guidesCount: guides.length });
      return guides;
      
    } catch (parseError) {
      console.error('❌ ShareData JSON 파싱 실패:', parseError);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 방법 3: gallery-item 태그 파싱 (⚠️ fallback - description 없음!)
  // ═══════════════════════════════════════════════════════════════
  // ✅ 2025-11-26: data-guid 속성 우선 사용 (UUID), data-id는 인덱스용
  console.log('⚠️ gallery-item fallback 파싱 시도 (description 손실 주의!)...');
  // data-guid가 있으면 사용, 없으면 data-id 사용 (하위 호환성)
  const galleryItemRegex = /<div[^>]*class="gallery-item"[^>]*data-id="([^"]*)"(?:[^>]*data-guid="([^"]*)")?[^>]*>\s*<img[^>]*src="([^"]*)"[^>]*>\s*<p>([^<]*)<\/p>/g;
  let match;
  const parsedGuides: ParsedGuide[] = [];
  
  while ((match = galleryItemRegex.exec(htmlContent)) !== null) {
    const [, dataId, dataGuid, imgSrc, title] = match;
    // data-guid가 있으면 우선 사용 (UUID), 없으면 data-id 사용 (하위 호환)
    const guideId = dataGuid || dataId || `guide-${Date.now()}-${parsedGuides.length}`;
    parsedGuides.push({
      id: guideId,
      userId: fallback.userId,
      title: title.trim(),
      description: '',
      imageUrl: imgSrc,
      latitude: null,
      longitude: null,
      locationName: fallback.location || '',
      aiGeneratedContent: '',
      viewCount: 0,
      language: 'ko',
      createdAt: fallback.createdAt,
      updatedAt: fallback.createdAt
    });
  }
  
  if (parsedGuides.length > 0) {
    console.log('⚠️ gallery-item에서 가이드 추출 완료 (description 없음!):', { guidesCount: parsedGuides.length });
    return parsedGuides;
  }
  
  console.warn('⚠️ HTML에서 가이드 정보를 찾을 수 없음');
  return [];
}
