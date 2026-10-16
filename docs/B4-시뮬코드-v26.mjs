// B4 시뮬 기록(엔진 밖, 2026-09-02) = v26 채택 전 실험본, 결과는 docs/b4-tuning-before-after.txt ㊲
import "dotenv/config";
import { pathToFileURL } from "node:url";
const MODES = ["approved", "refined", "refined2", "refined3", "refined4"];
const MODE = MODES.includes(process.env.MODE) ? process.env.MODE : "approved";
const LV = MODES.indexOf(MODE); // 0=1차 … 4=5차
const DAYTRIP_KM = 15;
const base =
  "c:/Users/hzino/Desktop/my-handy-guide2/.claude/worktrees/b4-slot-duration/";
const m = await import(pathToFileURL(base + "server/db.ts").href);
const db = m.db ?? m.default?.db;
const { sql } = await import("drizzle-orm");
const TH = await import(
  pathToFileURL(base + "server/services/agents/transit-haversine.ts").href
);
const legMin = (a, b) =>
  TH.calcTransitHaversine(a, b, TH.pickTransitMode(D(a, b), false).calc)
    .duration;

const CENTER = { lat: 48.8566, lng: 2.3522, name: "도심" };
const CLUSTER_KM = 1.5,
  RINGS = [1, 3, 8, Infinity];
const LUNCH_FROM = 12 * 60,
  DINNER_FROM = 19 * 60,
  PAID_LAST = 18 * 60,
  LONG_STAY = 300,
  FREE_THR = 3;
const PRICED = new Set(["heritage", "attraction", "adventure", "healing"]);
const hav = (a, b, c, d) => {
  const R = 6371,
    r = Math.PI / 180;
  const x =
    Math.sin(((c - a) * r) / 2) ** 2 +
    Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};
