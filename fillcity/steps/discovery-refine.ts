// ⚠️ 수정금지(승인필요) 2026-09-29 사장님 결정 = ③ 넣기 전 후처리 = 한 묶음 안에서 언어별 이름이 갈리면 이름별로 나눈다(식당 4개 언어 기준은 이름마다 다시 = 1~2개 언어에만 나온 이름 = 환각 거름) · 창고 행 이름(구글 이름·현지어 이름)과 강일치하는 무리만 그 행에 흡수(현지어 이름을 빼면 번역 연결이 끊겨 쌍둥이가 생김 = 2026-09-29 리마 Plaza Mayor 실측 · 옛 판 오염은 정제 LLM 검토에서 행별로 바로잡음), 아니면 신규로 돌려 구글맵 CID 가 판정 · 합의 좌표 = 언어별 좌표 중앙값 (정본 §)
import {
  placeStop,
  sameName,
} from "../../worker/lib/services/fill/gmaps-pid-identity/gates";

type Named = { name_en?: string | null; name_local?: string | null };
type Anchor = { kind: "psr" | "tmp"; id: number };
type Member<P> = Named & { raw?: P; tier: string };

const namesOf = (m: Named) => [m.name_en, m.name_local];
const agree = (a: Named, b: Named, stop: Set<string>) =>
  sameName(namesOf(a), namesOf(b), stop) ||
  sameName(namesOf(b), namesOf(a), stop);

// 이름이 같은 구성원끼리 한 무리(서로 이어지면 같은 무리)
function clusters<M extends Named>(members: M[], stop: Set<string>): M[][] {
  const root = members.map((_, i) => i);
  const find = (i: number): number =>
    root[i] === i ? i : (root[i] = find(root[i]));
  for (let i = 0; i < members.length; i++)
    for (let j = i + 1; j < members.length; j++)
      if (agree(members[i], members[j], stop)) root[find(i)] = find(j);
  const byRoot = new Map<number, M[]>();
  members.forEach((m, i) =>
    byRoot.set(find(i), [...(byRoot.get(find(i)) || []), m]),
  );
  return [...byRoot.values()];
}

export function refineGroups<
  P extends { address?: string },
  G extends { anchor: Anchor; members: Member<P>[] },
>(
  groups: Map<string, G>,
  psrInfo: Map<number, Named>,
  all: P[],
  newGroup: (key: string, anchor: Anchor, p: P, tier: string) => G,
  addMember: (g: G, p: P, tier: string) => void,
): void {
  const stop = placeStop(
    null,
    all.map((p) => p.address),
  );
  const rebuild = (
    key: string,
    anchor: Anchor,
    ms: Member<P>[],
    tier?: string,
  ) => {
    for (const m of ms)
      addMember(
        groups.get(key) ?? newGroup(key, anchor, m.raw!, tier ?? m.tier),
        m.raw!,
        tier ?? m.tier,
      );
  };
  let split = 0;
  let unhooked = 0;
  for (const [key, g] of [...groups]) {
    const cls = clusters(g.members, stop);
    const row =
      g.anchor.kind === "psr" && psrInfo.has(g.anchor.id)
        ? psrInfo.get(g.anchor.id)!
        : null;
    const keep = row
      ? cls.filter((cl) => cl.some((m) => agree(m, row, stop)))
      : cls.slice(0, 1);
    const rest = cls.filter((cl) => !keep.includes(cl));
    if (!rest.length) continue;
    groups.delete(key);
    if (keep.length) rebuild(key, g.anchor, keep.flat());
    rest.forEach((cl, i) =>
      rebuild(
        `${key}#${i}`,
        { kind: "tmp", id: g.anchor.id },
        cl,
        row ? "이름다름(흡수 안 함)" : "이름갈림(나눔)",
      ),
    );
    if (row) unhooked += rest.length;
    else split += rest.length;
    for (const cl of rest)
      console.log(
        `  ↳ ${row ? `흡수 안 함 ← #${g.anchor.id} ${row.name_en}` : `나눔 ← ${keep[0]?.[0]?.name_en}`}: ${[...new Set(cl.map((m) => m.name_en))].join(" / ")} (${new Set(cl.map((m) => (m as any).lang)).size}개 언어)`,
      );
  }
  console.log(
    `③ 후처리: 이름 갈림 나눔 ${split} · 창고 행과 이름 다름(흡수 안 함) ${unhooked}`,
  );
}

export function mid(xs: number[]): number | null {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
}

export function majorityCat(cats: string[]): string {
  const cnt: Record<string, number> = {};
  for (const c of cats) cnt[c] = (cnt[c] || 0) + 1;
  return Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown";
}

export function avg(xs: number[]): number | null {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
}

function norm(s?: string | null): string {
  if (!s) return "";
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      // ⚠️ 수정금지(승인필요) 2026-08-27 사장님 지시 = 결합기호 제거 후 NFC 재조합 = 한글 음절이 아래 허용범위(가-힯)에 남는다.
      .normalize("NFC")
      .replace(/[^a-z0-9一-鿿぀-ヿ가-힯 ]/g, " ")
      .replace(/\b(the|el|la|los|las|de|del|of|museo|museum)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}
// ⚠️ 수정금지(승인필요) 2026-08-27 사장님 지시 = 과병합 의심 판정(감사 플래그, 병합 판정에 영향 0).
export function isMixedGroup(members: Named[]): boolean {
  const distinct = [
    ...new Set(members.map((m) => norm(m.name_en)).filter(Boolean)),
  ];
  if (distinct.length <= 1) return false;
  const sets = distinct.map((n) => new Set(n.split(" ")));
  const largest = sets.reduce((a, b) => (b.size > a.size ? b : a));
  return !sets.every((s) => [...s].every((t) => largest.has(t)));
}
