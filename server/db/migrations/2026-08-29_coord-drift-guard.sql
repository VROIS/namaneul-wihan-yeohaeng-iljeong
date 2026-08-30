-- ⚠️ 수정금지(승인필요) 2026-08-29 사장님 승인 = 좌표이탈 차단 트리거(PID 스크래핑 좌표오염 사고 대응, 뮌헨 #78329 실사고)
-- = 기존 place_seed_raw_prevent_dup 트리거와 별도(app.skip_dup_check 우회와 무관하게 항상 작동).
-- = 행 자신의 city_id 중심에서 100km 이내였던 좌표가 UPDATE 로 100km 밖으로 나가면 무조건 차단.
-- = 100km 는 이 프로젝트 전역 단일 기준 재사용(§16, ag2/ag3/ag4 pool-radius.ts·place-identity.sql 불변5~8 과 동일 값).
-- 적용: psql $SUPA_URL -f server/db/migrations/2026-08-29_coord-drift-guard.sql

CREATE OR REPLACE FUNCTION public.place_seed_raw_guard_coord_drift()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  city_lat double precision;
  city_lng double precision;
  old_km double precision;
  new_km double precision;
BEGIN
  IF NEW.latitude IS NULL OR NEW.longitude IS NULL THEN RETURN NEW; END IF;
  IF OLD.latitude IS NULL OR OLD.longitude IS NULL THEN RETURN NEW; END IF;
  IF OLD.latitude = NEW.latitude AND OLD.longitude = NEW.longitude THEN RETURN NEW; END IF;

  SELECT latitude::float, longitude::float INTO city_lat, city_lng
  FROM cities WHERE id = NEW.city_id;
  IF city_lat IS NULL OR city_lng IS NULL THEN RETURN NEW; END IF;

  old_km := 6371*acos(least(1,greatest(-1,
    sin(radians(city_lat))*sin(radians(OLD.latitude::float)) +
    cos(radians(city_lat))*cos(radians(OLD.latitude::float))*cos(radians(OLD.longitude::float - city_lng)))));
  new_km := 6371*acos(least(1,greatest(-1,
    sin(radians(city_lat))*sin(radians(NEW.latitude::float)) +
    cos(radians(city_lat))*cos(radians(NEW.latitude::float))*cos(radians(NEW.longitude::float - city_lng)))));

  IF old_km <= 100 AND new_km > 100 THEN
    RAISE EXCEPTION '[좌표이탈차단] id=% 자기도시(city_id=%) 중심 %km(정상) → %km(도시밖) 이동 시도 = 차단',
      NEW.id, NEW.city_id, round(old_km::numeric,1), round(new_km::numeric,1);
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS place_seed_raw_guard_coord_drift_trigger ON public.place_seed_raw;
CREATE TRIGGER place_seed_raw_guard_coord_drift_trigger
  BEFORE UPDATE ON public.place_seed_raw
  FOR EACH ROW
  EXECUTE FUNCTION place_seed_raw_guard_coord_drift();
