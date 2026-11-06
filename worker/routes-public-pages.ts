// ⚠️ 수정금지(승인필요) 2026-11-07 사장님 결정 = 검색·AI 검색·LLM 이 읽는 공개 글 페이지 = 도시 대표 여정 · 창고 해설 · 사이트맵 · LLM 안내문 (정본 2026-11-07)
import type { Express, Request, Response } from "express";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import * as schema from "../shared/schema";
import type { Db, OpenDb } from "./db-types";
import { readyCities } from "./best-itinerary/city-resolver";
import { applyItineraryTranslations } from "./best-itinerary/translate";
import { warehouseGuideOrder } from "./lib/warehouse-guide-order";
import {
  cityWithRepresentative,
  pickDisplayName,
} from "./lib/services/shared/city-representative-place";
import {
  PAGE_LANGS,
  isPageLang,
  pageText,
  paceKey,
  whoKey,
  type PageLang,
} from "./lib/public-pages-text";
import {
  SITE,
  esc,
  slugify,
  renderPage,
  allLangPaths,
} from "./lib/public-pages-html";

const { guides, placeSeedRaw, cities } = schema;
const HANGUL = /[가-힣]/;
const REF = "ref=web_page";

const tripPath = (lang: PageLang, cityId: number, nameEn: string | null) =>
  `/trips/${lang}/${cityId}-${slugify(nameEn || String(cityId))}`;
const guidePath = (lang: PageLang, placeId: number, name: string) =>
  `/guides/${lang}/${placeId}-${slugify(name)}`;
const leadingId = (slug: string): number =>
  parseInt(String(slug).split("-")[0], 10);

function placeName(
  lang: PageLang,
  p: {
    nameKo?: string | null;
    nameEn?: string | null;
    nameLocal?: string | null;
    name?: string | null;
  },
): string {
  if (lang === "ko") return (p.nameKo || p.name || pickDisplayName(p)).trim();
  return pickDisplayName({
    nameEn: p.nameEn,
    nameLocal: p.nameLocal,
    nameKo: p.nameKo || p.name,
  });
}
// 다른 언어 페이지에 번역 안 된 한국어 글이 섞이지 않게 한다.
const textFor = (lang: PageLang, s: unknown): string => {
  const v = String(s ?? "").trim();
  return lang !== "ko" && HANGUL.test(v) ? "" : v;
};
const dbId = (slotId: unknown): number | null => {
  const m = /^db-(\d+)$/.exec(String(slotId ?? ""));
  return m ? Number(m[1]) : null;
};

function sendHtml(res: Response, html: string, status = 200) {
  res.status(status);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(html);
}

async function warehouseGuide(db: Db, placeId: number, lang: PageLang) {
  const [row] = await db
    .select({
      content: guides.aiGeneratedContent,
      description: guides.description,
      updatedAt: guides.createdAt,
    })
    .from(guides)
    .where(and(eq(guides.placeId, placeId), eq(guides.language, lang)))
    .orderBy(...(await warehouseGuideOrder(db)))
    .limit(1);
  const text = (row?.content || row?.description || "").trim();
  return text ? { text, updatedAt: row!.updatedAt } : null;
}

async function citiesWithTrips(db: Db) {
  const ready = await readyCities(db);
  const reps = await Promise.all(
    ready.map((c) => cityWithRepresentative(db, c.id)),
  );
  return ready
    .map((c, i) => ({ ...c, rep: reps[i] }))
    .filter(
      (c) =>
        c.rep?.itineraryId != null &&
        Array.isArray((c.rep.rawData as any)?.days) &&
        (c.rep.rawData as any).days.length > 0,
    );
}

