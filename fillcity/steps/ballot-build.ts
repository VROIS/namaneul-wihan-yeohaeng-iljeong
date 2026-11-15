// 필시티 v4 = 투표 용지 만들기 = 비아토르 명소(제휴 API · 무료)를 거점 반경으로 받아, 가장 가까운 거점이 이 도시인 곳만 남긴다(완비 도시 = readyCities 1벌 + 지금 돌리는 거점) · 상품 0개는 뺀다 · 용지는 이름순(순서에 뜻 없음) · DB 쓰기 0 (정본 2026-11-14)
import fs from "fs";
import path from "path";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../../shared/schema";
import {
  connectDb,
  loadEnv,
  parseArgs,
  reportDir,
  stamp,
  stampOf,
} from "./common";
import {
  VIATOR,
  viatorHeaders,
} from "../../worker/lib/services/fill/affiliate-links";
import { distanceKmFromCoords as km } from "../../worker/lib/services/shared/geo-distance";
import { nearestHub, readBallot, type BallotFile } from "./ballot-common";
import { readyCities } from "../../worker/best-itinerary/city-resolver";

loadEnv();
const argv = parseArgs();
const cityId = Number(argv["city-id"] || 0);
const RADIUS_KM = Number(argv["radius-km"] || 150);
const MAX_BALLOT = Number(argv["max"] || 120);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

if (process.argv[1] && /ballot-build\.ts$/.test(process.argv[1]))
  (async () => {
    if (!cityId) {
      console.error(
        "Usage: --city-id=<N> [--radius-km=150] [--max=120] [--since=<판 시작 시각>]",
      );
      process.exit(1);
    }
    const since = argv["since"] ? stampOf(String(argv["since"])) : undefined;
    const have = since ? readBallot(cityId, since) : null;
    if (have) {
      console.log(
        `↪ 이어 돌기 = 이 판에서 이미 만든 용지 ${have.ballot.length}곳을 그대로 쓴다`,
      );
      process.exit(0);
    }
    const c = await connectDb();
    const self = (
      await c.query(
        "SELECT id, name, latitude::float8 lat, longitude::float8 lng FROM cities WHERE id=$1",
        [cityId],
      )
    ).rows[0];
    if (!self?.lat) {
      console.error(`✗ 도시 ${cityId} 좌표 없음`);
      process.exit(1);
    }
    const readyIds: number[] = (
      await readyCities(drizzle(c, { schema }) as any)
    ).map((r: any) => r.id);
    const hubs: BallotFile["hubs"] = (
      await c.query(
        "SELECT id, name, latitude::float8 lat, longitude::float8 lng FROM cities WHERE id = ANY($1::int[]) AND latitude IS NOT NULL",
        [[...new Set([cityId, ...readyIds])]],
      )
    ).rows;
    await c.end();

    const H = viatorHeaders();
    const call = async (p: string, body?: any) => {
      for (let i = 0; i < 4; i++) {
        const r = await fetch(
          VIATOR + p,
          body
            ? { method: "POST", headers: H, body: JSON.stringify(body) }
            : { headers: H },
        );
        if (r.status === 429) {
          await sleep(10_000);
          continue;
        }
        if (!r.ok) throw new Error(`비아토르 ${p} 응답 ${r.status}`);
        return (await r.json()) as any;
      }
      throw new Error(`비아토르 ${p} 호출 한도(429) 4회`);
    };
    const allDests: any[] = (await call("/destinations")).destinations ?? [];
    const fold = (s: unknown) =>
      String(s ?? "")
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    const cityDests = allDests.filter(
      (d: any) => d.type === "CITY" && d.center,
    );
    const isCityItself = (name: string, lat: number, lng: number) =>
      cityDests.some(
        (d: any) =>
          fold(d.name) === fold(name) &&
          km(lat, lng, d.center.latitude, d.center.longitude) <= 10,
      );
    const dests = allDests.filter(
      (d: any) =>
        d.center &&
        km(self.lat, self.lng, d.center.latitude, d.center.longitude) <=
          RADIUS_KM,
    );
    const seen = new Map<number, any>();
    for (const d of dests)
      for (let start = 1; ; start += 30) {
        const j = await call("/attractions/search", {
          destinationId: d.destinationId,
          pagination: { start, count: 30 },
        });
        for (const a of j.attractions ?? [])
          if (!seen.has(a.attractionId)) seen.set(a.attractionId, a);
        await sleep(350);
        if (start + 30 > (j.totalCount ?? 0)) break;
      }
    const dropped = { otherHub: 0, noProduct: 0, overMax: 0, cityItself: 0 };
    const cityNames: string[] = [];
    const mine: any[] = [];
    for (const a of seen.values()) {
      const lat = a.center?.latitude,
        lng = a.center?.longitude;
      if (lat == null || lng == null) continue;
      const d = km(self.lat, self.lng, lat, lng);
      if (d > RADIUS_KM) continue;
      if (nearestHub(hubs, lat, lng) !== cityId) {
        dropped.otherHub++;
        continue;
      }
      if (!(a.productCount > 0)) {
        dropped.noProduct++;
        continue;
      }
      if (isCityItself(String(a.name), lat, lng)) {
        dropped.cityItself++;
        cityNames.push(`${a.name}(${a.productCount})`);
        continue;
      }
      mine.push({
        id: a.attractionId,
        name: String(a.name),
        lat,
        lng,
        km: Math.round(d * 10) / 10,
        products: a.productCount,
        reviews: a.reviews?.totalReviews ?? 0,
      });
    }
    mine.sort((a, b) => b.products - a.products);
    dropped.overMax = Math.max(0, mine.length - MAX_BALLOT);
    const ballot = mine
      .slice(0, MAX_BALLOT)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((a, i) => ({ no: i + 1, ...a }));
    const payload: BallotFile = {
      cityId,
      generatedAt: new Date().toISOString(),
      radiusKm: RADIUS_KM,
      hubs,
      dropped,
      localities: [
        ...new Set(
          cityDests
            .filter(
              (d: any) =>
                km(self.lat, self.lng, d.center.latitude, d.center.longitude) <=
                RADIUS_KM,
            )
            .map((d: any) => String(d.name)),
        ),
      ],
      ballot,
    };
    const out = path.join(reportDir(cityId), `${stamp()}_ballot.json`);
    fs.writeFileSync(out, JSON.stringify(payload, null, 2));
    console.log(
      `═══ 투표 용지 city ${cityId} ${self.name} · 반경 ${RADIUS_KM}km · 비교 거점 ${hubs.length}곳 ═══`,
    );
    console.log(
      `비아토르 목적지 ${dests.length}곳 · 명소 ${seen.size}곳 → 용지 ${ballot.length}곳 (다른 거점이 더 가까움 ${dropped.otherHub} · 상품 0개 ${dropped.noProduct} · 도시 자체 ${dropped.cityItself}${cityNames.length ? ` = ${cityNames.join(", ")}` : ""} · 상한 ${MAX_BALLOT} 밖 ${dropped.overMax})`,
    );
    console.log(
      `상품 수 앞 12 = ${[...ballot]
        .sort((a, b) => b.products - a.products)
        .slice(0, 12)
        .map((b) => `${b.name}(${b.products}·${Math.round(b.km)}km)`)
        .join(" | ")}`,
    );
    console.log(`용지 = ${out}`);
    if (!ballot.length) {
      console.error("✗ 용지가 비었다 = 발굴을 투표로 부를 수 없다");
      process.exit(1);
    }
    process.exit(0);
  })().catch((e) => {
    console.error("✗ 투표 용지 실패:", e?.message || e);
    process.exit(1);
  });
