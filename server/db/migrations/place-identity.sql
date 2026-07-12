-- ⚠️ 수정금지(승인필요) 2026-06-03 = place_seed_raw 동일성/중복방지 DDL 단일 SSOT (= 헌법 §14)
-- = 라이브 DB 현행 정의 복원(= 소실됐던 원본) + 2026-06-03 PID/URI veto 추가.
-- = 정규화 = lower(trim(name_en)) = server/services/shared/matcher.ts normName 과 동일 식 (= 앱↔DB 정합).
-- ⚠️ 수정금지(승인필요) — matcher PID veto 제거 동기화(2026-06-15 SSOT)
-- = 트리거 = shared/matcher.ts 7단계와 동형(§16 matcher≡트리거): PID > URI > 주소+로컬이름 > 좌표10m > 로컬이름 / 영어명·한국어명(의심메모).
--   핵심: URI(cid) 둘 다 있고 서로 다르면 = 확정 다른 장소 = 보조(주소·좌표) 차단 (= samePlace veto). PID 차이는 더이상 veto 아님(우리 PID 오류=TS 교정, 2026-06-15).
-- ⚠️ 수정금지(승인필요) 2026-07-09 사장님 SSOT = 불변1~5(병합)만 도시무관(글로벌) = city_id 조건 폐기 §19. 의심6~7(name_en/ko 메모)은 도시한정 유지.
--   = 같은 장소가 다른 도시 여정에서 재발굴되던 재과금 근본 제거(불변1~5). 6·7 도시무관은 일반명 노이즈 9,826 폭발이라 제외. matcher.ts 와 byte 동형(§16).
-- 적용: Supabase apply_migration 또는 psql $SUPA_URL -f server/db/migrations/place-identity.sql
-- = 라이브 DB 정본과 byte 동기화(§19 DB↔레포).

-- ── 1) UNIQUE = (city_id, lower(trim(name_en))) = 도시 내 동명 1행 race 안전망 ──
--   ⚠️ 2026-07-09 = 도시무관 매칭과 무충돌: 이 인덱스는 "같은 도시 내 name_en 중복"만 막고 다른 도시 동명(체인)은 허용.
--   = name_en 은 매칭 병합기준 아님(suspect) → 크로스도시 동명은 별개 행이 정상 = 인덱스 city_id 스코프 유지가 맞음(트리거 도시무관과 층위 다름).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_psr_global_city_name
  ON public.place_seed_raw USING btree (city_id, lower(TRIM(BOTH FROM name_en)))
  WHERE ((name_en IS NOT NULL) AND (TRIM(BOTH FROM name_en) <> ''::text));

-- ── 1-b) 도시무관 매칭키 인덱스 (= 트리거 불변1·2·4 + ag3 후보조회 + repair dupOwner 풀스캔 해소) ──
--   ⚠️ 2026-07-09 = 도시무관화(city_id 조건 제거)로 PID/URI/좌표 조회가 Seq Scan(전체행) 됨 → btree 인덱스로 Index Scan 전환(실측 입증).
--   = 등가검색 PID/URI 는 결정적 개선. 좌표는 위도 btree 로 후보 좁힘(경도 필터). NULL 다수라 부분인덱스.
CREATE INDEX IF NOT EXISTS idx_psr_google_place_id ON public.place_seed_raw (google_place_id) WHERE google_place_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_psr_google_maps_uri ON public.place_seed_raw (google_maps_uri) WHERE google_maps_uri IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_psr_latitude ON public.place_seed_raw (latitude) WHERE latitude IS NOT NULL;

