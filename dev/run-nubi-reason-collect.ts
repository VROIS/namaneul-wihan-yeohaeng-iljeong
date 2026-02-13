/**
 * nubiReason 배치 수집 실행 (파리 attraction)
 */
import "dotenv/config";

async function loadApiKeysFromDb(db: any) {
  const { apiKeys } = await import("@shared/schema");
  const keys = await db.select().from(apiKeys);
  for (const key of keys) {
    if (key.keyValue?.trim() && key.isActive) {
      process.env[key.keyName] = key.keyValue;
      if (key.keyName === "GEMINI_API_KEY") {
        process.env.AI_INTEGRATIONS_GEMINI_API_KEY = key.keyValue;
      }
    }
  }
}

async function main() {
  const { db } = await import("../server/db");
  const { cities } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");
  const {
    collectNubiReasonsForCategory,
    getPlaceNamesForCategory,
  } = await import("../server/services/nubi-reason-batch-service");

  if (!db) {
    console.error("DB 연결 없음");
    process.exit(1);
  }

  await loadApiKeysFromDb(db);
  const paris = await db.select().from(cities).where(eq(cities.name, "파리")).then((r) => r[0]);
  if (!paris) {
    console.error("파리 도시 없음");
    process.exit(1);
  }

  const placeNames = await getPlaceNamesForCategory(paris.id, "attraction", 30);
  console.log(`[NubiReason] 파리 attraction ${placeNames.length}곳 수집 시작...`);
  if (placeNames.length === 0) {
    console.log("장소 없음. 시딩 후 재시도.");
    process.exit(0);
  }

  const result = await collectNubiReasonsForCategory(paris.id, paris.name, placeNames);
  console.log("[NubiReason] 완료:", JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
