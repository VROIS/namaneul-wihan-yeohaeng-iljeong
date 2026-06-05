-- ⚠️ 수정금지(승인필요) 2026-06-03 = place_seed_raw 동일성/중복방지 DDL 단일 SSOT (= 헌법 §14)
-- = 라이브 DB 현행 정의 복원(= 소실됐던 원본) + 2026-06-03 PID/URI veto 추가.
-- = 정규화 = lower(trim(name_en)) = server/services/shared/matcher.ts normName 과 동일 식 (= 앱↔DB 정합).
-- = 트리거 = shared/matcher.ts 5단계와 동형: PID(0) > 주소+이름9조합(1) > 좌표10m(2) > 이름 UNIQUE(3).
--   핵심: PID/URI 둘 다 있고 서로 다르면 = 확정 다른 장소 = 보조(주소·좌표) 차단 안 함 (= samePlace veto).
-- 적용: Supabase apply_migration 또는 psql $SUPA_URL -f server/db/migrations/place-identity.sql

-- ── 1) 글로벌 UNIQUE = (city_id, lower(trim(name_en))) = 도시 내 동명 1행 (= matcher 5순위 + race 안전망) ──
CREATE UNIQUE INDEX IF NOT EXISTS uniq_psr_global_city_name
  ON public.place_seed_raw USING btree (city_id, lower(TRIM(BOTH FROM name_en)))
  WHERE ((name_en IS NOT NULL) AND (TRIM(BOTH FROM name_en) <> ''::text));

-- ── 2) BEFORE INSERT 중복방지 트리거 함수 (= upsertPlace 우회 직접 INSERT 차단 = 헌법 §14 안전망) ──
CREATE OR REPLACE FUNCTION public.place_seed_raw_prevent_dup()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  matched_id integer;
BEGIN
  -- 0순위 = google_place_id 일치 = 같은 장소 확정 (= 변경 X)
  IF NEW.google_place_id IS NOT NULL AND NEW.google_place_id <> '' THEN
    SELECT id INTO matched_id FROM place_seed_raw
    WHERE city_id = NEW.city_id AND google_place_id = NEW.google_place_id
    LIMIT 1;
    IF matched_id IS NOT NULL THEN
      RAISE EXCEPTION 'place_seed_raw INSERT 차단 = PID(%) 매칭 행 id=% 존재 = upsertPlace() 사용 강제 (= 사용자 SSOT 2026-05-15)', NEW.google_place_id, matched_id;
    END IF;
  END IF;

  -- 1순위 = 풀 주소 정규화 100% + 이름 9 조합 한 쌍 동시 (= 2026-05-18)
  -- ⚠️ 2026-06-03 = PID/URI 둘 다 있고 서로 다르면 = 확정 다른 장소 = 차단 안 함 (= shared/matcher.ts samePlace 동형)
  IF NEW.address IS NOT NULL AND LENGTH(TRIM(NEW.address)) >= 20 THEN
    SELECT id INTO matched_id FROM place_seed_raw
    WHERE city_id = NEW.city_id
      AND address IS NOT NULL
      AND LOWER(REGEXP_REPLACE(address, '[\s\.,;:!?''"()\[\]{}]+', ' ', 'g')) =
          LOWER(REGEXP_REPLACE(NEW.address, '[\s\.,;:!?''"()\[\]{}]+', ' ', 'g'))
      AND NOT (google_place_id IS NOT NULL AND google_place_id <> '' AND NEW.google_place_id IS NOT NULL AND NEW.google_place_id <> '' AND google_place_id <> NEW.google_place_id)
      AND NOT (google_maps_uri IS NOT NULL AND google_maps_uri <> '' AND NEW.google_maps_uri IS NOT NULL AND NEW.google_maps_uri <> '' AND google_maps_uri <> NEW.google_maps_uri)
      AND (
        LOWER(TRIM(COALESCE(name_en, ''))) = LOWER(TRIM(COALESCE(NEW.name_en, '__NULL__')))
        OR LOWER(TRIM(COALESCE(name_local, ''))) = LOWER(TRIM(COALESCE(NEW.name_local, '__NULL__')))
        OR LOWER(TRIM(COALESCE(name_ko, ''))) = LOWER(TRIM(COALESCE(NEW.name_ko, '__NULL__')))
        OR LOWER(TRIM(COALESCE(name_en, ''))) = LOWER(TRIM(COALESCE(NEW.name_local, '__NULL__')))
        OR LOWER(TRIM(COALESCE(name_en, ''))) = LOWER(TRIM(COALESCE(NEW.name_ko, '__NULL__')))
        OR LOWER(TRIM(COALESCE(name_local, ''))) = LOWER(TRIM(COALESCE(NEW.name_en, '__NULL__')))
        OR LOWER(TRIM(COALESCE(name_local, ''))) = LOWER(TRIM(COALESCE(NEW.name_ko, '__NULL__')))
        OR LOWER(TRIM(COALESCE(name_ko, ''))) = LOWER(TRIM(COALESCE(NEW.name_en, '__NULL__')))
        OR LOWER(TRIM(COALESCE(name_ko, ''))) = LOWER(TRIM(COALESCE(NEW.name_local, '__NULL__')))
      )
    LIMIT 1;
    IF matched_id IS NOT NULL THEN
      RAISE EXCEPTION 'place_seed_raw INSERT 차단 = 풀 주소+이름 동시 매칭 행 id=% 존재 = upsertPlace() 사용 강제 (= 사용자 SSOT 2026-05-18)', matched_id;
    END IF;
  END IF;

  -- 2순위 = 좌표 10m (= 같은 건물)
  -- ⚠️ 2026-06-03 = PID/URI 다르면 = 확정 다른 장소 = 차단 안 함 (= 같은 건물 다른 장소 별개 행, 개선문↔La promenade 사고 방지)
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    SELECT id INTO matched_id FROM place_seed_raw
    WHERE city_id = NEW.city_id
      AND latitude IS NOT NULL AND longitude IS NOT NULL
      AND ABS(latitude - NEW.latitude) < 0.0001
      AND ABS(longitude - NEW.longitude) < 0.0001
      AND NOT (google_place_id IS NOT NULL AND google_place_id <> '' AND NEW.google_place_id IS NOT NULL AND NEW.google_place_id <> '' AND google_place_id <> NEW.google_place_id)
      AND NOT (google_maps_uri IS NOT NULL AND google_maps_uri <> '' AND NEW.google_maps_uri IS NOT NULL AND NEW.google_maps_uri <> '' AND google_maps_uri <> NEW.google_maps_uri)
    LIMIT 1;
    IF matched_id IS NOT NULL THEN
      RAISE EXCEPTION 'place_seed_raw INSERT 차단 = 좌표 10m 매칭 행 id=% 존재 = upsertPlace() 사용 강제 (= 사용자 SSOT 2026-05-15)', matched_id;
    END IF;
  END IF;

  -- 3순위 = 이름 = UNIQUE INDEX uniq_psr_global_city_name (city_id, lower(trim(name_en))) 가 강제
  RETURN NEW;
END;
$function$;

-- ── 3) 트리거 바인딩 (= BEFORE INSERT) ──
DROP TRIGGER IF EXISTS place_seed_raw_prevent_dup_trigger ON public.place_seed_raw;
CREATE TRIGGER place_seed_raw_prevent_dup_trigger
  BEFORE INSERT ON public.place_seed_raw
  FOR EACH ROW
  EXECUTE FUNCTION place_seed_raw_prevent_dup();
