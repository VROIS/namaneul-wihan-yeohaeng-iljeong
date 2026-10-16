// ⚠️ 수정금지(승인필요) 2026-10-05 사장님 결정 = v3.2 최적화 (정본 §)
import fs from "fs";
import path from "path";
import {
  ROOT,
  loadEnv,
  parseArgs,
  reportDir,
  runAgents,
  shareRanges,
  stamp,
} from "./common";
import { LABEL_STATES, readListRaws } from "./lists-common";
import { validateRefine } from "./refine-validate";

loadEnv();
const argv = parseArgs();
const cityId = Number(argv["city-id"] || 0);
const apply = argv["apply"] === "true";
const PROMPTS = path.join(ROOT, "fillcity/prompts/05-list-refine");

type Pick = {
  cat: string;
  name: string;
  cid: string;
  label: string | null;
  rv: number;
};

function cardLines(): Map<string, string> {
  const out = new Map<string, string>();
  for (const { json } of readListRaws(cityId))
    for (const e of json.raw?.entries ?? [])
      if (e.cid)
        out.set(
          String(e.cid),
          String(e.line ?? "")
            .replace(/\s+/g, " ")
            .slice(0, 230),
        );
  return out;
}

function originalSelect(): string | null {
  const base = reportDir(cityId);
  for (const f of fs
    .readdirSync(base)
    .filter((x) => x.endsWith("_lists-select.json"))
    .sort()
    .reverse()) {
    const file = path.join(base, f);
    if (!JSON.parse(fs.readFileSync(file, "utf-8")).refined) return file;
  }
  return null;
}

function refineDir(selectName: string): string {
  const base = reportDir(cityId);
  const prev = fs
    .readdirSync(base)
    .filter((d) => d.startsWith("refine-"))
    .sort()
    .reverse()
    .find((d) => {
      try {
        return (
          JSON.parse(
            fs.readFileSync(path.join(base, d, "refine-meta.json"), "utf-8"),
          ).select === selectName
        );
      } catch {
        return false;
      }
    });
  const dir = path.join(base, prev ?? `refine-${stamp()}`);
  for (const sub of ["todo", "judged", "done"])
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
  if (!prev)
    fs.writeFileSync(
      path.join(dir, "refine-meta.json"),
      JSON.stringify({ select: selectName }),
    );
  else
    console.log(`↻ 이어쓰기 = 끝나지 않은 정제 폴더 ${prev} 에서 이어서 한다`);
  return dir;
}

