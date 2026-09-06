#!/usr/bin/env node
// Workers Assets 업로드용 public-dist/ 조립 (2026-09-06)
//
// 왜 조립이 필요한가 = Workers Assets 는 디렉터리 1개만 받는다.
//   근거: skills/cloudflare/references/static-assets/configuration.md:36
//        "directory (string, required): Path to assets folder"
//   그런데 우리는 서빙해야 할 원본이 3곳이다.
//     1) dist/                          <- Expo 웹빌드 (server/index.ts:210-222 의 express.static + GET *)
//     2) assets/                        <- 캐릭터·차량·폰트 (server/index.ts:236 의 app.use("/assets", ...))
//     3) server/templates/admin-dashboard.html <- 관리자 (server/admin/dashboard-routes.ts:36-47)
//   => 셋을 public-dist/ 한 곳으로 합친다. 원본 3곳은 읽기만 하고 절대 수정하지 않는다.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public-dist");

const SRC_DIST = path.join(ROOT, "dist");
const SRC_ASSETS = path.join(ROOT, "assets");
const SRC_ADMIN = path.join(ROOT, "server", "templates", "admin-dashboard.html");

// 제외 목록 = 앱 구동과 무관한 개발 산출물.
//   assets/test-screenshots (122개) = Playwright/DevTools 실증 캡처. 루트 .gitignore:111 에서
//   이미 제외 대상으로 확정된 폴더 = 운영 서빙 대상이 아님.
//   .assetsignore 대신 "복사 단계에서 제외"를 택한 근거:
//     - .assetsignore 는 업로드 시점 필터일 뿐(configuration.md:107-118), 파일은 이미 public-dist 에 복사된 뒤다.
//       즉 로컬 디스크에 80MB 중 불필요분이 그대로 남고 조립 시간도 그만큼 든다.
//     - 여기서 아예 안 복사하면 public-dist 자체가 곧 업로드 대상 = 상태 1벌(§0). 두 군데(스크립트+ignore파일)에
//       같은 제외 규칙이 공존하지 않는다.
//   결론: .assetsignore 파일은 만들지 않는다.
const EXCLUDE_DIRS = new Set(["test-screenshots"]);
// .psd = 포토샵 원본(2boo_map.psd). 브라우저가 못 읽는 소스파일 = 서빙 대상 아님.
const EXCLUDE_EXTS = new Set([".psd"]);

/** 디렉터리를 재귀 복사한다. 복사한 파일의 상대경로 목록을 돌려준다. */
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

/** 제외 규칙을 적용한 상태로 상대경로 목록만 뽑는다(복사 전 충돌 검사용). */
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

// ── 0. 원본 존재 확인 ────────────────────────────────────────────────
for (const [label, p] of [
  ["dist/ (Expo 웹빌드)", SRC_DIST],
  ["assets/ (앱 에셋)", SRC_ASSETS],
  ["server/templates/admin-dashboard.html", SRC_ADMIN],
]) {
  if (!fs.existsSync(p)) {
    console.error(`[중단] 원본이 없습니다: ${label} -> ${p}`);
    process.exit(1);
  }
}

// ── 1. 충돌 검사 (복사 전) ───────────────────────────────────────────
// 지뢰: dist 안에도 assets/ 폴더가 있고(dist/assets/...), 레포에도 assets/ 가 있다.
// assets/ 를 public-dist/assets/ 로 머지하면 같은 상대경로 파일이 서로를 덮어쓸 수 있다.
// => 실제로 겹치는 파일이 있는지 먼저 확인하고, 있으면 경고 + 목록 출력한다.
const distAssetsDir = path.join(SRC_DIST, "assets");
const distAssetsRel = new Set(listRel(distAssetsDir));
const repoAssetsRel = listRel(SRC_ASSETS);
const collisions = repoAssetsRel.filter((r) => distAssetsRel.has(r));

console.log("── 충돌 검사: dist/assets/  vs  assets/ ──");
console.log(`  dist/assets 파일 ${distAssetsRel.size}개 / assets 파일 ${repoAssetsRel.length}개 (제외규칙 적용 후)`);
if (collisions.length > 0) {
  console.warn(`  ⚠ 경고: 같은 경로 파일 ${collisions.length}개 = assets/ 가 dist/assets/ 를 덮어씁니다.`);
  for (const c of collisions) console.warn(`     - assets/${c}`);
} else {
  console.log("  ✅ 충돌 0건 (dist 쪽은 내용해시 파일명, 레포 쪽은 원본 파일명이라 경로가 겹치지 않음)");
}
console.log("");

// ── 2. public-dist 초기화 ────────────────────────────────────────────
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// ── 3. dist/ -> public-dist/  (C등급 1건: GET * SPA 웹화면) ─────────
//   원본 근거: server/index.ts:210-222
const nDist = copyDir(SRC_DIST, OUT).length;
console.log(`1) dist/ -> public-dist/                       ${nDist}개`);

// ── 4. assets/ -> public-dist/assets/ 머지 (C등급 2건: /assets) ─────
//   원본 근거: server/index.ts:236  app.use("/assets", express.static(<repo>/assets))
//   머지 = dist/assets/ 위에 덮어쓰기. (위 충돌 검사에서 실제 겹침 없음을 확인)
const outAssets = path.join(OUT, "assets");
fs.mkdirSync(outAssets, { recursive: true });
const nAssets = copyDir(SRC_ASSETS, outAssets).length;
console.log(`2) assets/ -> public-dist/assets/ (머지)        ${nAssets}개`);

// ── 5. 관리자 html (C등급 3건: GET /admin) ───────────────────────────
//   원본 근거: server/admin/dashboard-routes.ts:36-47 (res.sendFile(admin-dashboard.html))
//   /admin -> public-dist/admin/index.html 로 둔다.
//   근거: html_handling 기본값 "auto-trailing-slash" = /admin 요청 시 /admin/index.html 이 있으면
//         /admin/ 으로 리다이렉트 후 서빙 (configuration.md:55-64).
const outAdmin = path.join(OUT, "admin");
fs.mkdirSync(outAdmin, { recursive: true });
fs.copyFileSync(SRC_ADMIN, path.join(outAdmin, "index.html"));
console.log(`3) admin-dashboard.html -> public-dist/admin/index.html  1개`);

// ── 6. 결과 요약 + 한도 점검 ─────────────────────────────────────────
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

// 한도 근거: gotchas.md:96-101 (파일당 25 MiB / 총 20,000개(무료)·100,000개(유료, wrangler 4.34.0+))
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
