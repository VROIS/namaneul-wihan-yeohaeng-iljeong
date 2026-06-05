# 📋 BTS 미니앱 마스터플랜 v3 — Screen 4~6 + 숏폼 + Gemini + 동선 (2026-04-27 종합)

## Context (왜 v2 폐기 + v3 작성)

### 시작 (세션 초)
- 엘파소 178 row 시드 + Wikipedia 28% 매칭 → Unsplash stock 99% 보강 = 17/137 만 사용 가능 = 심각
- "(가) 178 row HTML 검증" 진행 중 → **이미지 매칭 작업 자체 무의미 발견**

### 사용자 통찰 시리즈 (전환점)
1. Wanderlog UX → 메인앱이 **이미 Google Maps API 사용 중**
2. 메인앱 루브르 페이지 = 모닝사이드 거리 사진 = **자동 매칭 신뢰 X**
3. 도시 + 장소명 → Google **자동 geocoding + 대표 사진** (좌표/place_id 불필요)
4. 공연장 = **원어 고유명** (`Stade de France` 등, DB 31 도시 보유)
5. 메인앱 백엔드 = **15~20 초 동기 처리** = 우리가 답습하면 X
6. **세계 최초 = 일정 → 48 초 숏폼** = UX 차별화 핵심

### v2 폐기 (이미지 매칭 마스터플랜)
- ❌ Wikipedia 28% 추가 보강
- ❌ Unsplash 식당 30 stock (같은 사진 1 장)
- ❌ Flickr/Pexels/Pixabay
- ❌ Google Places quota 분배로 식당 모으기
- ❌ 32 도시 × 180 row × 다단계 fallback (6 개월 비현실)

### v3 채택 (이번 세션 결정 사항 종합)

---

## 1. 시드 SSOT 변경 (`docs/MCP_RAW_DATA_PROMPTS.md` 보강 필요)

### 카테고리 = 7 (shopping 신규 추가)
- attraction
- restaurant
- healing
- adventure
- hotspot
- heritage
- **shopping** ← 신규 (chiller 캐릭터 매핑용)

### 카테고리당 row = 30 → **5** (대폭 축소)
- 1 도시 후보 풀 = vibe 6 카테고리 × 5 = **30 vibe**
- restaurant 풀 = **10** (7 점심 후보 + 저녁 1 + 여유 2)
- 공연장 1 (Wikipedia 이미지)
- = 도시당 binary 다운로드 = **40**

### 캐릭터 ↔ 카테고리 1:1 매핑
| 캐릭터 | 카테고리 |
|---|---|
| collector | heritage |
| romanticist | hotspot |
| explorer | attraction |
| challenger | adventure |
| **companion** | 6 vibe 카테고리 × 1 위 혼합 |
| recharger | healing |
| chiller | **shopping** (신규) |

---

## 2. 이미지 수집 cron 전면 재설계

### 기존 cron 잘못
- 매일 Text Search 30 = 새 장소 "발굴" → **시드 SSOT 매일 변동** (제거)
- Place Photos 30 = 발굴된 장소 이미지

### 새 cron (시드 고정, 이미지만 채움)
```
SELECT name_en, c.name AS city, c.state, c.country_code, c.latitude, c.longitude
FROM place_seed_raw psr JOIN cities c ON c.id = psr.city_id
WHERE psr.image_url IS NULL OR psr.image_updated_at < now() - 180 days
LIMIT 30;

For each row:
  ① searchText({
      textQuery: `${name_en}, ${city}, ${state}, ${country}`,
      locationRestriction: { circle: { center: {lat, lng}, radius: 50000 }},
      regionCode: country_code
     })  → photo_name 받음
  ② Photo Media (photo_name) → JPEG binary
  ③ Supabase Storage 업로드 → 우리 CDN URL
  ④ UPDATE psr SET image_url = supabase_url, 
                    image_attribution = 'Photo by ... via Google',
                    image_updated_at = NOW()
```

= 자연어로 = "엘파소 식당 30 곳 이름 보낼게, 이미지 URL 만 줘"

