#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public-dist");

const SRC_DIST = path.join(ROOT, "dist");
const SRC_ASSETS = path.join(ROOT, "assets");
const SRC_ADMIN = path.join(ROOT, "worker", "admin", "admin-dashboard.html");

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
console.log(`  dist/assets 파일 ${distAssetsRel.size}개 / assets 파일 ${repoAssetsRel.length}개 (제외규칙 적용 후)`);
if (collisions.length > 0) {
  console.warn(`  ⚠ 경고: 같은 경로 파일 ${collisions.length}개 = assets/ 가 dist/assets/ 를 덮어씁니다.`);
  for (const c of collisions) console.warn(`     - assets/${c}`);
} else {
  console.log("  ✅ 충돌 0건 (dist 쪽은 내용해시 파일명, 레포 쪽은 원본 파일명이라 경로가 겹치지 않음)");
}
console.log("");

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const nDist = copyDir(SRC_DIST, OUT).length;
console.log(`1) dist/ -> public-dist/                       ${nDist}개`);

const outAssets = path.join(OUT, "assets");
fs.mkdirSync(outAssets, { recursive: true });
const nAssets = copyDir(SRC_ASSETS, outAssets).length;
console.log(`2) assets/ -> public-dist/assets/ (머지)        ${nAssets}개`);

// ⚠️ 수정금지(승인필요) 2026-09-25 사장님 결정 = 관리자 화면 = worker/admin 1벌, 리플릿 폴더에서 가져오지 않음 (정본 9-25)
const outAdmin = path.join(OUT, "admin");
fs.mkdirSync(outAdmin, { recursive: true });
fs.copyFileSync(SRC_ADMIN, path.join(outAdmin, "index.html"));
console.log(`3) admin-dashboard.html -> public-dist/admin/index.html  1개`);

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
