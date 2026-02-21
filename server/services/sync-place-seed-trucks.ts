/**
 * DB 대통합 마스터계획 Step 5: 물류 트럭 스크립트 실행
 * sync-master-place-seed (1차), sync-prices-to-seed (2차)를 스케줄러에서 호출
 */
import { spawn } from "child_process";
import path from "path";

function runScript(scriptName: string): Promise<{ success: boolean; itemsProcessed: number; errors: string[] }> {
  return new Promise((resolve) => {
    const scriptPath = path.join(process.cwd(), "scripts", scriptName);
    const proc = spawn("npx", ["tsx", scriptPath], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (d) => { stdout += d.toString(); });
    proc.stderr?.on("data", (d) => { stderr += d.toString(); });

    proc.on("close", (code) => {
      if (code === 0) {
        const match = stdout.match(/총 (\d+)건/);
        const itemsProcessed = match ? parseInt(match[1], 10) : 0;
        resolve({ success: true, itemsProcessed, errors: [] });
      } else {
        resolve({
          success: false,
          itemsProcessed: 0,
          errors: [stderr || `Exit code ${code}`],
        });
      }
    });

    proc.on("error", (err) => {
      resolve({ success: false, itemsProcessed: 0, errors: [err.message] });
    });
  });
}

/** 1차 물류 트럭: 인스타 이미지·메타데이터 → place_seed_raw */
export async function runSyncMasterPlaceSeed(): Promise<{
  success: boolean;
  itemsProcessed: number;
  errors: string[];
}> {
  return runScript("sync-master-place-seed.ts");
}

/** 2차 물류 트럭: place_prices → place_seed_raw 가격 빈칸 땜빵 (place-linker 매칭) */
export async function runSyncPricesToSeed(): Promise<{
  success: boolean;
  itemsProcessed: number;
  errors: string[];
}> {
  try {
    const { runSyncPricesToSeed: run } = await import("./sync-prices-to-seed-service");
    const r = await run();
    console.log(`[SyncPrices] 가격 ${r.totalUpdated}건, place_id 신규매칭 ${r.placeIdMatched}건, 미매칭 ${r.notFound}건`);
    return { success: true, itemsProcessed: r.totalUpdated, errors: [] };
  } catch (e: any) {
    return { success: false, itemsProcessed: 0, errors: [e?.message || String(e)] };
  }
}

/** 3차 대통합: place_id 전건 매칭 + 이미지·가격·블로그·셀럽 일괄 채우기 */
export async function runSyncConsolidation(): Promise<{
  success: boolean;
  itemsProcessed: number;
  errors: string[];
}> {
  try {
    const { runConsolidation } = await import("./sync-consolidation-service");
    const r = await runConsolidation();
    const total = r.placeIdMatched + r.imagesUpdated + r.pricesUpdated + r.blogCountsUpdated + r.celebUpdated + r.vibeUpdated + r.nubiReasonUpdated;
    console.log(`[Consolidation] 총 ${total}건 업데이트`);
    return { success: true, itemsProcessed: total, errors: r.errors };
  } catch (e: any) {
    return { success: false, itemsProcessed: 0, errors: [e?.message || String(e)] };
  }
}

/** 4차: googlePlaceId 백필 (일 100건, Text Search API) */
export async function runBackfillGooglePlaceId(): Promise<{
  success: boolean;
  itemsProcessed: number;
  errors: string[];
}> {
  try {
    const { runGooglePlaceIdBackfill } = await import("./sync-google-place-id-service");
    const r = await runGooglePlaceIdBackfill();
    console.log(`[Backfill] ${r.cityProcessed}(${r.phase}): googlePlaceId ${r.googlePlaceIdSet}건, place_id ${r.placeIdLinked}건, API ${r.totalApiCalls}회`);
    return { success: true, itemsProcessed: r.googlePlaceIdSet, errors: r.errors };
  } catch (e: any) {
    return { success: false, itemsProcessed: 0, errors: [e?.message || String(e)] };
  }
}
