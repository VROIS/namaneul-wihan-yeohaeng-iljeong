// ⚠️ 수정금지(승인필요) 2026-11-09 사장님 결정 = 예약 버튼 = /go 한 곳 = 연결표에서 수수료 1순위 제휴처 하나로 보냄 · 연결 없으면 그 장소 구글맵 (정본 2026-11-09)
import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import * as schema from "../shared/schema";
import type { OpenDb } from "./db-types";
import { affiliateLinksDir } from "../shared/r2-paths";
import {
  affiliateUrl,
  pickAffiliate,
  type AffiliateLinksFile,
} from "../shared/affiliate-partners";
import { getFromR2, listR2 } from "./lib/services/shared/r2-client";

const { placeSeedRaw } = schema;
const TTL_MS = 10 * 60 * 1000;
let cached: { at: number; file: AffiliateLinksFile | null } = {
  at: 0,
  file: null,
};

async function linksFile(): Promise<AffiliateLinksFile | null> {
  if (Date.now() - cached.at < TTL_MS) return cached.file;
  const keys = (await listR2(`${affiliateLinksDir}/`)).map((o) => o.key).sort();
  const latest = keys[keys.length - 1];
  const body = latest ? await getFromR2(latest) : null;
  cached = {
    at: Date.now(),
    file: body
      ? (JSON.parse(body.toString("utf8")) as AffiliateLinksFile)
      : null,
  };
  return cached.file;
}

export function registerGoRoutes(app: Express, openDb: OpenDb): void {
  app.get("/go", async (req: Request, res: Response) => {
    const placeId = Number(req.query.place);
    const tripId = Number(req.query.trip) || 0;
    if (!Number.isInteger(placeId) || placeId <= 0)
      return res.status(400).send("place");
    const entry = (await linksFile())?.places[String(placeId)];
    const link = entry ? pickAffiliate(entry.links) : null;
    if (link) {
      console.log(
        `[go] place=${placeId} trip=${tripId} partner=${link.partner}`,
      );
      return res.redirect(
        302,
        affiliateUrl(link, `tripis_${entry!.cityId}_${tripId}`),
      );
    }
    const { db, close } = openDb();
    try {
      const [row] = await db
        .select({ uri: placeSeedRaw.googleMapsUri })
        .from(placeSeedRaw)
        .where(eq(placeSeedRaw.id, placeId))
        .limit(1);
      if (!row?.uri) return res.status(404).send("place");
      console.log(`[go] place=${placeId} trip=${tripId} partner=maps`);
      return res.redirect(302, row.uri);
    } finally {
      close();
    }
  });
}
