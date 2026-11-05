-- 2026-11-05 사장님 결정 = 관리자 "홍보" 탭 = 공식 채널 게시물 1줄씩(promo_posts) + 숫자 기록 시각별(promo_stats) · 유튜브 = 서버 1시간 자동 · 나머지 = 어사이드 입력 (정본 2026-11-05)
CREATE TABLE IF NOT EXISTS promo_posts (
  id serial PRIMARY KEY,
  episode text NOT NULL,
  track text NOT NULL,
  channel text NOT NULL,
  url text NOT NULL UNIQUE,
  posted_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS promo_stats (
  id serial PRIMARY KEY,
  post_id integer NOT NULL REFERENCES promo_posts(id) ON DELETE CASCADE,
  captured_at timestamptz NOT NULL DEFAULT now(),
  views integer,
  likes integer,
  comments integer
);

CREATE INDEX IF NOT EXISTS promo_stats_post_time_idx ON promo_stats (post_id, captured_at);
