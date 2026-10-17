-- 2026-10-18 사장님 결정 = best_rank 앞자리에 산출표 순위가 붙어도 자동순위는 뒤 7자리 언어코드의 언어 수로 센다. 라이브 DB 에 그대로 실행(Supabase SQL 편집기).
CREATE OR REPLACE FUNCTION public.place_seed_raw_autorank()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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

  -- 2) 베스트 언어코드(best_rank 의 뒤 7자리 = best_rank % 10000000, 앞자리는 산출표 순위) 의 0 아닌 자릿수 개수(=뽑은 언어 수) 큰 순
  --    → 번호 없는 행(NULL) 은 RC DESC NULLS LAST → id 로 1..N 재배치 (2026-08-27 사장님 확정, 정의 = server/services/shared/best-rank.ts)
  --    (= rc-rerank.ts 권위 순서에 베스트 언어 수 정렬 추가. best_rank NULL 인 행끼리는 옛 RC 순서 그대로. 숫자 크기 정렬 금지.)
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (
      ORDER BY length(replace((best_rank % 10000000)::text, '0', '')) DESC NULLS LAST, google_review_count DESC NULLS LAST, id
    ) AS rk
    FROM place_seed_raw
    WHERE city_id = v_city AND seed_category = v_cat
  )
  UPDATE place_seed_raw p SET rank = ranked.rk
  FROM ranked WHERE p.id = ranked.id;

  RETURN NULL;
END;
$function$;
