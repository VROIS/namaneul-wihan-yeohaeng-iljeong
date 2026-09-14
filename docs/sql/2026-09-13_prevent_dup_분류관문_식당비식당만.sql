-- 2026-09-13 사장님 결정 = 트리거 prevent_dup 분류 관문 5줄 = 식당·비식당만. 라이브 DB 에 그대로 실행(Supabase SQL 편집기). 저장소 SQL(server/db/migrations/place-identity.sql)은 이미 같은 내용.
CREATE OR REPLACE FUNCTION public.place_seed_raw_prevent_dup()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  matched_id integer;
  v_near_cnt integer := 0;
  v_addr text;
  v_local text := LOWER(TRIM(COALESCE(NEW.name_local, '')));
  v_en text := LOWER(TRIM(COALESCE(NEW.name_en, '')));
  v_ko text := LOWER(TRIM(COALESCE(NEW.name_ko, '')));
BEGIN
  -- ⚠️ 수정금지(승인필요) 2026-06-24 사장님 SSOT = 깊이(depth) 가드 = 다른 트리거 cascade(autorank 의 rank 일괄 UPDATE) 안에서 발동 시 = 검문 면제.
  --   근거: autorank 가 INSERT 직후 같은 카테고리 전 행 rank 를 일괄 UPDATE → 이제 prevent_dup 가 UPDATE 에도 발동 →
  --         이미 PID중복이 있는 카테고리(restaurant 등)면 그 중복행 rank 갱신이 불변1 에 걸려 모든 신규 INSERT 가 죽음.
  --   cascade 는 rank(정렬값)만 바꾸고 식별컬럼(PID·URI·좌표·이름)은 절대 안 바꿈 = 검문 불필요 = 면제 안전.
  --   = autorank 의 'pg_trigger_depth() > 1 RETURN NULL' 가드와 동형. depth=1(사용자 직접 INSERT/UPDATE)만 검문.
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  -- ⚠️ 수정금지(승인필요) 2026-07-18 사장님 SSOT = 우리 id 확정행 직행(ag3 ③ TS) = prevent_dup 만 외과적 면제(중복검사 불필요 = 이미 우리 id).
  --   = place-upsert targetRowId 직행이 SET LOCAL app.skip_dup_check='on' 로만 이 검문 스킵. 매칭·INSERT 는 플래그 없음 = 중복 보호 유지.
  --   = replica 방식(모든 트리거 우회) 폐기 §19 = write_gate(데드락방지)·autorank(랭킹) 는 살려야 = 이 트리거만 정확히 끔.
  IF current_setting('app.skip_dup_check', true) = 'on' THEN RETURN NEW; END IF;
  -- 사용자 SSOT 2026-06-15 = matcher.ts 와 동일 = veto 는 URI(cid)만 (PID 제거 = 우리 PID 오류 가능 = TS 교정).
  -- 불변(확정=차단) 1)PID 2)URI 3)풀주소 4)좌표10m 5)로컬이름 / 가변(의심=통과+메모) 6)영어명 7)한국어명 (2026-07-18 §19 = 불변3 로컬이름 결합 삭제)
  -- ⚠️ 수정금지(승인필요) 2026-06-24 사장님 SSOT = BEFORE INSERT OR UPDATE 확장 = 자기행 제외(c.id <> COALESCE(NEW.id,-1)) 전 불변 필수.
  --   = UPDATE 시 NEW.id 가 자기 자신과 충돌(전수 마비) 차단. INSERT 는 NEW.id NULL = COALESCE -1 폴백 = 기존 동작 무변경.

  -- ⚠️ 수정금지(승인필요) 2026-07-09 사장님 SSOT = 도시무관(글로벌) 매칭 = 불변1~5 city_id 조건 폐기 2026-07-09 §19.
  --   = 같은 장소가 다른 도시 여정에서 재발굴되던 재과금 근본 제거. matcher.ts 와 동형(§16 matcher≡트리거). name_local 크로스도시 겹침 18개뿐=안전.
  -- 1) PID (자기행 제외, 도시무관)
  IF NEW.google_place_id IS NOT NULL AND NEW.google_place_id <> '' THEN
    SELECT id INTO matched_id FROM place_seed_raw WHERE google_place_id = NEW.google_place_id AND id <> COALESCE(NEW.id, -1) LIMIT 1;
    IF matched_id IS NOT NULL THEN RAISE EXCEPTION '[중복차단] 불변1 PID 일치 id=% = upsertPlace() 사용', matched_id; END IF;
  END IF;

  -- 2) URI (자기행 제외, 도시무관)
  IF NEW.google_maps_uri IS NOT NULL AND NEW.google_maps_uri <> '' THEN
    SELECT id INTO matched_id FROM place_seed_raw WHERE public.psr_cid(google_maps_uri) IS NOT NULL AND public.psr_cid(google_maps_uri) = public.psr_cid(NEW.google_maps_uri) AND id <> COALESCE(NEW.id, -1) LIMIT 1;
    IF matched_id IS NOT NULL THEN RAISE EXCEPTION '[중복차단] 불변2 URI 일치 id=%', matched_id; END IF;
  END IF;

  -- 3) 풀주소 (자기행 제외, URI·PID·먹는곳 veto)
  -- ⚠️ 수정금지(승인필요) 2026-09-07 사장님 결정 = 주소가 같아도 한쪽만 식당이면 다른 장소(큰 건물·몰·기념관은 주소를 공유한다).
  --   발굴 시점에는 PID·URI 가 없어 그 두 veto 가 안 걸린다 = 몰의 표를 몰 안 식당이 가져가는 오염의 근본(다하우 카페테리아·이튼센터 실증).
  --   풀주소(20자+, 번지+우편번호) 정규화 일치 = 그것만으로 같은 장소 = 독립 차단. 식당끼리·명소끼리는 종전과 동일.
  v_addr := TRIM(REGEXP_REPLACE(REGEXP_REPLACE(LOWER(COALESCE(NEW.address,'')), '[.,;:!?''"()\[\]{}]', ' ', 'g'), '\s+', ' ', 'g'));
  -- ⚠️ 수정금지(승인필요) 2026-08-10 사장님 승인 = 주소 판정은 **번지+우편번호가 있을 때만**(§14 원문 전제 그대로 집행).
  --   사유 = 번지·우편번호가 없는 나라(케냐 등)는 주소가 '길 이름'뿐이라 같은 길의 다른 곳까지 한 곳으로 합쳐졌다.
  --   실증 2026-08-10 나이로비 = 27곳 중 2곳 소실(스네이크파크·카렌블릭센박물관). 숫자 덩어리 2개 이상 = 번지+우편번호.
  --   유럽·일본 주소는 숫자 2개 이상이라 판정이 종전과 완전히 같다(실측: 우리 DB 4,336행 그대로 / 1,043행만 건너뜀).
  IF LENGTH(v_addr) >= 20
     AND (SELECT count(*) FROM regexp_matches(v_addr, '[0-9]+', 'g')) >= 2 THEN
    SELECT c.id INTO matched_id FROM place_seed_raw c
    WHERE c.address IS NOT NULL AND c.id <> COALESCE(NEW.id, -1)
      AND TRIM(REGEXP_REPLACE(REGEXP_REPLACE(LOWER(c.address), '[.,;:!?''"()\[\]{}]', ' ', 'g'), '\s+', ' ', 'g')) = v_addr
      AND NOT (public.psr_cid(c.google_maps_uri) IS NOT NULL AND public.psr_cid(NEW.google_maps_uri) IS NOT NULL AND public.psr_cid(c.google_maps_uri)<>public.psr_cid(NEW.google_maps_uri))
      AND NOT (c.google_place_id IS NOT NULL AND c.google_place_id<>'' AND NEW.google_place_id IS NOT NULL AND NEW.google_place_id<>'' AND c.google_place_id<>NEW.google_place_id)
      AND (c.seed_category = 'restaurant') = (NEW.seed_category = 'restaurant')
    LIMIT 1;
    IF matched_id IS NOT NULL THEN RAISE EXCEPTION '[중복차단] 불변3 풀주소 일치 id=%', matched_id; END IF;
  END IF;

  -- 4) 좌표 10m (자기행 제외)
  -- ⚠️ 2026-07-09 = 위도 BETWEEN(sargable) = idx_psr_latitude 인덱스로 후보 좁힘(경도는 ABS 필터). ABS(위도) 는 non-sargable=풀스캔(실측 1983ms→0.09ms).
  --   = BETWEEN x±0.0001 ≡ ABS(x)<0.0001 논리 동일. 결과 무변경, 성능만 개선.
  -- ⚠️ 수정금지(승인필요) 2026-09-03 사장님 결정 = 좌표는 같은 건물까지만 = PID 가 있고 서로 다르면 다른 장소(제외) · 10m 안에 후보가 여럿(동점)이면 현지어 이름(name_local)이 맞는 행에만 붙이고 없으면 통과(새 행) (정본 B4)
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    SELECT COUNT(*), MIN(c.id) INTO v_near_cnt, matched_id FROM place_seed_raw c
    WHERE c.latitude BETWEEN NEW.latitude - 0.0001 AND NEW.latitude + 0.0001 AND c.longitude IS NOT NULL AND c.id <> COALESCE(NEW.id, -1)
      AND ABS(c.longitude - NEW.longitude) < 0.0001
      AND NOT (public.psr_cid(c.google_maps_uri) IS NOT NULL AND public.psr_cid(NEW.google_maps_uri) IS NOT NULL AND public.psr_cid(c.google_maps_uri)<>public.psr_cid(NEW.google_maps_uri))
      AND NOT (c.google_place_id IS NOT NULL AND c.google_place_id<>'' AND NEW.google_place_id IS NOT NULL AND NEW.google_place_id<>'' AND c.google_place_id<>NEW.google_place_id)
      -- ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = 분류 관문 = 식당·비식당만 가른다, 그 밖의 분류는 한 풀(멀티태그 합집합) = 쌍둥이 원천 차단 ② (정본 §)
      AND (c.seed_category = 'restaurant') = (NEW.seed_category = 'restaurant');
    IF v_near_cnt > 1 THEN
      SELECT c.id INTO matched_id FROM place_seed_raw c
      WHERE c.latitude BETWEEN NEW.latitude - 0.0001 AND NEW.latitude + 0.0001 AND c.longitude IS NOT NULL AND c.id <> COALESCE(NEW.id, -1)
        AND ABS(c.longitude - NEW.longitude) < 0.0001
        AND NOT (public.psr_cid(c.google_maps_uri) IS NOT NULL AND public.psr_cid(NEW.google_maps_uri) IS NOT NULL AND public.psr_cid(c.google_maps_uri)<>public.psr_cid(NEW.google_maps_uri))
        AND NOT (c.google_place_id IS NOT NULL AND c.google_place_id<>'' AND NEW.google_place_id IS NOT NULL AND NEW.google_place_id<>'' AND c.google_place_id<>NEW.google_place_id)
        AND (c.seed_category = 'restaurant') = (NEW.seed_category = 'restaurant')
        AND v_local <> '' AND v_local = LOWER(TRIM(COALESCE(c.name_local,'')))
      LIMIT 1;
    END IF;
    IF matched_id IS NOT NULL THEN RAISE EXCEPTION '[중복차단] 불변4 좌표10m 일치 id=%', matched_id; END IF;
  END IF;

  -- 5) 로컬이름 (자기행 제외)
  -- ⚠️ 수정금지(승인필요) 2026-09-04 사장님 확정 = PID 가 서로 다르면 다른 장소 = 절대 기준(veto) = 불변3·4·6 과 동형으로 5·7·8 에도 적용.
  --   사유 = 넓은 장소는 본관과 내부 시설이 이름·주소를 공유한다(시카고 Griffin 박물관 ↔ 그 안 Coal Mine, 파리 박물관 동일). 이름만으로 묶으면 다른 장소가 합쳐진다.
  -- ⚠️ 수정금지(승인필요) 2026-08-17 사장님 승인 = 같은도시 OR 100km 상한 추가(불변6·7·8 과 동형 §16/§19).
  --   사유: "City Market" 같은 흔한 이름이 대륙이 달라도 문자열만 같으면 무제한(도시무관) 매칭돼
  --   나이로비 여정이 멕시코시티 행(city_id=102)에 잘못 병합되는 실사고 발생(2026-08-17 실측, id=61563:
  --   주소="Muindi Mbingu St, Nairobi"인데 좌표·PID는 멕시코시티). 옛 완전 도시무관(2026-07-09) 폐기.
  IF v_local <> '' THEN
    SELECT c.id INTO matched_id FROM place_seed_raw c
    WHERE c.id <> COALESCE(NEW.id, -1)
      AND ( c.city_id = NEW.city_id
            OR ( NEW.latitude IS NOT NULL AND NEW.latitude <> 0 AND NEW.longitude IS NOT NULL AND NEW.longitude <> 0
                 AND c.latitude IS NOT NULL AND c.latitude <> 0 AND c.longitude IS NOT NULL AND c.longitude <> 0
                 AND sqrt( power((c.latitude::float - NEW.latitude::float)*111320, 2)
                         + power((c.longitude::float - NEW.longitude::float)*111320*cos(radians((c.latitude::float + NEW.latitude::float)/2)), 2) ) <= 100000 ) )
      AND NOT (public.psr_cid(c.google_maps_uri) IS NOT NULL AND public.psr_cid(NEW.google_maps_uri) IS NOT NULL AND public.psr_cid(c.google_maps_uri)<>public.psr_cid(NEW.google_maps_uri))
      AND NOT (c.google_place_id IS NOT NULL AND c.google_place_id<>'' AND NEW.google_place_id IS NOT NULL AND NEW.google_place_id<>'' AND c.google_place_id<>NEW.google_place_id)
      AND v_local IN (LOWER(TRIM(COALESCE(c.name_en,''))), LOWER(TRIM(COALESCE(c.name_local,''))), LOWER(TRIM(COALESCE(c.name_ko,''))))
      -- ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = 분류 관문 = 식당·비식당만 가른다, 그 밖의 분류는 한 풀(멀티태그 합집합) = 쌍둥이 원천 차단 ② (정본 §)
      AND (c.seed_category = 'restaurant') = (NEW.seed_category = 'restaurant')
    LIMIT 1;
    IF matched_id IS NOT NULL THEN RAISE EXCEPTION '[중복차단] 불변5 로컬이름 일치 id=%', matched_id; END IF;
  END IF;

  -- ⚠️ 수정금지(승인필요) 2026-07-12 사장님 SSOT = 불변6 고유명사 일치(병합) = 이름 완전일치(5)로 못 잡는 레거시 오염행 흡수.
  --   = "첫 대문자=고유명사"(psr_proper_key) 키가 후보 라틴이름칸(en/local)과 완전일치 = 같은 장소(Palais de↔du Tau 등). 같은도시 OR 100km(짧은키 우연겹침 방지 = 물리 상한).
  --   = name_ko(한글) 제외 = 대문자 원칙 불가 + 오염 name_ko(박물관↔거리) 오병합 근본차단. matcher.ts properKeys(en/local만)와 동형(§16).
  --   veto = matcher.ts samePlace(PID게이트, 214행)와 동형 = 양쪽 PID 있고 (PID 다름 OR 양쪽 URI 있고 URI 다름) = 다른 장소(차단). 옛 URI-only veto = 폐기 2026-07-12 §19(Golden Gate Bridge↔Park 오병합 근본).
  DECLARE
    k_en text := public.psr_proper_key(NEW.name_en);
    k_local text := public.psr_proper_key(NEW.name_local);
  BEGIN
    IF COALESCE(length(k_en),0) >= 3 OR COALESCE(length(k_local),0) >= 3 THEN
      SELECT c.id INTO matched_id FROM place_seed_raw c
      WHERE c.id <> COALESCE(NEW.id, -1)
        -- 2026-07-17 사장님 SSOT = 도시한정 → 같은도시 OR 100km(같은장소 물리 상한) = matcher 와 1벌 §19
        AND ( c.city_id = NEW.city_id
              OR ( NEW.latitude IS NOT NULL AND NEW.latitude <> 0 AND NEW.longitude IS NOT NULL AND NEW.longitude <> 0
                   AND c.latitude IS NOT NULL AND c.latitude <> 0 AND c.longitude IS NOT NULL AND c.longitude <> 0
                   AND sqrt( power((c.latitude::float - NEW.latitude::float)*111320, 2)
                           + power((c.longitude::float - NEW.longitude::float)*111320*cos(radians((c.latitude::float + NEW.latitude::float)/2)), 2) ) <= 100000 ) )
        -- ⚠️ 수정금지(승인필요) 2026-09-08 사장님 확정 = cid 가 다르면 다른 곳(PID 와 같은 대우) = 다른 불변과 같은 모양의 독립 veto. 옛 "PID 양쪽 있을 때만" 폐기 §19 = 구글맵으로만 만든 행(PID 없음)이 이름 같다고 흡수되던 구멍.
        AND NOT (public.psr_cid(c.google_maps_uri) IS NOT NULL AND public.psr_cid(NEW.google_maps_uri) IS NOT NULL AND public.psr_cid(c.google_maps_uri)<>public.psr_cid(NEW.google_maps_uri))
        AND NOT (c.google_place_id IS NOT NULL AND c.google_place_id<>'' AND NEW.google_place_id IS NOT NULL AND NEW.google_place_id<>'' AND c.google_place_id<>NEW.google_place_id)
        -- ⚠️ 2026-08-22 사장님 승인(시뮬 검증) = 일반명사 꼬리 상이 veto = "같은 머리+다른 꼬리"(National Park↔National Museum, Central Park↔Central Market) = 다른 장소(통과).
        --   양쪽 다 제거 일반명사가 있고 서로 다를 때만 발동 = 꼬리 동일(Palais de↔du Tau)·한쪽 결여(Musée du Louvre↔Louvre)는 기존 병합 유지.
        AND NOT ( public.psr_removed_generics(COALESCE(NULLIF(NEW.name_local,''), NEW.name_en)) <> ''
                  AND public.psr_removed_generics(COALESCE(NULLIF(c.name_local,''), c.name_en)) <> ''
                  AND public.psr_removed_generics(COALESCE(NULLIF(NEW.name_local,''), NEW.name_en))
                      <> public.psr_removed_generics(COALESCE(NULLIF(c.name_local,''), c.name_en)) )
        AND ARRAY(SELECT k FROM unnest(ARRAY[k_en,k_local]) k WHERE length(k)>=3)
            && ARRAY(SELECT k FROM unnest(ARRAY[public.psr_proper_key(c.name_en),public.psr_proper_key(c.name_local)]) k WHERE length(k)>=3)
        -- ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = 분류 관문 = 식당·비식당만 가른다, 그 밖의 분류는 한 풀(멀티태그 합집합) = 쌍둥이 원천 차단 ② (정본 §)
        AND (c.seed_category = 'restaurant') = (NEW.seed_category = 'restaurant')
      LIMIT 1;
      IF matched_id IS NOT NULL THEN RAISE EXCEPTION '[중복차단] 불변6 고유명사 일치 id=%', matched_id; END IF;
    END IF;
  END;

  -- ⚠️ 수정금지(승인필요) 2026-07-17 사장님 SSOT = 7·8 영어명/한국어명(가변=의심 '중복의심' 메모만) = 같은도시 OR 100km(같은장소 물리 상한).
  --   = 전면 도시무관은 'Genoa'·'Cathedral' 등 일반명이 크로스도시 의심그룹 9,826개 폭발(실측) = 순수 노이즈라 100km 상한 유지.
  --   = matcher.ts nameStep name_en/ko 와 동형(§16).
  matched_id := NULL;
  IF v_en <> '' THEN
    SELECT c.id INTO matched_id FROM place_seed_raw c
    WHERE c.id <> COALESCE(NEW.id, -1)
      -- 2026-07-17 사장님 SSOT = 도시한정 → 같은도시 OR 100km(같은장소 물리 상한) = matcher 와 1벌 §19
      AND ( c.city_id = NEW.city_id
            OR ( NEW.latitude IS NOT NULL AND NEW.latitude <> 0 AND NEW.longitude IS NOT NULL AND NEW.longitude <> 0
                 AND c.latitude IS NOT NULL AND c.latitude <> 0 AND c.longitude IS NOT NULL AND c.longitude <> 0
                 AND sqrt( power((c.latitude::float - NEW.latitude::float)*111320, 2)
                         + power((c.longitude::float - NEW.longitude::float)*111320*cos(radians((c.latitude::float + NEW.latitude::float)/2)), 2) ) <= 100000 ) )
      AND NOT (public.psr_cid(c.google_maps_uri) IS NOT NULL AND public.psr_cid(NEW.google_maps_uri) IS NOT NULL AND public.psr_cid(c.google_maps_uri)<>public.psr_cid(NEW.google_maps_uri))
      AND NOT (c.google_place_id IS NOT NULL AND c.google_place_id<>'' AND NEW.google_place_id IS NOT NULL AND NEW.google_place_id<>'' AND c.google_place_id<>NEW.google_place_id)
      AND v_en IN (LOWER(TRIM(COALESCE(c.name_en,''))), LOWER(TRIM(COALESCE(c.name_local,''))), LOWER(TRIM(COALESCE(c.name_ko,''))))
    LIMIT 1;
  END IF;
  IF matched_id IS NULL AND v_ko <> '' THEN
    SELECT c.id INTO matched_id FROM place_seed_raw c
    WHERE c.id <> COALESCE(NEW.id, -1)
      -- 2026-07-17 사장님 SSOT = 도시한정 → 같은도시 OR 100km(같은장소 물리 상한) = matcher 와 1벌 §19
      AND ( c.city_id = NEW.city_id
            OR ( NEW.latitude IS NOT NULL AND NEW.latitude <> 0 AND NEW.longitude IS NOT NULL AND NEW.longitude <> 0
                 AND c.latitude IS NOT NULL AND c.latitude <> 0 AND c.longitude IS NOT NULL AND c.longitude <> 0
                 AND sqrt( power((c.latitude::float - NEW.latitude::float)*111320, 2)
                         + power((c.longitude::float - NEW.longitude::float)*111320*cos(radians((c.latitude::float + NEW.latitude::float)/2)), 2) ) <= 100000 ) )
      AND NOT (public.psr_cid(c.google_maps_uri) IS NOT NULL AND public.psr_cid(NEW.google_maps_uri) IS NOT NULL AND public.psr_cid(c.google_maps_uri)<>public.psr_cid(NEW.google_maps_uri))
      AND NOT (c.google_place_id IS NOT NULL AND c.google_place_id<>'' AND NEW.google_place_id IS NOT NULL AND NEW.google_place_id<>'' AND c.google_place_id<>NEW.google_place_id)
      AND v_ko IN (LOWER(TRIM(COALESCE(c.name_en,''))), LOWER(TRIM(COALESCE(c.name_local,''))), LOWER(TRIM(COALESCE(c.name_ko,''))))
    LIMIT 1;
  END IF;
  IF matched_id IS NOT NULL THEN
    IF NOT ('중복의심' = ANY(COALESCE(NEW.phase_tags, ARRAY[]::text[]))) THEN
      NEW.phase_tags := COALESCE(NEW.phase_tags, ARRAY[]::text[]) || ARRAY['중복의심', '의심대상-' || matched_id];
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;
