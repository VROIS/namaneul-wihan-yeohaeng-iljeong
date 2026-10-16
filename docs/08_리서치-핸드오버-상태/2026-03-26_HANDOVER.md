# Handover: Unified ID & Master DB Consolidation

## 1. Work Completed
- **Unified ID (111R1)**: Logic implemented in `scripts/sync-master-place-seed.ts`. Successfully assigned to all 5,250 rows in `place_seed_raw`.
- **Instagram Priority Imaging**: Logic implemented to fetch the best image from `instagram_photos` (by like count) -> `celebrity_place_evidence` -> `place_images`.
- **Matching Logic**: Improved using name normalization (removes spaces/lowercase) and alias matching.

## 2. Current State
- **Database Schema**: `place_seed_raw` now has `unified_id`, `best_image_url`, `celeb_mention`, `naver_blog_count`, and `vibe_keywords`.
- **Data Gap**: Only ~200 places have full metadata. This is because the source `places` table only has 1,737 entries, while `place_seed_raw` has 5,250. 
- **Verification**: `scripts/report-consolidation.ts` shows the current integration status.

## 3. Pending Tasks for Next Assistant
- **Missing Data Collection**: The primary bottleneck is the ~3,500 places in `place_seed_raw` that don't exist in `places`. You need to run the crawler/Google Places API to fetch details for these places and save them to `places` (and related tables).
- **Periodic Sync**: Once data is collected, re-run `npx tsx scripts/sync-master-place-seed.ts` to update the master warehouse.
- **Itinerary Engine Integration**: Update `server/services/itinerary-generator.ts` to use `place_seed_raw` as the primary data source for UI-ready data.

## 4. Key Files
- `shared/schema.ts`: DB schema.
- `scripts/sync-master-place-seed.ts`: The main migration/sync engine.
- `scripts/report-consolidation.ts`: Verification tool.
