-- 2026-11-15 사장님 결정 = 도시 카드 노출 순서 = 나라 묶음(지정 순서 → 나라 인구) → 묶음 안 도시(지정 순서 → 도시 인구) · 나라 표는 따로 만들지 않는다 (정본 2026-11-15)
ALTER TABLE cities
  ADD COLUMN IF NOT EXISTS population integer,
  ADD COLUMN IF NOT EXISTS country_population integer,
  ADD COLUMN IF NOT EXISTS country_order integer,
  ADD COLUMN IF NOT EXISTS city_order integer;