(async () => {
  if (!cityId) {
    console.error(
      "Usage: --city-id=<N> [--apply]  (먼저 discovery-lists-select)",
    );
    process.exit(1);
  }
  const selectFile = originalSelect();
  if (!selectFile) {
    console.error("✗ 선별 보고서가 없다 = discovery-lists-select 를 먼저");
    process.exit(1);
  }
  const report = JSON.parse(fs.readFileSync(selectFile, "utf-8"));
  const picks: Pick[] = report.picks ?? [];
  const states = LABEL_STATES;
  const lodgingRe = new RegExp(states.lodging.join("|"), "i");
  const placeSet = new Set(states.place.map((s) => s.toLowerCase()));
  const lines = cardLines();
  const decided = new Map<
    string,
    { keep: boolean; reason: string; source: string }
  >();
  const ambiguous: any[] = [];
  for (const p of picks) {
    const l = String(p.label ?? "");
    if (l && lodgingRe.test(l))
      decided.set(p.cid, {
        keep: false,
        reason: `표: 분류칩 "${l}" = 숙박`,
        source: "table",
      });
    else if (l && placeSet.has(l.toLowerCase()))
      decided.set(p.cid, {
        keep: true,
        reason: `표: 분류칩 "${l}" = 장소`,
        source: "table",
      });
    else
      ambiguous.push({
        cid: p.cid,
        name: p.name,
        label: p.label,
        rv: p.rv,
        line: lines.get(p.cid) ?? "",
        foodJudge: p.cat === "restaurant",
      });
  }
  const dir = refineDir(path.basename(selectFile));
  const has = (sub: string, cid: string) =>
    fs.existsSync(path.join(dir, sub, `${cid}.json`));
  console.log(
    `═══ 목록 정제 city ${cityId} = 선별 ${picks.length}곳 → 표가 바로 정함 ${decided.size}곳(숙박 ${[...decided.values()].filter((d) => !d.keep).length}) · 판정 일꾼에게 갈 애매한 곳 ${ambiguous.length}곳 → ${path.relative(ROOT, dir)} ═══`,
  );

  const pendingJudge = ambiguous
    .filter(
      (x) =>
        !has("judged", x.cid) && !has("todo", x.cid) && !has("done", x.cid),
    )
    .map((x, order) => ({ order, ...x }));
  const inputFile = path.join(dir, "refine-input.json");
  fs.writeFileSync(
    inputFile,
    JSON.stringify({ cityId, items: pendingJudge }, null, 2),
  );
  const judgeRanges = shareRanges(pendingJudge.length);
  if (judgeRanges.length) {
    console.log(
      `🧑‍⚖️ 판정 일꾼 ${judgeRanges.length}명 동시 = 아직 판정 없는 ${pendingJudge.length}곳`,
    );
    await runAgents({
      label: "judge",
      instruction: path.join(PROMPTS, "instruction-judge.txt"),
      ranges: judgeRanges,
      promptOf: (j) =>
        [
          `- 명단 파일 = ${inputFile}`,
          `- 네게 배정된 순서 = 명단 항목의 order 값이 ${j.from}부터 ${j.to}까지(끝 번호 포함, 도시 번호 ${cityId}, 조 번호 ${j.k})`,
          `- 결과 폴더 = ${dir}`,
        ].join("\n"),
      doneOf: (j) =>
        pendingJudge
          .slice(j.from, j.to + 1)
          .every((x) => has("judged", x.cid) || has("todo", x.cid)),
      dir,
    });
  }

  const todo = fs
    .readdirSync(path.join(dir, "todo"))
    .filter((x) => x.endsWith(".json"))
    .map((x) => JSON.parse(fs.readFileSync(path.join(dir, "todo", x), "utf-8")))
    .filter((x) => !has("done", String(x.cid)))
    .sort((a, b) => String(a.cid).localeCompare(String(b.cid)));
  const openRanges = shareRanges(todo.length);
  openRanges.forEach((j) =>
    fs.writeFileSync(
      path.join(dir, `mine-${j.k}.json`),
      JSON.stringify(todo.slice(j.from, j.to + 1), null, 2),
    ),
  );
  if (openRanges.length) {
    console.log(
      `🌐 직접 열어 볼 곳 ${todo.length}곳 → 일꾼 ${openRanges.length}명 동시(몫 ${openRanges.map((j) => j.to - j.from + 1).join("·")})`,
    );
    await runAgents({
      label: "open",
      instruction: path.join(PROMPTS, "instruction-browser.txt"),
      ranges: openRanges,
      promptOf: (j) =>
        [
          `- 네 몫 파일 = ${path.join(dir, `mine-${j.k}.json`)} (조 번호 ${j.k})`,
          `- 결과 폴더 = ${dir}`,
        ].join("\n"),
      doneOf: (j) =>
        todo.slice(j.from, j.to + 1).every((m) => has("done", String(m.cid))),
      dir,
    });
  }

  const v = validateRefine(
    ambiguous.map((x, order) => ({ order, cid: x.cid, name: x.name })),
    dir,
  );
  for (const [cid, d] of v.decided) decided.set(cid, d);
  const undecided = picks.filter((p) => !decided.has(p.cid));
  console.log(
    `검사 = 판정 ${v.decided.size}/${ambiguous.length} · 직접 연 판정 ${v.pages}곳 · 오류 ${v.errs.length}건 · 판정 못 끝낸 곳 ${undecided.length}`,
  );
  for (const e of v.errs.slice(0, 20)) console.log(`  ✘ ${e}`);
  const removed = picks.filter((p) => decided.get(p.cid)?.keep === false);
  console.log(`업체로 판정(입력에서 뺌) ${removed.length}곳`);
  for (const p of removed)
    console.log(
      `  - ${p.name} [${p.label ?? "분류칩 없음"}] · ${decided.get(p.cid)!.reason.slice(0, 80)} (${decided.get(p.cid)!.source})`,
    );
  fs.writeFileSync(
    path.join(dir, "refine-table.json"),
    JSON.stringify(
      {
        cityId,
        errs: v.errs,
        undecided: undecided.map((p) => p.cid),
        removed: removed.map((p) => ({ ...p, ...decided.get(p.cid) })),
      },
      null,
      2,
    ),
  );
  if (apply) {
    const refined = {
      ...report,
      generatedAt: new Date().toISOString(),
      refined: {
        removed: removed.map((p) => p.cid),
        undecided: undecided.map((p) => p.cid),
        from: path.basename(selectFile),
      },
      picks: picks.filter((p) => decided.get(p.cid)?.keep === true),
    };
    const out = path.join(reportDir(cityId), `${stamp()}_lists-select.json`);
    fs.writeFileSync(out, JSON.stringify(refined, null, 2));
    console.log(`정제한 선별 보고서 = ${out} (입력 ${refined.picks.length}곳)`);
  } else console.log("DRY = --apply 로 정제한 선별 보고서를 만든다");
  process.exit(undecided.length || v.errs.length ? 1 : 0);
})().catch((e) => {
  console.error("✗ 목록 정제 실패:", e?.message || e);
  process.exit(1);
});
