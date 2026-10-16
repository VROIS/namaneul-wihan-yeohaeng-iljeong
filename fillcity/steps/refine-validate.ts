// ⚠️ 수정금지(승인필요) 2026-10-05 사장님 결정 = v3.2 최적화 (정본 §)
import fs from "fs";
import path from "path";
import { foldName } from "../../worker/lib/services/shared/text-fold";

export type RefineItem = { order: number; cid: string; name: string };

const urlHasCid = (url: string, cid: string): boolean => {
  const u = url.toLowerCase();
  if (u.includes(cid)) return true;
  try {
    return u.includes(BigInt(cid).toString(16));
  } catch {
    return false;
  }
};
// ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 이름 비교 글자 다듬기는 text-fold foldName 1벌(PID 관문과 공용) (정본 §)
const sameName = (a: string, b: string): boolean => {
  const x = foldName(a);
  const y = foldName(b);
  if (!x || !y) return false;
  if (x.includes(y) || y.includes(x)) return true;
  const tx = new Set(x.split(" ").filter((t) => t.length > 1));
  const ty = y.split(" ").filter((t) => t.length > 1);
  if (!tx.size || !ty.length) return false;
  return (
    ty.filter((t) => tx.has(t)).length / Math.min(tx.size, ty.length) >= 0.6
  );
};

function checkOne(
  v: any,
  id: string,
  cid: string,
  name: string,
  errs: string[],
  sources: string[],
): void {
  if (typeof v?.keep !== "boolean")
    errs.push(`${id}: keep 이 true/false 가 아님`);
  if ("unsure" in (v ?? {})) errs.push(`${id}: unsure 금지`);
  if (typeof v?.reason !== "string" || v.reason.trim().length < 8)
    errs.push(`${id}: 이유(reason) 8글자 미만`);
  if (!sources.includes(v?.source))
    errs.push(`${id}: source 가 ${sources.join("/")} 가 아님`);
  if (v?.source !== "page") return;
  if (typeof v?.doubt !== "string" || v.doubt.trim().length < 8)
    errs.push(`${id}: page 인데 의심한 이유(doubt) 없음`);
  const ev = v?.evidence;
  if (!ev || typeof ev !== "object")
    return void errs.push(`${id}: page 인데 증거 없음`);
  if (typeof ev.url !== "string" || !ev.url.trim())
    errs.push(`${id}: 증거에 url 없음`);
  if (typeof ev.h1 !== "string" || !ev.h1.trim())
    errs.push(`${id}: 증거에 읽은 이름(h1) 없음`);
  else if (
    !(typeof ev.url === "string" && urlHasCid(ev.url, cid)) &&
    !sameName(ev.h1, name)
  )
    errs.push(
      `${id}: 증거가 이 항목과 이어지지 않음(주소에 cid 없음 + 읽은 이름 "${ev.h1}" ≠ "${name}")`,
    );
  if (typeof ev.seen !== "string" || ev.seen.trim().length < 10)
    errs.push(`${id}: 증거 문구(seen) 10자 미만`);
}

export function validateRefine(
  items: RefineItem[],
  dir: string,
  sources: string[] = ["list", "page"],
): { errs: string[]; decided: Map<string, any>; pages: number } {
  const errs: string[] = [];
  const decided = new Map<string, any>();
  const byCid = new Map(items.map((x) => [x.cid, x]));
  const put = (v: any, id: string): void => {
    const cid = String(v?.cid ?? "");
    const it = byCid.get(cid);
    if (!it) return void errs.push(`${id}: 명단에 없는 cid`);
    if (decided.has(cid))
      return void errs.push(
        `${id}: cid 중복(판정 조와 열기 결과가 둘 다 있음)`,
      );
    checkOne(v, id, cid, it.name, errs, sources);
    decided.set(cid, v);
  };
  for (const f of fs
    .readdirSync(dir)
    .filter((x) => /^verdict-\d+\.json$/.test(x))) {
    let arr: any[] = [];
    try {
      arr = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
    } catch {
      errs.push(`${f}: JSON 읽기 실패`);
      continue;
    }
    arr.forEach((v, i) => put(v, `${f}#${i + 1} cid=${v?.cid}`));
  }
  for (const sub of ["judged", "done"]) {
    const subDir = path.join(dir, sub);
    if (!fs.existsSync(subDir)) continue;
    for (const f of fs
      .readdirSync(subDir)
      .filter((x) => /^\d+\.json$/.test(x))) {
      try {
        const v = JSON.parse(fs.readFileSync(path.join(subDir, f), "utf-8"));
        if (sub === "done" && v?.source !== "page")
          errs.push(`done/${f}: 열기 결과는 source=page 여야 함`);
        put(v, `${sub}/${f.replace(".json", "")}`);
      } catch {
        errs.push(`${sub}/${f}: JSON 읽기 실패`);
      }
    }
  }
  for (const it of items)
    if (!decided.has(it.cid)) errs.push(`cid=${it.cid} ${it.name}: 판정 빠짐`);
  const pages = [...decided.values()].filter(
    (v) => v?.source === "page",
  ).length;
  return { errs, decided, pages };
}
