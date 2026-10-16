// ⚠️ 수정금지(승인필요) 2026-10-06 사장님 결정 = 깔때기 숫자 자동 출력 1벌 = 한 판의 보고서·원본 로그(실행 창 안 파일)만 읽어 창고 시작 → ① 삭제 → 구글 목록 → 선별 → 정제 → 제미니 7언어 → 교집합 → ④ 신규 → 장부 → 2차 → 최종 점검 → 페이지 열기 합 → 판정을 표 하나로 찍는다(손으로 세지 않는다, DB 쓰기 0, 다른 도구 파일은 읽기만) (정본 §)
import fs from "fs";
import path from "path";
import { ROOT, loadEnv, parseArgs, reportDir, stampOf } from "./common";

loadEnv();
const argv = parseArgs();
const cityId = Number(argv["city-id"] || 0);
if (!cityId) {
  console.error(
    "Usage: --city-id=<N> [--from=<ISO 또는 YYYY-MM-DD_HHMMSS>] [--to=<같은 형식>]",
  );
  process.exit(1);
}
const dir = reportDir(cityId);
const rawDir = path.join(ROOT, "docs", "raw", String(cityId));
const files = (d: string) => (fs.existsSync(d) ? fs.readdirSync(d).sort() : []);
const J = (f: string) => JSON.parse(fs.readFileSync(f, "utf-8"));
const baselines = files(dir).filter((f) => f.endsWith("_baseline-status.txt"));
const from = stampOf(
  String(
    argv["from"] ||
      (baselines.length
        ? baselines[baselines.length - 1].slice(0, 17)
        : "1970-01-01_000000"),
  ),
);
const to = stampOf(String(argv["to"] || new Date().toISOString()));
const inWin = (f: string) => f.slice(0, 17) >= from && f.slice(0, 17) <= to;
const first = (d: string, re: RegExp) =>
  files(d).filter((f) => re.test(f) && inWin(f))[0];
const last = (d: string, re: RegExp) =>
  files(d)
    .filter((f) => re.test(f) && inWin(f))
    .pop();
const n = (v: unknown) => (v == null ? "-" : String(v));
const rows: [string, string][] = [];

