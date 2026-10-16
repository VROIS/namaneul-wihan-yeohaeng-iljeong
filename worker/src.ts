import express from "express";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../shared/schema";
import {
  CREDIT_COSTS,
  PRICE_EUR,
  PURCHASE_CREDITS,
  SIGNUP_BONUS,
} from "../shared/credits";
import { httpServerHandler } from "cloudflare:node";
import {
  generateItineraryICS,
  type ItineraryForICS,
} from "./lib/itinerary-ics";
import {
  type CompanionType,
  type GuidePriceResult,
  type MobilityStyle,
  type TransitPriceResult,
  type TravelStyle,
} from "./lib/services/transport/constants";
import {
  calcTransitHaversine,
  estimateTransitCost,
  haversineKm,
  pickTransitMode,
} from "./lib/services/agents/transit-haversine";
import { optimizeDayRoute } from "./lib/services/itinerary/route-optimizer";
import { retimePlaces } from "./lib/services/route/regen-retime";
import {
  round2,
  shouldApplyGuidePrice,
} from "./lib/services/transport/guide-pricing";
import { calculateUberBlackHourly } from "./lib/services/transport/transit-pricing";
import { calculateTransportPrice } from "./lib/services/transport-pricing-service";
import { guideCostForDay } from "./lib/services/transport/day-config";
import { withEngineDb } from "./lib/db";
import {
  getCompanionCount,
  calculateDayCount,
  DEFAULT_START_TIME,
  DEFAULT_END_TIME,
} from "./lib/services/agents/types";
// ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = 바인딩(env)·응답 뒤 약속(waitUntil) = cloudflare:workers 공식 진입점 1벌. 타입은 `wrangler types` 가 만든 Env (정본 §)
import { env, waitUntil } from "cloudflare:workers";
import { ensureKeys } from "./keys";
import { registerPlaceRoutes } from "./routes-places";
import { registerItineraryRoutes } from "./routes-itinerary";
import { registerGuideVideoRoutes } from "./routes-guide-video";
import { registerExpertBtsRoutes } from "./routes-expert-bts";
import { registerAppleAuthRoutes } from "./routes-auth-apple";
import { registerAuthCreditsRoutes } from "./routes-auth-credits";
import { registerAdminRoutes } from "./routes-admin";
import { registerSocialAuthRoutes } from "./routes-social-auth";
import {
  registerPaymentRoutes,
  registerPaymentWebhookRoute,
} from "./routes-payments";
import { registerMisc2Routes } from "./routes-misc2";
import { registerGeminiRoutes } from "./routes-gemini";
import { registerAdminKeysRoutes } from "./routes-admin-keys";
import { registerItineraryGenerateRoutes } from "./routes-itinerary-generate";
import { registerAppErrorRoutes } from "./routes-app-errors";
import { registerAdminKeyTestRoutes } from "./routes-admin-keytest";
import { registerRestRoutes } from "./routes-rest";
import { registerItineraryGenerateDbRoutes } from "./routes-itinerary-generate-db";
import { readyCities } from "./best-itinerary/city-resolver";
import { withScheduled } from "./scheduled";
import {
  registerVideoGenerateRoutes,
  VideoStitchContainer,
} from "./routes-video-generate";

export { VideoStitchContainer };

const app = express();

// ⚠️ 수정금지(승인필요) 2026-09-06 사장님 결정 = Stripe 웹훅은 **express.json() 앞**에 등록한다(§9 충전 유일 경로).
registerPaymentWebhookRoute(
  app,
  () => openDb(),
  () => sql(),
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false, limit: "10mb" }));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", req.header("origin") || "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ⚠️ 수정금지(승인필요) 2026-09-06 사장님 결정 = prepare:false 고정.
const sql = () =>
  postgres(env.HYPERDRIVE.connectionString, {
    max: 5,
    fetch_types: false,
    prepare: true,
  });

