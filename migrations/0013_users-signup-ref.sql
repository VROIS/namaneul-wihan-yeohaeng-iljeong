-- 2026-10-29 사장님 결정 = 유입 링크 기록 = 가입할 때 처음 들어온 링크의 ref 값(예: tiktok_paris)을 남긴다 (referred_by = 인증창 main/bts 는 그대로)
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_ref varchar(64);