### 비용 (무료 한도 안)
| SKU | 호출/월 | 무료 한도 |
|---|---|---|
| Text Search Essentials | 30 도시 × 30 row = 900 | 10,000/월 ✅ |
| Place Photos Enterprise | 900 | 1,000/월 ✅ (간당) |
| Supabase Storage | 192 MB (32 도시 × 30 × 200KB) | 1 GB free ✅ |

### 수집 기간
- 도시당 30 binary = 일일 30 cap = **1 일/도시**
- 추가 식당 풀 10 = 도시당 10 binary 더 = **1.3 일/도시**
- 32 도시 = **약 38 일 (5.5 주)**

### 공연장 = Wikipedia URL 그대로 (binary X)
- `Stade de France` 등 31 도시 모두 위키 페이지 보유
- Wikimedia URL = 무료 무제한 호출
- Google Photo 호출 X = 31 quota 절약

---

## 3. 백엔드 동선 알고리즘 (자체 코드, $0)

### Haversine + nearest-neighbor + 2-opt (30~50 줄)
```typescript
function planDay({ venue, vibe, restaurantPool10, character, concertTime }) {
  const N = vibe.length;
  
  // 1) 메인앱 PACE_CONFIG import
  const totalSlots = N + (mealCount(N));  // 식사 슬롯 자동 추가
  const pace = autoPace(totalSlots, availableMin);  // Relaxed/Normal/Packed
  
  // 2) Haversine 동선
  const route = nearestNeighbor([venue, ...vibe], venue);
  
  // 3) 점심 = 동선 중간 가장 가까운 식당
  const lunch = findNearestRestaurant(route[mid], restaurantPool10);
  
  // 4) 저녁 = 공연장 근접 식당 (점심 제외)
  const dinner = findNearestRestaurant(venue, restaurantPool10, exclude=[lunch.id]);
  
  // 5) 2-opt 개선
  return twoOpt([venue, ...vibe, lunch, dinner, venue]);
}
```

### 메인앱 PACE_CONFIG 재사용 (`agents/types.ts:113-141`)
```typescript
PACE_CONFIG = {
  Packed:  { slotDurationMinutes: 90,  maxSlotsPerDay: 8 },
  Normal:  { slotDurationMinutes: 120, maxSlotsPerDay: 6 },
  Relaxed: { slotDurationMinutes: 150, maxSlotsPerDay: 4 },
};
MEAL_SLOTS = [
  { type: 'lunch',  startHour: 12, endHour: 14 },
  { type: 'dinner', startHour: 18, endHour: 20 },  // 콘서트 17:00 도착 시 16:30~17:00 으로 조정
];
```

### 카드 N → 페이스 자동 환산
```
가용 시간 = (콘서트 시간 - 09:00) - 3시간 (콘서트 입장 buffer)
         = 8 시간 (예: 09~17 시 / 콘서트 20:00)

카드 N (사용자 선택 vibe + 식사) → 슬롯 시간 = 8h ÷ N

| N | 슬롯/분 | 페이스 | 구성 예시 |
|---|---|---|---|
| 3 (최소) | 2.66h | Relaxed | vibe 2 + 점심 1 |
| 4 | 2h    | Normal  | vibe 3 + 점심, vibe 2 + 점심+저녁 |
| 5 | 1.6h  | Normal  | vibe 3 + 점심+저녁 |
| 6 | 1.33h | Packed  | vibe 4 + 점심+저녁 |
| 7 (최대) | 1.14h ≈70분 | Packed | vibe 5 + 점심+저녁 |
```

### 공연장 = 카드 X (자동 anchor)
- 출발 09:00 + 도착 17:00 = 시스템 자동
- 사용자 카드 카운트에 미포함

### DB cities 컬럼 활용 (이미 보유)
- `bts_show_times` (jsonb) — 콘서트 시작 시간
- `bts_concert_dates` (jsonb)
- `bts_time_confirmed` (boolean)

---

## 4. Screen 4 재설계 (카트 → 지도 교체)

### `BTSPlaceCartScreen.tsx` 수정 위치

**제거**:
- 라인 571-597 (CartCarousel ScrollView, 76×100 작은 썸네일)
- 라인 843-847 (cartSection style)

