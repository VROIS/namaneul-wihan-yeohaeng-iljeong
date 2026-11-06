// ⚠️ 수정금지(승인필요) 2026-11-07 사장님 결정 = 공개 글 페이지 HTML 틀 1벌 = 자바스크립트 없이 읽히는 글(AI 크롤러용) (정본 2026-11-07)
import { PAGE_LANGS, pageText, type PageLang } from "./public-pages-text";

export const SITE = "https://tripis.app";

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function slugify(s: string): string {
  const base = s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "place";
}

export interface PageShell {
  lang: PageLang;
  title: string;
  description: string;
  path: string;
  alternates: { lang: PageLang; path: string }[];
  jsonLd?: unknown;
  body: string;
}

const CSS = `
:root{--bg:#fbfcfd;--fg:#14202b;--muted:#5a6876;--line:#e1e7ee;--accent:#1A73E8;--chip:#eef4fd}
@media (prefers-color-scheme:dark){:root{--bg:#10151b;--fg:#e6edf3;--muted:#9aa8b6;--line:#26303a;--accent:#7fb0ff;--chip:#18222d}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.65 system-ui,-apple-system,"Segoe UI","Noto Sans KR","Hiragino Sans","Noto Sans SC",sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px 56px}
header.top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:18px}
header.top a.brand{font-weight:800;font-size:20px;color:var(--accent);text-decoration:none}
h1{font-size:1.6rem;line-height:1.3;margin:.2em 0 .5em}h2{font-size:1.2rem;margin:1.8em 0 .6em}
p{margin:.6em 0}.muted{color:var(--muted);font-size:.9rem}a{color:var(--accent)}
ol.stops{list-style:none;padding:0;margin:0;display:grid;gap:10px}
ol.stops li{border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.time{font-variant-numeric:tabular-nums;font-weight:700}.meta{color:var(--muted);font-size:.88rem}
.cta{display:grid;gap:8px;margin:28px 0;padding:16px;border-radius:12px;background:var(--chip)}
.cta a{font-weight:700}
.brandline{border-top:1px solid var(--line);margin-top:36px;padding-top:16px;color:var(--muted);font-size:.92rem}
nav.langs a{margin-right:10px;font-size:.88rem}
ul.cities{columns:2;padding-left:1.1em}@media (max-width:480px){ul.cities{columns:1}}
`;

const LANG_LABEL: Record<PageLang, string> = {
  en: "English",
  ko: "한국어",
  ja: "日本語",
  fr: "Français",
  zh: "中文",
  es: "Español",
  de: "Deutsch",
};

export function renderPage(p: PageShell): string {
  const t = pageText(p.lang);
  const url = SITE + p.path;
  const alt = p.alternates
    .map(
      (a) =>
        `<link rel="alternate" hreflang="${a.lang === "zh" ? "zh-Hans" : a.lang}" href="${esc(SITE + a.path)}">`,
    )
    .join("");
  const en = p.alternates.find((a) => a.lang === "en");
  const xdef = en
    ? `<link rel="alternate" hreflang="x-default" href="${esc(SITE + en.path)}">`
    : "";
  const langNav = p.alternates
    .filter((a) => a.lang !== p.lang)
    .map(
      (a) =>
        `<a href="${esc(a.path)}" hreflang="${a.lang}">${LANG_LABEL[a.lang]}</a>`,
    )
    .join("");
  const ld = p.jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(p.jsonLd).replace(/</g, "\\u003c")}</script>`
    : "";
  return `<!doctype html><html lang="${t.htmlLang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.title)}</title><meta name="description" content="${esc(p.description)}"><link rel="canonical" href="${esc(url)}">${alt}${xdef}
<meta property="og:type" content="article"><meta property="og:site_name" content="TRIPIS"><meta property="og:title" content="${esc(p.title)}"><meta property="og:description" content="${esc(p.description)}"><meta property="og:url" content="${esc(url)}"><meta name="twitter:card" content="summary">
<style>${CSS}</style>${ld}</head><body><main>
<header class="top"><a class="brand" href="${SITE}/?ref=web_page">TRIPIS</a>${langNav ? `<nav class="langs" aria-label="${esc(t.languages)}">${langNav}</nav>` : ""}</header>
${p.body}
<p class="brandline">${esc(t.brand)}</p>
</main></body></html>`;
}

export function allLangPaths(
  build: (l: PageLang) => string,
): { lang: PageLang; path: string }[] {
  return PAGE_LANGS.map((lang) => ({ lang, path: build(lang) }));
}
