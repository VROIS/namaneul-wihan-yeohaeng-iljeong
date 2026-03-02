# AGENTS.md

## Cursor Cloud specific instructions

### Project overview
NUBI (VibeTrip) — Korean-targeted European travel itinerary generator. Express.js backend + React Native Expo frontend, Supabase PostgreSQL (remote), Gemini AI.

### Running services
- **Dev server**: `npm run dev` (runs `tsx server/index.ts` on port 8082)
- **Server build**: `npm run server:build` (esbuild → `server_dist/index.js`)
- **Frontend build**: `npx expo export --platform web` (→ `dist/`)
- **Full build**: `npm run build` (server + frontend)

### Lint / Type check / Format
- `npm run lint` — ESLint via Expo (errors in `_agent/skills/` are pre-existing, not part of main app)
- `npm run check:types` — TypeScript strict check (`tsc --noEmit`); pre-existing `db` null-check errors in `server/storage.ts`
- `npm run check:format` / `npm run format` — Prettier

### Key gotchas
- **No local database**: The app uses Supabase PostgreSQL via `DATABASE_URL`. Without it, the server starts but DB features are disabled (graceful degradation).
- **API keys loaded from DB**: At startup, the server loads API keys from the `api_keys` table in Supabase. Environment variables serve as fallback.
- **Port**: Dev server defaults to port 8082 (set via `PORT` env var).
- **Expo web build must exist**: The server serves the frontend from `dist/`. Run `npx expo export --platform web` if `dist/` is missing.
- **No automated test suite**: The project has no unit/integration test framework configured. Validation is done via lint, type-check, and manual testing against the deployed instance.
- **Workspace rules prohibit modifying core files** (see `.cursorrules`): `shared/schema.ts`, `server/db.ts`, `server/index.ts`, and the scoring engine files require explicit user permission before editing.

### Required secrets (for full functionality)
See `.env.example` for the complete list. The three critical ones:
- `DATABASE_URL` — Supabase PostgreSQL connection string
- `GEMINI_API_KEY` — Google Gemini AI (itinerary generation + crawlers)
- `GOOGLE_MAPS_API_KEY` — Google Places/Routes API
