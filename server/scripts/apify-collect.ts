/**
 * Apify 자동 수집 스크립트
 * BTS 34개 도시 - 숏폼 영상 우선 (틱톡 > 인스타 릴스 > 인스타 게시글)
 *
 * 무료 $5 내에서 숏폼 영상 최대한 수집 후 정지
 * 결과 좋으면 유료 전환 후 게시글/이미지까지 확장
 *
 * 사용법:
 *   APIFY_TOKEN=your_token npx tsx server/scripts/apify-collect.ts
 */

import * as fs from "fs";
import * as path from "path";

const APIFY_TOKEN = process.env.APIFY_TOKEN;
if (!APIFY_TOKEN) {
  console.error("APIFY_TOKEN 환경변수를 설정하세요");
  console.error("사용법: APIFY_TOKEN=apify_api_xxx npx tsx server/scripts/apify-collect.ts");
  process.exit(1);
}

// BTS 34개 도시 - 도시당 태그 1개 (비용 절감, 숏폼 우선)
const BTS_CITIES = [
  { name: "Goyang", tag: "goyang" },
  { name: "Tokyo", tag: "tokyofood" },
  { name: "Tampa", tag: "tampafood" },
  { name: "El Paso", tag: "elpasofood" },
  { name: "Mexico City", tag: "mexicocityfood" },
  { name: "Stanford", tag: "bayareafood" },
  { name: "Las Vegas", tag: "vegasfood" },
  { name: "Busan", tag: "busanfood" },
  { name: "Madrid", tag: "madridfood" },
  { name: "Brussels", tag: "brusselsfood" },
  { name: "London", tag: "londonfood" },
  { name: "Munich", tag: "munichfood" },
  { name: "Paris", tag: "parisfood" },
  { name: "East Rutherford", tag: "metlifestadium" },
  { name: "Foxborough", tag: "gillettestadium" },
  { name: "Baltimore", tag: "baltimorefood" },
  { name: "Arlington", tag: "arlingtontx" },
  { name: "Toronto", tag: "torontofood" },
  { name: "Chicago", tag: "chicagofood" },
  { name: "Los Angeles", tag: "lafood" },
  { name: "Bogota", tag: "bogotafood" },
  { name: "Lima", tag: "limafood" },
  { name: "Santiago", tag: "santiagofood" },
  { name: "Buenos Aires", tag: "buenosairesfood" },
  { name: "Sao Paulo", tag: "saopaulofood" },
  { name: "Kaohsiung", tag: "kaohsiungfood" },
  { name: "Bangkok", tag: "bangkokfood" },
  { name: "Kuala Lumpur", tag: "klfood" },
  { name: "Singapore", tag: "singaporefood" },
  { name: "Jakarta", tag: "jakartafood" },
  { name: "Melbourne", tag: "melbournefood" },
  { name: "Sydney", tag: "sydneyfood" },
  { name: "Hong Kong", tag: "hongkongfood" },
  { name: "Manila", tag: "manilafood" },
];

const APIFY_BASE = "https://api.apify.com/v2";

interface ApifyRun {
  id: string;
  status: string;
  defaultDatasetId: string;
}

async function checkBalance(): Promise<number> {
  const res = await fetch(`${APIFY_BASE}/users/me/usage?token=${APIFY_TOKEN}`);
  if (!res.ok) return -1;
  const json: any = await res.json();
  // Free tier = $5 total
  const used = json.data?.totalUsageUsd ?? 0;
  const remaining = 5.0 - used;
  console.log(`[Budget] 사용: $${used.toFixed(2)} / 잔여: ~$${remaining.toFixed(2)}`);
  return remaining;
}

async function startActor(actorId: string, input: Record<string, any>): Promise<ApifyRun> {
  const res = await fetch(
    `${APIFY_BASE}/acts/${actorId}/runs?token=${APIFY_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );
  if (!res.ok) throw new Error(`Actor start failed: ${res.status} ${await res.text()}`);
  const json: any = await res.json();
  return json.data;
}

async function waitForRun(runId: string): Promise<ApifyRun> {
  const timeout = 10 * 60 * 1000;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const res = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${APIFY_TOKEN}`);
    const json: any = await res.json();
    const status = json.data.status;
    if (status === "SUCCEEDED") return json.data;
    if (status === "FAILED" || status === "ABORTED") throw new Error(`Run ${runId} ${status}`);
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`Run ${runId} timed out`);
}

async function getDataset(datasetId: string): Promise<any[]> {
  const res = await fetch(
    `${APIFY_BASE}/datasets/${datasetId}/items?token=${APIFY_TOKEN}&format=json`
  );
  return res.json() as Promise<any[]>;
}

function saveJSON(filename: string, data: any[]) {
  const dir = path.join(__dirname, "..", "data");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  console.log(`Saved: ${filepath} (${data.length} items)`);
}

