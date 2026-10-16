-- user_providers: 한 사용자에 여러 provider(구글/카카오/페이스북) 연결
-- 매칭 우선순위: 1) provider 2) provider 없을 때만 birth_date
CREATE TABLE IF NOT EXISTS "user_providers" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "provider_id" text NOT NULL,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "user_providers_provider_provider_id_unique" UNIQUE("provider", "provider_id")
);

CREATE INDEX IF NOT EXISTS "user_providers_user_id_idx" ON "user_providers"("user_id");
CREATE INDEX IF NOT EXISTS "user_providers_provider_provider_id_idx" ON "user_providers"("provider", "provider_id");

-- 기존 users.provider, provider_id 데이터를 user_providers로 이전
INSERT INTO "user_providers" ("user_id", "provider", "provider_id")
SELECT "id", "provider", "provider_id"
FROM "users"
WHERE "provider" IS NOT NULL AND "provider_id" IS NOT NULL
ON CONFLICT ("provider", "provider_id") DO NOTHING;