export function registerPublicPageRoutes(app: Express, openDb: OpenDb): void {
  app.get("/trips", (_req: Request, res: Response) =>
    res.redirect(302, "/trips/en"),
  );

  app.get("/trips/:lang", async (req: Request, res: Response) => {
    const lang = String(req.params.lang);
    if (!isPageLang(lang)) return res.status(404).send("Not found");
    const { db, close } = openDb();
    try {
      const t = pageText(lang);
      const list = await citiesWithTrips(db);
      const items = list
        .map((c) => {
          const name = lang === "ko" ? c.nameKo : c.nameEn || c.nameKo;
          const days = (c.rep!.rawData as any).days.length;
          return `<li><a href="${esc(tripPath(lang, c.id, c.nameEn))}">${esc(t.tripTitle(name, days, t.who[whoKey(c.rep!.companionType, c.rep!.curationFocus)]))}</a></li>`;
        })
        .join("");
      const body = `<h1>${esc(t.indexTitle)}</h1><p>${esc(t.indexIntro)}</p><ul class="cities">${items}</ul>
<div class="cta"><a href="${SITE}/?${REF}">${esc(t.ctaPlan)}</a></div>`;
      sendHtml(
        res,
        renderPage({
          lang,
          title: `${t.indexTitle} | TRIPIS`,
          description: t.indexIntro,
          path: `/trips/${lang}`,
          alternates: allLangPaths((l) => `/trips/${l}`),
          jsonLd: {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: t.indexTitle,
            itemListElement: list.map((c, i) => ({
              "@type": "ListItem",
              position: i + 1,
              url: SITE + tripPath(lang, c.id, c.nameEn),
            })),
          },
          body,
        }),
      );
    } catch (e) {
      console.error("[public-pages] /trips index 실패:", (e as Error)?.message);
      res.status(500).send("Error");
    } finally {
      close();
    }
  });

  app.get("/trips/:lang/:slug", async (req: Request, res: Response) => {
    const lang = String(req.params.lang);
    const cityId = leadingId(String(req.params.slug));
    if (!isPageLang(lang) || !Number.isInteger(cityId))
      return res.status(404).send("Not found");
    const { db, close } = openDb();
    try {
      const rep = await cityWithRepresentative(db, cityId);
      const raw0 = rep?.rawData as { days?: any[] } | null;
      if (
        !rep ||
        rep.itineraryId == null ||
        !Array.isArray(raw0?.days) ||
        raw0!.days!.length === 0
      )
        return res.status(404).send("Not found");
      const canonical = tripPath(lang as PageLang, cityId, rep.nameEn);
      if (req.path !== canonical) return res.redirect(301, canonical);

      const L = lang as PageLang;
      const t = pageText(L);
      const raw = (await applyItineraryTranslations(
        db,
        raw0 as Record<string, any>,
        L,
      )) as { days: any[] };
      const cityName = L === "ko" ? rep.nameKo : rep.nameEn || rep.nameKo;
      const ids = raw.days
        .flatMap((d) => (Array.isArray(d?.places) ? d.places : []))
        .map((s: any) => dbId(s?.id))
        .filter((x): x is number => x != null);
      const [guideRows, freshRows] = ids.length
        ? await Promise.all([
            db
              .selectDistinct({ placeId: guides.placeId })
              .from(guides)
              .where(and(inArray(guides.placeId, ids), eq(guides.language, L))),
            db
              .select({
                id: placeSeedRaw.id,
                nameKo: placeSeedRaw.nameKo,
                nameEn: placeSeedRaw.nameEn,
                nameLocal: placeSeedRaw.nameLocal,
                address: placeSeedRaw.address,
              })
              .from(placeSeedRaw)
              .where(inArray(placeSeedRaw.id, ids)),
          ])
        : [[], []];
      const hasGuide = new Set(guideRows.map((g) => g.placeId));
      const fresh = new Map(freshRows.map((r) => [r.id, r]));
      const videos = (rep.videoByDay || {}) as Record<
        string,
        { status?: string }
      >;
      const who = t.who[whoKey(rep.companionType, rep.curationFocus)];
      const title = t.tripTitle(cityName, raw.days.length, who);
      const stopCount =
        ids.length ||
        raw.days.reduce(
          (n, d) => n + (Array.isArray(d?.places) ? d.places.length : 0),
          0,
        );
      const intro = t.tripIntro(
        cityName,
        raw.days.length,
        stopCount,
        t.pace[paceKey(rep.travelPace)],
      );
      const updated = (rep.updatedAt ? new Date(rep.updatedAt) : new Date())
        .toISOString()
        .slice(0, 10);

      const listItems: { name: string; address?: string }[] = [];
      const daysHtml = raw.days
        .map((d, di) => {
          const dayNo = Number(d?.day) || di + 1;
          const places: any[] = Array.isArray(d?.places) ? d.places : [];
          const lis = places
            .map((s) => {
              const pid = dbId(s?.id);
              const cur = (pid != null && fresh.get(pid)) || s;
              const name = placeName(L, cur);
              listItems.push({ name, address: cur?.address || undefined });
              const summary =
                textFor(L, s?.summaryKo) || textFor(L, s?.editorialSummary);
              const meta = [
                s?.isMealSlot ? t.meal : "",
                Number(s?.transit_min) > 0
                  ? t.travel(Number(s.transit_min))
                  : "",
                Number(s?.estimatedPriceEur) > 0
                  ? t.price(Math.round(Number(s.estimatedPriceEur)))
                  : "",
              ]
                .filter(Boolean)
                .join(" · ");
              const guide =
                pid != null && hasGuide.has(pid)
                  ? ` · <a href="${esc(guidePath(L, pid, placeName("en", cur)))}">${esc(t.guideLink)}</a>`
                  : "";
              return `<li><span class="time">${esc(s?.startTime || "")}${s?.endTime ? "–" + esc(s.endTime) : ""}</span> <strong>${esc(name)}</strong>${summary ? `<p>${esc(summary)}</p>` : ""}${meta || guide ? `<div class="meta">${esc(meta)}${guide}</div>` : ""}</li>`;
            })
            .join("");
          const film =
            videos[String(dayNo)]?.status === "succeeded"
              ? `<p class="muted"><a href="${SITE}/?video=${rep.itineraryId}-${dayNo}&amp;${REF}">${esc(t.dayFilm)}</a></p>`
              : "";
          return `<h2>${esc(t.day(dayNo))}</h2><ol class="stops">${lis}</ol>${film}`;
        })
        .join("");

      const body = `<h1>${esc(title)}</h1><p>${esc(intro)}</p><p class="muted">${esc(t.updated)} ${updated}</p>
${daysHtml}
<div class="cta"><a href="${SITE}/?city=${cityId}&amp;${REF}">${esc(t.ctaPlan)}</a><a href="${SITE}/?city=${cityId}&amp;${REF}">${esc(t.ctaGuide)}</a><a href="${SITE}/?${REF}">${esc(t.ctaExpert)}</a></div>
<p><a href="/trips/${L}">${esc(t.otherCities)}</a></p>`;

      sendHtml(
        res,
        renderPage({
          lang: L,
          title: `${title} | TRIPIS`,
          description: intro,
          path: canonical,
          alternates: allLangPaths((l) => tripPath(l, cityId, rep.nameEn)),
          jsonLd: {
            "@context": "https://schema.org",
            "@type": "TouristTrip",
            name: title,
            description: intro,
            url: SITE + canonical,
            inLanguage: t.htmlLang,
            dateModified: updated,
            provider: { "@type": "Organization", name: "TRIPIS", url: SITE },
            itinerary: {
              "@type": "ItemList",
              itemListElement: listItems.map((p, i) => ({
                "@type": "ListItem",
                position: i + 1,
                item: {
                  "@type": "TouristAttraction",
                  name: p.name,
                  ...(p.address ? { address: p.address } : {}),
                },
              })),
            },
          },
          body,
        }),
      );
    } catch (e) {
      console.error("[public-pages] /trips page 실패:", (e as Error)?.message);
      res.status(500).send("Error");
    } finally {
      close();
    }
  });

  app.get("/guides/:lang/:slug", async (req: Request, res: Response) => {
    const lang = String(req.params.lang);
    const placeId = leadingId(String(req.params.slug));
    if (!isPageLang(lang) || !Number.isInteger(placeId))
      return res.status(404).send("Not found");
    const { db, close } = openDb();
    try {
      const L = lang as PageLang;
      const [place] = await db
        .select({
          nameKo: placeSeedRaw.nameKo,
          nameEn: placeSeedRaw.nameEn,
          nameLocal: placeSeedRaw.nameLocal,
          address: placeSeedRaw.address,
          cityId: placeSeedRaw.cityId,
          cityNameKo: cities.name,
          cityNameEn: cities.nameEn,
        })
        .from(placeSeedRaw)
        .leftJoin(cities, eq(cities.id, placeSeedRaw.cityId))
        .where(eq(placeSeedRaw.id, placeId))
        .limit(1);
      const g = place ? await warehouseGuide(db, placeId, L) : null;
      if (!place || !g) return res.status(404).send("Not found");
      const canonical = guidePath(L, placeId, placeName("en", place));
      if (req.path !== canonical) return res.redirect(301, canonical);

      const t = pageText(L);
      const name = placeName(L, place);
      const cityName =
        L === "ko" ? place.cityNameKo : place.cityNameEn || place.cityNameKo;
      const langsWithGuide = await db
        .selectDistinct({ language: guides.language })
        .from(guides)
        .where(
          and(
            eq(guides.placeId, placeId),
            inArray(guides.language, [...PAGE_LANGS]),
          ),
        );
      const alternates = PAGE_LANGS.filter((l) =>
        langsWithGuide.some((x) => x.language === l),
      ).map((l) => ({
        lang: l,
        path: guidePath(l, placeId, placeName("en", place)),
      }));
      const paras = g.text
        .split(/\n{2,}|\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => `<p>${esc(s)}</p>`)
        .join("");
      const description = g.text.replace(/\s+/g, " ").slice(0, 155);
      const cityLink =
        `<p class="muted">${esc(place.address || "")}</p>` +
        (place.cityId != null && cityName
          ? `<p><a href="${esc(tripPath(L, place.cityId, place.cityNameEn))}">${esc(t.guideFrom(cityName))}</a></p>`
          : "");
      const body = `<h1>${esc(t.guideTitle(name))}</h1>${cityLink}${paras}
<div class="cta"><a href="${SITE}/?${place.cityId != null ? `city=${place.cityId}&amp;` : ""}${REF}">${esc(t.ctaGuide)}</a><a href="${SITE}/?${REF}">${esc(t.ctaPlan)}</a></div>`;
      sendHtml(
        res,
        renderPage({
          lang: L,
          title: `${t.guideTitle(name)} | TRIPIS`,
          description,
          path: canonical,
          alternates,
          jsonLd: {
            "@context": "https://schema.org",
            "@type": "Article",
            headline: t.guideTitle(name),
            inLanguage: t.htmlLang,
            dateModified: new Date(g.updatedAt ?? Date.now())
              .toISOString()
              .slice(0, 10),
            about: {
              "@type": "TouristAttraction",
              name,
              ...(place.address ? { address: place.address } : {}),
            },
            publisher: { "@type": "Organization", name: "TRIPIS", url: SITE },
          },
          body,
        }),
      );
    } catch (e) {
      console.error("[public-pages] /guides page 실패:", (e as Error)?.message);
      res.status(500).send("Error");
    } finally {
      close();
    }
  });

  app.get("/sitemap.xml", async (_req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const list = await citiesWithTrips(db);
      const guideRows = await db
        .selectDistinct({
          placeId: guides.placeId,
          language: guides.language,
          nameEn: placeSeedRaw.nameEn,
          nameLocal: placeSeedRaw.nameLocal,
          nameKo: placeSeedRaw.nameKo,
        })
        .from(guides)
        .innerJoin(placeSeedRaw, eq(placeSeedRaw.id, guides.placeId))
        .where(
          and(
            isNotNull(guides.placeId),
            inArray(guides.language, [...PAGE_LANGS]),
          ),
        );
      const urls: string[] = [];
      for (const l of PAGE_LANGS) urls.push(`/trips/${l}`);
      for (const c of list)
        for (const l of PAGE_LANGS) urls.push(tripPath(l, c.id, c.nameEn));
      for (const g of guideRows)
        urls.push(
          guidePath(g.language as PageLang, g.placeId!, placeName("en", g)),
        );
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
        .map((u) => `<url><loc>${esc(SITE + u)}</loc></url>`)
        .join("\n")}\n</urlset>`;
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(xml);
    } catch (e) {
      console.error("[public-pages] sitemap 실패:", (e as Error)?.message);
      res.status(500).send("Error");
    } finally {
      close();
    }
  });

  app.get("/llms.txt", async (_req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const en = pageText("en");
      const list = await citiesWithTrips(db);
      const lines = [
        "# TRIPIS",
        "",
        `> ${en.brand}`,
        "",
        "TRIPIS is a travel app (web: https://tripis.app, Android, iOS) in 7 languages (English, Korean, Japanese, French, Chinese, Spanish, German).",
        "",
        "## What it does",
        "- Builds a day-by-day itinerary for a city: stops in order with times, travel between stops and estimated prices, tuned to who you travel with (solo, couple, family, family with parents, friends) and your pace.",
        "- On-site guides: at each stop the app tells the story of the place (text and voice).",
        "- AI review of your plan, and a real local expert (a person) does the final check and answers questions.",
        "- Share a plan with family by link, or add it to your calendar.",
        "- Optional: preview each day of your trip as a short film.",
        "",
        "## City itineraries",
        ...list.map(
          (c) =>
            `- [${en.tripTitle(c.nameEn || c.nameKo, (c.rep!.rawData as any).days.length, en.who[whoKey(c.rep!.companionType, c.rep!.curationFocus)])}](${SITE}${tripPath("en", c.id, c.nameEn)})`,
        ),
        "",
        "## More",
        `- All itineraries by language: ${PAGE_LANGS.map((l) => `${SITE}/trips/${l}`).join(" , ")}`,
        `- Sitemap: ${SITE}/sitemap.xml`,
        "",
      ];
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(lines.join("\n"));
    } catch (e) {
      console.error("[public-pages] llms.txt 실패:", (e as Error)?.message);
      res.status(500).send("Error");
    } finally {
      close();
    }
  });
}
