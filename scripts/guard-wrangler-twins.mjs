#!/usr/bin/env node
// ⚠️ 수정금지(승인필요) 2026-09-14 사장님 결정 = 배포 설정 2벌이 갈라지는 것을 **기계로** 막는다(§16 = 글 아닌 코드로). 정본 worker/wrangler.jsonc ↔ 되돌아오는 길 worker/wrangler.build.jsonc = 이미지 지정 칸만 다르고 나머지는 같아야 한다 (정본 §24)
//   왜 = 한쪽만 고치면 비상시(되돌아가는 그때)에야 어긋남이 드러난다. 그때는 이미 늦다.
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAIN = "worker/wrangler.jsonc";
const BUILD = "worker/wrangler.build.jsonc";

// --staged(커밋 훅) = 커밋될 내용을 본다 = "양쪽 다 고쳐놓고 한쪽만 git add" 를 막는다.
// 인자 없음(기계검증) = 지금 고친 파일을 본다 = 커밋 전에 그 자리에서 알려준다.
const STAGED = process.argv.includes("--staged");
function readSource(rel) {
  if (STAGED) {
    try {
      return execSync(`git show ":${rel}"`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      return null; // 스테이지에 없음 = 이번 커밋 대상 아님
    }
  }
  const abs = join(ROOT, rel);
  return existsSync(abs) ? readFileSync(abs, "utf8") : null;
}

// 이미지 지정 칸 = 두 파일이 **달라야 하는** 유일한 곳
const IMAGE_KEYS = ["image", "image_build_context"];

/** 주석·끝쉼표를 걷어내고 JSON 으로 읽는다(문자열 안은 건드리지 않는다) */
function parseJsonc(raw) {
  const out = []; // 글자 1개 = 칸 1개. 문자열 밖 글자는 뒤에서 되짚어 쉼표를 지울 수 있게.
  const outsideStr = []; // 그 칸이 문자열 밖이었는지
  let inStr = false;
  let esc = false;
  const push = (ch, outside) => {
    out.push(ch);
    outsideStr.push(outside);
  };
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      push(c, false);
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      push(c, false); // 여는 따옴표 = 값의 일부 = 쉼표 지우기 대상 아님
      continue;
    }
    if (c === "/" && raw[i + 1] === "/") {
      while (i < raw.length && raw[i] !== "\n") i++;
      push("\n", true);
      continue;
    }
    if (c === "/" && raw[i + 1] === "*") {
      i += 2;
      while (i < raw.length && !(raw[i] === "*" && raw[i + 1] === "/")) i++;
      i++;
      continue;
    }
    // JSONC 는 끝쉼표를 허용한다(wrangler 정상 수용). 닫힘을 만나면 그 앞의 문자열 밖 쉼표를 지운다.
    if (c === "}" || c === "]") {
      let k = out.length - 1;
      while (k >= 0 && outsideStr[k] && /\s/.test(out[k])) k--;
      if (k >= 0 && outsideStr[k] && out[k] === ",") out[k] = " ";
    }
    push(c, true);
  }
  return JSON.parse(out.join(""));
}

/** containers[].image 계열만 지운 사본 = 나머지가 같은지 보기 위함 */
function stripImage(cfg) {
  const c = JSON.parse(JSON.stringify(cfg));
  for (const entry of c.containers || []) for (const k of IMAGE_KEYS) delete entry[k];
  return c;
}

const srcA = readSource(MAIN);
const srcB = readSource(BUILD);
if (srcA === null || srcB === null) process.exit(0); // 둘 중 하나가 아직 없으면 볼 것이 없다

let a, b;
try {
  a = stripImage(parseJsonc(srcA));
  b = stripImage(parseJsonc(srcB));
} catch (e) {
  console.error(`\n❌ 배포 설정을 읽지 못했습니다: ${e.message}\n`);
  process.exit(1);
}

/** 키 순서가 달라도 같게 보도록 재귀 정렬한 뒤 문자열로 */
function stable(v) {
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  if (v && typeof v === "object")
    return (
      "{" +
      Object.keys(v)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + stable(v[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(v);
}

if (stable(a) === stable(b)) process.exit(0);

// 어느 자리가 다른지 경로까지 알려준다(후임이 바로 고치게)
const diffs = [];
function walk(x, y, path) {
  if (stable(x) === stable(y)) return;
  const bothObj =
    x && y && typeof x === "object" && typeof y === "object" && !Array.isArray(x) === !Array.isArray(y);
  if (!bothObj) return void diffs.push(path);
  const keys = Array.isArray(x)
    ? [...Array(Math.max(x.length, y.length)).keys()]
    : [...new Set([...Object.keys(x), ...Object.keys(y)])];
  let deeper = false;
  for (const k of keys) {
    const before = diffs.length;
    walk(x?.[k], y?.[k], Array.isArray(x) ? `${path}[${k}]` : path ? `${path}.${k}` : String(k));
    if (diffs.length > before) deeper = true;
  }
  if (!deeper) diffs.push(path);
}
walk(a, b, "");
console.error(
  "\n❌ §24 위반 = 배포 설정 2벌이 갈라졌습니다 (이미지 지정 칸 말고는 같아야 합니다):",
);
console.error("  다른 자리: " + (diffs.join(", ") || "(알 수 없음)"));
console.error("  정본        = worker/wrangler.jsonc");
console.error("  되돌아오는 길 = worker/wrangler.build.jsonc");
console.error(
  "\n해소: 한쪽에 넣은 변경을 다른 쪽에도 같이 옮기세요(이미지 지정만 서로 달라야 합니다).\n",
);
process.exit(1);
