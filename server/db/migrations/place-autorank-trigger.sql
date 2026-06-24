-- ⚠️ 수정금지(승인필요) 2026-06-10 = 사용자 SSOT = place_seed_raw 자동 랭킹 트리거 (= 헌법 §14 랭킹 자동화)
-- = 목적: 쓰기(INSERT/UPDATE/DELETE) 시점에 그 (city_id, seed_category) 의 rank 를
--         RC(google_review_count) DESC NULLS LAST, id 로 즉시 재계산·저장.
--         → "실시간(입력 시 자동 갱신) + 정해진 순서(DB-only 서빙은 저장된 확정 rank 그대로 노출)" 동시 충족.
-- = 이유: PSR 쓰기 루트 ~20개(발굴·fill·메인앱 ag3/route-backfill/city-resolver 등) 누가 써도 rank 자동 정렬.
--         수동 rc-rerank CLI = 더는 불필요(백필 용도로만 잔존). = "건건이 수동 rerank" 안티패턴 제거.
-- = 충돌회피: UNIQUE(city_id, seed_category, rank) → 2단계(임시 음수 = -id → 1..N) = rc-rerank.ts 동일 기법.
--             ⚠️ 단일 UPDATE 는 중간에 rank 중복 = UNIQUE 위반 → 반드시 2단계.
-- = BTS army_zone/merch_store = rank=1 고정 보존 = 제외 (= rc-rerank EXCLUDE 동일).
-- = 재귀방지: 내부 UPDATE 는 rank 만 변경 = 트리거 UPDATE OF 목록(google_review_count, seed_category, city_id) 밖
--             = 재발화 안 됨 (+ pg_trigger_depth() 안전망).
-- = 문지기(place_seed_raw_prevent_dup) = BEFORE INSERT OR UPDATE = rank-UPDATE 도 발화하나 pg_trigger_depth()>1 면제 = 무충돌 (2026-06-24 §20).
-- 적용 = psql $SUPA_URL -f server/db/migrations/place-autorank-trigger.sql

CREATE OR REPLACE FUNCTION public.place_seed_raw_autorank()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
  v_city integer;
  v_cat  text;
BEGIN
  -- 재귀 방지 안전망 (내부 rank-UPDATE 는 UPDATE OF 목록 밖이라 사실상 재발화 없음)
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;

  IF TG_OP = 'DELETE' THEN
    v_city := OLD.city_id; v_cat := OLD.seed_category;
  ELSE
    v_city := NEW.city_id; v_cat := NEW.seed_category;
  END IF;
  IF v_city IS NULL OR v_cat IS NULL THEN RETURN NULL; END IF;

  -- BTS 특수(army_zone/merch_store) = rank=1 고정 = 재랭킹 제외
  IF v_cat IN ('bts_army_zone', 'bts_merch_store') THEN RETURN NULL; END IF;

  -- 1) 임시 음수(-id, 유일)로 비움 = UNIQUE(city,cat,rank) 충돌 회피
  UPDATE place_seed_raw SET rank = -id
  WHERE city_id = v_city AND seed_category = v_cat;

  -- 2) RC DESC NULLS LAST, id 로 1..N 재배치 (= rc-rerank.ts 와 동일 권위 순서)
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY google_review_count DESC NULLS LAST, id) AS rk
    FROM place_seed_raw
    WHERE city_id = v_city AND seed_category = v_cat
  )
  UPDATE place_seed_raw p SET rank = ranked.rk
  FROM ranked WHERE p.id = ranked.id;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS place_seed_raw_autorank_trigger ON place_seed_raw;
CREATE TRIGGER place_seed_raw_autorank_trigger
  AFTER INSERT OR DELETE OR UPDATE OF google_review_count, seed_category, city_id
  ON place_seed_raw
  FOR EACH ROW
  EXECUTE FUNCTION public.place_seed_raw_autorank();