const D = (a, b) => hav(a.lat, a.lng, b.lat, b.lng);
const toMin = (s) => {
  const [h, mm] = String(s).split(":").map(Number);
  return h * 60 + mm;
};
const fmt = (t) =>
  `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
const bc = (b) =>
  b
    ? String(b)
        .split("")
        .filter((c) => c !== "0").length
    : 0;
const ang = (pt) =>
  ((Math.atan2(
    pt.lat - CENTER.lat,
    (pt.lng - CENTER.lng) * Math.cos((CENTER.lat * Math.PI) / 180),
  ) *
    180) /
    Math.PI +
    360) %
  360;
const dir = (pt) =>
  ["동", "북동", "북", "북서", "서", "남서", "남", "남동"][
    Math.round(ang(pt) / 45) % 8
  ];
const cen = (items) => ({
  lat: items.reduce((s, x) => s + x.lat, 0) / items.length,
  lng: items.reduce((s, x) => s + x.lng, 0) / items.length,
});
const star = (n) => (n ? "★" + n : "  ");
const isPaid = (a) => (a.price ?? 0) > FREE_THR && PRICED.has(a.cat);

// 식당풀 = 서빙게이트 전체(컷오프 없음 = 이미지 없는 행 포함) / 예산 띠 = 엔진 cityMealTiers 와 같은 계산
const restAll = (
  await db.execute(
    sql`SELECT name_ko n, latitude lat, longitude lng, price_eur p, best_rank br, rank, (image_url IS NOT NULL AND image_url<>'') img FROM place_seed_raw WHERE city_id=19 AND seed_category='restaurant' AND status='active' AND (COALESCE(google_review_count,0)>0 OR best_rank IS NOT NULL) AND latitude IS NOT NULL`,
  )
).rows.map((r) => ({
  n: r.n,
  lat: +r.lat,
  lng: +r.lng,
  p: r.p == null ? null : +r.p,
  best: bc(r.br),
  rank: r.rank ?? 9999,
  img: !!r.img,
}));
const ps = (
  await db.execute(
    sql`SELECT price_eur::float p FROM place_seed_raw WHERE city_id=19 AND seed_category='restaurant' AND status='active' AND google_review_count>0 AND google_place_id IS NOT NULL AND price_eur IS NOT NULL AND price_eur>0 AND image_url IS NOT NULL AND image_url<>'' ORDER BY price_eur`,
  )
).rows.map((r) => +r.p);
const at = (f) => ps[Math.min(ps.length - 1, Math.floor(ps.length * f))];
const tiers = { lo: at(0.3), hi: at(0.8) };
const bandOf = (style) =>
  style === "Economic"
    ? { min: 1, cap: tiers.lo }
    : style === "Reasonable"
      ? { min: tiers.lo, cap: tiers.hi }
      : { min: tiers.hi, cap: Infinity };

// C = 출발(도심 최원거리) 고정 + 종료(도심) 고정 + 최근접 + 2-opt (경계 고정) → 경로와 그 길이(도심 귀환 포함)
const homePath = (pts) => {
  if (pts.length === 0) return { path: [], km: 0 };
  if (pts.length === 1) return { path: [...pts], km: D(CENTER, pts[0]) * 2 };
  const start = pts.reduce((a, b) => (D(CENTER, b) > D(CENTER, a) ? b : a));
  const rem = pts.filter((p) => p !== start);
  const path = [start];
  let cur = start;
  while (rem.length) {
    let bi = 0,
      bd = Infinity;
    rem.forEach((p, i) => {
      const d = D(cur, p);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    path.push(rem[bi]);
    cur = rem[bi];
    rem.splice(bi, 1);
  }
  path.push(CENTER);
  const n = path.length;
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i <= n - 3; i++)
      for (let j = i + 1; j <= n - 2; j++) {
        const delta =
          D(path[i - 1], path[j]) +
          D(path[i], path[j + 1]) -
          D(path[i - 1], path[i]) -
          D(path[j], path[j + 1]);
        if (delta < -1e-9) {
          path.splice(i, j - i + 1, ...path.slice(i, j + 1).reverse());
          improved = true;
        }
      }
  }
  let km = D(CENTER, path[0]);
  for (let i = 1; i < n; i++) km += D(path[i - 1], path[i]);
  return { path: path.slice(0, -1), km };
};
const pathKm = (order) => {
  if (!order.length) return 0;
  let km = D(CENTER, order[0]);
  for (let i = 1; i < order.length; i++) km += D(order[i - 1], order[i]);
  return km + D(order[order.length - 1], CENTER);
};

const TITLE = {
  approved: "1차 = 2026-09-02 승인 문구 그대로",
  refined: "2차 = 유료 자리바꿈 · 식당 상한 안까지 반경 확장 · 날 = km 최소",
  refined2: "3차 = 2차 + 무료 미루기 + 당일치기 하루 1개",
  refined3:
    "4차 = 3차 + 붙은 먼 구역 = 한 당일치기 + 가까운 무료만 미룸 + 약한 시간 균등",
  refined4: "5차 = 4차 + 넘친 곳을 앞 날 빈자리에 끼워 넣기",
};
console.log(
  `\n#################### MODE = ${MODE} (${TITLE[MODE]}) ####################`,
);
for (const id of process.argv.slice(2).map(Number)) {
  const row = (
    await db.execute(sql`SELECT raw_data FROM itineraries WHERE id=${id}`)
  ).rows[0];
  const rd =
    typeof row.raw_data === "string" ? JSON.parse(row.raw_data) : row.raw_data;
  const N = rd.days.length,
    startMin = toMin(rd.startTime),
    endMin = toMin(rd.endTime),
    style = rd.travelStyle;
  const firstMeal = rd.days.flatMap((d) => d.places).find((p) => p.isMealSlot);
  const meal = firstMeal
    ? toMin(firstMeal.endTime) - toMin(firstMeal.startTime)
    : 60;
  const band = bandOf(style);
  const acts = [];
  const seen = new Set();
  for (const d of rd.days)
    for (const p of d.places) {
      const n = p.nameKo || p.name;
      if (!p.isMealSlot && !seen.has(n)) {
        seen.add(n);
        acts.push({
          name: n,
          lat: +p.lat,
          lng: +p.lng,
          best: bc(p.bestRank),
          price: p.estimatedPriceEur ?? null,
          cat: p.seedCategory || "?",
          dur: toMin(p.endTime) - toMin(p.startTime),
        });
      }
    }
  const origKm = rd.days.reduce((s, d) => {
    let prev = null,
      k = 0;
    for (const p of d.places) {
      if (prev) k += hav(+prev.lat, +prev.lng, +p.lat, +p.lng);
      prev = p;
    }
    return s + k;
  }, 0);
  const cats = [...new Set(acts.map((a) => a.cat))].join("+");
  console.log(
    `\n${"═".repeat(78)}\n 재료 = 여정 #${id}  파리 ${N}일 ${rd.startTime}~${rd.endTime} · ${cats} · ${style}(식사 띠 €${band.min}~${band.cap === Infinity ? "∞" : band.cap}) · 활동 ${acts.length}곳(★${acts.filter((a) => a.best).length}) · 식사 ${meal}분 · 원본 이동 ${origKm.toFixed(1)}km\n${"═".repeat(78)}`,
  );

  // A 구역 = 1.5km 안에서 이어지는 묶음. 하루보다 큰 구역만 C 순서로 쪼갬.
  const par = acts.map((_, i) => i);
  const find = (i) => (par[i] === i ? i : (par[i] = find(par[i])));
  for (let i = 0; i < acts.length; i++)
    for (let j = i + 1; j < acts.length; j++)
      if (D(acts[i], acts[j]) <= CLUSTER_KM) par[find(i)] = find(j);
  const g = new Map();
  acts.forEach((a, i) => {
    const k = find(i);
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(a);
  });
  const zones = [...g.values()].map((items, zid) => ({ zid, items }));
  zones.forEach((z) => z.items.forEach((a) => (a.zid = z.zid)));
  const dayCap = endMin - startMin - 2 * meal,
    load = (items) => items.reduce((s, a) => s + a.dur, 0);
  let splitCount = 0;
  const clusters = [];
  for (const z of zones) {
    if (load(z.items) <= dayCap) {
      clusters.push({ zid: z.zid, items: z.items, c: cen(z.items) });
      continue;
    }
    splitCount++;
    const ord = homePath(z.items).path;
    let chunk = [];
    for (const a of ord) {
      if (chunk.length && load(chunk) + a.dur > dayCap) {
        clusters.push({ zid: z.zid, items: chunk, c: cen(chunk) });
        chunk = [];
      }
      chunk.push(a);
    }
    if (chunk.length)
      clusters.push({ zid: z.zid, items: chunk, c: cen(chunk) });
  }
  // B 방향 한 바퀴(Sweep) → N일로 자르기, 구역 통째.  1차 = 시간 균등  /  2차~ = 하루 경로 km 합 최소(+벌점)
  const byAng = clusters.slice().sort((a, b) => ang(a.c) - ang(b.c));
  const K = byAng.length;
  let best = null;
  if (LV === 0) {
    const total = load(acts),
      cap = Math.ceil(total / N);
    for (let o = 0; o < K; o++) {
      const seq = [...byAng.slice(o), ...byAng.slice(0, o)];
      const days = [];
      let cur = [],
        cnt = 0;
      for (const c of seq) {
        const l = load(c.items);
        if (cnt > 0 && cnt + l > cap && days.length < N - 1) {
          days.push(cur);
          cur = [];
          cnt = 0;
        }
        cur.push(...c.items);
        cnt += l;
      }
      days.push(cur);
      while (days.length < N) days.push([]);
      const loads = days.map(load);
      const score = Math.max(...loads) - Math.min(...loads);
      if (!best || score < best.score) best = { days, score };
    }
  } else {
    const memo = new Map();
    const groupCost = (seq, i, j) => {
      const key = seq
        .slice(i, j)
        .map((c) => c.zid + ":" + c.items.length + ":" + c.c.lat)
        .join("|");
      if (memo.has(key)) return memo.get(key);
      const items = seq.slice(i, j).flatMap((c) => c.items);
      const over = Math.max(0, load(items) - dayCap);
      const farCs = seq.slice(i, j).filter((c) => D(CENTER, c.c) > DAYTRIP_KM);
      let trips = 0;
      const seenFar = [];
      for (const c of farCs) {
        if (
          !seenFar.some(
            (s) =>
              D(s.c, c.c) <= 0.5 * Math.min(D(CENTER, s.c), D(CENTER, c.c)),
          )
        )
          trips++;
        seenFar.push(c);
      }
      const farPen =
        LV === 2 && farCs.length > 1
          ? (farCs.length - 1) * 300
          : LV >= 3 && trips > 1
            ? (trips - 1) * 300
            : 0;
      const balPen = LV >= 3 ? Math.abs(load(items) - load(acts) / N) * 0.1 : 0;
      const cost = homePath(items).km + over * 1.0 + farPen + balPen;
      memo.set(key, cost);
      return cost;
    };
    for (let o = 0; o < K; o++) {
      const seq = [...byAng.slice(o), ...byAng.slice(0, o)];
      const dp = Array.from({ length: K + 1 }, () =>
        Array(N + 1).fill(Infinity),
      );
      const cut = Array.from({ length: K + 1 }, () => Array(N + 1).fill(-1));
      dp[0][0] = 0;
      for (let k = 1; k <= N; k++)
        for (let i = k; i <= K; i++)
          for (let j = k - 1; j < i; j++) {
            const v = dp[j][k - 1] + groupCost(seq, j, i);
            if (v < dp[i][k]) {
              dp[i][k] = v;
              cut[i][k] = j;
            }
          }
      if (K >= N && dp[K][N] < (best?.score ?? Infinity)) {
        const days = [];
        let i = K;
        for (let k = N; k >= 1; k--) {
          const j = cut[i][k];
          days.unshift(seq.slice(j, i).flatMap((c) => c.items));
          i = j;
        }
        best = { days, score: dp[K][N] };
      }
    }
    if (!best) {
      const days = byAng.map((c) => c.items);
      while (days.length < N) days.push([]);
      best = { days, score: 0 };
    }
  }
  // E 식사: 1차 = 첫 반경에서 멈춤(예산 안→상한 이하→아무거나) / 2차~ = 상한 안이 나올 때까지 반경 확장, 상한 밖은 최후
  const usedRest = new Set();
  const pickRest = (anchor) => {
    const scored = restAll
      .filter((r) => !usedRest.has(r.n))
      .map((r) => ({ ...r, d: D(anchor, r) }));
    const byBestRc = (a, b) => b.best - a.best || a.rank - b.rank || a.d - b.d;
    for (const ring of RINGS) {
      const inRing = scored.filter((x) => x.d <= ring);
      if (!inRing.length) continue;
      const inB = inRing.filter(
        (x) => x.p != null && x.p >= band.min && x.p <= band.cap,
      );
      const under = inRing.filter((x) => x.p != null && x.p <= band.cap);
      const pool = inB.length
        ? inB
        : under.length
          ? under
          : LV === 0
            ? inRing
            : [];
      if (pool.length) {
        const pick = pool.sort(byBestRc)[0];
        usedRest.add(pick.n);
        return pick;
      }
    }
    const any = scored.sort((a, b) => a.d - b.d)[0];
    if (any) usedRest.add(any.n);
    return any ?? null;
  };
  // D 시각 = C 순서 그대로(점심 12시 뒤·저녁 19시·유료 18시 전·5h+ 점심 생략). 못 들어간 것 = late.
  const schedule = (order) => {
    let acc = startMin,
      lunchDone = false;
    const placed = [],
      late = [];
    for (const a of order) {
      if (!lunchDone && acc >= LUNCH_FROM) {
        acc = Math.max(acc, LUNCH_FROM) + meal;
        lunchDone = true;
      }
      if ((isPaid(a) && acc >= PAID_LAST) || acc + a.dur > endMin - meal) {
        late.push(a);
        continue;
      }
      placed.push(a);
      acc += a.dur;
      if (!lunchDone && a.dur >= LONG_STAY) lunchDone = true;
    }
    return { placed, late };
  };
  // ① 유료 앞당김: 2차 = 자리 바꿈 / 3차 = 바로 앞 무료를 그 유료 뒤로 / 4차~ = 그 유료 3km 안 무료만
  const repairPaid = (order) => {
    let cur = [...order];
    for (let guard = 0; guard < cur.length * cur.length; guard++) {
      const { late } = schedule(cur);
      const p = late.find(isPaid);
      if (!p) break;
      const idx = cur.indexOf(p);
      let f = -1;
      for (let i = idx - 1; i >= 0; i--)
        if (!isPaid(cur[i]) && (LV < 3 || D(cur[i], p) <= 3)) {
          f = i;
          break;
        }
      if (f < 0) break;
      if (LV >= 2) {
        const [free] = cur.splice(f, 1);
        cur.splice(cur.indexOf(p) + 1, 0, free);
      } else {
        [cur[f], cur[idx]] = [cur[idx], cur[f]];
      }
    }
    return cur;
  };
  // 날별 순서 확정(넘침은 다음 날로), 5차 = 마지막 날 넘침을 앞 날 빈자리에 가장 싸게 끼워 넣기
  const dayOrders = [];
  let carry = [],
    dropped = [],
    swaps = 0;
  for (let d = 0; d < N; d++) {
    let order = homePath([...carry, ...best.days[d]]).path;
    carry = [];
    if (LV >= 1) {
      const fixed = repairPaid(order);
      if (fixed.some((a, i) => a !== order[i])) swaps++;
      order = fixed;
    }
    const { placed, late } = schedule(order);
    dayOrders.push(placed);
    (d < N - 1 ? carry : dropped).push(...late);
  }
  let rescued = 0;
  if (LV >= 4) {
    const rest = [];
    for (const a of dropped) {
      let done = false;
      for (let d = 0; d < N && !done; d++) {
        let bestO = null,
          bestK = Infinity;
        for (let pos = 0; pos <= dayOrders[d].length; pos++) {
          const o = [
            ...dayOrders[d].slice(0, pos),
            a,
            ...dayOrders[d].slice(pos),
          ];
          const k = pathKm(o);
          if (k < bestK && schedule(o).late.length === 0) {
            bestK = k;
            bestO = o;
          }
        }
        if (bestO) {
          dayOrders[d] = bestO;
          done = true;
          rescued++;
        }
      }
      if (!done) rest.push(a);
    }
    dropped = rest;
  }
  // 출력 = 식사까지 붙여 시각표 (점심 기준 = 직전 활동, 저녁 기준 = 실제 마지막 활동, 식사는 기준점을 옮기지 않음)
  let totKm = 0,
    placedBest = 0;
  const zoneDays = new Map();
  for (let d = 0; d < N; d++) {
    let acc = startMin,
      cursor = null,
      lunchDone = false;
    const seq = [];
    const actDeadline = endMin - meal;
    const takeLunch = () => {
      const anchor = cursor ?? CENTER;
      const L = pickRest(anchor);
      lunchDone = true;
      if (!L) return;
      const st = Math.max(acc, LUNCH_FROM);
      if (st + meal > actDeadline) return;
      seq.push({ meal: "점심", ...L, at: st, dur: meal });
      acc = st + meal;
    };
    for (const a of dayOrders[d]) {
      if (!lunchDone && acc >= LUNCH_FROM) takeLunch();
      seq.push({ ...a, at: acc });
      acc += a.dur;
      cursor = a;
      if (!lunchDone && a.dur >= LONG_STAY) lunchDone = true;
    }
    if (!lunchDone && cursor) takeLunch();
    if (cursor) {
      const Dn = pickRest(cursor);
      if (Dn) {
        const st = Math.max(acc, DINNER_FROM);
        if (st + meal <= endMin)
          seq.push({ meal: "저녁", ...Dn, at: st, dur: meal });
      }
    }
    seq.sort((x, y) => x.at - y.at);
    let prev = null,
      km = 0,
      trMin = seq.length ? legMin(CENTER, seq[0]) : 0;
    const zset = new Set();
    const rows = [];
    for (const s of seq) {
      const leg = prev ? D(prev, s) : 0;
      km += leg;
      if (prev) trMin += legMin(prev, s);
      prev = s;
      if (s.meal)
        rows.push(
          `    ${fmt(s.at)}~${fmt(s.at + s.dur)}  🍽 ${s.meal}  ${s.n} (€${s.p ?? "?"})${s.best ? " ★" + s.best : ""}${s.img ? "" : " [이미지X]"}  ←${leg.toFixed(1)}km`,
        );
      else {
        zset.add(s.zid);
        if (s.best) placedBest++;
        rows.push(
          `    ${fmt(s.at)}~${fmt(s.at + s.dur)}  ${star(s.best)} ${dir(s).padEnd(2)} [${String(s.cat).padEnd(10)}] ${s.name}${s.price != null ? ` (€${s.price})` : ""}${leg ? `  ←${leg.toFixed(1)}km` : ""}`,
        );
      }
    }
    zset.forEach((z) => {
      if (!zoneDays.has(z)) zoneDays.set(z, new Set());
      zoneDays.get(z).add(d);
    });
    const lastAct = [...seq].reverse().find((s) => !s.meal);
    totKm += km;
    console.log(
      `\n  ── Day${d + 1}  활동 ${seq.filter((s) => !s.meal).length}곳 · 식사 ${seq.filter((s) => s.meal).length}회 · 이동 ${km.toFixed(1)}km · 마지막 활동→도심 ${lastAct ? D(lastAct, CENTER).toFixed(1) : "-"}km · 구역 ${[...zset].map((z) => "#" + z).join(" ")}`,
    );
    {
      const actMin = seq.filter((s) => !s.meal).reduce((x, s) => x + s.dur, 0),
        mealMin = seq.filter((s) => s.meal).length * meal,
        dayMin = endMin - startMin,
        used = actMin + mealMin + trMin;
      console.log(
        `     ⏱ 가용 ${(dayMin / 60).toFixed(1)}h = 활동 ${(actMin / 60).toFixed(1)}h + 식사 ${(mealMin / 60).toFixed(1)}h + 이동(엔진공식·시각표엔 0) ${(trMin / 60).toFixed(1)}h → 실제 ${(used / 60).toFixed(1)}h ${used > dayMin ? "= 넘침 " + ((used - dayMin) / 60).toFixed(1) + "h" : "= 빔 " + ((dayMin - used) / 60).toFixed(1) + "h"}`,
      );
    }
    console.log(rows.join("\n") || "    (비어 있음)");
  }
  const twice = [...zoneDays.values()].filter((s) => s.size > 1).length;
  console.log(
    `\n  ▶ 이동 합계 ${totKm.toFixed(1)}km (원본 ${origKm.toFixed(1)}km, ${Math.round((1 - totKm / origKm) * 100)}% 감소) · ★ ${placedBest}/${acts.filter((a) => a.best).length} 배치 · 구역 ${zoneDays.size}개 중 이틀 이상 걸친 구역 ${twice}개${splitCount ? ` (하루보다 큰 구역 분할 ${splitCount}건)` : ""}${LV >= 1 ? ` · 유료 앞당김 ${swaps}일` : ""}${LV >= 4 ? ` · 앞 날 끼워넣기 ${rescued}곳` : ""} · 탈락 ${dropped.length}곳${dropped.length ? " = " + dropped.map((a) => a.name).join(", ") : ""}`,
  );
}
process.exit(0);
