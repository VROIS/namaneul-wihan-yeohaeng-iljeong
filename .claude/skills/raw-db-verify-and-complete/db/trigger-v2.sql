-- ⚠️ 수정금지(승인필요) 2026-05-18 = 사용자 SSOT v2 = 헌법 §14 변경
-- = place_seed_raw_prevent_dup 트리거 함수 = BEFORE INSERT
-- = 1 순위 매칭 = 풀 주소 100% + 이름 9 조합 한 쌍 동시 (= v1 = 주소 단독 → v2 = 주소 + 이름)
-- = 광역 주소 (= Disney Village 복합 상가) 같은 주소 다른 식당 = 별도 행 보존
-- 적용 = psql $SUPA_URL -f trigger-v2.sql

CREATE OR REPLACE FUNCTION public.place_seed_raw_prevent_dup()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  matched_id integer;
BEGIN
  -- 0순위 = google_place_id 일치 (= 변경 X)
  IF NEW.google_place_id IS NOT NULL AND NEW.google_place_id <> '' THEN
    SELECT id INTO matched_id FROM place_seed_raw
    WHERE city_id = NEW.city_id AND google_place_id = NEW.google_place_id
    LIMIT 1;
    IF matched_id IS NOT NULL THEN
      RAISE EXCEPTION 'place_seed_raw INSERT 차단 = PID(%) 매칭 행 id=% 존재 = upsertPlace() 사용 강제 (= 사용자 SSOT 2026-05-15)', NEW.google_place_id, matched_id;
    END IF;
  END IF;

  -- 1순위 v2 = 풀 주소 정규화 100% + 이름 9 조합 한 쌍 동시 (= 사용자 SSOT 2026-05-18)
  -- = 광역 주소 (= Disney Village 복합 상가) 같은 주소 다른 식당 = 분리 보존
  IF NEW.address IS NOT NULL AND LENGTH(TRIM(NEW.address)) >= 20 THEN
    SELECT id INTO matched_id FROM place_seed_raw
    WHERE city_id = NEW.city_id
      AND address IS NOT NULL
      AND LOWER(REGEXP_REPLACE(address, '[\s\.,;:!?''"()\[\]{}]+', ' ', 'g')) =
          LOWER(REGEXP_REPLACE(NEW.address, '[\s\.,;:!?''"()\[\]{}]+', ' ', 'g'))
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

  -- 2순위 = 좌표 10m (= 변경 X)
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    SELECT id INTO matched_id FROM place_seed_raw
    WHERE city_id = NEW.city_id
      AND latitude IS NOT NULL AND longitude IS NOT NULL
      AND ABS(latitude - NEW.latitude) < 0.0001
      AND ABS(longitude - NEW.longitude) < 0.0001
    LIMIT 1;
    IF matched_id IS NOT NULL THEN
      RAISE EXCEPTION 'place_seed_raw INSERT 차단 = 좌표 10m 매칭 행 id=% 존재 = upsertPlace() 사용 강제 (= 사용자 SSOT 2026-05-15)', matched_id;
    END IF;
  END IF;

  -- 3순위 = 이름 = 기존 UNIQUE INDEX (uniq_psr_global_city_name) 가 강제

  RETURN NEW;
END;
$function$;

-- 트리거 자체 = 기존 = 그대로 유지 (= 함수만 교체)
-- CREATE TRIGGER place_seed_raw_prevent_dup_trigger
--   BEFORE INSERT ON place_seed_raw
--   FOR EACH ROW
--   EXECUTE FUNCTION place_seed_raw_prevent_dup();
