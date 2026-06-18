-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-06-18_apipass-issue-key.sql
-- ⚠️ 라이브 적용됨 (2026-06-18 사장님 "설치해" 승인 후 apply_migration 실행). 레포 SQL = 라이브 byte 정합(§19).
-- ═══════════════════════════════════════════════════════════════════════════
-- 【목적】 출입증(${API_PASS}) 검문 후 외부호출 API 키 발급 = 단일 관문 (= 사장님 SSOT 2026-06-18).
--   = 표준 프롬프트 통과한 호출만 출입증(도시·행·날짜)을 갖춤 -> 정식이면 키 반환 -> AI 임의호출 차단.
--   = SECURITY DEFINER = 키 원천 api_keys 직독 없이 이 함수만 키를 꺼내줌 (= 외부 리서치 확정 = 트리거 불가, 함수가 답).
--
-- 【라이브 DB 실측 (2026-06-18, MCP SELECT)】
--   · api_keys = GEMINI_API_KEY(활성) · GOOGLE_MAPS_API_KEY(활성). 소유자 postgres.
--   · cities id=19(파리) 존재 / place_seed_raw city_id=19 = 770행.
--   · issue_api% 함수 = 0 (= 깨끗 = 신규 생성).
--
-- 【검문 = 출입증 3요소 = 다 "있나/없나"(true/false) (= 사장님 SSOT 2026-06-18)】
--   p_key_name    줄 키 이름 (= api_keys.key_name). 미존재 = 자동 차단. 키 종류 무제한(구글맵·검색·영상 등).
--   p_input_date  'YYYY-MM-DD' 형식 (= 호출 시점 날짜). 형식만 검사.
--   p_city_id     도시 = 있음(>0=cities 검증) / 없음(NULL=완전 신규 도시 면제) = 행과 동일 판별.
--   p_has_row     행 = 있음(채움=그 도시 행 확인) / 없음(발굴 면제).
--   = 통과 -> key_value 반환 / 미달 -> RAISE EXCEPTION (= 키 미발급 = 외부호출 물리 불가)
--
-- 【apply (= 사장님 검수 통과 후에만)】 Supabase apply_migration 또는 psql -f.
--
-- 【롤백】 DROP FUNCTION IF EXISTS public.issue_api_key(text, integer, text, boolean);
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.issue_api_key(
  p_key_name   text,        -- 줄 키 이름 (= api_keys.key_name)
  p_city_id    integer,     -- 도시 id = 있음(>0) / 없음(NULL=완전 신규)
  p_input_date text,
  p_has_row    boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_key_value text;
  v_exists    boolean;
BEGIN
  -- 1) 날짜 형식 YYYY-MM-DD
  IF p_input_date IS NULL OR p_input_date !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION '[출입증 차단] 날짜 형식 오류(''%'' != YYYY-MM-DD)', p_input_date
      USING ERRCODE = 'check_violation';
  END IF;

  -- 2) 도시 있음(>0) -> cities 검증 / 없음(NULL/0=완전 신규) -> 면제
  IF p_city_id IS NOT NULL AND p_city_id > 0 THEN
    SELECT EXISTS(SELECT 1 FROM public.cities WHERE id = p_city_id) INTO v_exists;
    IF NOT v_exists THEN
      RAISE EXCEPTION '[출입증 차단] 도시id=% 가 cities 에 없음(가짜 도시)', p_city_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  -- 3) 행 있음(채움) + 도시 있음 -> 그 도시 행 확인 / 없음(발굴·신규도시) -> 면제
  IF p_has_row AND p_city_id IS NOT NULL AND p_city_id > 0 THEN
    SELECT EXISTS(SELECT 1 FROM public.place_seed_raw WHERE city_id = p_city_id) INTO v_exists;
    IF NOT v_exists THEN
      RAISE EXCEPTION '[출입증 차단] 채움인데 도시id=% 에 행 없음', p_city_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  -- 4) 검문 통과 = api_keys 단일 원천에서 키 발급
  SELECT key_value INTO v_key_value
  FROM public.api_keys
  WHERE key_name = p_key_name AND is_active = true
  LIMIT 1;
  IF v_key_value IS NULL OR v_key_value = '' THEN
    RAISE EXCEPTION '[출입증] 키 ''%'' 미존재/비활성 = api_keys DB 확인', p_key_name
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN v_key_value;
END;
$function$;

COMMENT ON FUNCTION public.issue_api_key(text, integer, text, boolean) IS
  '출입증(${API_PASS}) 검문 후 외부호출 키 발급 단일 관문 = SECURITY DEFINER. 사장님 SSOT 2026-06-18.';

-- CREATE 직후 PUBLIC 자동 EXECUTE 회수 (= 통제). app role 분리는 별도 단계(미실행).
REVOKE EXECUTE ON FUNCTION public.issue_api_key(text, integer, text, boolean) FROM PUBLIC;

-- 【롤백】 DROP FUNCTION IF EXISTS public.issue_api_key(text, integer, text, boolean);