-- ── 1-c) 트리거 검사식 표현식 인덱스 4종 (2026-07-10 라이브 적용분과 동기화 §19) ──
--   ⚠️ 수정금지(승인필요) 2026-07-10 사장님 SSOT = 도시무관화로 불변3(주소정규식)·불변5~7(이름검사)이 전행 Seq Scan
--   (실측 주소 3,164ms·이름 3,635ms/회 = 매칭·저장 21초의 범인) → 트리거 검사식 "그대로"의 표현식 인덱스로 ms 전환
--   (실측 주소 1.36ms·이름 5.85ms, 트리거 IN 구문이 자동으로 BitmapOr 로 탐 = 로직 변경 0).
--   ⚠️ 식이 트리거 본문과 1글자라도 다르면 인덱스를 안 탐 = 표현식 임의 변경 금지.
CREATE INDEX IF NOT EXISTS idx_psr_addr_norm ON public.place_seed_raw (TRIM(REGEXP_REPLACE(REGEXP_REPLACE(LOWER(address), '[.,;:!?''"()\[\]{}]', ' ', 'g'), '\s+', ' ', 'g')));
CREATE INDEX IF NOT EXISTS idx_psr_name_en_norm ON public.place_seed_raw (LOWER(TRIM(COALESCE(name_en,''))));
CREATE INDEX IF NOT EXISTS idx_psr_name_local_norm ON public.place_seed_raw (LOWER(TRIM(COALESCE(name_local,''))));
CREATE INDEX IF NOT EXISTS idx_psr_name_ko_norm ON public.place_seed_raw (LOWER(TRIM(COALESCE(name_ko,''))));

-- ── 2) BEFORE INSERT OR UPDATE 중복방지 트리거 함수 (= upsertPlace 우회 직접 INSERT/UPDATE 차단 = 헌법 §14 안전망, 2026-06-24 §20 확장) ──
-- ⚠️ 수정금지(승인필요) 2026-07-12 사장님 SSOT = 고유명사 키 함수 = 이름에서 일반명사(장소유형어)+불용어를 걷어내고 남는 고유명사만 정렬조인.
--   = matcher.ts properNameKey 와 동형(§16 앱↔DB 1벌). 목적 = 레거시 오염행 흡수(Palais de↔du Tau, Taittinger↔Champagne Taittinger).
--   = 오병합 0 근거: 일반명사 제거로 Palais des Papes(papes)≠Palais du Tau(tau) 자동분리. GENERIC 은 matcher.ts GENERIC_NAME 와 동일 목록.
CREATE OR REPLACE FUNCTION public.psr_proper_key(nm text)
 RETURNS text LANGUAGE sql IMMUTABLE AS $$
  -- "첫 글자 대문자 = 고유명사"(라틴문자권 공통, matcher.ts properNameKey 동형). 대문자 시작 토큰만 남겨 소문자화·악센트제거·정렬조인.
  -- 전부대/소문자 이름(대소문자 정보 없음)은 전 토큰 사용. 구두점→공백(원본 대소문자 보존 위해 lower 는 필터 뒤에).
  WITH toks AS (
    SELECT tok, (nm = upper(nm) OR nm = lower(nm)) AS all_same
    FROM unnest(string_to_array(regexp_replace(coalesce(nm,''), '[^\wÀ-ÿ ]', ' ', 'g'), ' ')) AS tok
    WHERE tok <> ''
  )
  SELECT string_agg(k, '' ORDER BY k) FROM (
    SELECT lower(translate(tok,'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýœ',
                               'aaaaaaceeeeiiiinooooouuuuyaaaaaaceeeeiiiinooooouuuuyo')) AS k
    FROM toks
    WHERE all_same OR tok ~ '^[A-ZÀ-Þ]'   -- 대문자 시작(고유명사)만. 전부대/소문자면 전 토큰.
  ) x;
$$;

