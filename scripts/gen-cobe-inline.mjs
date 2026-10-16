// ⚠️ 수정금지(승인필요) 2026-07-30 = **지구본(cobe) 본체를 앱 안에 끼워 넣는 도구.**
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "node_modules/cobe/dist/index.esm.js");
const OUT = path.join(root, "client/screens/bts/cobe-inline.ts");

let s = fs.readFileSync(SRC, "utf8");

const before = s;
s = s.replace(/export\{[^}]*\};?\s*$/, "window.createGlobe=Pe;");
if (s === before || !s.includes("window.createGlobe")) {
  console.error(
    "[gen-cobe-inline] ❌ 내보내기 문장을 못 찾았습니다. cobe 판이 바뀌었을 수 있습니다.\n" +
      "  node_modules/cobe/dist/index.esm.js 끝부분을 열어 export 문 형태를 확인하십시오.",
  );
  process.exit(1);
}

if (s.includes("`") || s.includes("${")) {
  console.error(
    "[gen-cobe-inline] ❌ 원본에 역따옴표가 있어 그대로 넣을 수 없습니다. 방식 변경 필요.",
  );
  process.exit(2);
}

const out =
  "// ⚠️ 자동 생성 파일 = 손으로 고치지 마십시오.\n" +
  "//   원본 = node_modules/cobe/dist/index.esm.js (cobe) 를 그대로 넣고,\n" +
  "//   맨 끝의 ESM 내보내기만 window.createGlobe 로 바꿨습니다(WebView 안에서 부르기 위함).\n" +
  "//   다시 만들려면 = node scripts/gen-cobe-inline.mjs\n" +
  "//   왜 끼워 넣나 = 앱(WebView)이 인터넷 없이도 지구본을 띄우고, 외부 주소를 안 부르게 하기 위함.\n" +
  "export default String.raw`" +
  s +
  "`;\n";

fs.writeFileSync(OUT, out, "utf8");
console.log(
  `[gen-cobe-inline] ✅ 생성 완료 → ${path.relative(root, OUT)} (${out.length.toLocaleString()}자)`,
);
