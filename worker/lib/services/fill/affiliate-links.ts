// ⚠️ 수정금지(승인필요) 2026-11-09 사장님 결정 = 예약 제휴 연결표 = 제휴처 공식 목록(좌표) → 알아보는 문(recognizePlace)으로 창고 유료 명소에 붙여 R2 연결표 1벌로 저장 · 창고(place_seed_raw)는 읽기만 (정본 2026-11-09)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { and, eq, gt, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";
import type {
  AffiliateLink,
  AffiliateLinksFile,
} from "@shared/affiliate-partners";
import { affiliateLinksDir, affiliateLinksKey } from "@shared/r2-paths";
import {
  RECOGNIZE_ROWS_SQL,
  namesAgree,
  recognizePlace,
  type RecognizeRow,
} from "../shared/recognize-place";
import { servingGateSql } from "../shared/pool-radius";
import { distanceKmFromCoords, OWN_CITY_KM } from "../shared/geo-distance";
import { getFromR2, listR2, uploadToR2 } from "../shared/r2-client";

const TARGET = [
  "heritage",
  "attraction",
  "adventure",
  "healing",
  "photospot",
] as const;
const VIATOR = "https://api.viator.com/partner";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type PartnerPlace = {
  id: string;
  name: string;
  url: string;
  lat: number | null;
  lng: number | null;
  street: string | null;
};
type City = {
  id: number;
  name: string;
  nameEn: string;
  lat: number;
  lng: number;
};

function viatorHeaders() {
  return {
    "exp-api-key": process.env.VIATOR_API_KEY!,
    Accept: "application/json;version=2.0",
    "Accept-Language": "en-US",
    "Content-Type": "application/json",
  };
}

async function viatorPlaces(city: City, dests: any[]): Promise<PartnerPlace[]> {
  const near = dests.filter(
    (d) =>
      d.center &&
      distanceKmFromCoords(
        city.lat,
        city.lng,
        d.center.latitude,
        d.center.longitude,
      ) <= OWN_CITY_KM,
  );
  const seen = new Map<string, PartnerPlace>();
  for (const d of near) {
    for (let start = 1; ; start += 30) {
      const r = await fetch(`${VIATOR}/attractions/search`, {
        method: "POST",
        headers: viatorHeaders(),
        body: JSON.stringify({
          destinationId: d.destinationId,
          pagination: { start, count: 30 },
        }),
      });
      if (r.status === 429) {
        await sleep(10_000);
        start -= 30;
        continue;
      }
      if (!r.ok) {
        console.log(
          `  Viator 목적지 ${d.destinationId}(${d.name}) 응답 ${r.status} = 이 목적지 건너뜀`,
        );
        break;
      }
      const j: any = await r.json();
      for (const a of j.attractions ?? [])
        seen.set(String(a.attractionId), {
          id: String(a.attractionId),
          name: a.name,
          url: a.attractionUrl,
          lat: a.center?.latitude ?? null,
          lng: a.center?.longitude ?? null,
          street: a.address?.street ?? null,
        });
      await sleep(700);
      if (start + 30 > (j.totalCount ?? 0)) break;
    }
  }
  return [...seen.values()];
}

const fold = (x: string) =>
  x.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