// =====================================================
// Phase 1: TikTok (최우선, ~$2-3)
// =====================================================
async function phase1_tiktok() {
  console.log("\n[Phase 1] TikTok 영상 수집 (34 도시 x 20건)");
  const allTags = BTS_CITIES.map((c) => c.tag);
  console.log(`해시태그 ${allTags.length}개`);

  const run = await startActor("clockworks~tiktok-scraper", {
    hashtags: allTags,
    resultsPerPage: 20,
  });
  console.log(`Run: ${run.id}`);

  const completed = await waitForRun(run.id);
  const data = await getDataset(completed.defaultDatasetId);
  console.log(`TikTok 완료: ${data.length}건`);

  const ts = new Date().toISOString().slice(0, 10);
  saveJSON(`tiktok_bts34_${ts}.json`, data);
  return data.length;
}

// =====================================================
// Phase 2: Instagram Reels (2순위, ~$1-2)
// =====================================================
async function phase2_reels() {
  console.log("\n[Phase 2] Instagram Reels 수집 (34 도시)");
  const urls = BTS_CITIES.map(
    (c) => `https://www.instagram.com/explore/tags/${c.tag}/`
  );

  const run = await startActor("apify~instagram-scraper", {
    directUrls: urls,
    resultsType: "posts",
    resultsLimit: 20,
  });
  console.log(`Run: ${run.id}`);

  const completed = await waitForRun(run.id);
  const data = await getDataset(completed.defaultDatasetId);

  // 릴스/영상 분리
  const reels = data.filter(
    (p: any) =>
      (p.url || "").includes("/reel/") ||
      p.productType === "clips" ||
      p.videoUrl
  );
  const posts = data.filter(
    (p: any) =>
      !(p.url || "").includes("/reel/") &&
      p.productType !== "clips" &&
      !p.videoUrl
  );

  const ts = new Date().toISOString().slice(0, 10);
  saveJSON(`instagram_reels_bts34_${ts}.json`, reels);
  saveJSON(`instagram_posts_bts34_${ts}.json`, posts);

  console.log(`Instagram 릴스: ${reels.length}건 / 게시글: ${posts.length}건`);
  return { reels: reels.length, posts: posts.length };
}

// =====================================================
// Phase 3: Instagram 게시글 추가 (유료 전환 후)
// =====================================================
async function phase3_posts() {
  console.log("\n[Phase 3] Instagram 게시글+이미지 추가 수집");
  console.log("-- 유료 전환 후 실행 권장 --");
  // 태그 2개로 확장
  const urls = BTS_CITIES.flatMap((c) => [
    `https://www.instagram.com/explore/tags/${c.tag}/`,
    `https://www.instagram.com/explore/tags/${c.tag.replace("food", "travel")}/`,
  ]);

  const run = await startActor("apify~instagram-scraper", {
    directUrls: urls,
    resultsType: "posts",
    resultsLimit: 50,
  });
  console.log(`Run: ${run.id}`);

  const completed = await waitForRun(run.id);
  const data = await getDataset(completed.defaultDatasetId);

  const ts = new Date().toISOString().slice(0, 10);
  saveJSON(`instagram_full_bts34_${ts}.json`, data);
  console.log(`Instagram 전체: ${data.length}건`);
  return data.length;
}

// =====================================================
// Main
// =====================================================
async function main() {
  console.log("===========================================");
  console.log(" Apify BTS 34 도시 - 숏폼 영상 우선 수집");
  console.log(" 우선순위: TikTok > Reels > 게시글");
  console.log("===========================================");

  await checkBalance();

  const results = { tiktok: 0, reels: 0, posts: 0 };

  // Phase 1: TikTok (무조건 실행)
  try {
    results.tiktok = await phase1_tiktok();
  } catch (e: any) {
    console.error("TikTok 실패:", e.message);
  }

  await checkBalance();

  // Phase 2: Instagram Reels (잔여 예산 있으면)
  try {
    const r = await phase2_reels();
    results.reels = r.reels;
    results.posts = r.posts;
  } catch (e: any) {
    console.error("Instagram 실패:", e.message);
    if (e.message.includes("402") || e.message.includes("limit")) {
      console.log("\n*** 무료 크레딧 소진 - Phase 2 스킵 ***");
      console.log("*** 유료 전환 후 다시 실행하세요 ***");
    }
  }

  // Phase 3은 주석 처리 (유료 전환 후 수동 활성화)
  // await phase3_posts();

  console.log("\n===========================================");
  console.log(" 수집 결과");
  console.log("===========================================");
  console.log(`[1순위] TikTok 영상:    ${results.tiktok}건`);
  console.log(`[2순위] Instagram 릴스: ${results.reels}건`);
  console.log(`[보너스] Instagram 게시글: ${results.posts}건`);
  console.log(`합계: ${results.tiktok + results.reels + results.posts}건`);

  if (results.tiktok + results.reels > 0) {
    console.log("\n다음 단계: npx tsx server/scripts/apify-import.ts");
  }

  await checkBalance();
}

main().catch(console.error);