// ⚠️ 수정금지(승인필요) 2026-09-06 사장님 결정 = 요청 1건 = 연결 1벌 = 반드시 닫는다.
function openDb() {
  const client = sql();
  return {
    db: drizzle(client, { schema }),
    close: () => {
      waitUntil(client.end({ timeout: 5 })); // ⚠️ 수정금지(승인필요) 2026-09-13 = 응답 뒤 끊기는 약속을 waitUntil 로 살려 실제로 닫는다(안 닫혀 풀러 15칸이 새던 사고 = 4차 호출 저장 실패)
    },
  };
}

// ⚠️ 수정금지(승인필요) 2026-09-06 사장님 결정 = 열쇠 게이트 (정본 B1)
async function withKeys<T>(run: () => Promise<T> | T): Promise<T> {
  const db = sql();
  try {
    await ensureKeys(db);
  } finally {
    waitUntil(db.end({ timeout: 5 })); // 응답 뒤 끊기는 약속을 살려 실제로 닫는다(openDb 와 같은 수리 = 풀러 칸 누수)
  }
  return run();
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    from: "cloudflare-worker",
    time: new Date().toISOString(),
  });
});

// ⚠️ 수정금지(승인필요) 2026-09-28 사장님 결정 = GET /api/cities = 연결은 try 밖에서 열고 finally 에서 닫는다(아래 4개 라우트 동일) (정본 9-28)
app.get("/api/cities", async (_req, res) => {
  const { db, close } = openDb();
  try {
    const rows = await db
      .select()
      .from(schema.cities)
      .orderBy(schema.cities.name);
    res.json(rows);
  } catch (error) {
    console.error("Error fetching cities:", error);
    res.status(500).json({ error: "Failed to fetch cities" });
  } finally {
    close();
  }
});

// ⚠️ 수정금지(승인필요) 2026-09-29 사장님 결정 = 도시 카드 = DB 올리 전환 기준 1벌(city-resolver readyCities) (정본 §)
app.get("/api/cities/ready", async (_req, res) => {
  const { db, close } = openDb();
  try {
    res.json(await readyCities(db));
  } catch (error) {
    console.error("[cities/ready] 완비도시 조회 실패:", error);
    res.status(500).json({ error: "failed_to_fetch_ready_cities" });
  } finally {
    close();
  }
});

// ⚠️ 수정금지(승인필요) 2026-09-06 사장님 결정 = 이 배선은 반드시 `/api/cities/:id` **앞**.
registerPlaceRoutes(app, openDb);
registerItineraryRoutes(app, openDb);
registerGuideVideoRoutes(app, openDb);
registerExpertBtsRoutes(app, openDb);
registerAppleAuthRoutes(app, openDb);
registerAuthCreditsRoutes(app, openDb);
registerAdminRoutes(app, openDb);
registerSocialAuthRoutes(app, openDb);
registerPaymentRoutes(app, openDb, sql);
registerMisc2Routes(app, openDb);
registerGeminiRoutes(app, openDb);
registerAdminKeysRoutes(app, openDb);
registerItineraryGenerateRoutes(app, openDb);
registerAppErrorRoutes(app, openDb);
registerAdminKeyTestRoutes(app, openDb);
registerRestRoutes(app, openDb);
registerItineraryGenerateDbRoutes(app, openDb, sql);
registerVideoGenerateRoutes(app, openDb);

app.get("/api/cities/:id", async (req, res) => {
  const { db, close } = openDb();
  try {
    const id = parseInt(String(req.params.id));
    if (Number.isNaN(id))
      return res.status(404).json({ error: "City not found" });
    const rows = await db
      .select()
      .from(schema.cities)
      .where(eq(schema.cities.id, id))
      .limit(1);
    if (!rows.length) return res.status(404).json({ error: "City not found" });
    res.json(rows[0]);
  } catch (error) {
    console.error("Error fetching city:", error);
    res.status(500).json({ error: "Failed to fetch city" });
  } finally {
    close();
  }
});