const base = first(dir, /_baseline-status\.txt$/);
if (base) {
  const t = fs.readFileSync(path.join(dir, base), "utf-8").split("\n");
  const i = t.findIndex((l) => /^활성\s+n\s+/.test(l));
  let sum = 0;
  for (let k = i + 1; k < t.length && /^\S+\s+\d+/.test(t[k]); k++)
    sum += Number(t[k].trim().split(/\s+/)[1] || 0);
  if (i >= 0) rows.push(["창고 시작(활성)", `${sum}행`]);
}
const del = first(dir, /_llm-review-deleted\.json$/);
if (del) {
  const j = J(path.join(dir, del));
  const arr: any[] = Array.isArray(j)
    ? j
    : (Object.values(j).find(Array.isArray) as any[]) || [];
  rows.push([
    "① LLM 검토",
    `삭제 ${arr.filter((x) => !x.fixed).length} · 고침 ${arr.filter((x) => x.fixed).length}`,
  ]);
}
const sels = files(dir).filter(
  (f) => f.endsWith("_lists-select.json") && inWin(f),
);
if (sels.length) {
  const s = J(path.join(dir, sels[0]));
  const total = (s.sources || []).reduce(
    (a: number, x: any) => a + (x.total || 0),
    0,
  );
  rows.push([
    "② 구글 목록",
    `${(s.sources || []).length}문장 · 항목 ${total} → 서로 다른 CID ${(s.pool || []).length} (겹침 ${n(s.drop?.inList)} · 반경 밖 ${n(s.drop?.far)} · 표에 없는 라벨 ${n(s.drop?.notInTable)})`,
  ]);
  rows.push([
    "② 선별(분류당 목표)",
    `${(s.picks || []).length}곳 = ${(s.stats || []).map((x: any) => `${x.cat} ${x.pick}${x.short ? `(못 채움 ${x.short})` : ""}`).join(" · ")}`,
  ]);
  const r = sels.length > 1 ? J(path.join(dir, sels[sels.length - 1])) : null;
  if (r?.refined)
    rows.push([
      "② 정제(일꾼)",
      `업체 제외 ${(r.refined.removed || []).length} → 입력 ${(r.picks || []).length}곳`,
    ]);
}
const b1 = last(dir, /_b1-discovery-diff\.json$/);
if (b1) {
  const b = J(path.join(dir, b1));
  const sec = (k: string) => b.report?.[k] || {};
  const cnt = (k: string, f: string) => (sec(k)[f] || []).length;
  const 있음 = cnt("landmarks", "confirm") + cnt("restaurants", "confirm");
  const 신규 = cnt("landmarks", "new") + cnt("restaurants", "new");
  const mixed = cnt("landmarks", "mixed") + cnt("restaurants", "mixed");
  rows.push([
    "③ 제미니 7언어 → 선처리",
    `채택 ${있음 + 신규}(랜드마크 ${cnt("landmarks", "confirm") + cnt("landmarks", "new")} · 식당 ${cnt("restaurants", "confirm") + cnt("restaurants", "new")}) → 창고에 이미 있음 ${있음}(${있음 + 신규 ? Math.round((100 * 있음) / (있음 + 신규)) : 0}%) · 신규 ${신규} · mixed ${mixed}`,
  ]);
}
const ins = last(rawDir, /_gmaps-discovery-insert\.json$/);
let insOpens = 0;
if (ins) {
  const s = J(path.join(rawDir, ins)).raw?.summary || {};
  insOpens = s.pageOpens || 0;
  rows.push([
    "④ 흡수·신규",
    `페이지 ${n(s.pageOpens)} → 새 행 ${n(s.insertedNew)} · 흡수 ${(s.absorbedHint || 0) + (s.absorbedOther || 0)} · 못 갖춤 ${n(s.noMatch)} · 폐업 ${n(s.closed)} · 제한보기 ${n(s.limited)}`,
  ]);
}
const ledger = path.join(dir, "insert-ledger.json");
if (fs.existsSync(ledger)) {
  const v: any[] = Object.values(J(ledger)).filter(
    (x: any) => x.at && stampOf(x.at) >= from && stampOf(x.at) <= to,
  );
  const by: Record<string, number> = {};
  for (const x of v) by[x.verdict] = (by[x.verdict] || 0) + 1;
  rows.push([
    "④ 장부(판정별)",
    Object.entries(by)
      .map(([k, c]) => `${k} ${c}`)
      .join(" · ") || "-",
  ]);
}
const ids = files(dir).filter(
  (f) => /_gemini-ids-\d+\.json$/.test(f) && inWin(f),
);
if (ids.length)
  rows.push([
    "⑤ 제미니 2차",
    `${ids.reduce((a, f) => a + J(path.join(dir, f)).length, 0)}행 · ${ids.length}분할`,
  ]);
const fc = files(dir)
  .filter(
    (f) => /^final-check-/.test(f) && inWin(f.replace("final-check-", "")),
  )
  .pop();
if (fc && fs.existsSync(path.join(dir, fc, "final-table.json"))) {
  const t = J(path.join(dir, fc, "final-table.json"));
  rows.push([
    "⑤ 최종 점검(일꾼)",
    `${t.total}행 · 짝 안 맞음 ${(t.mismatch || []).length}`,
  ]);
}
const reads = files(rawDir).filter(
  (f) => /_gmaps-page-read-\d+\.json$/.test(f) && inWin(f),
);
const readRows = reads.reduce(
  (a, f) => a + (J(path.join(rawDir, f)).raw?.rows || []).length,
  0,
);
const lists = files(rawDir).filter(
  (f) => /_gmaps-list-/.test(f) && inWin(f),
).length;
rows.push([
  "구글맵 열기 합(코드)",
  `${readRows + insOpens + lists} = 직행·후처리·2차 ${readRows} + ④ ${insOpens} + 목록 ${lists}`,
]);
const after = last(dir, /_after-status\.txt$/);
if (after) {
  const t = fs.readFileSync(path.join(dir, after), "utf-8");
  const pick = (re: RegExp) => (t.match(re) || [""])[0];
  rows.push([
    "⑥ 판정(실행 후 상태표)",
    `${pick(/손님상 \d+ · 베스트 \d+/)} · ${pick(/⑥ 판정 = [^\n]*/)}`,
  ]);
}
const w = Math.max(...rows.map(([k]) => k.length));
console.log(`\n═══ 깔때기 — city ${cityId} (${from} ~ ${to}) ═══`);
for (const [k, v] of rows) console.log(`${k.padEnd(w + 2)}${v}`);
