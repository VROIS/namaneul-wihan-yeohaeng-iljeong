-- 1 row × 1 primary category × 1 rank + multi-tag (사용자 2026-04-27 v4 SSOT)
-- DELETE 7 vibe 카테고리 row (bts_venue/army/merch 보존)
DELETE FROM place_seed_raw
WHERE city_id=101 AND collection_phase='bts2026'
  AND seed_category IN ('attraction','restaurant','healing','adventure','hotspot','heritage','shopping');