function matchCity(
  city: City,
  partner: AffiliateLink["partner"],
  places: PartnerPlace[],
  rows: RecognizeRow[],
  targets: Set<number>,
  townNames: Set<string>,
  cityWords: Set<string>,
  rejected: Set<string>,
): Map<number, AffiliateLink> {
  const strip = (x: string | null | undefined) =>
    x
      ? fold(x)
          .split(/[^a-z0-9가-힣]+/)
          .filter((w) => w && !cityWords.has(w))
          .join(" ")
      : x;
  const best = new Map<number, AffiliateLink>();
  for (const p of places) {
    if (townNames.has(fold(p.name).trim())) continue;
    const same = (row: RecognizeRow) =>
      namesAgree(strip(p.name), [
        strip(row.name_en),
        strip(row.name_local),
        row.name_ko,
      ]);
    const g = {
      name: p.name,
      address: p.street,
      lat: p.lat,
      lng: p.lng,
      isRestaurant: false,
      cityNames: [city.name, city.nameEn],
    };
    const first = recognizePlace(g, rows);
    const r =
      first && same(first.row) ? first : recognizePlace(g, rows.filter(same));
    if (!r || !targets.has(r.row.id)) continue;
    if (rejected.has(`${r.row.id}:${partner}:${p.id}`)) continue;
    const prev = best.get(r.row.id);
    if (prev && (prev.meters ?? Infinity) <= (r.meters ?? Infinity)) continue;
    best.set(r.row.id, {
      partner,
      partnerPlaceId: p.id,
      url: p.url,
      matchedBy: r.why,
      meters: r.meters,
    });
  }
  return best;
}

type NamedPlace = { id: string; names: string[]; url: string };
const UA = { "User-Agent": "Mozilla/5.0 (compatible; TRIPIS affiliate-links)" };
const STOP = new Set(
  "the of and de du des la le les el del di da in at d l".split(" "),
);
const words = (x: string | null | undefined) =>
  x
    ? fold(x)
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 2)
    : [];

async function sitemapText(url: string): Promise<string> {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`사이트맵 ${url} ${r.status}`);
  return r.text();
}

async function gygPlaces(): Promise<NamedPlace[]> {
  const out: NamedPlace[] = [];
  const loc =
    /<loc>https:\/\/www\.getyourguide\.com\/([a-z0-9-]+)-l(\d+)\/<\/loc>/;
  const alt =
    /hreflang="[a-z]{2}(?:-[a-z]{2})?" href="https:\/\/www\.getyourguide\.com\/(?:[a-z]{2}-[a-z]{2}\/)?([a-z0-9-]+)-l\d+\/"/g;
  for (let i = 0; ; i++) {
    const r = await fetch(`https://www.getyourguide.com/sitemap-poi-${i}.xml`, {
      headers: UA,
    });
    if (!r.ok) break;
    for (const u of (await r.text()).split("</url>")) {
      const m = u.match(loc);
      if (!m) continue;
      const names = [
        ...new Set([m[1], ...[...u.matchAll(alt)].map((a) => a[1])]),
      ];
      out.push({
        id: m[2],
        names,
        url: `https://www.getyourguide.com/${m[1]}-l${m[2]}/`,
      });
    }
  }
  return out;
}

async function klookPlaces(): Promise<NamedPlace[]> {
  return [
    ...(
      await sitemapText("https://www.klook.com/sitemap-poi-plain_en.xml")
    ).matchAll(
      /<loc>https:\/\/www\.klook\.com\/destination\/p(\d+)-([a-z0-9-]+)\/<\/loc>/g,
    ),
  ].map((m) => ({
    id: m[1],
    names: [m[2]],
    url: `https://www.klook.com/destination/p${m[1]}-${m[2]}/`,
  }));
}

