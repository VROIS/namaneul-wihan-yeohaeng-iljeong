import { hav, sectorIntoDays, orderHoming } from "./eng.mjs";
const CENTER = { lat: 48.8566, lng: 2.3522 };
const PACE = {
  Packed: { slot: 90, meal: 60 },
  Normal: { slot: 120, meal: 90 },
  Relaxed: { slot: 150, meal: 120 },
};
const H = 11.06,
  r30 = (x) => Math.round(x / 30) * 30;
const t2m = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const m2t = (m) =>
  String(Math.floor(m / 60)).padStart(2, "0") +
  ":" +
  String(m % 60).padStart(2, "0");
const END = t2m("21:00");
const sl = (p, c) => (p == null || p <= 3 ? c.slot : r30((p / H) * 60));
const P = (n, pr, la, lo) => ({ n, p: pr, lat: la, lng: lo });
const DATA = {
  heritage: [
    P("루브르", 22, 48.8606, 2.33764),
    P("개선문", 16, 48.8738, 2.29503),
    P("베르사유", 21, 48.8049, 2.12036),
    P("사크레쾨르", 0, 48.8867, 2.3431),
    P("노트르담", 0, 48.853, 2.3499),
    P("팡테옹", 13, 48.8462, 2.34641),
    P("오페라 가르니에", 15, 48.872, 2.3316),
    P("생트샤펠", 13, 48.8554, 2.34496),
    P("앵발리드", 15, 48.8561, 2.31278),
    P("퐁피두", 15, 48.8608, 2.3517),
    P("카타콤", 29, 48.8338, 2.33242),
    P("페르라셰즈", 0, 48.8615, 2.39347),
  ],
  attraction: [
    P("디즈니랜드", 96, 48.8674, 2.78359),
    P("무랭루주", null, 48.8839, 2.33242),
    P("몽마르트르 박물관", 15, 48.8877, 2.34067),
    P("월트디즈니 스튜디오", 94, 48.8681, 2.78039),
    P("아스테릭스", 62, 49.1342, 2.57128),
    P("라 빌레트 공원", 0, 48.8932, 2.39053),
    P("아틀리에 뤼미에르", 17, 48.8616, 2.38081),
    P("파르크 데 프랭스", 25, 48.8414, 2.25305),
    P("그레뱅 뮤지엄", 26, 48.8718, 2.34222),
    P("바토 무슈", 20, 48.864, 2.30594),
    P("바토 파리지앵", 18, 48.8604, 2.29357),
    P("루이비통 재단", 16, 48.8766, 2.26352),
  ],
  healing: [
    P("샹 드 마르스", 0, 48.8558, 2.29838),
    P("튈르리 정원", 0, 48.8635, 2.32749),
    P("뱅센 숲", 0, 48.8294, 2.42654),
    P("베르시 공원", 0, 48.8371, 2.3789),
    P("불로뉴 숲", 0, 48.862, 2.25231),
    P("뷔트 쇼몽", 0, 48.881, 2.38276),
    P("몽소 공원", 0, 48.8797, 2.30895),
    P("쏘 공원", 0, 48.7675, 2.29655),
    P("몽수리 공원", 0, 48.8227, 2.33766),
    P("플로랄 공원", 3, 48.8377, 2.4443),
  ],
  adventure: [
    P("아쿠아불바르", 39, 48.8318, 2.27626),
    P("팀 브레이크", 28, 48.8922, 2.2475),
    P("센사스", 28, 48.8879, 2.34425),
    P("셔우드 파크", 30, 49.1143, 2.3934),
    P("버추얼 룸", 30, 48.858, 2.37076),
    P("더 게임", 32, 48.8467, 2.35208),
    P("코에지오", 30, 49.0532, 2.0537),
    P("에어로카트", 35, 48.9569, 2.20487),
    P("마인드아웃", 30, 48.7797, 2.21721),
    P("서킷 캐롤", 0, 48.9792, 2.5221),
    P("이 스포트", 10, 48.8609, 2.34134),
  ],
};
const NAME = {
  heritage: "Culture 100%",
  attraction: "Attraction 100%",
  healing: "Healing 100%",
  adventure: "Adventure 100%",
};
const SUM = {};
for (const cat of ["heritage", "attraction", "healing", "adventure"]) {
  console.log("\n████ " + NAME[cat] + " · 파리 3일 (실제 엔진 동선) ████");
  for (const pace of ["Packed", "Normal", "Relaxed"]) {
    const c = PACE[pace];
    const nAct = Math.max(1, Math.floor((720 - c.meal) / c.slot)) + 2 - 2;
    const groups = sectorIntoDays(DATA[cat], [nAct, nAct, nAct], CENTER);
    let tot = 0,
      totPaid = 0;
    const out = [];
    for (let d = 0; d < 3; d++) {
      const day = orderHoming(groups[d] || [], CENTER);
      if (!day.length) {
        out.push("  Day " + (d + 1) + "  (배정 없음)");
        continue;
      }
      let t = t2m("09:00"),
        paid = 0,
        act = 0,
        lunch = false,
        prev = CENTER,
        km = 0;
      const rows = [];
      const push = (n, dur, tag) => {
        rows.push([m2t(t), m2t(t + dur), dur, n, tag]);
        t += dur;
      };
      for (const pl of day) {
        const isPaid = pl.p != null && pl.p > 3;
        if (isPaid && paid >= 3) continue;
        const dur = sl(pl.p, c);
        const need = !lunch && act >= 2 ? c.meal : 0;
        if (t + need + dur + c.meal > END) break;
        if (need) {
          push("🍽 점심", c.meal, "");
          lunch = true;
        }
        const dk = hav(prev, pl);
        km += dk;
        prev = pl;
        push(
          pl.n +
            (pl.p == null ? "" : pl.p > 0 ? " (€" + pl.p + ")" : " (무료)"),
          dur,
          isPaid
            ? paid === 0
              ? "⭐오전첫"
              : paid === 1
                ? "⭐오후첫"
                : "⭐오후2"
            : "",
        );
        if (isPaid) paid++;
        act++;
      }
      if (!act) {
        out.push("  Day " + (d + 1) + "  (시간 부족)");
        continue;
      }
      if (!lunch) push("🍽 점심", c.meal, "");
      push("🍽 저녁", c.meal, "");
      out.push("  Day " + (d + 1) + "  [이동 " + km.toFixed(0) + "km]");
      for (const [a, b, dd, n, g] of rows)
        out.push(
          "    " +
            a +
            "~" +
            b +
            " " +
            String(dd + "분").padStart(6) +
            "  " +
            n +
            (g ? "  " + g : ""),
        );
      out.push(
        "    → " +
          m2t(t) +
          " · " +
          act +
          "곳(유료" +
          paid +
          ") · 여유 " +
          (END - t) +
          "분",
      );
      tot += act;
      totPaid += paid;
    }
    console.log("\n── " + pace + " ──");
    console.log(out.join("\n"));
    console.log("  ▸ 3일 " + tot + "곳 (유료" + totPaid + ")");
    (SUM[cat] ??= {})[pace] = [tot, totPaid];
  }
}
console.log("\n\n═══ 요약 ═══");
console.log("카테고리            Packed     Normal    Relaxed");
for (const k of Object.keys(SUM))
  console.log(
    "  " +
      NAME[k].padEnd(18) +
      ["Packed", "Normal", "Relaxed"]
        .map((p) => (SUM[k][p][0] + "곳(유" + SUM[k][p][1] + ")").padStart(11))
        .join(""),
  );