app.get("/api/guide/health", (_req, res) => {
  res.json({ status: "ok", service: "guide", version: "2.0.0" });
});

app.get("/api/credits/pricing", async (_req, res) => {
  try {
    await withKeys(() => {
      res.json({
        currency: "EUR",
        priceEur: PRICE_EUR,
        purchaseCredits: PURCHASE_CREDITS,
        signupBonus: SIGNUP_BONUS,
        costs: CREDIT_COSTS,
        stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
      });
    });
  } catch (error) {
    console.error("Error fetching pricing:", error);
    res.status(500).json({ error: "Failed to fetch pricing" });
  }
});

app.get("/api/itineraries/:id/calendar.ics", async (req, res) => {
  const { db, close } = openDb();
  try {
    const idNum = parseInt(String(req.params.id));
    if (Number.isNaN(idNum)) {
      return res.status(404).json({ error: "Itinerary not found" });
    }
    const [itinerary] = await db
      .select()
      .from(schema.itineraries)
      .where(eq(schema.itineraries.id, idNum))
      .limit(1);
    const raw = itinerary?.rawData as ItineraryForICS | undefined;
    if (!raw?.days?.length || !raw.startDate) {
      return res.status(404).json({ error: "Itinerary not found" });
    }
    const ics = generateItineraryICS(raw);
    const filename = encodeURIComponent(
      `${raw.title || raw.destination || "trip"}.ics`,
    ).replace(
      /[!'()*]/g,
      (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
    );
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="trip.ics"; filename*=UTF-8''${filename}`,
    );
    res.send(ics);
  } catch (error) {
    console.error("Error generating itinerary ics:", error);
    res.status(500).json({ error: "Failed to generate calendar" });
  } finally {
    close();
  }
});

type RegenPlace = {
  name: string;
  lat: number;
  lng: number;
  isMealSlot?: boolean;
  mealPrice?: number;
  estimatedPriceEur?: number;
  [key: string]: unknown;
};
type RegenTransit = {
  from: string;
  to: string;
  distance: number;
  duration: number;
  durationText: string;
  mode: string;
  modeLabel: string;
  cost: number;
  costTotal: number;
};
type RegenFormData = {
  mobilityStyle?: MobilityStyle;
  travelStyle?: TravelStyle;
  companionType?: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
};

async function regenerateDay(params: {
  day: number;
  accommodationCoords?: { lat: number; lng: number };
  places: RegenPlace[];
  formData?: RegenFormData;
  keepOrder?: boolean;
}) {
  const { day, accommodationCoords, places, formData, keepOrder } = params;

  if (!places || places.length === 0) {
    return { day, places: [] };
  }

  const nonMealPlaces = places.filter((p) => !p.isMealSlot);

  let optimized = nonMealPlaces;
  if (!keepOrder && nonMealPlaces.length > 2 && accommodationCoords) {
    optimized = optimizeDayRoute(
      nonMealPlaces as never,
      accommodationCoords,
    ) as unknown as RegenPlace[];
  }

  const reordered: RegenPlace[] = [];
  let optIdx = 0;
  for (const p of places) {
    if (p.isMealSlot) {
      reordered.push(p);
    } else if (optIdx < optimized.length) {
      reordered.push(optimized[optIdx]);
      optIdx++;
    }
  }

  const isGuideDay = shouldApplyGuidePrice(
    formData?.mobilityStyle as MobilityStyle,
    formData?.travelStyle as TravelStyle,
  );
  const companionCount = formData
    ? getCompanionCount(formData.companionType || "Solo")
    : 2;

  const center = accommodationCoords;
  const buildTransit = (
    from: { lat: number; lng: number },
    fromName: string,
    to: { lat: number; lng: number },
    toName: string,
  ): RegenTransit => {
    const km = round2(haversineKm(from.lat, from.lng, to.lat, to.lng));
    const { mode, calc } = pickTransitMode(km, isGuideDay);
    const tr = calcTransitHaversine(
      { ...from, name: fromName },
      { ...to, name: toName },
      calc,
      companionCount,
      center,
    );
    const cost = isGuideDay ? 0 : estimateTransitCost(mode);
    return {
      from: fromName,
      to: toName,
      distance: Math.round(km * 1000),
      duration: tr.duration,
      durationText: `${tr.duration}분`,
      mode,
      modeLabel:
        mode === "walk"
          ? "도보"
          : mode === "private_guide"
            ? "전용차량이동"
            : "지하철/버스",
      cost,
      costTotal: cost,
    };
  };

  const departureTransit =
    accommodationCoords && reordered.length > 0
      ? buildTransit(
          accommodationCoords,
          "🏨 숙소",
          reordered[0],
          reordered[0].name,
        )
      : undefined;

  const transits: RegenTransit[] = [];
  for (let i = 0; i < reordered.length - 1; i++) {
    transits.push(
      buildTransit(
        reordered[i],
        reordered[i].name,
        reordered[i + 1],
        reordered[i + 1].name,
      ),
    );
  }

  const returnTransit =
    accommodationCoords &&
    reordered.length > 0 &&
    reordered[reordered.length - 1].seedCategory !== "bts_venue"
      ? buildTransit(
          reordered[reordered.length - 1],
          reordered[reordered.length - 1].name,
          accommodationCoords,
          "🏨 숙소",
        )
      : undefined;

  const allTransits: RegenTransit[] = [
    ...(departureTransit ? [departureTransit] : []),
    ...transits,
    ...(returnTransit ? [returnTransit] : []),
  ];

  const dayCount =
    formData?.startDate && formData?.endDate
      ? calculateDayCount(formData.startDate, formData.endDate)
      : 1;
  // ⚠️ 수정금지(승인필요) 2026-10-09 사장님 결정 = 그날의 출발·끝 시각 = 받은 값 그대로(날마다 사용자가 정하고, 안 정하면 기본 09:00~21:00) (정본 §)
  const dc = {
    startTime: formData?.startTime || DEFAULT_START_TIME,
    endTime: formData?.endTime || DEFAULT_END_TIME,
  };
  const [sh, sm] = dc.startTime.split(":").map(Number);
  const [eh, em] = dc.endTime.split(":").map(Number);
  const availableHours = Math.max(
    4,
    round2((eh * 60 + em - (sh * 60 + sm)) / 60),
  );

  // ⚠️ 수정금지(승인필요) 2026-10-10 사장님 결정 = 조정 뒤 슬롯 시간 = 처음 생성과 같은 계산 1벌로 다시 깐다 · 순서 유지 요청(keepOrder)은 받은 순서 그대로 (정본 §)
  if (accommodationCoords && reordered.length)
    retimePlaces({
      places: reordered,
      anchor: accommodationCoords,
      startTime: dc.startTime,
      endTime: dc.endTime,
      isGuideDay,
      departure: departureTransit,
      between: transits,
      ret: returnTransit,
    });

  const priceResult = await calculateTransportPrice({
    companionType: (formData?.companionType || "Couple") as CompanionType,
    companionCount,
    mobilityStyle: (formData?.mobilityStyle || "Moderate") as MobilityStyle,
    travelStyle: (formData?.travelStyle || "Reasonable") as TravelStyle,
    availableHours,
    dayCount,
  });
  const transportPerPersonPerDay = isGuideDay
    ? await guideCostForDay({
        dayConfig: dc,
        companionType: (formData?.companionType || "Couple") as CompanionType,
        companionCount,
        mobilityStyle: (formData?.mobilityStyle || "Moderate") as MobilityStyle,
        travelStyle: (formData?.travelStyle || "Reasonable") as TravelStyle,
        dayCount,
      })
    : transits.reduce((s, t) => s + (t.cost || 0), 0);

  let transportDisplay: Record<string, unknown>;
  if (isGuideDay) {
    allTransits.forEach((t) => {
      t.cost = 0;
      t.costTotal = 0;
    });
    const routeSegments = allTransits.map((t) => {
      const hasRealData = t.distance > 0 && t.duration > 0;
      return {
        distanceKm: hasRealData ? round2((t.distance || 0) / 1000) : 3.0,
        durationMin: hasRealData ? t.duration || 0 : 12,
      };
    });
    const uberBlackComp =
      routeSegments.length > 0
        ? calculateUberBlackHourly(
            availableHours,
            routeSegments,
            companionCount,
          )
        : null;
    transportDisplay = {
      category: "guide" as const,
      perPersonPerDay: transportPerPersonPerDay,
      uberBlackComparison: uberBlackComp
        ? {
            perPersonPerDay: uberBlackComp.perPersonPerDay,
            totalDistanceKm: uberBlackComp.totalDistanceKm,
            totalDurationMin: uberBlackComp.totalDurationMin,
          }
        : null,
      vehicleDescription:
        priceResult.category === "guide"
          ? (priceResult as GuidePriceResult).vehicleDescription
          : "전용 차량",
      notes: priceResult.notes || [],
    };
  } else {
    const guideUpsell =
      priceResult.category === "transit"
        ? (priceResult as TransitPriceResult).guideUpsell
        : null;
    transportDisplay = {
      category: "transit" as const,
      perPersonPerDay: transportPerPersonPerDay,
      method:
        priceResult.category === "transit"
          ? (priceResult as TransitPriceResult).method
          : "대중교통",
      details:
        priceResult.category === "transit"
          ? (priceResult as TransitPriceResult).details
          : "",
      guideUpsell: guideUpsell
        ? {
            perPersonPerDay: guideUpsell.perPersonPerDay,
            vehicleDescription: guideUpsell.vehicleDescription,
            clickable: true,
          }
        : null,
      notes: priceResult.notes || [],
    };
  }

  const mealEur = reordered.reduce(
    (s, p) => s + (p.isMealSlot && p.mealPrice ? p.mealPrice : 0),
    0,
  );
  // ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 가격은 500 이상도 허용 = 무조건 실제 값 (정본 §)
  const entranceEur = reordered.reduce(
    (s, p) =>
      s +
      (!p.isMealSlot &&
      typeof p.estimatedPriceEur === "number" &&
      p.estimatedPriceEur > 0
        ? p.estimatedPriceEur
        : 0),
    0,
  );
  const perPersonEur = round2(mealEur + entranceEur + transportPerPersonPerDay);

  return {
    day,
    places: reordered,
    departureTransit,
    returnTransit,
    transit: {
      transits,
      totalDuration: transits.reduce((sum, t) => sum + t.duration, 0),
      totalCost: transits.reduce((sum, t) => sum + t.costTotal, 0),
      totalDistanceKm: round2(
        transits.reduce((sum, t) => sum + (t.distance || 0) / 1000, 0),
      ),
    },
    dailyCost: {
      perPersonEur,
      breakdown: {
        mealEur,
        entranceEur,
        transportEur: transportPerPersonPerDay,
      },
    },
    transportDisplay,
  };
}

app.post("/api/routes/regenerate-day", async (req, res) => {
  try {
    const { day, accommodationCoords, places, formData, keepOrder } = req.body;

    if (!day || !places || !Array.isArray(places)) {
      return res.status(400).json({ error: "day, places are required" });
    }

    const result = await withEngineDb(() =>
      regenerateDay({
        day,
        accommodationCoords,
        places,
        formData,
        keepOrder: keepOrder === true,
      }),
    );

    res.json(result);
  } catch (error) {
    console.error("[Regenerate Day] Error:", (error as Error)?.message);
    res.status(500).json({ error: "동선 재최적화 실패" });
  }
});

app.listen(8080);
export default withScheduled(httpServerHandler({ port: 8080 })); // ⚠️ 수정금지(승인필요) 2026-10-16 사장님 결정 = HTTP 는 그대로, 정기 작업(scheduled)만 덧붙임 (정본 §정리)
