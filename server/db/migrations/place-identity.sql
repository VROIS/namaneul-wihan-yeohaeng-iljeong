-- ⚠️ 수정금지(승인필요) 2026-06-03 = place_seed_raw 동일성/중복방지 DDL 단일 SSOT (= 헌법 §14)
-- = 라이브 DB 현행 정의 복원(= 소실됐던 원본) + 2026-06-03 PID/URI veto 추가.
-- = 정규화 = lower(trim(name_en)) = server/services/shared/matcher.ts normName 과 동일 식 (= 앱↔DB 정합).
-- ⚠️ 수정금지(승인필요) — matcher PID veto 제거 동기화(2026-06-15 SSOT)
-- = 트리거 = shared/matcher.ts 5단계와 동형: PID(0) > 주소+이름9조합(1) > 좌표10m(2) > 이름 UNIQUE(3).
--   핵심: URI(cid) 둘 다 있고 서로 다르면 = 확정 다른 장소 = 보조(주소·좌표) 차단 (= samePlace veto). PID 차이는 더이상 veto 아님(우리 PID 오류=TS 교정, 2026-06-15).
-- 적용: Supabase apply_migration 또는 psql $SUPA_URL -f server/db/migrations/place-identity.sql
-- = 라이브 DB 정본(7단계, 2026-06-08 마이그 7step) 과 byte 동기화. 구버전 4단계 삭제(제19조)

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
  v_addr text;
  v_local text := LOWER(TRIM(COALESCE(NEW.name_local, '')));
  v_en text := LOWER(TRIM(COALESCE(NEW.name_en, '')));
  v_ko text := LOWER(TRIM(COALESCE(NEW.name_ko, '')));
