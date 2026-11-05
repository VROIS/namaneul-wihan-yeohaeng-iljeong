// ⚠️ 수정금지(승인필요) 2026-11-05 사장님 결정 = 홍보 탭 그리기 1벌 = 저장본 promo 자료 → 기간(7일·30일·전체) · 카드 4 · 채널별 하루 조회 · 상위 4편 · 편별 표 · 숏폼→앱 (공식 채널 5 · BTS 도 같은 순위 · 하루 경계 = 파리 시간) (정본 2026-11-05)
(() => {
  const CH = [
    { k: "youtube", name: "YouTube", short: "YT", color: "#FF5A5A" },
    { k: "instagram", name: "Instagram", short: "IG", color: "#E1306C" },
    { k: "tiktok", name: "TikTok", short: "TT", color: "#25F4EE" },
    { k: "threads", name: "Threads", short: "Th", color: "#D9DDE3" },
    { k: "x", name: "X", short: "X", color: "#7AA7FF" },
  ];
  const TOP = ["#F5C542", "#A78BFA", "#34D399", "#FB923C"];
  const PERIODS = [
    { k: 7, label: "7일" },
    { k: 30, label: "30일" },
    { k: 0, label: "전체" },
  ];
  const DAY = 864e5;
  const st = {
    period: 7,
    hidden: new Set(),
    axis: "age",
    sort: { key: "total", dir: -1 },
    data: null,
  };

  const esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("ko-KR"));
  const addDays = (d, n) =>
    new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
  const parisDay = (iso) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(
      new Date(iso),
    );
  const parisTime = (iso) =>
    new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso));
  const md = (d) => `${d.slice(5, 7)}/${d.slice(8, 10)}`;
  const dayLabel = (d) =>
    `${md(d)}(${"일월화수목금토"[new Date(`${d}T00:00:00Z`).getUTCDay()]})`;
  const niceMax = (v) => {
    const m = Math.max(10, v);
    const p = 10 ** Math.floor(Math.log10(m));
    const f = [1, 2, 2.5, 5, 10].find((x) => x * p >= m);
    return f * p;
  };
  const fresh = (iso) => Date.now() - Date.parse(iso) < DAY;

  // ── 자료 → 게시물별 하루 증가 · 편 묶음 ──
  function model(data) {
    const posts = data.posts.map((p) => {
      const pts = [...p.points].sort((a, b) => (a.d < b.d ? -1 : 1));
      const inc = {};
      let pv = 0;
      let pr = 0;
      let lastV = null;
      let lastR = null;
      for (const q of pts) {
        const r = q.l == null && q.c == null ? null : (q.l ?? 0) + (q.c ?? 0);
        const e = (inc[q.d] = { v: null, r: null });
        if (q.v != null) {
          e.v = q.v - pv;
          pv = lastV = q.v;
        }
        if (r != null) {
          e.r = r - pr;
          pr = lastR = r;
        }
      }
      return { ...p, pts, inc, lastV, lastR, day: parisDay(p.postedAt) };
    });
    const eps = new Map();
    for (const p of posts) {
      const e = eps.get(p.episode) || {
        name: p.episode,
        track: p.track,
        postedAt: p.postedAt,
        posts: [],
      };
      if (p.postedAt < e.postedAt) e.postedAt = p.postedAt;
      e.posts.push(p);
      eps.set(p.episode, e);
    }
    return { posts, eps: [...eps.values()] };
  }

  function windowDays(m, today) {
    if (st.period) {
      const days = [];
      const prev = [];
      for (let i = st.period - 1; i >= 0; i--) days.push(addDays(today, -i));
      for (let i = 2 * st.period - 1; i >= st.period; i--)
        prev.push(addDays(today, -i));
      return { days, prev };
    }
    let start = today;
    for (const p of m.posts) {
      if (p.day < start) start = p.day;
      for (const q of p.pts) if (q.d < start) start = q.d;
    }
    const days = [];
    for (let d = start; d <= today; d = addDays(d, 1)) days.push(d);
    return { days, prev: [] };
  }

  const sumInc = (posts, days, f) => {
    let sum = 0;
    let has = false;
    for (const p of posts)
      for (const d of days) {
        const v = p.inc[d]?.[f];
        if (v != null) {
          sum += v;
          has = true;
        }
      }
    return { sum, has };
  };

  function delta(cur, prev, has) {
    if (!st.period) return "";
    const tail = `<span class="pr-mute">지난 ${st.period}일 대비</span>`;
    if (!has || !prev) return `<div class="pr-delta pr-mute">— ${tail}</div>`;
    const diff = cur - prev;
    const up = diff >= 0;
    let txt;
    if (prev < 20) txt = `${up ? "+" : ""}${diff}`;
    else {
      const pct = Math.abs((diff / prev) * 100);
      txt = `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;
    }
    return `<div class="pr-delta" style="color:${up ? "#34D399" : "#F87171"}">${up ? "▲" : "▼"} ${txt} ${tail}</div>`;
  }

  // ── 위 줄: 기간 · 마지막 갱신 ──
  function headHtml(m, today) {
    const btns = PERIODS.map(
      (p) =>
        `<button type="button" class="pr-seg${st.period === p.k ? " on" : ""}" data-act="period" data-v="${p.k}" aria-pressed="${st.period === p.k}">${p.label}</button>`,
    ).join("");
    const last = CH.map((c) => {
      let at = null;
      for (const p of m.posts)
        if (p.channel === c.k)
          for (const q of p.pts) if (!at || q.at > at) at = q.at;
      if (!at)
        return `<span class="pr-mute2"><b style="color:${c.color}">●</b> ${c.name} 입력 없음</span>`;
      const d = parisDay(at);
      return `<span><b style="color:${c.color}">●</b> ${c.name} ${d === today ? "" : md(d) + " "}${parisTime(at)} ${c.k === "youtube" ? "자동" : "입력"}</span>`;
    }).join("");
    return `<div class="pr-box pr-head"><div class="pr-segs" role="group" aria-label="기간">${btns}</div><div class="pr-last"><span>마지막 갱신 (파리)</span>${last}</div></div>`;
  }

  // ── 요약 카드 4 ──
  function cardsHtml(m, w, signups) {
    const v = sumInc(m.posts, w.days, "v");
    const vp = sumInc(m.posts, w.prev, "v");
    const r = sumInc(m.posts, w.days, "r");
    const rp = sumInc(m.posts, w.prev, "r");
    const su = w.days.reduce((a, d) => a + (signups[d] || 0), 0);
    const sp = w.prev.reduce((a, d) => a + (signups[d] || 0), 0);
    let best = null;
    for (const c of CH) {
      const s = sumInc(
        m.posts.filter((p) => p.channel === c.k),
        w.days,
        "v",
      ).sum;
      if (s > 0 && (!best || s > best.s)) best = { c, s };
    }
    const span = st.period ? `${st.period}일` : "전체";
    const card = (label, val, extra, dim) =>
      `<div class="pr-box pr-card"><div class="pr-lab">${label}</div><div class="pr-big"${dim ? ' style="color:#8A96B0"' : ""}>${val}</div>${extra}</div>`;
    return `<div class="pr-cards">${[
      card(
        `조회 (${span} 증가분 · 5채널 합)`,
        fmt(v.sum),
        delta(v.sum, vp.sum, vp.has) +
          (best
            ? `<div class="pr-sub">가장 많이 본 채널 = ${best.c.name} ${Math.round((best.s / v.sum) * 100)}%</div>`
            : ""),
      ),
      card("반응 (좋아요 + 댓글)", fmt(r.sum), delta(r.sum, rp.sum, rp.has)),
      card("신규 가입 (앱 기록)", fmt(su), delta(su, sp, true)),
      card(
        "[App] 버튼 누름",
        "—",
        '<div class="pr-sub">기록 없음 (세는 곳이 없음)</div>',
        true,
      ),
    ].join("")}</div>`;
  }

  // ── 그래프 공통 ──
  function frame(W, H, yMax, pad) {
    let g = "";
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + ((H - pad.t - pad.b) * i) / 4;
      g += `<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" stroke="#1E2A44"/><text x="${pad.l - 6}" y="${y + 4}" fill="#8A96B0" font-size="11" text-anchor="end">${fmt(Math.round((yMax * (4 - i)) / 4))}</text>`;
    }
    return g;
  }
  const anchor = (x, W, pad) =>
    x < pad.l + 30 ? "start" : x > W - pad.r - 30 ? "end" : "middle";
  const textW = (t) =>
    [...t].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2fff ? 10 : 6), 0);
  const xLabels = (W, pad, n, xOf, label) => {
    const step = Math.max(
      1,
      Math.ceil(n / Math.floor((W - pad.l - pad.r) / 64)),
    );
    let s = "";
    for (let i = 0; i < n; i += step)
      s += `<text x="${xOf(i)}" y="${pad.y1}" fill="#8A96B0" font-size="11" text-anchor="${anchor(xOf(i), W, pad)}">${label(i)}</text>`;
    return s;
  };
  const line = (pts, color, dashed) =>
    pts.length > 1
      ? `<polyline points="${pts.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"${dashed ? ' stroke-dasharray="5 5"' : ""}/>`
      : "";

  // ── 그래프 ① 채널별 하루 조회 ──
  function channelChart(m, w, today, W) {
    const H = 260;
    const pad = { l: 44, r: 12, t: 14, b: 52, y1: 224, y2: 244 };
    const n = w.days.length;
    const series = CH.map((c) => {
      const ps = m.posts.filter((p) => p.channel === c.k);
      const vals = w.days.map((d) => {
        let s = null;
        for (const p of ps) {
          const v = p.inc[d]?.v;
          if (v != null) s = (s ?? 0) + v;
        }
        return s;
      });
      return { c, vals, has: vals.some((v) => v != null) };
    });
    const vis = series.filter((s) => s.has && !st.hidden.has(s.c.k));
    const yMax = niceMax(
      Math.max(0, ...vis.flatMap((s) => s.vals.map((v) => v ?? 0))),
    );
    const xOf = (i) =>
      n === 1
        ? (pad.l + W - pad.r) / 2
        : pad.l + ((W - pad.l - pad.r) * i) / (n - 1);
    const yOf = (v) =>
      pad.t + (H - pad.t - pad.b) * (1 - Math.max(0, v) / yMax);
    let body = "";
    for (const s of vis) {
      let run = [];
      const flush = () => {
        const last = run[run.length - 1];
        const dashTail = last && w.days[last.i] === today && run.length > 1;
        const solid = dashTail ? run.slice(0, -1) : run;
        body += line(
          solid.map((p) => p.xy),
          s.c.color,
          false,
        );
        if (dashTail)
          body += line(
            run.slice(-2).map((p) => p.xy),
            s.c.color,
            true,
          );
        run = [];
      };
      s.vals.forEach((v, i) => {
        if (v == null) return flush();
        const xy = [xOf(i), yOf(v)];
        run.push({ i, xy });
        body += `<circle cx="${xy[0]}" cy="${xy[1]}" r="3" fill="${s.c.color}"><title>${s.c.name} ${dayLabel(w.days[i])} ${fmt(v)}</title></circle>`;
      });
      flush();
    }
    const byDay = {};
    for (const e of m.eps) {
      const d = parisDay(e.postedAt);
      (byDay[d] = byDay[d] || []).push(e.name);
    }
    let marks = "";
    let lastEnd = -1;
    w.days.forEach((d, i) => {
      const names = byDay[d];
      if (!names) return;
      const x = xOf(i);
      const txt = `▲ ${names[0].length > 9 ? names[0].slice(0, 9) + "…" : names[0]}${names.length > 1 ? ` 외 ${names.length - 1}` : ""}`;
      const half = textW(txt) / 2;
      const show = x - half > lastEnd && x + half < W;
      if (!show && x - 5 <= lastEnd) return;
      lastEnd = show ? x + half + 6 : x + 11;
      marks += `<text x="${x}" y="${pad.y2}" fill="#F5C542" font-size="10" text-anchor="middle"><title>${esc(names.join(" · "))}</title>${show ? esc(txt) : "▲"}</text>`;
    });
    const svg = `<svg width="${W}" height="${H}" role="img" aria-label="채널별 하루 조회 꺾은선 그래프">${frame(W, H, yMax, pad)}${body}${xLabels(W, pad, n, xOf, (i) => dayLabel(w.days[i]))}${marks}</svg>`;
    const legend = series
      .map((s) =>
        s.has
          ? `<button type="button" class="pr-leg" data-act="ch" data-v="${s.c.k}" aria-pressed="${!st.hidden.has(s.c.k)}"${st.hidden.has(s.c.k) ? ' style="opacity:.45"' : ""}><b style="color:${s.c.color}">●</b> ${s.c.name}</button>`
          : `<button type="button" class="pr-leg pr-off" disabled aria-pressed="false"><b style="color:${s.c.color}">●</b> ${s.c.name} · 입력 없음</button>`,
      )
      .join("");
    return `<section class="pr-box"><div class="pr-t"><h2>채널별 하루 조회</h2><span class="pr-mute">하루 증가분 · 오늘은 점선(집계 중)</span></div><div class="pr-svg" data-chart="ch">${svg}</div><div class="pr-legs">${legend}</div></section>`;
  }

  // 편 누적 조회 = 그날까지 게시물마다 마지막 숫자의 합
  function cumSeries(e) {
    const days = [
      ...new Set(e.posts.flatMap((p) => p.pts.map((q) => q.d))),
    ].sort();
    return days.map((d) => {
      let v = 0;
      let at = null;
      for (const p of e.posts) {
        let last = null;
        for (const q of p.pts) if (q.d <= d && q.v != null) last = q.v;
        v += last ?? 0;
        for (const q of p.pts) if (q.d === d && (!at || q.at > at)) at = q.at;
      }
      return { d, v, at };
    });
  }

  // ── 그래프 ② 상위 4편 누적 조회 ──
  function topChart(m, w, W) {
    const H = 240;
    const pad = { l: 44, r: 12, t: 14, b: 30, y1: 228 };
    const ranked = m.eps
      .map((e) => ({ e, s: sumInc(e.posts, w.days, "v").sum }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 4);
    const toggle = `<div class="pr-segs" role="group" aria-label="가로축">${[
      ["age", "게시 후 시간"],
      ["date", "날짜"],
    ]
      .map(
        ([k, l]) =>
          `<button type="button" class="pr-seg${st.axis === k ? " on" : ""}" data-act="axis" data-v="${k}" aria-pressed="${st.axis === k}">${l}</button>`,
      )
      .join("")}</div>`;
    const head = `<div class="pr-t"><h2>상위 4편 누적 조회</h2>${toggle}</div>`;
    if (!ranked.length)
      return `<section class="pr-box">${head}<div class="pr-empty">이 기간에 조회가 늘어난 편이 없습니다</div></section>`;
    const lines = ranked.map(({ e }, i) => {
      const t0 = Date.parse(e.postedAt);
      const s = cumSeries(e);
      const pts =
        st.axis === "age"
          ? [
              { x: 0, v: 0 },
              ...s.map((p) => ({ x: (Date.parse(p.at) - t0) / 36e5, v: p.v })),
            ]
          : [
              ...(w.days.includes(parisDay(e.postedAt))
                ? [{ x: w.days.indexOf(parisDay(e.postedAt)), v: 0 }]
                : []),
              ...s
                .filter((p) => w.days.includes(p.d))
                .map((p) => ({ x: w.days.indexOf(p.d), v: p.v })),
            ];
      return { e, pts, color: TOP[i], live: fresh(e.postedAt) };
    });
    const yMax = niceMax(
      Math.max(0, ...lines.flatMap((l) => l.pts.map((p) => p.v))),
    );
    const n = w.days.length;
    const xMax =
      st.axis === "age"
        ? Math.max(24, ...lines.flatMap((l) => l.pts.map((p) => p.x)))
        : Math.max(1, n - 1);
    const xOf = (x) => pad.l + ((W - pad.l - pad.r) * x) / xMax;
    const yOf = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / yMax);
    let body = "";
    const tags = [];
    for (const l of lines) {
      const xy = l.pts.map((p) => [xOf(p.x), yOf(p.v)]);
      body += line(xy, l.color, l.live);
      for (const [x, y] of xy)
        body += `<circle cx="${x}" cy="${y}" r="2.5" fill="${l.color}"/>`;
      const end = xy[xy.length - 1];
      if (end) tags.push({ x: end[0], y: end[1], l });
    }
    tags.sort((a, b) => a.y - b.y);
    let prevY = -99;
    for (const t of tags) {
      const y = Math.max(t.y - 6, prevY + 13);
      prevY = y;
      const right = t.x > W * 0.6;
      body += `<text x="${right ? t.x - 4 : t.x + 4}" y="${y}" fill="${t.l.color}" font-size="11" font-weight="700" text-anchor="${right ? "end" : "start"}">${esc(t.l.e.name)} ${fmt(t.l.pts[t.l.pts.length - 1].v)}${t.l.live ? " · 집계 중" : ""}</text>`;
    }
    let xl = "";
    if (st.axis === "age") {
      const stepD = Math.max(
        1,
        Math.ceil(
          xMax / 24 / Math.max(1, Math.floor((W - pad.l - pad.r) / 64)),
        ),
      );
      for (let h = 0; h <= xMax; h += stepD * 24)
        xl += `<text x="${xOf(h)}" y="${pad.y1}" fill="#8A96B0" font-size="11" text-anchor="${anchor(xOf(h), W, pad)}">${h === 0 ? "게시" : h <= 48 ? `${h}시간` : `${h / 24}일`}</text>`;
    } else
      xl = xLabels(
        W,
        pad,
        n,
        (i) => xOf(i),
        (i) => dayLabel(w.days[i]),
      );
    const svg = `<svg width="${W}" height="${H}" role="img" aria-label="상위 4편 누적 조회 꺾은선 그래프">${frame(W, H, yMax, pad)}${body}${xl}</svg>`;
    return `<section class="pr-box">${head}<div class="pr-svg" data-chart="top">${svg}</div><div class="pr-mute">게시 후 24시간이 안 된 편은 점선 · "집계 중" · 도시 편과 BTS 예고편을 같은 순위로</div></section>`;
  }

  // ── 편별 표 ──
  function tableHtml(m, w) {
    const span = st.period ? `${st.period}일 증가` : "전체 증가";
    const rows = m.eps.map((e) => {
      const byCh = {};
      for (const c of CH) {
        const ps = e.posts.filter((p) => p.channel === c.k && p.lastV != null);
        byCh[c.k] = ps.length ? ps.reduce((a, p) => a + p.lastV, 0) : null;
      }
      const tv = e.posts.filter((p) => p.lastV != null);
      const tr = e.posts.filter((p) => p.lastR != null);
      return {
        e,
        total: tv.length ? tv.reduce((a, p) => a + p.lastV, 0) : null,
        inc: sumInc(e.posts, w.days, "v").sum,
        react: tr.length ? tr.reduce((a, p) => a + p.lastR, 0) : null,
        ...byCh,
      };
    });
    const { key, dir } = st.sort;
    rows.sort((a, b) =>
      a[key] == null ? 1 : b[key] == null ? -1 : (a[key] - b[key]) * dir,
    );
    const th = (k, label, color) =>
      `<th scope="col" aria-sort="${key === k ? (dir < 0 ? "descending" : "ascending") : "none"}"><button type="button" data-act="sort" data-v="${k}"${color ? ` style="color:${color}"` : ""}>${label}${key === k ? (dir < 0 ? " ▼" : " ▲") : ""}</button></th>`;
    const body = rows
      .map((r) => {
        const e = r.e;
        const links = CH.flatMap((c) =>
          e.posts
            .filter((p) => p.channel === c.k)
            .map(
              (p) =>
                `<a href="${esc(p.url)}" target="_blank" rel="noopener" style="color:${c.color}">${c.short}</a>`,
            ),
        ).join(" ");
        return `<tr><td class="pr-ep"><div><b>${esc(e.name)}</b></div><div class="pr-mute">${md(parisDay(e.postedAt))} · ${e.track === "bts" ? "BTS 예고" : "도시"}${fresh(e.postedAt) ? " · 집계 중" : ""}</div></td><td><b>${fmt(r.total)}</b></td><td style="color:${r.inc > 0 ? "#34D399" : "#8A96B0"}">${r.inc > 0 ? "+" : ""}${fmt(r.inc)}</td>${CH.map((c) => `<td${r[c.k] == null ? ' class="pr-mute2"' : ""}>${fmt(r[c.k])}</td>`).join("")}<td${r.react == null ? ' class="pr-mute2"' : ""}>${fmt(r.react)}</td><td class="pr-links">${links}</td></tr>`;
      })
      .join("");
    return `<section class="pr-box"><div class="pr-t"><h2>편별 성과</h2><span class="pr-mute">열 머리를 누르면 정렬 · 기본 = 조회 많은 순</span></div><div class="pr-scroll"><table class="pr-table"><thead><tr><th scope="col" class="pr-ep">편</th>${th("total", "조회")}${th("inc", span)}${CH.map((c) => th(c.k, c.short, c.color)).join("")}${th("react", "반응")}<th scope="col">원본</th></tr></thead><tbody>${body}</tbody></table></div><div class="pr-mute">조회 정의는 채널마다 다릅니다(예: YouTube 는 재생 시작 때 셈). 합계는 대략값 · "—" = 입력 없음(0 아님)</div></section>`;
  }

  // ── 숏폼 → 앱 ──
  function funnelHtml(m, w, signups) {
    const span = st.period ? `${st.period}일` : "전체 기간";
    const v = sumInc(m.posts, w.days, "v").sum;
    const su = w.days.reduce((a, d) => a + (signups[d] || 0), 0);
    const box = (label, val, sub, dim) =>
      `<div class="pr-fn"><div class="pr-lab">${label}</div><div class="pr-mid"${dim ? ' style="color:#8A96B0"' : ""}>${val}</div><div class="pr-mute">${sub}</div></div>`;
    return `<section class="pr-box"><div class="pr-t"><h2>숏폼 → 앱 (같은 ${span} 나란히)</h2><span class="pr-mute">같은 사람을 따라간 퍼널이 아님 · 이어진 구간만 비율 표시</span></div><div class="pr-fns">${[
      box("① 숏폼 조회", fmt(v), "5채널 합"),
      box("② 영상 링크로 들어옴", "—", "기록 없음", true),
      box("③ 가입", fmt(su), "앱 기록 · 가입 크레딧 50"),
      box("④ [App] 버튼", "—", "기록 없음", true),
    ].join("")}</div></section>`;
  }

  const CSS = `
#tab-promo{--pr-line:#1E2A44}
#tab-promo .pr-wrap{display:flex;flex-direction:column;gap:14px;color:#E6EAF2}
#tab-promo .pr-box{background:#121A2E;border:1px solid var(--pr-line);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px;min-width:0}
#tab-promo .pr-head{flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px}
#tab-promo .pr-segs{display:flex;gap:4px;background:#0B1020;border-radius:10px;padding:4px}
#tab-promo .pr-seg{min-height:44px;padding:0 14px;border:0;border-radius:8px;background:transparent;color:#B4BDD0;font:inherit;font-size:14px;cursor:pointer}
#tab-promo .pr-seg.on{background:#4285F4;color:#fff;font-weight:700}
#tab-promo .pr-last{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:#A3ADC2}
#tab-promo .pr-mute{font-size:12px;color:#8A96B0}
#tab-promo .pr-mute2{color:#6E7891}
#tab-promo .pr-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px}
#tab-promo .pr-card{gap:6px}
#tab-promo .pr-lab{font-size:13px;color:#A3ADC2}
#tab-promo .pr-big{font-size:30px;font-weight:800}
#tab-promo .pr-mid{font-size:24px;font-weight:800}
#tab-promo .pr-delta{font-size:13px}
#tab-promo .pr-sub{font-size:12px;color:#8A96B0}
#tab-promo .pr-charts{display:grid;gap:14px}
#tab-promo .pr-t{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
#tab-promo .pr-t h2{margin:0;font-size:16px;font-weight:700;color:#E6EAF2}
#tab-promo .pr-svg{width:100%;overflow:hidden}
#tab-promo .pr-svg svg{display:block}
#tab-promo .pr-legs{display:flex;flex-wrap:wrap;gap:8px}
#tab-promo .pr-leg{min-height:44px;padding:0 12px;border-radius:999px;border:1px solid var(--pr-line);background:#0B1020;color:#E6EAF2;font:inherit;font-size:13px;cursor:pointer}
#tab-promo .pr-off{border-style:dashed;background:transparent;color:#6E7891;cursor:default}
#tab-promo .pr-empty{padding:30px 0;text-align:center;color:#8A96B0;font-size:13px}
#tab-promo .pr-scroll{overflow-x:auto}
#tab-promo .pr-table{width:100%;min-width:760px;border-collapse:collapse;font-size:13px;text-align:right}
#tab-promo .pr-table th,#tab-promo .pr-table td{padding:9px 8px;border-bottom:1px solid #172038;white-space:nowrap}
#tab-promo .pr-table th{color:#A3ADC2;font-weight:500}
#tab-promo .pr-table th button{background:none;border:0;color:inherit;font:inherit;cursor:pointer;min-height:32px;padding:0}
#tab-promo .pr-table .pr-ep{text-align:left;white-space:normal;min-width:120px}
#tab-promo .pr-links a{text-decoration:none;font-weight:700;margin-left:4px}
#tab-promo .pr-fns{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr));gap:10px}
#tab-promo .pr-fn{background:#0B1020;border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:4px}`;

  function render() {
    const root = document.getElementById("tab-promo");
    if (!root || !st.data) return;
    const d = st.data;
    if (!d.posts.length) {
      root.innerHTML =
        '<div class="pr-box pr-empty">아직 홍보 집계가 없습니다. YouTube 는 1시간마다 자동, 다른 채널은 어사이드 입력 뒤 보입니다.</div>';
      return;
    }
    const m = model(d);
    const w = windowDays(m, d.today);
    const rw = root.clientWidth || 600;
    const two = rw >= 930;
    const cw = Math.max(240, (two ? Math.floor((rw - 14) / 2) : rw) - 30);
    root.innerHTML = `<div class="pr-wrap">${headHtml(m, d.today)}${cardsHtml(m, w, d.signups)}<div class="pr-charts" style="grid-template-columns:${two ? "1fr 1fr" : "1fr"}">${channelChart(m, w, d.today, cw)}${topChart(m, w, cw)}</div>${tableHtml(m, w)}${funnelHtml(m, w, d.signups)}</div>`;
  }

  function onClick(ev) {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const { act, v } = b.dataset;
    if (act === "period") st.period = Number(v);
    if (act === "axis") st.axis = v;
    if (act === "ch" && !st.hidden.delete(v)) st.hidden.add(v);
    if (act === "sort")
      st.sort = { key: v, dir: st.sort.key === v ? -st.sort.dir : -1 };
    render();
  }

  let ready = false;
  window.loadPromo = async () => {
    const root = document.getElementById("tab-promo");
    if (!ready) {
      const s = document.createElement("style");
      s.textContent = CSS;
      document.head.appendChild(s);
      root.addEventListener("click", onClick);
      let t;
      window.addEventListener("resize", () => {
        clearTimeout(t);
        t = setTimeout(render, 150);
      });
      ready = true;
    }
    try {
      const res = await fetch("/api/admin/snapshot");
      const snap = await res.json();
      if (!res.ok || !snap.sections?.promo)
        throw new Error(snap.error || "저장본에 홍보 자료 없음");
      st.data = snap.sections.promo;
      render();
    } catch (e) {
      if (!st.data)
        root.innerHTML = `<div class="pr-box pr-empty">홍보 자료를 읽지 못했습니다 (${esc(e.message)})</div>`;
    }
  };
})();
