-- ⚠️ 2026-07-07 사장님 승인 = raw-responses 버킷 ANON 쓰기 정책 (운영 raw 증발 근본해결)
-- 근본: 운영은 SUPABASE_ANON_KEY 만 있음(api_keys 테이블, SERVICE_ROLE 없음). 부팅 로더(server/index.ts:299)가 api_keys→process.env 주입.
--   save-collected-raw.ts / save-raw.ts 가 ANON 폴백으로 raw-responses PUT → 이 버킷엔 ANON 정책이 없어 403(RLS 거부) → 무성 증발(§18 위반).
--   place-images 버킷은 anon_insert/select/update 정책이 있어 성공(cron·여정생성 이미지). = 그 3정책을 raw-responses 에 동일 복제(§16 재발명0).
-- 실증(2026-07-07): 적용 前 ANON PUT=403 → 적용 後=200(Key 반환). 라이브 적용 완료 = 이 파일은 레포 동기화(§19 DB↔레포 최신 1벌).
-- 라이브에 이미 존재하면 재적용 시 에러 = IF NOT EXISTS 가드(PG16+) 또는 DROP 후 재생성. 여기선 명시적 정의(라이브=이 정의와 동일).

-- INSERT (신규 raw 저장)
DROP POLICY IF EXISTS anon_insert_raw_responses ON storage.objects;
CREATE POLICY anon_insert_raw_responses ON storage.objects
  FOR INSERT TO anon WITH CHECK (bucket_id = 'raw-responses');

-- SELECT (서버가 저장 raw 재조회 = 버전순번 판정 등)
DROP POLICY IF EXISTS anon_select_raw_responses ON storage.objects;
CREATE POLICY anon_select_raw_responses ON storage.objects
  FOR SELECT TO anon USING (bucket_id = 'raw-responses');

-- UPDATE (x-upsert 덮어쓰기 = 같은 날 같은 tag 동일내용)
DROP POLICY IF EXISTS anon_update_raw_responses ON storage.objects;
CREATE POLICY anon_update_raw_responses ON storage.objects
  FOR UPDATE TO anon USING (bucket_id = 'raw-responses') WITH CHECK (bucket_id = 'raw-responses');

-- 주의: DELETE 정책은 의도적으로 미추가(raw=자산=삭제 방지 §18). 정리는 SERVICE_ROLE(관리자)로만.
