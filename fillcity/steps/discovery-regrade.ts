// ⚠️ 수정금지(승인필요) 2026-08-29 사장님 결정 = B1 후처리 등급조정 v3(§0 700줄로 discovery-merge-diff.ts 에서 분리) + R6(A등급 병합 대상이 PID無면 confirm) 추가
import type { Client } from "pg";
import { haversineKm } from "../../server/services/agents/transit-haversine";
import type { Group } from "./discovery-merge-diff";

const GENERIC = new Set(
  "the a le la les el los las de du des del di da of and und et y museum musee museo museu church eglise iglesia kirche cathedral cathedrale catedral kathedrale basilica basilique park parc parque palace palais palacio place plaza platz square restaurant restaurante ristorante cafe bar bistro brasserie taverna taberna tavern pub grill kitchen house casa maison haus tower tour torre turm center centre centro zentrum national nacional nationale market mercado marche markt street rue calle strasse st saint sainte san santa santo sankt gallery galerie galeria garden jardin jardim giardino old new grand grande gran historic".split(
    " ",
  ),
);
const ACTIVITY = new Set(
  "walk skyline edgewalk skydeck view viewpoint observation deck hiking hike trail boats boat cruise cruises tour tours bike biking cycling kayak kayaking tandem swan ride rides cafe bistro restaurant grill shop store gift cafeteria terrace terrasse rooftop bar lounge spa hotel parking arcade arcades gardens garden vedettes vedette bateaux bateau croisiere croisieres barco barcos crucero cruceros boote boot schiff schifffahrt rundfahrt battello battelli crociera crociere".split(
    " ",
  ),
);
const rgNorm = (s?: string | null) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFC") // 한글 음절 복원(discovery-merge-diff.ts norm() 과 동일, 2026-08-27 §19)
    .replace(/[^a-z0-9가-힣一-鿿぀-ヿ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const toks = (s?: string | null) =>
  new Set(
    rgNorm(s)
      .split(" ")
      .filter((t) => t.length >= 3 && !GENERIC.has(t)),
  );

interface NameSide {
  name?: string | null;
  nameLocal?: string | null;
  nameKo?: string | null;
}
interface RowNames {
  name_en?: string | null;
  name_local?: string | null;
  name_ko?: string | null;
}
function activitySuffix(a: string, b: string): boolean {
  const A = toks(a);
  const B = toks(b);
  if (!A.size || !B.size) return false;
  const [S, L] = A.size <= B.size ? [A, B] : [B, A];
  if (![...S].every((t) => L.has(t))) return false;
  return [...L].filter((t) => !S.has(t)).some((t) => ACTIVITY.has(t));
}
function exactAny(g: NameSide, r: RowNames): string | null {
  const P: [string, string | null | undefined, string | null | undefined][] = [
    ["name↔en", g.name, r.name_en],
    ["name↔local", g.name, r.name_local],
    ["local↔local", g.nameLocal, r.name_local],
    ["local↔en", g.nameLocal, r.name_en],
    ["ko↔ko", g.nameKo, r.name_ko],
  ];
  for (const [k, a, b] of P) {
    if (!(a && b && rgNorm(a) && rgNorm(a) === rgNorm(b))) continue;
    if (k === "ko↔ko") {
      const en = new Set([...toks(g.name), ...toks(g.nameLocal)]);
      const rn = new Set([...toks(r.name_en), ...toks(r.name_local)]);
      if (![...en].some((t) => rn.has(t))) continue;
    }
    const suffixed = P.some(
      ([k2, a2, b2]) =>
        k2 !== k &&
        !!a2 &&
        !!b2 &&
        rgNorm(a2) !== rgNorm(b2) &&
        activitySuffix(a2, b2),
    );
    return suffixed ? null : k;
  }
  return null;
}
function containOK(g: NameSide, r: RowNames): boolean {
  const pairs = [
    [g.name, r.name_en],
    [g.nameLocal, r.name_local],
    [g.name, r.name_local],
    [g.nameLocal, r.name_en],
  ];
  for (const [a, b] of pairs) {
    if (!a || !b) continue;
    const A = toks(a);
    const B = toks(b);
    if (!A.size || !B.size) continue;
    const [S, L] = A.size <= B.size ? [A, B] : [B, A];
    let inc = 0;
    for (const t of S) if (L.has(t)) inc++;
    if (S.size >= 2 && inc === S.size) {
      const extra = [...L].filter((t) => !S.has(t));
      if (extra.length <= 2 && !extra.some((t) => ACTIVITY.has(t))) return true;
    }
  }
  return false;
}

export interface PsrRow {
  id: number;
  name_en: string | null;
  name_local: string | null;
  name_ko: string | null;
  seed_category: string;
  status: string;
  merged_into: number | null;
  city_id: number;
  lat: number | null;
  lng: number | null;
  pid: boolean;
}
export const PSR_COLS = `id, name_en, name_local, name_ko, seed_category, status, merged_into, city_id, latitude::float AS lat, longitude::float AS lng, google_place_id IS NOT NULL AS pid`;

export type Bucket = "merge" | "confirm" | "new";
export interface Regrade {
  rule: string;
  from: Bucket;
  to: Bucket;
  note: string;
}
export interface Staged extends NameSide {
  g: Group;
  orig: Bucket; // 문지기 판정 등급(R2·R3·R4 대상 선별 기준)
  bucket: Bucket; // 등급조정 후 최종 등급
  psr: PsrRow | null; // merge = 대상 행 / confirm = 후보 행
  by: string;
  lat: number | null;
  lng: number | null;
  regrade: Regrade | null;
  absorbed: boolean; // R4 로 앞 그룹에 흡수됨 = 산출표 제외
}

export async function regradeStaged(
  c: Client,
  staged: Staged[],
  cityRows: PsrRow[],
) {
  // ── 등급조정(regrade) v3 = 문지기 판정 뒤·산출표 앞, 규칙 순서 고정 R5→R1→R6→R2/R3→R4 (2026-08-29 사장님 결정) ──
  const regradeCounts = {
    R1: 0,
    R2: 0,
    R3: 0,
    R4: 0,
    R5: 0,
    R6: 0,
    hintOnly: 0,
  };
  const setRegrade = (s: Staged, rule: string, to: Bucket, note: string) => {
    s.regrade = {
      rule: s.regrade ? `${s.regrade.rule}+${rule}` : rule,
      from: s.regrade?.from ?? s.bucket,
      to,
      note: s.regrade ? `${s.regrade.note} · ${note}` : note,
    };
    s.bucket = to;
  };
  for (const s of staged) {
    if (s.orig !== "merge") continue;
    let r = s.psr!;
    if (r.status === "merged" && r.merged_into) {
      const keep: PsrRow | undefined = (
        await c.query(`SELECT ${PSR_COLS} FROM place_seed_raw WHERE id = $1`, [
          r.merged_into,
        ])
      ).rows[0];
      regradeCounts.R5++;
      setRegrade(
        s,
        "R5",
        "merge",
        `#${r.id}(merged) → 키프행 #${keep?.id ?? r.merged_into} ${keep?.name_en ?? "조회 실패"}`,
      );
      if (keep) {
        s.psr = keep;
        r = keep;
      }
    } else if (
      r.status === "quarantined" ||
      r.status === "hold" ||
      r.status === "closed"
    ) {
      regradeCounts.R5++;
      setRegrade(s, "R5", "new", `#${r.id} ${r.name_en} ${r.status}`);
      s.psr = null;
      continue;
    }
    if (s.lat != null && s.lng != null && r.lat != null && r.lng != null) {
      const d = haversineKm(s.lat, s.lng, r.lat, r.lng);
      if (d > 2) {
        regradeCounts.R1++;
        s.by = `${s.by}+R1>2km`;
        setRegrade(
          s,
          "R1",
          "confirm",
          `#${r.id} ${r.name_en} ${d.toFixed(1)}km`,
        );
      }
    }
    if (s.bucket === "merge" && !r.pid) {
      regradeCounts.R6++;
      s.by = `${s.by}+R6 PID無`;
      setRegrade(s, "R6", "confirm", `#${r.id} ${r.name_en} PID無`);
    }
  }
  for (const s of staged) {
    if (s.orig === "merge" || s.lat == null || s.lng == null) continue;
    let hit: { r: PsrRow; d: number; rule: "R2" | "R3"; how: string } | null =
      null;
    for (const r of cityRows) {
      if (r.status !== "active" && r.status !== "candidate") continue;
      const d = haversineKm(s.lat, s.lng, r.lat!, r.lng!);
      if (d > 0.1) continue;
      if ((s.g.type === "restaurants") !== (r.seed_category === "restaurant"))
        continue;
      const ex = exactAny(s, r);
      if (ex) {
        hit = { r, d, rule: "R2", how: ex };
        break;
      }
      if (!hit && containOK(s, r)) hit = { r, d, rule: "R3", how: "토큰포함" };
    }
    if (!hit) continue;
    regradeCounts[hit.rule]++;
    if (!hit.r.pid) regradeCounts.hintOnly++;
    s.psr = hit.r;
    s.by = hit.r.pid ? hit.rule : `${hit.rule}-hint`;
    setRegrade(
      s,
      hit.rule,
      hit.r.pid ? "merge" : "confirm",
      `#${hit.r.id} ${hit.r.name_en}(${hit.r.seed_category}) ${Math.round(hit.d * 1000)}m [${hit.how}]`,
    );
  }
  const bucketOrder: Record<Bucket, number> = { merge: 0, confirm: 1, new: 2 };
  const rest = staged
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.bucket !== "merge" && s.lat != null)
    .sort(
      (x, y) =>
        (x.s.g.type === "restaurants" ? 1 : 0) -
          (y.s.g.type === "restaurants" ? 1 : 0) ||
        bucketOrder[x.s.orig] - bucketOrder[y.s.orig] ||
        x.i - y.i,
    )
    .map(({ s }) => s);
  for (let i = 0; i < rest.length; i++)
    for (let k = i + 1; k < rest.length; k++) {
      const a = rest[i];
      const b = rest[k];
      if (a.absorbed || b.absorbed) continue;
      const d = haversineKm(a.lat!, a.lng!, b.lat!, b.lng!);
      if (d > 0.05) continue;
      if (
        !exactAny(a, {
          name_en: b.name,
          name_local: b.nameLocal,
          name_ko: b.nameKo,
        }) &&
        !containOK(a, { name_en: b.name, name_local: b.nameLocal })
      )
        continue;
      b.absorbed = true;
      regradeCounts.R4++;
      const A = a.g;
      const B = b.g;
      A.members.push(...B.members);
      for (const x of B.langs) A.langs.add(x);
      for (const x of B.names) A.names.add(x);
      for (const x of B.locals) A.locals.add(x);
      for (const x of B.kos) A.kos.add(x);
      for (const x of B.addresses) A.addresses.add(x);
      A.lats.push(...B.lats);
      A.lngs.push(...B.lngs);
      A.cats.push(...B.cats);
      A.prices.push(...B.prices);
      A.ranks.push(...B.ranks);
      A.copies.push(...B.copies);
      a.by = `${a.by}+R4`;
      setRegrade(
        a,
        "R4",
        a.bucket,
        `"${b.name}"(${B.langs.size}개국어) 흡수 ${Math.round(d * 1000)}m`,
      );
    }
  return regradeCounts;
}
