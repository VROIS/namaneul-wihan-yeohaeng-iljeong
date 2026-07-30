// ⚠️ 수정금지(승인필요) 2026-07-30 = **지구본(cobe) 본체를 앱 안에 끼워 넣는 도구.**
//   왜 필요한가 = 앱(iOS/안드로이드)은 지구본을 WebView 안에서 띄우는데, 그 안에서 인터넷으로
//   외부 라이브러리를 받아오게 하면 ① 비행기·지하에서 안 뜨고 ② 외부 주소 호출이라 심사 위험이 있다.
//   그래서 cobe(16KB)를 **파일로 끼워 넣어** 두고, WebView 가 그것을 그대로 쓴다.
//
//   1회용 스크립트가 아니다 = cobe 를 올릴 때마다 이걸 다시 돌린다(§16 = 영구 도구).
//
//   실행 = node scripts/gen-cobe-inline.mjs
//   결과 = client/screens/bts/cobe-inline.ts (자동 생성 = 손으로 고치지 말 것)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "node_modules/cobe/dist/index.esm.js");
const OUT = path.join(root, "client/screens/bts/cobe-inline.ts");

let s = fs.readFileSync(SRC, "utf8");

// cobe 는 ESM(export) 로 끝난다. WebView 안에서는 <script> 로 넣으므로 전역 함수로 바꾼다.
const before = s;
s = s.replace(/export\{[^}]*\};?\s*$/, "window.createGlobe=Pe;");
if (s === before || !s.includes("window.createGlobe")) {
  console.error(
    "[gen-cobe-inline] ❌ 내보내기 문장을 못 찾았습니다. cobe 판이 바뀌었을 수 있습니다.\n" +
      "  node_modules/cobe/dist/index.esm.js 끝부분을 열어 export 문 형태를 확인하십시오.",
  );
  process.exit(1);
}

// 역따옴표가 들어 있으면 String.raw 로 감쌀 수 없다(문법 깨짐) = 즉시 중단.
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