**추가**:
- WebView + `/api/map/html` (메인앱 패턴 그대로)
- 마커 = 후보 8 카드 (캐릭터 카테고리 5 + 식사 2 + 공연장 1)
- 지도 중심 = **공연장 좌표** (사용자 거리감 인지)
- 마커 클릭 = postMessage → 상세 섹션 ScrollView scrollTo

**유지 절대**:
- HERO 궤도 카드 (라인 547-565) ← 차별화 핵심
- CharacterHero (중앙 캐릭터) ← 차별화 핵심
- 상세 섹션 (라인 600-628) — 큰 이미지 4/3 비율
- 게이지 + CTA "다음" 버튼 (라인 631-659)

### 카드 N 최소값 변경
- `BTSContext.tsx` 라인 128: `>=2` → **`>=3`**

### Screen 4 = 거리감만 (동선 X)
- 사용자 선택 전 = 동선 알 수 없음
- 지도 = 후보 핀 위치 = "공연장에서 이만큼 떨어졌구나" 거리 인지
- 동선 최적화 = Screen 6 에서만

---

## 5. "같이 떠나요" 버튼 = 동기/비동기 분기

```
[버튼 클릭]
   ↓
   ├─[동기 응답 ~50ms]
   │   ① 동선 최적화 (1ms, 위 알고리즘)
   │   ② 슬롯 시간표 정리
   │   ③ 프론트로 즉시 응답
   │      → Screen 5 (숏폼) 진입
   │
   └─[비동기 백그라운드 1~3초]
       ④ Gemini 호출 → 8 씬 시나리오 대사
       ⑤ Embed iframe URL 8 개 생성 (Screen 6 용)
       ⑥ DB 저장 (history)
           ↓
       Screen 6 진입 시 → fetch (이미 완료)
```

### 메인앱 15~20 초 → BTS 미니앱 ~1 초
- 사용자 = "같이 떠나요" 즉시 → Screen 5 (숏폼) 진입
- 숏폼 보는 5~10 초 동안 Gemini 끝남
- Screen 6 도달 시 = 시나리오 + Embed 모두 준비

---

## 6. Screen 5 = 48 초 숏폼 (세계 최초 차별화)

### 합성 방식 = **클라이언트 합성** (MVP)
- HyperFrames (HeyGen 오픈소스, Apache 2.0, 2026-04-17 출시)
- HTML/CSS/JS + GSAP + FFmpeg
- Claude Code 슬래시 커맨드 = `/hyperframes`, `/gsap`
- 로컬 실행 = $0

### 음성 = **Web Speech API** (사용자 발견)
- `public/` 폴더 레거시 코드 = 이미 상용 배포 검증
- 한국어 OS 보이스 = 자연 + 무료
- ElevenLabs $22/월 폐기 → **$0**

### 차별화 7 기능
1. **시간 톤 매핑** — 사진 색상 자동 변경 (09 시 노랑 → 12 시 밝음 → 17 시 노을 → 20 시 네온)
2. **카운트다운 자막** — "콘서트까지 11 시간 → 6 시간 → 0 시간"
3. **캐릭터 PNG** — 1 인칭 = 사용자 + 캐릭터 함께 걷는 느낌
4. **Web TTS 캐릭터별 톤** — collector 차분 / challenger 활기
5. **Ken Burns** — 사진 자연스러운 줌인/팬
6. **자막** — 캐릭터 톤별 폰트
7. **카운트다운 BGM** — 무료 라이선스 (Pixabay Music)

### 8 씬 × 6 초 = 48 초 spec
```
씬 1: 공연장 출발 (09:00) — "콘서트까지 11 시간"
씬 2: vibe 1 (오전) — Ken Burns + 자막
씬 3: 점심 — 식당 사진 + 캐릭터 추천 멘트
씬 4: vibe 2 (오후 초반)
씬 5: vibe 3 (오후 중반)
씬 6: 저녁 (공연장 근접) — "콘서트까지 1 시간"
씬 7: 공연장 도착 — "콘서트까지 0 시간 ⚡"
씬 8: BTS 콘서트장 + 캐릭터 함께 — "같이 떠났습니다"
```

