# BTS 이벤트 페이지 구체화 계획

> 2026-02-21 대화 정리. 메인앱과 완전 독립, 이벤트성, MZ+ARMY 타깃.

---

## 1. 전체 아키텍처

### 1.1 플로우

```
[1] 7명 캐릭터 중 1명 선택 (사용자 성향 매칭)
        ↓
[2] 우리가 제시: 멤버 가중치(5.3.2) 기반 상위 8곳
    - 배치: 상단·하단 6개 + 좌우 측면 2+2 = 8장 카드
        ↓
[3] 사용자 1~8개 선택
        ↓
[4] 메인앱 슬롯 생성 로직과 유사하게 일정 생성
        ↓
[5] 결과: 최대 8장 인스타 릴스 스타일 + 하단 카드식 일정
```

### 1.2 DB 구조 (이미 준비됨)

| 테이블 | 컬럼 | 용도 |
|--------|------|------|
| cities | bts_rank (1~34) | BTS 2026 공연 도시 |
| place_seed_raw | collection_phase='bts2026' | BTS 수집 장소 |
| place_seed_raw | seed_category, vibe_keywords | 바이브 매칭 |

---

## 2. 7명 캐릭터 (저작권 회피)

| 아키타입 | 우리 캐릭터명 | seed_category 가중치 | pace | BGM |
|----------|---------------|----------------------|------|-----|
| 문화 수집가 | 컬렉터 | Culture 5, Healing 3, Attraction 2 | Normal | collector.mp3 |
| 낭만주의자 | 로맨티스트 | Romantic 5, Culture 3, Attraction 2 | Relaxed | romanticist.mp3 |
| 미학적 탐험가 | 익스플로러 | Hotspot 5, Adventure 3, Attraction 2 | Packed | explorer.mp3 |
| 아드레날린 미식가 | 챌린저 | Adventure 5, Foodie 3, Hotspot 2 | Packed | challenger.mp3 |
| 배려형 동행자 | 컴패니언 | Healing 5, Romantic 3, Culture 2 | Normal | companion.mp3 |
| 럭셔리 휴식가 | 리차저 | Healing 5, Foodie 3, Culture 2 | Relaxed | recharger.mp3 |
| 궁극의 힐러 | 칠러 | Healing 5, Culture 3, Attraction 2 | Ultra-Relaxed | chiller.mp3 |

---

## 3. 백엔드 API

| 엔드포인트 | 역할 |
|------------|------|
| GET /api/bts/cities | BTS 34도시 목록 |
| GET /api/bts/top-places?cityId=&memberId= | 멤버 가중치 기반 상위 8곳 |
| POST /api/bts/generate | 선택 장소 → 일정 생성 |

### 3.1 Gemini 보강 (최종 단계)

**입력**: 후보지 + 시간  
**출력**:
1. 동선 최적화 (순서 재배열)
2. 실제·최신 정보 (입장료, 식비, 교통비)
3. 이미지 최소 1장/장소 (셀럽/인스타 우선)

---

## 4. 미리보기 영상 (8장 릴스)

### 4.1 콘셉트

- **캐릭터**: 선택한 1명이 일정을 쭉 소개하는 가이드 톤
- **이미지 부족**: 캐릭터 + 텍스트/일러스트로 보완
- **스타일**: 실사처럼, 슬라이드/회사소개 느낌 금지

### 4.2 기술 스택

| 구성요소 | 도구 | 비용 |
|----------|------|------|
| 영상 합성 | Remotion | 무료 |
| 캐릭터 애니메이션 | Lottie (JSON) | 무료 |
| 음악 | 7곡 미리 준비 (저작권 프리) | 무료 |

### 4.3 움직이는 만화 캐릭터

- **Lottie**: LottieFiles 무료 JSON → `@remotion/lottie`
- **7명**: 바이브별 Lottie 캐릭터 7개
- **대안**: SVG 직접 제작, Rive

### 4.4 음악

- **7명 = 7곡 고유 BGM**
- 캐릭터 선택 시 해당 MP3 자동 적용
- 출처: Pixabay Music, YouTube Audio Library 등

---

## 5. 프론트엔드 UX 원칙

| ❌ 피함 | ✅ 지향 |
|---------|---------|
| 기계적 폼 | 놀이·게임처럼 선택 |
| 엑셀/일정표 | 인스타/페이스북 스토리 느낌 |
| 단계별 설문 | 몰입형 플로우 |

**타깃**: MZ + ARMY (스와이프·탭, 시각 중심)

---

## 6. 구현 순서

### Phase 1: 백엔드
1. GET /api/bts/cities
2. GET /api/bts/top-places (멤버 가중치 로직)
3. POST /api/bts/generate + Gemini 보강

### Phase 2: 프론트엔드
1. bts-app UI로 BTSConcertPlannerScreen 교체
2. API 연동
3. 독립 진입 (인증 우회)

### Phase 3: 미리보기 영상
1. BGM 7곡 수집 + assets/bgm/
2. Lottie 캐릭터 7개 수집 + assets/characters/
3. Remotion 컴포지션 (캐릭터 + 장소 + BGM)
4. 8장 릴스 렌더링

---

## 7. 음악 수집 가이드 (7곡)

### 7.1 추천 출처 (무료, 저작권 프리)

| 출처 | URL | 비고 |
|------|-----|------|
| Pixabay Music | https://pixabay.com/music/ | MP3 다운로드, 상업적 사용 가능 |
| YouTube Audio Library | YouTube Studio → Audio Library | MP3 다운로드, 일부 출처 표기 필요 |

### 7.2 캐릭터별 검색 키워드

| 캐릭터 | 검색 키워드 | 분위기 |
|--------|-------------|--------|
| 컬렉터 | "lofi", "jazz", "chill", "culture" | Chill, Lo-fi |
| 로맨티스트 | "piano", "romantic", "ambient" | 감성, 피아노 |
| 익스플로러 | "indie", "upbeat", "trendy" | 트렌디, 인디 |
| 챌린저 | "edm", "upbeat", "energy", "extreme" | EDM, 에너지 |
| 컴패니언 | "acoustic", "warm", "friendly" | 따뜻한, 어쿠스틱 |
| 리차저 | "luxury", "soft", "elegant" | 럭셔리, 부드러운 |
| 칠러 | "minimal", "ambient", "relax" | 미니멀, 앰비언트 |

### 7.3 Pixabay 직접 링크

| 용도 | URL |
|------|-----|
| Travel 전체 | https://pixabay.com/music/search/travel/ |
| Lofi/Chill | https://pixabay.com/music/search/lofi/ |
| Upbeat | https://pixabay.com/music/search/upbeat/ |
| Ambient | https://pixabay.com/music/search/ambient/ |
| Acoustic | https://pixabay.com/music/search/acoustic/ |

**다운로드**: 각 트랙 페이지 → Free Download → MP3 선택

### 7.4 저장 구조

```
assets/bgm/
├── collector.mp3
├── romanticist.mp3
├── explorer.mp3
├── challenger.mp3
├── companion.mp3
├── recharger.mp3
└── chiller.mp3
```

---

## 8. 참조 문서

| 문서 | 용도 |
|------|------|
| docs/BTS/PHASE_1_COMPLETE.md | bts-app 플로우, 3-Page |
| docs/BTS/prototype.html | 4 Scene, 로딩 메시지 |
| docs/BTS_여정생성_AZ_구현계획.md | Step A~D |
| docs/stitch-prompt-bts-planner.md | UI 디자인 스펙 |