async function worldCities(): Promise<string[]> {
  return [
    ...(
      await sitemapText("https://www.klook.com/sitemap-city-plain_en.xml")
    ).matchAll(/destination\/c\d+-([a-z0-9-]+)\//g),
  ].map((m) => m[1]);
}

function matchByName(
  city: City,
  partner: AffiliateLink["partner"],
  places: NamedPlace[],
  index: Map<string, NamedPlace[]>,
  world: string[],
  rows: RecognizeRow[],
  targets: Set<number>,
  rejected: Set<string>,
): Map<number, AffiliateLink> {
  const myCity = new Set([...words(city.nameEn), ...words(city.name)]);
  const foreign = (slug: string) =>
    world.some(
      (wc) =>
        !wc.split("-").every((w) => myCity.has(w)) &&
        `-${slug}-`.includes(`-${wc}-`),
    );
  const best = new Map<number, AffiliateLink>();
  for (const row of rows) {
    if (!targets.has(row.id)) continue;
    const mine = new Set([...words(row.name_en), ...words(row.name_local)]);
    const cands = new Set<NamedPlace>();
    for (const w of mine)
      if (w.length >= 4 && !myCity.has(w))
        for (const p of index.get(w) ?? []) cands.add(p);
    for (const p of cands) {
      const slug = p.names.find((s) =>
        s
          .split("-")
          .filter((w) => w.length >= 2 && !STOP.has(w) && !myCity.has(w))
          .every((w) => mine.has(w)),
      );
      if (!slug || p.names.some(foreign)) continue;
      const r = recognizePlace(
        {
          name: slug.replace(/-/g, " "),
          isRestaurant: false,
          cityNames: [city.name, city.nameEn],
        },
        rows,
      );
      if (r?.row.id !== row.id) continue;
      if (rejected.has(`${row.id}:${partner}:${p.id}`)) continue;
      best.set(row.id, {
        partner,
        partnerPlaceId: p.id,
        url: p.url,
        matchedBy: r.why,
        meters: null,
      });
      break;
    }
  }
  return best;
}

function tokenIndex(places: NamedPlace[]): Map<string, NamedPlace[]> {
  const idx = new Map<string, NamedPlace[]>();
  for (const p of places)
    for (const w of new Set(p.names.flatMap((n) => n.split("-"))))
      if (w.length >= 4) {
        const list = idx.get(w);
        if (list) list.push(p);
        else idx.set(w, [p]);
      }
  return idx;
}

async function latestFile(): Promise<AffiliateLinksFile | null> {
  const keys = (await listR2(`${affiliateLinksDir}/`)).map((o) => o.key).sort();
  const body = keys.length ? await getFromR2(keys[keys.length - 1]) : null;
  return body
    ? (JSON.parse(body.toString("utf8")) as AffiliateLinksFile)
    : null;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  (async () => {
    process.chdir(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.."),
    );
    for (const line of fs
      .readFileSync(".env", "utf-8")
      .replace(/^﻿/, "")
      .split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]])
        process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
    const apply = process.argv.includes("--apply");
    const ids = (
      process.argv.find((a) => a.startsWith("--city-id="))?.split("=")[1] ?? ""
    )
      .split(",")
      .map(Number)
      .filter((n) => n > 0);
    if (!ids.length) throw new Error("--city-id=19,37,... 필요");
    const pg = await import("pg");
    const c = new (pg as any).default.Client({
      connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    await c.connect();
    await c.query("BEGIN READ ONLY");
    const db = drizzle(c, { schema });
    const { cities, placeSeedRaw } = schema;
    const destRes = (await (
      await fetch(`${VIATOR}/destinations`, { headers: viatorHeaders() })
    ).json()) as { destinations: any[] };
    const dests = destRes.destinations;
    const townNames = new Set(dests.map((d) => fold(d.name).trim()));
    const cityWords = new Set(
      (await db.select({ a: cities.name, b: cities.nameEn }).from(cities))
        .flatMap((x) => [x.a, x.b])
        .filter((n): n is string => !!n)
        .flatMap((n) => fold(n).split(/[^a-z0-9]+/))
        .filter((w) => w.length >= 3),
    );
    const file: AffiliateLinksFile = (await latestFile()) ?? {
      builtAt: "",
      places: {},
      rejected: [],
    };
    const addReject = process.argv
      .find((a) => a.startsWith("--reject="))
      ?.split("=")[1];
    if (addReject)
      file.rejected = [...new Set([...file.rejected, ...addReject.split(",")])];
    const rejected = new Set(file.rejected);
    const world = await worldCities();
    const named: [AffiliateLink["partner"], NamedPlace[]][] = [
      ["gyg", await gygPlaces()],
      ["klook", await klookPlaces()],
    ];
    const indexes = new Map(named.map(([k, p]) => [k, tokenIndex(p)]));
    console.log(
      `제휴 목록 = ${named.map(([k, p]) => `${k} ${p.length}`).join(" · ")} · Viator 목적지 ${dests.length}`,
    );
    for (const id of ids) {
      const [ci] = await db
        .select({
          id: cities.id,
          name: cities.name,
          nameEn: cities.nameEn,
          lat: cities.latitude,
          lng: cities.longitude,
        })
        .from(cities)
        .where(eq(cities.id, id));
      const city: City = {
        ...ci,
        nameEn: ci.nameEn ?? ci.name,
        lat: Number(ci.lat),
        lng: Number(ci.lng),
      };
      const rows: RecognizeRow[] = (await c.query(RECOGNIZE_ROWS_SQL, [id]))
        .rows;
      const targets = new Set(
        (
          await db
            .select({ id: placeSeedRaw.id })
            .from(placeSeedRaw)
            .where(
              and(
                eq(placeSeedRaw.cityId, id),
                servingGateSql(),
                gt(placeSeedRaw.priceEur, 0),
                inArray(placeSeedRaw.seedCategory, [...TARGET]),
              ),
            )
        ).map((r) => r.id),
      );
      const viator = matchCity(
        city,
        "viator",
        await viatorPlaces(city, dests),
        rows,
        targets,
        townNames,
        cityWords,
        rejected,
      );
      const byPartner = new Map<string, Map<number, AffiliateLink>>([
        ["viator", viator],
      ]);
      for (const [k, places] of named)
        byPartner.set(
          k,
          matchByName(
            city,
            k,
            places,
            indexes.get(k)!,
            world,
            rows,
            targets,
            rejected,
          ),
        );
      for (const [k, v] of Object.entries(file.places))
        if (v.cityId === id) delete file.places[k];
      for (const m of byPartner.values())
        for (const [pid, link] of m)
          file.places[String(pid)] = {
            cityId: id,
            links: [...(file.places[String(pid)]?.links ?? []), link],
          };
      console.log(
        `${city.nameEn}(${id}) 대상 ${targets.size} · ${[...byPartner].map(([k, m]) => `${k} ${m.size}`).join(" · ")}`,
      );
    }
    const owners = new Map<string, Set<string>>();
    for (const [pid, v] of Object.entries(file.places))
      for (const l of v.links) {
        const key = `${l.partner}:${l.partnerPlaceId}`;
        owners.set(key, (owners.get(key) ?? new Set()).add(pid));
      }
    for (const [pid, v] of Object.entries(file.places)) {
      v.links = v.links.filter(
        (l) =>
          owners.get(`${l.partner}:${l.partnerPlaceId}`)!.size === 1 &&
          !rejected.has(`${pid}:${l.partner}:${l.partnerPlaceId}`),
      );
      if (!v.links.length) delete file.places[pid];
    }
    await c.query("ROLLBACK");
    await c.end();
    file.builtAt = new Date().toISOString();
    const total = Object.keys(file.places).length;
    if (apply) {
      const key = affiliateLinksKey();
      await uploadToR2(
        key,
        Buffer.from(JSON.stringify(file, null, 2)),
        "application/json",
      );
      console.log(`═══ 연결표 저장 ${key} · 장소 ${total} ═══`);
    } else {
      const out = process.argv
        .find((a) => a.startsWith("--out="))
        ?.split("=")[1];
      if (out) fs.writeFileSync(out, JSON.stringify(file, null, 2));
      console.log(
        `═══ 연결표 DRY · 장소 ${total} (R2 저장 안 함${out ? ` · 로컬 ${out}` : ""}) ═══`,
      );
    }
    process.exit(0);
  })().catch((e) => {
    console.error("✗ 제휴 연결표 실패:", e?.message || e);
    process.exit(1);
  });
}