### Phase 1 (즉시) → Phase 2 (출시 후)
| Phase | 시간 | 결과 |
|---|---|---|
| **MVP (1~2 주)** | HyperFrames + 정적 PNG + GSAP + Web TTS + 자막 + 시간 톤 + 카운트다운 | 클라이언트 즉시 재생, MP4 X |
| Phase 2 (3~4 주) | + Rive 본 추가 (캐릭터 입/손) | 자연스러운 캐릭터 |
| Phase 3 (출시 후) | + MP4 export (HyperFrames 백엔드 + 정적 BGM) + TikTok 공유 | UGC 바이럴 |

---

## 7. Screen 6 = 최종 여정 + Google Maps Embed

### 구성
```
[상단] 시간표 (8 슬롯)
       09:00 vibe 1 / 11:30 점심 / 14:00 vibe 2 / 17:00 공연장 등

[중단] Google Maps Embed iframe (place mode)
       URL = "/maps/embed/v1/place?key=...&q=Stade+de+France+Paris"
       = 무료 무제한 + 진짜 사진 자동

[하단] Gemini 시나리오 대사 8 씬 + 카드 8 장 디테일
       = 캐릭터별 대사
```

### Embed = 2 회 노출 spec
- Screen 4: 후보 핀 표시 (거리감)
- Screen 6: 동선 + place 큰 화면 (진짜 사진)

= 같은 컴포넌트 재사용.

---

## 8. 이미지 source = 4 컨텍스트 단일 재사용

```
Supabase Storage URL (place_seed_raw.image_url)
   ↓ 모든 화면 단일 참조
   ├─ HERO 궤도 카드 8 장 (Screen 4)
   ├─ 상세 섹션 큰 이미지 (Screen 4 하단)
   ├─ Screen 5 숏폼 사진 배경
   └─ Screen 6 카드 디테일 썸네일
```

= 사용자 "원재료 멀티 소스 캐시" 의도 그대로.

---

## 9. 운영비 = $0

| 항목 | 월 비용 |
|---|---|
| Google Maps Embed (Screen 4 + 6) | $0 (always free) |
| Google Place Photo cron | $0 (월 1000 무료 안) |
| Gemini 시나리오 (월 100 일정) | ≈ $0.10 |
| **Web Speech API TTS** | **$0** (레거시 재사용) |
| **HyperFrames 영상 합성** | **$0** (오픈소스) |
| Supabase Storage + CDN | $0 (free tier) |
| **총 운영비** | **≈ $0.10/월** |

= 이번 세션 통찰만으로 ElevenLabs $22 + Rive $19 = **$41/월 절감**.

---

## 10. 핵심 파일 (수정 위치)

### 신규 작성
- `client/components/bts/BTSMapSection.tsx` — WebView + /api/map/html 래퍼
- `client/components/bts/BTSShortFormPlayer.tsx` — HyperFrames 컴포지션 또는 RN 합성
- `client/components/bts/BTSItineraryFinal.tsx` — Screen 6 최종 여정
- `server/services/bts/route-optimizer.ts` — 동선 알고리즘 30~50 줄
- `server/services/bts/gemini-scene-generator.ts` — 시나리오 8 씬 생성

### 수정
- `client/screens/bts/BTSPlaceCartScreen.tsx` (라인 571-597 카트 → 지도)
- `client/contexts/BTSContext.tsx` (라인 128 카드 최소 2 → 3)
- `server/routes/bts-routes.ts` (`/api/bts/top-places` → 30 후보 + 식당 10 + venue / `/api/bts/generate` 동기/비동기 분기)
- `scripts/p0-bts-daily-cron.mjs` (Text Search 30 폐기, Find Place + Photo + Storage 만)
- `docs/MCP_RAW_DATA_PROMPTS.md` (shopping 카테고리 prompt 추가, 카테고리당 5 정정)

### 재사용 import
- `server/services/agents/types.ts` (PACE_CONFIG, MEAL_SLOTS) — 메인앱 그대로
- `server/services/itinerary-generator.ts:2133-2408` (distributePlacesWithUserTime)
- `public/` 폴더 레거시 — Web Speech API 코드

### Schema 변경
- `place_seed_raw.image_attribution` 컬럼 추가 (Google ToS 의무)
- `place_seed_raw.image_updated_at` 컬럼 추가 (180 일 갱신용)

