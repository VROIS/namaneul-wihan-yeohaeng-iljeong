-- 2026-11-21 사장님 결정 = 거점 깃발 = 사장님이 정한 거점(비어 있어도 거점) · 가장 가까운 거점 판정·통폐합·끌어오기는 이 칸만 본다 (정본 2026-11-21)
ALTER TABLE cities
  ADD COLUMN IF NOT EXISTS is_hub boolean NOT NULL DEFAULT false;