CREATE OR REPLACE FUNCTION public.place_seed_raw_prevent_dup()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  matched_id integer;
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
  -- 사용자 SSOT 2026-06-15 = matcher.ts 와 동일 = veto 는 URI(cid)만 (PID 제거 = 우리 PID 오류 가능 = TS 교정).
  -- 불변(확정=차단) 1)PID 2)URI 3)풀주소+로컬이름 4)좌표10m 5)로컬이름 / 가변(의심=통과+메모) 6)영어명 7)한국어명
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
    SELECT id INTO matched_id FROM place_seed_raw WHERE google_maps_uri = NEW.google_maps_uri AND id <> COALESCE(NEW.id, -1) LIMIT 1;
    IF matched_id IS NOT NULL THEN RAISE EXCEPTION '[중복차단] 불변2 URI 일치 id=%', matched_id; END IF;
  END IF;

  -- 3) 풀주소 + 로컬이름 (자기행 제외, URI veto 만 유지)
  v_addr := TRIM(REGEXP_REPLACE(REGEXP_REPLACE(LOWER(COALESCE(NEW.address,'')), '[.,;:!?''"()\[\]{}]', ' ', 'g'), '\s+', ' ', 'g'));
  IF LENGTH(v_addr) >= 20 THEN
    SELECT c.id INTO matched_id FROM place_seed_raw c
    WHERE c.address IS NOT NULL AND c.id <> COALESCE(NEW.id, -1)
      AND TRIM(REGEXP_REPLACE(REGEXP_REPLACE(LOWER(c.address), '[.,;:!?''"()\[\]{}]', ' ', 'g'), '\s+', ' ', 'g')) = v_addr
      AND NOT (c.google_maps_uri IS NOT NULL AND c.google_maps_uri<>'' AND NEW.google_maps_uri IS NOT NULL AND NEW.google_maps_uri<>'' AND c.google_maps_uri<>NEW.google_maps_uri)
      AND (v_local = '' OR EXISTS (
        SELECT 1 FROM (VALUES (LOWER(TRIM(COALESCE(c.name_en,'')))),(LOWER(TRIM(COALESCE(c.name_local,'')))),(LOWER(TRIM(COALESCE(c.name_ko,''))))) AS t(cn)
        WHERE t.cn <> '' AND ((LEAST(LENGTH(v_local),LENGTH(t.cn))<6 AND v_local=t.cn) OR (LEAST(LENGTH(v_local),LENGTH(t.cn))>=6 AND (v_local LIKE '%'||t.cn||'%' OR t.cn LIKE '%'||v_local||'%')))
      ))
    LIMIT 1;
    IF matched_id IS NOT NULL THEN RAISE EXCEPTION '[중복차단] 불변3 풀주소+로컬이름 일치 id=%', matched_id; END IF;
  END IF;

  -- 4) 좌표 10m (자기행 제외)
  -- ⚠️ 2026-07-09 = 위도 BETWEEN(sargable) = idx_psr_latitude 인덱스로 후보 좁힘(경도는 ABS 필터). ABS(위도) 는 non-sargable=풀스캔(실측 1983ms→0.09ms).
  --   = BETWEEN x±0.0001 ≡ ABS(x)<0.0001 논리 동일. 결과 무변경, 성능만 개선.
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    SELECT c.id INTO matched_id FROM place_seed_raw c
    WHERE c.latitude BETWEEN NEW.latitude - 0.0001 AND NEW.latitude + 0.0001 AND c.longitude IS NOT NULL AND c.id <> COALESCE(NEW.id, -1)
      AND ABS(c.longitude - NEW.longitude) < 0.0001
      AND NOT (c.google_maps_uri IS NOT NULL AND c.google_maps_uri<>'' AND NEW.google_maps_uri IS NOT NULL AND NEW.google_maps_uri<>'' AND c.google_maps_uri<>NEW.google_maps_uri)
    LIMIT 1;
    IF matched_id IS NOT NULL THEN RAISE EXCEPTION '[중복차단] 불변4 좌표10m 일치 id=%', matched_id; END IF;
  END IF;

  -- 5) 로컬이름 (자기행 제외, 도시무관)
  IF v_local <> '' THEN
    SELECT c.id INTO matched_id FROM place_seed_raw c
    WHERE c.id <> COALESCE(NEW.id, -1)
      AND NOT (c.google_maps_uri IS NOT NULL AND c.google_maps_uri<>'' AND NEW.google_maps_uri IS NOT NULL AND NEW.google_maps_uri<>'' AND c.google_maps_uri<>NEW.google_maps_uri)
      AND v_local IN (LOWER(TRIM(COALESCE(c.name_en,''))), LOWER(TRIM(COALESCE(c.name_local,''))), LOWER(TRIM(COALESCE(c.name_ko,''))))
    LIMIT 1;
    IF matched_id IS NOT NULL THEN RAISE EXCEPTION '[중복차단] 불변5 로컬이름 일치 id=%', matched_id; END IF;
  END IF;

  -- ⚠️ 수정금지(승인필요) 2026-07-12 사장님 SSOT = 불변6 고유명사 일치(병합) = 이름 완전일치(5)로 못 잡는 레거시 오염행 흡수.
  --   = "첫 대문자=고유명사"(psr_proper_key) 키가 후보 라틴이름칸(en/local)과 완전일치 = 같은 장소(Palais de↔du Tau 등). 도시한정(짧은키 우연겹침 방지).
  --   = name_ko(한글) 제외 = 대문자 원칙 불가 + 오염 name_ko(박물관↔거리) 오병합 근본차단. matcher.ts properKeys(en/local만)와 동형(§16).
  DECLARE
    k_en text := public.psr_proper_key(NEW.name_en);
    k_local text := public.psr_proper_key(NEW.name_local);
  BEGIN
    IF COALESCE(length(k_en),0) >= 3 OR COALESCE(length(k_local),0) >= 3 THEN
      SELECT c.id INTO matched_id FROM place_seed_raw c
      WHERE c.city_id = NEW.city_id AND c.id <> COALESCE(NEW.id, -1)
        AND NOT (c.google_maps_uri IS NOT NULL AND c.google_maps_uri<>'' AND NEW.google_maps_uri IS NOT NULL AND NEW.google_maps_uri<>'' AND c.google_maps_uri<>NEW.google_maps_uri)
        AND ARRAY(SELECT k FROM unnest(ARRAY[k_en,k_local]) k WHERE length(k)>=3)
            && ARRAY(SELECT k FROM unnest(ARRAY[public.psr_proper_key(c.name_en),public.psr_proper_key(c.name_local)]) k WHERE length(k)>=3)
      LIMIT 1;
      IF matched_id IS NOT NULL THEN RAISE EXCEPTION '[중복차단] 불변6 고유명사 일치 id=%', matched_id; END IF;
    END IF;
  END;

  -- ⚠️ 수정금지(승인필요) 2026-07-09 사장님 SSOT = 7·8 영어명/한국어명(가변=의심 '중복의심' 메모만) = 도시한정 유지(city_id = NEW.city_id).
  --   = 도시무관화하면 'Genoa'·'Cathedral' 등 일반명이 크로스도시 의심그룹 9,826개 폭발(실측) = 순수 노이즈. 병합도 안 하니 실익0.
  --   = matcher.ts nameStep name_en/ko cityGuard=true 와 동형(§16). 불변1~5(병합)만 도시무관.
  matched_id := NULL;
  IF v_en <> '' THEN
    SELECT c.id INTO matched_id FROM place_seed_raw c
    WHERE c.city_id = NEW.city_id AND c.id <> COALESCE(NEW.id, -1)
      AND NOT (c.google_maps_uri IS NOT NULL AND c.google_maps_uri<>'' AND NEW.google_maps_uri IS NOT NULL AND NEW.google_maps_uri<>'' AND c.google_maps_uri<>NEW.google_maps_uri)
      AND v_en IN (LOWER(TRIM(COALESCE(c.name_en,''))), LOWER(TRIM(COALESCE(c.name_local,''))), LOWER(TRIM(COALESCE(c.name_ko,''))))
    LIMIT 1;
  END IF;
  IF matched_id IS NULL AND v_ko <> '' THEN
    SELECT c.id INTO matched_id FROM place_seed_raw c
    WHERE c.city_id = NEW.city_id AND c.id <> COALESCE(NEW.id, -1)
      AND NOT (c.google_maps_uri IS NOT NULL AND c.google_maps_uri<>'' AND NEW.google_maps_uri IS NOT NULL AND NEW.google_maps_uri<>'' AND c.google_maps_uri<>NEW.google_maps_uri)
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
$function$;

-- ── 3) 트리거 바인딩 (= BEFORE INSERT OR UPDATE) ──
-- ⚠️ 수정금지(승인필요) 2026-06-24 사장님 SSOT = INSERT 만 → INSERT OR UPDATE 확장 (= #45 PID 직행 UPDATE 도 중복 검문 = §20 통일 PSR).
--   = 자기행 제외(불변1~7 의 c.id <> COALESCE(NEW.id,-1)) 가 정상 자기 갱신은 통과시키고 진짜 중복(다른 행)만 차단.
DROP TRIGGER IF EXISTS place_seed_raw_prevent_dup_trigger ON public.place_seed_raw;
CREATE TRIGGER place_seed_raw_prevent_dup_trigger
  BEFORE INSERT OR UPDATE ON public.place_seed_raw
  FOR EACH ROW
  EXECUTE FUNCTION place_seed_raw_prevent_dup();