### HyperFrames 설치
```bash
npx skills add heygen-com/hyperframes
# 슬래시 커맨드 등록: /hyperframes, /hyperframes-cli, /gsap
```

---

## 11. 메모리 저장 사항 (ExitPlanMode 후)

이번 세션 사용자 통찰 = 미래 AI 가 헛짓 안 하도록 메모리:

1. **`feedback_user_pattern_to_rule.md`**
   - 사용자 행동 패턴 → 룰베이스 변환 = AI 한계 영역
   - 메인앱 PACE_CONFIG = 사용자가 직접 만든 SSOT
   - 룰 재발명 X = 메인앱 그대로 import

2. **`reference_screen4_redesign_v3.md`**
   - 카트 캐러셀 (76×100) → 지도 교체
   - 카드 8 풀 = vibe 5 + 식사 2 + 공연장 1
   - 카드 N = 사용자 자유 조합 (3~7)
   - HERO 궤도 카드 = 절대 유지

3. **`feedback_image_matching_polite_failure.md`**
   - 자동 이미지 매칭 = Wikipedia 28% + Unsplash 17/137 = 가짜 위험
   - 메인앱 places.photo_urls 도 일부 가짜 (모닝사이드 사례, Café Louvre 음악 페스티벌)
   - 해결 = 1) Google Photo binary 다운로드 + Supabase Storage, 2) Embed iframe 활용

4. **`reference_hyperframes_webttts.md`**
   - HyperFrames = HeyGen 오픈소스 = HTML + GSAP + FFmpeg
   - Web Speech API = `public/` 레거시 = $0 한국어 자연
   - 조합 = 운영비 $0 영상 합성

5. **`reference_character_category_mapping.md`**
   - 캐릭터 7 ↔ 카테고리 매핑 (collector→heritage, chiller→shopping 등)
   - shopping 카테고리 신규 (사용자 SSOT 확장)

---

## 12. 검증 (E2E)

### Phase 1 (시드 + cron)
```sql
-- shopping 카테고리 신규 시드 확인
SELECT category_tags, COUNT(*) FROM place_seed_raw 
WHERE city_id=101 AND 'shopping' = ANY(category_tags) 
GROUP BY category_tags;

-- cron 진행 (이미지 채움)
SELECT COUNT(*) FILTER (WHERE image_url LIKE '%supabase%') AS cdn_count,
       COUNT(*) AS total
FROM place_seed_raw WHERE city_id=101 AND 'bts2026' = ANY(phase_tags);
```

### Phase 2 (백엔드 API)
```bash
# 동선 알고리즘 + 페이스
curl -X POST /api/bts/generate \
  -d '{ "cityId": 101, "characterId": "collector", "selectedPlaceIds": [1,2,3] }'
# → 50ms 응답 = route + schedule
# → 1~3 초 후 = scenes + embedUrls 준비
```

### Phase 3 (프론트엔드)
- Screen 4 진입 → 카트 자리 = 지도 + 마커 9 개 표시
- 카드 3 선택 → "같이 떠나요" → Screen 5 즉시 진입
- 숏폼 48 초 자동 재생 + Web TTS 음성
- Screen 6 진입 → 시간표 + Embed 지도 + 시나리오 대사

---

## 13. 운영 제약 (CLAUDE.md)

- §1: 사용자 명시 승인 후 진행
- §2: HERO 궤도 카드 + 상세 섹션 + Context = **건드리지 않음**
- §3: ⚠️ 수정금지 코드 (server/googleAuth.ts 등) = 무관
- §6: 모든 수정 코드 한국어 주석 + ⚠️ 수정금지(승인필요)
- §8: Android WebView 호환 (postMessage / Google Maps JS API / HyperFrames)
- §10: 커밋/푸시 = 사용자 명시 시
- §13: Replit Expo 설정 절대 수정 X

---

## 14. 단계별 작업 순서 (지금 당장 해야 할 일)

