-- 2026-07-24 사장님 승인 = 일별 [바로 예약하기] = expert_inquiries 통합(별도 테이블 금지 §0)
-- kind = 'expert'(검증 문의) | 'booking'(드라이빙 가이드 예약 요청) / day_number = booking 전용 일차
ALTER TABLE expert_inquiries ADD COLUMN IF NOT EXISTS kind varchar NOT NULL DEFAULT 'expert';
ALTER TABLE expert_inquiries ADD COLUMN IF NOT EXISTS day_number integer;
