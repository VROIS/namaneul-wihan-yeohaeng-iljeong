#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public-dist");

const SRC_DIST = path.join(ROOT, "dist");
const SRC_ASSETS = path.join(ROOT, "assets");
const SRC_ADMIN = path.join(ROOT, "worker", "admin", "admin-dashboard.html");
const SRC_PROMO = path.join(ROOT, "worker", "admin", "admin-promo.js");
const SRC_TP_DRIVE = path.join(ROOT, "worker", "lib", "travelpayouts-drive.html");

const EXCLUDE_DIRS = new Set(["test-screenshots"]);
const EXCLUDE_EXTS = new Set([".psd"]);

function copyDir(src, dest, relBase = "") {
  const copied = [];
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      fs.mkdirSync(to, { recursive: true });
      copied.push(...copyDir(from, to, rel));
      continue;
    }
    if (!entry.isFile()) continue;
    if (EXCLUDE_EXTS.has(path.extname(entry.name).toLowerCase())) continue;

    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    copied.push(rel);
  }
  return copied;
}

function listRel(src, relBase = "") {
  const out = [];
  if (!fs.existsSync(src)) return out;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      out.push(...listRel(path.join(src, entry.name), rel));
      continue;
    }
    if (!entry.isFile()) continue;
    if (EXCLUDE_EXTS.has(path.extname(entry.name).toLowerCase())) continue;
    out.push(rel);
  }
  return out;
}

function dirSizeBytes(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSizeBytes(p);
    else if (entry.isFile()) total += fs.statSync(p).size;
  }
  return total;
}

const mb = (b) => `${(b / 1024 / 1024).toFixed(2)} MB`;

for (const [label, p] of [
  ["dist/ (Expo 웹빌드)", SRC_DIST],
  ["assets/ (앱 에셋)", SRC_ASSETS],
  ["worker/admin/admin-dashboard.html", SRC_ADMIN],
  ["worker/admin/admin-promo.js", SRC_PROMO],
]) {
  if (!fs.existsSync(p)) {
    console.error(`[중단] 원본이 없습니다: ${label} -> ${p}`);
    process.exit(1);
  }
}

const distAssetsDir = path.join(SRC_DIST, "assets");
const distAssetsRel = new Set(listRel(distAssetsDir));
const repoAssetsRel = listRel(SRC_ASSETS);
const collisions = repoAssetsRel.filter((r) => distAssetsRel.has(r));

console.log("── 충돌 검사: dist/assets/  vs  assets/ ──");
console.log(
  `  dist/assets 파일 ${distAssetsRel.size}개 / assets 파일 ${repoAssetsRel.length}개 (제외규칙 적용 후)`,
);
if (collisions.length > 0) {
  console.warn(
    `  ⚠ 경고: 같은 경로 파일 ${collisions.length}개 = assets/ 가 dist/assets/ 를 덮어씁니다.`,
  );
  for (const c of collisions) console.warn(`     - assets/${c}`);
} else {
  console.log(
    "  ✅ 충돌 0건 (dist 쪽은 내용해시 파일명, 레포 쪽은 원본 파일명이라 경로가 겹치지 않음)",
  );
}
console.log("");

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const nDist = copyDir(SRC_DIST, OUT).length;
console.log(`1) dist/ -> public-dist/                       ${nDist}개`);

// ⚠️ 수정금지(승인필요) 2026-11-09 사장님 결정 = 앱 웹 화면 head 에 Travelpayouts Drive 1벌(worker/lib/travelpayouts-drive.html = 공개 글 페이지와 같은 파일) (정본 2026-11-09)
const outIndex = path.join(OUT, "index.html");
const tpDrive = fs.readFileSync(SRC_TP_DRIVE, "utf8");
fs.writeFileSync(
  outIndex,
  fs.readFileSync(outIndex, "utf8").replace("</head>", `${tpDrive}</head>`),
);
console.log(`   index.html head <- travelpayouts-drive.html`);

