-- 2026-10-16 사장님 결정 = 쓰는 칸이 0인 열거형 3개 삭제 (persona_type 은 users 칸이 쓰므로 남김)
-- reviews 테이블 삭제(0011) 뒤 data_source 를 쓰는 칸이 없어졌다.
DROP TYPE IF EXISTS data_source;
DROP TYPE IF EXISTS place_type;
DROP TYPE IF EXISTS verification_status;
