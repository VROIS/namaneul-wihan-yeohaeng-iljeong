/**
 * R2 연결·업로드·공개URL 실증 도구 (§22 "입증" 단계 전용, 상시 재사용 — 일회성 아님)
 * 실행: npx tsx scripts/r2-smoke-test.ts
 * = Supabase Storage 의 실제 영상 1개 + 이미지 1개를 그대로 내려받아
 *   server/services/shared/r2-client.ts 로 R2(tripis-videos)에 업로드 →
 *   R2 리스트 조회로 실제 저장됐는지 확인 →
 *   공개 URL(R2_PUBLIC_URL)로 실제 HTTP GET 하여 앱이 불러 보여줄 수 있는 경로까지 실증.
 * = 테스트 경로 = `_r2-smoke-test/` 프리픽스(운영 파일과 절대 안 섞임, 재실행 시 덮어쓰기).
 */
import "dotenv/config";
import {
  uploadToR2,
  listR2,
  getR2PublicUrl,
} from "../server/services/shared/r2-client";

const SUPA_URL =
  process.env.SUPABASE_URL || "https://wxebceflvuythuodemro.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type SupaEntry = {
  name: string;
  id: string | null;
  metadata: { size?: number; mimetype?: string } | null;
};

async function listSupabase(bucket: string, prefix = ""): Promise<SupaEntry[]> {
  const r = await fetch(`${SUPA_URL}/storage/v1/object/list/${bucket}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY as string,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefix, limit: 20 }),
  });
  if (!r.ok) throw new Error(`[list] ${bucket}/${prefix} 실패: ${r.status}`);
  return r.json();
}

/** 버킷에서 실제 파일 1개를 찾아 (경로, 크기) 반환 — 폴더면 재귀 진입 */
async function findOneFile(
  bucket: string,
  prefix = "",
): Promise<{ path: string; size: number }> {
  const entries = await listSupabase(bucket, prefix);
  for (const e of entries) {
    if (e.metadata && typeof e.metadata.size === "number") {
      return { path: `${prefix}${e.name}`, size: e.metadata.size };
    }
  }
  for (const e of entries) {
    if (!e.metadata) {
      return findOneFile(bucket, `${prefix}${e.name}/`);
    }
  }
  throw new Error(`[findOneFile] ${bucket}/${prefix} 안에 파일 없음`);
}

async function downloadSupabase(bucket: string, path: string): Promise<Buffer> {
  const r = await fetch(`${SUPA_URL}/storage/v1/object/${bucket}/${path}`, {
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY as string,
    },
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new Error(`[download] ${bucket}/${path} 실패: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function main() {
  if (!SERVICE_KEY)
    throw new Error("SUPABASE_SERVICE_ROLE_KEY 없음(.env 확인)");

  console.log("[1/4] Supabase 에서 실제 영상 1개 탐색(itinerary-videos)...");
  const video = await findOneFile("itinerary-videos");
  console.log(
    `  → ${video.path} (${(video.size / 1024 / 1024).toFixed(2)} MB)`,
  );

  console.log("[2/4] Supabase 에서 실제 이미지 1개 탐색(place-images)...");
  const image = await findOneFile("place-images");
  console.log(`  → ${image.path} (${(image.size / 1024).toFixed(0)} KB)`);

  console.log("[3/5] 두 파일 다운로드 후 R2 로 업로드...");
  const videoBuf = await downloadSupabase("itinerary-videos", video.path);
  const videoKey = `_r2-smoke-test/${video.path}`;
  const videoResult = await uploadToR2(videoKey, videoBuf, "video/mp4");
  console.log(
    `  ✅ 영상 업로드: ${videoResult.key} (${videoResult.size} bytes)`,
  );

  const imageBuf = await downloadSupabase("place-images", image.path);
  const ext = image.path.split(".").pop()?.toLowerCase();
  const contentType =
    ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  const imageKey = `_r2-smoke-test/${image.path}`;
  const imageResult = await uploadToR2(imageKey, imageBuf, contentType);
  console.log(
    `  ✅ 이미지 업로드: ${imageResult.key} (${imageResult.size} bytes)`,
  );

  console.log("[4/5] R2 리스트 재조회로 실제 저장 확인...");
  const listed = await listR2("_r2-smoke-test/");
  console.log("  R2 에 실제 저장된 파일:");
  for (const item of listed) {
    console.log(`    - ${item.key}  (${(item.size / 1024).toFixed(1)} KB)`);
  }
  const videoStoredOk = listed.some(
    (i) => i.key === videoKey && i.size === videoBuf.length,
  );
  const imageStoredOk = listed.some(
    (i) => i.key === imageKey && i.size === imageBuf.length,
  );

  console.log(
    "[5/5] 공개 URL로 실제 HTTP GET → 앱이 불러 보여줄 수 있는지 확인...",
  );
  const videoUrl = getR2PublicUrl(videoKey);
  const imageUrl = getR2PublicUrl(imageKey);
  const videoFetch = await fetch(videoUrl);
  const imageFetch = await fetch(imageUrl);
  const videoFetchOk =
    videoFetch.ok &&
    Number(videoFetch.headers.get("content-length")) === videoBuf.length;
  const imageFetchOk =
    imageFetch.ok &&
    Number(imageFetch.headers.get("content-length")) === imageBuf.length;
  console.log(`  영상 URL: ${videoUrl}`);
  console.log(
    `    → HTTP ${videoFetch.status}, content-length=${videoFetch.headers.get("content-length")}`,
  );
  console.log(`  이미지 URL: ${imageUrl}`);
  console.log(
    `    → HTTP ${imageFetch.status}, content-length=${imageFetch.headers.get("content-length")}`,
  );

  console.log("\n=== 결과 ===");
  console.log(
    `영상 저장 실증: ${videoStoredOk ? "✅ 통과" : "❌ 실패"} / 공개URL 열람: ${videoFetchOk ? "✅ 통과" : "❌ 실패"}`,
  );
  console.log(
    `이미지 저장 실증: ${imageStoredOk ? "✅ 통과" : "❌ 실패"} / 공개URL 열람: ${imageFetchOk ? "✅ 통과" : "❌ 실패"}`,
  );
  if (!videoStoredOk || !imageStoredOk || !videoFetchOk || !imageFetchOk)
    process.exit(1);
}

main().catch((e) => {
  console.error("❌ 실패:", e.message);
  process.exit(1);
});