### **Step 1 즉시** — SSOT 보강 (1~2 일)
- [ ] `docs/MCP_RAW_DATA_PROMPTS.md` shopping 카테고리 prompt 추가
- [ ] `docs/MCP_RAW_DATA_PROMPTS.md` 카테고리당 5 (기존 30) 정정
- [ ] `place_seed_raw` 신규 컬럼 마이그레이션 (`image_attribution`, `image_updated_at`)

### **Step 2 cron 정정** (3~5 일)
- [ ] `scripts/p0-bts-daily-cron.mjs` 재작성:
  - Text Search 30 폐기
  - Find Place + Photo + Supabase Storage 업로드 흐름
  - 도시당 30 + 10 식당 = 40 binary
  - 일일 quota 30 = 32~38 일 분할 처리

### **Step 3 백엔드 동선 + 페이스** (3~5 일)
- [ ] `server/services/bts/route-optimizer.ts` (Haversine + nearest-neighbor + 2-opt)
- [ ] 메인앱 `agents/types.ts` PACE_CONFIG import
- [ ] `/api/bts/generate` 동기/비동기 분기 패턴
- [ ] `/api/bts/top-places` 응답 = 30 vibe + 10 식당 + venue

### **Step 4 Screen 4 리팩토링** (3~5 일)
- [ ] BTSPlaceCartScreen 카트 캐러셀 (571-597) → WebView 지도
- [ ] BTSContext 카드 최소 2 → 3
- [ ] HERO 궤도 카드 + 상세 섹션 = 절대 유지

### **Step 5 Screen 5 숏폼** (1~2 주)
- [ ] HyperFrames 설치 (`npx skills add heygen-com/hyperframes`)
- [ ] Web Speech API 레거시 코드 import (`public/`)
- [ ] 8 씬 컴포지션 + GSAP 트랜지션
- [ ] 시간 톤 매핑 + 카운트다운 + 자막

### **Step 6 Screen 6 최종 여정** (3~5 일)
- [ ] BTSItineraryFinal 화면 (시간표 + Embed + 시나리오)
- [ ] Embed iframe URL 생성 spec
- [ ] Gemini 시나리오 8 씬 통합

### **Step 7 통합 검증** (3~5 일)
- [ ] E2E: 카드 선택 → 같이 떠나요 → 숏폼 → 최종 여정
- [ ] 비용 모니터링 (Google Cloud Console)
- [ ] 32 도시 확장 (도시별 38 일 cron 점진 진행)

---

## 15. 핵심 결론 (v3)

**이미지 매칭 마스터플랜 v2 = 폐기**.

**v3 = BTS 미니앱 통째 재설계** =
- 시드 SSOT 축소 (180 → 30) + shopping 신규
- 카드 8 = vibe 5 + 식사 2 + 공연장 1 (캐릭터 7 매핑)
- 동선 = 자체 코드 (nearest-neighbor + 2-opt) = $0
- 메인앱 PACE_CONFIG 재사용 = 룰 재발명 X
- Screen 4 = 카트 → 지도 (거리감)
- Screen 5 = 48 초 숏폼 = HyperFrames + Web TTS = **세계 최초**
- Screen 6 = 시간표 + Embed = 무료 무제한
- 운영비 = **월 ~$0.10**

**MVP 기간** = 약 **6~8 주** (Step 1~7).
**32 도시 시드 보강** = 38 일 (병렬 cron).
**비용** = 약 **$0** (Gemini 만 ~$0.10/월).

---

## ❓ 지금 당장 해야 할 일 (사용자 질문 직답)

**"이번 세션 시작 시점 = 178 row 시각 검증 보고 대기"** = **폐기됨** (이미지 매칭 자체가 무의미).

**= 새 즉시 작업**:

1. **Plan 승인** (이 문서) → ExitPlanMode
2. **Step 1 시작** — SSOT 보강:
   - `docs/MCP_RAW_DATA_PROMPTS.md` 에 **shopping 카테고리 prompt** 추가
   - 카테고리당 30 → **5** 정정
3. **메모리 5 개 저장** — 이번 세션 통찰 (위 11번 항목)

= **Step 1 첫 타깃 = `docs/MCP_RAW_DATA_PROMPTS.md` shopping 추가** 부터 시작이 자연스러움 (사용자 SSOT 가 가장 윗단).
