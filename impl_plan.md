# NUBI DB 통합 및 최적화 수술 계획서

## 1. 현재 DB 구조 분석 및 문제점 (사전 분석 결과)

대표님께서 지적하신 **"로우데이터를 `place_seed_raw` 테이블 하나로 모아서 중복 테이블을 없애고 컬럼으로 통합하자"**는 방향은 현재 NUBI 파이프라인의 핵심 병목을 뚫어줄 유일한 정답입니다. 제가 스키마(`shared/schema.ts`)를 분석해본 결과 다음과 같은 상태입니다.

### 📸 인스타 사진 통합 상태 확인 (선임자 작업 결과)
다행히 인스타 사진 등은 선임자가 **`place_images`라는 단일 테이블로 이미 거의 통합**해두었습니다.
- `place_images` 테이블 구조 (schema.ts 507라인)
- 통합 소스: `instagram_photos`, `places.instagram_photo_urls`, `celebrity_place_evidence`, `places.photoUrls`
- **우선순위(sort_order)**: 1=인스타(최우선), 2=셀럽, 3=구글, 4=위키 순서로 자동 세팅되게 설계됨.
- **결론**: 이미지 쪽 창고 정리는 상당히 잘 되어 있습니다. 여기서 가져다 쓰면 됩니다.

### 🚨 진짜 문제: 사방으로 흩어진 장소 정보 (60초 지연의 주범)
현재 파이프라인 V3가 제미나이에서 여정 틀을 받아온 후, 이 장소들에 살(가격, 이유, 리뷰 등)을 붙이기 위해 **너무 많은 테이블을 JOIN하거나 여러 번 찔러보고 있습니다.**

1. `places` (기본 장소 정보)
2. `place_nubi_reasons` (선정 이유 - 최근 추가됨)
3. `place_prices` (가격 정보)
4. `naver_blog_posts` (네이버 블로그 리뷰 유무)
5. `vibe_analysis` (분위기 매칭)

이것들을 매번 파이프라인 돌 때마다 찾고 앉아있으니 60초나 걸리는 겁니다.

---

## 2. 해결책: `place_seed_raw` 마스터 창고화 작업

대표님 말씀대로 `place_seed_raw` 테이블이 단순한 '시드 수집용 임시 테이블'이 아니라, **프론트엔드와 최적화 로직이 바라보는 유일한 '마스터 뷰(뷰 테이블 형태 또는 통짜 컬럼)'**가 되어야 합니다.

### [Phase 1: DB 스키마 업데이트 - 컬럼 통합]
`shared/schema.ts`의 `place_seed_raw` 테이블에 흩어져 있는 핵심 데이터 컬럼을 추가합니다.

*   `naverBlogCount`: 네이버 블로그 누적 리뷰 수 (검색 안 해도 되게)
*   `celebMention`: 셀럽 방문 여부 및 이름 ("리사 방문")
*   `nubiReason`: NUBI 선정 이유 (place_nubi_reasons 테이블에서 이관/통합)
*   `vibeKeywords`: 분위기 키워드 (vibe_analysis에서 이관/통합)
*   `bestImageUrl`: `place_images`에서 1순위로 뽑아둔 킹왕짱 이미지 URL (매번 조인해서 찾을 필요 없이 박아둠)
*   `priceEur`: 현재 있음 (강화 유지)

### [Phase 2: 마이그레이션 스크립트 작성 (책꽂이 정리)]
기존에 흩어져있던 `place_nubi_reasons`, `naver_blog_posts`, `place_images`의 핵심 요약 데이터를 `place_seed_raw`의 새 컬럼들로 쫙 밀어넣는(Update) 1회성 스크립트를 작성하여 DB를 정리합니다.

### [Phase 3: 파이프라인 V3 60초 지연 분쇄 (`itinerary-generator.ts`)]
창고가 하나로 통합되었으므로, 기존의 무거운 `route-optimizer`나 `enrichment` 로직을 대폭 덜어냅니다.
제미나이가 짜준 경로 장소들의 이름을 `place_seed_raw` **단일 테이블에서만** 검색하여 모든 컬럼(이미지, 가격, 이유, 셀럽)을 한 번에 뽑아오도록 로직을 수정합니다.

이 작업만으로 여정 생성 속도를 60초 → 15초(제미나이 순수 응답시간 수준)로 획기적으로 줄일 수 있습니다.

---

## 3. 대표님 컨펌 요청 사항

**"DB 스키마(`shared/schema.ts`)의 `place_seed_raw`에 부족한 요약 컬럼들(nubiReason, vibe, bestImageUrl, celeb 등)을 추가하고, 기존 데이터를 이쪽으로 싹 밀어넣는 마스터 창고화 스크립트를 지금 바로 작성해서 돌려도 되겠습니까?"**

승인해주시면 즉시 스키마 수정 및 데이터 통합(책꽂이 정리) 스크립트를 작성하겠습니다!