// ⚠️ 수정금지(승인필요) 2026-11-17 사장님 결정 = 홈 index.html 머리말 = 네이버 소유확인 · 미리보기 태그(제목·설명 = app.json web.name·web.description 1벌) · Organization·WebSite·MobileApplication 구조화 데이터 1벌 + #root 정적 소개문(일정 + 영상 · BTS 공연 도시 하루) (정본 §AI 간택 미션)
const { name: HOME_TITLE, description: HOME_DESC } = JSON.parse(
  fs.readFileSync(path.join(ROOT, "app.json"), "utf8"),
).expo.web;
const STORE_URLS = [
  "https://play.google.com/store/apps/details?id=com.sonanie.guide",
  "https://apps.apple.com/kr/app/tripis-bts-%ED%88%AC%EC%96%B4-%EC%8A%A4%ED%8E%98%EC%85%9C/id6760204083",
];
const HOME_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://tripis.app/#organization",
      name: "TRIPIS",
      alternateName: "트리피스",
      url: "https://tripis.app",
      logo: "https://tripis.app/assets/images/tripis-app-icon.png",
      sameAs: [
        ...STORE_URLS,
        "https://www.youtube.com/@tripis_app",
        "https://www.instagram.com/tripis_app/",
        "https://www.threads.com/@tripis_app",
        "https://www.tiktok.com/@tripis_app",
        "https://x.com/tripis_app",
      ],
      disambiguatingDescription:
        "TRIPIS (tripis.app) is a travel itinerary and travel video app. It is not Tripsi or Tripsy and has no relation to them.",
    },
    {
      "@type": "WebSite",
      "@id": "https://tripis.app/#website",
      name: "TRIPIS",
      alternateName: "트리피스",
      url: "https://tripis.app",
      inLanguage: ["en", "ko", "ja", "fr", "zh", "es", "de"],
      publisher: { "@id": "https://tripis.app/#organization" },
    },
    {
      "@type": "MobileApplication",
      name: "TRIPIS",
      url: "https://tripis.app",
      description: HOME_DESC,
      applicationCategory: "TravelApplication",
      operatingSystem: "Android, iOS",
      downloadUrl: STORE_URLS,
      publisher: { "@id": "https://tripis.app/#organization" },
    },
  ],
};
const HOME_HEAD = `<meta name="naver-site-verification" content="ee47d51f00eb5eeb3476c7dfd9ba9220ece4109e">
<link rel="canonical" href="https://tripis.app/">
<meta name="theme-color" content="#4285F4">
<link rel="apple-touch-icon" href="https://tripis.app/assets/images/apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="TRIPIS">
<meta property="og:title" content="${HOME_TITLE}">
<meta property="og:description" content="${HOME_DESC}">
<meta property="og:url" content="https://tripis.app/">
<meta property="og:image" content="https://tripis.app/assets/images/og-tripis.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="TRIPIS: plan the route, AI checks it, a local expert verifies it">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${HOME_TITLE}">
<meta name="twitter:description" content="${HOME_DESC}">
<meta name="twitter:image" content="https://tripis.app/assets/images/og-tripis.jpg">
<script type="application/ld+json">${JSON.stringify(HOME_LD)}</script>
`;
const HOME_ROOT = `<div id="root"><main style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 20px;color:#14202b;line-height:1.6">
<h1>${HOME_TITLE}</h1>
<p>TRIPIS plans your day and turns it into a travel video. It plans your trip day by day: which places to visit, in what order, at what time, how long it takes to get from one stop to the next, and roughly what it costs. An AI can then check your plan, and a local expert can verify it before you go.</p>
<ul>
<li>Plan: choose a city, dates, who you travel with and what you like.</li>
<li>Video: each day of your plan becomes your own short travel video.</li>
<li>BTS concert-city one-day plans: a concert-day plan around the venue in BTS tour cities.</li>
<li>AI check: an AI reads your plan and gives its opinion.</li>
<li>Local expert: a local expert verifies your plan and answers your questions.</li>
</ul>
<p><a href="/trips/en">Ready-made city itineraries</a> · <a href="/about/en">What is TRIPIS?</a></p>
</main></div>`;
fs.writeFileSync(
  outIndex,
  fs
    .readFileSync(outIndex, "utf8")
    .replace("</head>", `${HOME_HEAD}</head>`)
    .replace(`<div id="root"></div>`, HOME_ROOT),
);
console.log(`   index.html head <- 미리보기 태그 · 구조화 데이터 · #root <- 정적 소개문`);

const outAssets = path.join(OUT, "assets");
fs.mkdirSync(outAssets, { recursive: true });
const nAssets = copyDir(SRC_ASSETS, outAssets).length;
console.log(`2) assets/ -> public-dist/assets/ (머지)        ${nAssets}개`);

// ⚠️ 수정금지(승인필요) 2026-11-05 사장님 결정 = 관리자 화면 = worker/admin 1벌(화면 + 홍보 탭 스크립트) (정본 2026-11-05)
const outAdmin = path.join(OUT, "admin");
fs.mkdirSync(outAdmin, { recursive: true });
fs.copyFileSync(SRC_ADMIN, path.join(outAdmin, "index.html"));
fs.copyFileSync(SRC_PROMO, path.join(outAdmin, "promo.js"));
console.log(
  `3) worker/admin -> public-dist/admin/ (index.html · promo.js)  2개`,
);

const allFiles = listRel(OUT);
const bytes = dirSizeBytes(OUT);
let maxFile = { rel: "", size: 0 };
for (const rel of allFiles) {
  const s = fs.statSync(path.join(OUT, rel)).size;
  if (s > maxFile.size) maxFile = { rel, size: s };
}

console.log("");
console.log("── 결과 ──");
console.log(`  총 파일 수 : ${allFiles.length}`);
console.log(`  총 용량    : ${mb(bytes)}`);
console.log(`  최대 파일  : ${maxFile.rel} (${mb(maxFile.size)})`);

const LIMIT_FILE = 25 * 1024 * 1024;
const LIMIT_COUNT = 20000;
if (maxFile.size > LIMIT_FILE) {
  console.error(`  ❌ 파일 크기 한도 초과(25 MiB): ${maxFile.rel}`);
  process.exit(1);
}
if (allFiles.length > LIMIT_COUNT) {
  console.error(`  ❌ 파일 개수 한도 초과(${LIMIT_COUNT}): ${allFiles.length}`);
  process.exit(1);
}
console.log(`  ✅ 한도 통과 (파일당 25 MiB 이하 / 개수 ${LIMIT_COUNT} 이하)`);