BEGIN
  -- 사용자 SSOT 2026-06-15 = matcher.ts 와 동일 = veto 는 URI(cid)만 (PID 제거 = 우리 PID 오류 가능 = TS 교정).
  -- 불변(확정=차단) 1)PID 2)URI 3)풀주소+로컬이름 4)좌표10m 5)로컬이름 / 가변(의심=통과+메모) 6)영어명 7)한국어명

  -- 1) PID
  IF NEW.google_place_id IS NOT NULL AND NEW.google_place_id <> '' THEN
    SELECT id INTO matched_id FROM place_seed_raw WHERE city_id = NEW.city_id AND google_place_id = NEW.google_place_id LIMIT 1;
    IF matched_id IS NOT NULL THEN RAISE EXCEPTION '[중복차단] 불변1 PID 일치 id=% = upsertPlace() 사용', matched_id; END IF;
  END IF;

  -- 2) URI
  IF NEW.google_maps_uri IS NOT NULL AND NEW.google_maps_uri <> '' THEN
    SELECT id INTO matched_id FROM place_seed_raw WHERE city_id = NEW.city_id AND google_maps_uri = NEW.google_maps_uri LIMIT 1;
    IF matched_id IS NOT NULL THEN RAISE EXCEPTION '[중복차단] 불변2 URI 일치 id=%', matched_id; END IF;
  END IF;

  -- 3) 풀주소 + 로컬이름 (PID veto 제거, URI veto 만 유지)
  v_addr := TRIM(REGEXP_REPLACE(REGEXP_REPLACE(LOWER(COALESCE(NEW.address,'')), '[.,;:!?''"()\[\]{}]', ' ', 'g'), '\s+', ' ', 'g'));
  IF LENGTH(v_addr) >= 20 THEN
    SELECT c.id INTO matched_id FROM place_seed_raw c
    WHERE c.city_id = NEW.city_id AND c.address IS NOT NULL
      AND TRIM(REGEXP_REPLACE(REGEXP_REPLACE(LOWER(c.address), '[.,;:!?''"()\[\]{}]', ' ', 'g'), '\s+', ' ', 'g')) = v_addr
      AND NOT (c.google_maps_uri IS NOT NULL AND c.google_maps_uri<>'' AND NEW.google_maps_uri IS NOT NULL AND NEW.google_maps_uri<>'' AND c.google_maps_uri<>NEW.google_maps_uri)
      AND (v_local = '' OR EXISTS (
        SELECT 1 FROM (VALUES (LOWER(TRIM(COALESCE(c.name_en,'')))),(LOWER(TRIM(COALESCE(c.name_local,'')))),(LOWER(TRIM(COALESCE(c.name_ko,''))))) AS t(cn)
        WHERE t.cn <> '' AND ((LEAST(LENGTH(v_local),LENGTH(t.cn))<6 AND v_local=t.cn) OR (LEAST(LENGTH(v_local),LENGTH(t.cn))>=6 AND (v_local LIKE '%'||t.cn||'%' OR t.cn LIKE '%'||v_local||'%')))
      ))
    LIMIT 1;
    IF matched_id IS NOT NULL THEN RAISE EXCEPTION '[중복차단] 불변3 풀주소+로컬이름 일치 id=%', matched_id; END IF;
  END IF;

  -- 4) 좌표 10m (PID veto 제거)
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    SELECT c.id INTO matched_id FROM place_seed_raw c
    WHERE c.city_id = NEW.city_id AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL
      AND ABS(c.latitude - NEW.latitude) < 0.0001 AND ABS(c.longitude - NEW.longitude) < 0.0001
      AND NOT (c.google_maps_uri IS NOT NULL AND c.google_maps_uri<>'' AND NEW.google_maps_uri IS NOT NULL AND NEW.google_maps_uri<>'' AND c.google_maps_uri<>NEW.google_maps_uri)
    LIMIT 1;
    IF matched_id IS NOT NULL THEN RAISE EXCEPTION '[중복차단] 불변4 좌표10m 일치 id=%', matched_id; END IF;
  END IF;

  -- 5) 로컬이름 (PID veto 제거)
  IF v_local <> '' THEN
    SELECT c.id INTO matched_id FROM place_seed_raw c
    WHERE c.city_id = NEW.city_id
      AND NOT (c.google_maps_uri IS NOT NULL AND c.google_maps_uri<>'' AND NEW.google_maps_uri IS NOT NULL AND NEW.google_maps_uri<>'' AND c.google_maps_uri<>NEW.google_maps_uri)
      AND v_local IN (LOWER(TRIM(COALESCE(c.name_en,''))), LOWER(TRIM(COALESCE(c.name_local,''))), LOWER(TRIM(COALESCE(c.name_ko,''))))
    LIMIT 1;
    IF matched_id IS NOT NULL THEN RAISE EXCEPTION '[중복차단] 불변5 로컬이름 일치 id=%', matched_id; END IF;
  END IF;

  -- 6·7) 영어명/한국어명 (가변=의심) = 차단 X = '중복의심' 메모 + 통과 (PID veto 제거)
  matched_id := NULL;
  IF v_en <> '' THEN
    SELECT c.id INTO matched_id FROM place_seed_raw c
    WHERE c.city_id = NEW.city_id
      AND NOT (c.google_maps_uri IS NOT NULL AND c.google_maps_uri<>'' AND NEW.google_maps_uri IS NOT NULL AND NEW.google_maps_uri<>'' AND c.google_maps_uri<>NEW.google_maps_uri)
      AND v_en IN (LOWER(TRIM(COALESCE(c.name_en,''))), LOWER(TRIM(COALESCE(c.name_local,''))), LOWER(TRIM(COALESCE(c.name_ko,''))))
    LIMIT 1;
  END IF;
  IF matched_id IS NULL AND v_ko <> '' THEN
    SELECT c.id INTO matched_id FROM place_seed_raw c
    WHERE c.city_id = NEW.city_id
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

-- ── 3) 트리거 바인딩 (= BEFORE INSERT) ──
DROP TRIGGER IF EXISTS place_seed_raw_prevent_dup_trigger ON public.place_seed_raw;
CREATE TRIGGER place_seed_raw_prevent_dup_trigger
  BEFORE INSERT ON public.place_seed_raw
  FOR EACH ROW
  EXECUTE FUNCTION place_seed_raw_prevent_dup();
