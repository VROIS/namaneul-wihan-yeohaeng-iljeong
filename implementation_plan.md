# 마스터 DB 통합 보정 계획 (Data Matching Fix)

`place_seed_raw`에 고유 ID는 성공적으로 생성되었으나, 이름 매칭 방식이 너무 엄격하여 사진, 분위기, 리뷰 등의 '살점 데이터'가 대부분 누락되었습니다(통합률 3%). 이를 해결하기 위해 매칭 로직을 대폭 강화합니다.

## Proposed Changes

### [Script] [sync-master-place-seed.ts](file:///c:/Users/SY%20Lee/Desktop/nubi-clean/scripts/sync-master-place-seed.ts)
- **이미지 우선순위 노출 (Instagram Priority)**:
    - ~5,000건의 인스타 데이터(`instagram_photos`) 중 추천할 만한 고화질 이미지를 1순위(`best_image_url`)로 배치
    - 매칭 순서: `instagram_photos` (좋아요 순) > `celebrity_place_evidence` > `places.photoUrls`
- **매칭 알고리즘 고도화**:
    - **1단계 (Exact)**: 한글/영어 이름 완전 일치
    - **2단계 (Normalized)**: 공백/특수문자 제거 후 비교 (예: "Eiffel Tower" == "eiffeltower")
    - **3단계 (Alias)**: `places` 테이블의 `aliases` 배열 내 검색
    - **4단계 (Google ID)**: (추가 예정) 구글 맵스 링크 등 식별자 기반 매칭
- **데이터 통합 범위 재확인**:
    - `place_images` (인스타 포함 통합 사진 창고)
    - `instagram_photos` (직접 수집된 인스타 로우 데이터)
    - `vibe_analysis` (분위기 키워드)
    - `celeb_evidence` (셀럽)
    - `naver_blog_posts` (블로그 리뷰)

## Verification Plan

### Automated Tests
- `scripts/report-consolidation.ts`를 실행하여 통합 성공률이 80% 이상으로 올라갔는지 수치로 확인

### Manual Verification
- Supabase 대시보드에서 특정 장소(예: 에펠탑)의 `best_image_url`과 `vibe_keywords`가 실제로 채워졌는지 직접 샘플 검증
