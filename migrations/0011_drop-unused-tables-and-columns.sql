-- 2026-10-16 사장님 결정 = 안 쓰는 테이블 8개와 place_seed_raw 안 쓰는 칸 5개 삭제 (shared_html_pages · opening_hours · image_updated_at · merged_into 는 남김)
-- 되돌림 자료 = 삭제 직전 JSON 백업(저장소 밖 tripis-db-backup-2026-10-16)
DROP TABLE IF EXISTS user_activity_logs, crisis_alerts, notifications, voice_configs, push_subscriptions, share_links, reviews, _psr_backup_madrid_20260611;
ALTER TABLE place_seed_raw
  DROP COLUMN IF EXISTS google_rating,
  DROP COLUMN IF EXISTS names_i18n,
  DROP COLUMN IF EXISTS photo_urls,
  DROP COLUMN IF EXISTS place_id,
  DROP COLUMN IF EXISTS vibe_keywords;
