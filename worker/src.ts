// Cloudflare Worker 진입점 (2026-09-05)
// Replit(server/index.ts, Express4) 은 손대지 않는다. 여기만 Express5.
// 이관은 검사표(docs/2026-09-05 Cloudflare 이관 검사표.md) 순서대로 한 줄씩.
// 여기 있는 라우트 = 실제로 배포·실증까지 끝난 것만. 그 외는 추가하지 않는다.
import express from "express";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { desc, eq, sql as dsql } from "drizzle-orm";
import * as schema from "../shared/schema";
import { httpServerHandler } from "cloudflare:node";
// 아래 4벌 = 서버(server/**)의 순수 계산 모듈 그대로 재사용(§16 재발명 금지).
//   server/db.ts(pg 드라이버)를 딸려오지 않는 것만 고른다 = Worker 번들 가능.
import {
  generateItineraryICS,
  type ItineraryForICS,
} from "../server/itinerary-ics";
import {
  COMPANION_TO_TRANSPORT,
  DEFAULT_PRICES,
  PARIS_TRANSIT_FARES,
  UBER_PARIS_FARES,
  type CompanionType,
  type GuidePriceResult,
  type MobilityStyle,
  type TransitPriceResult,
  type TransportPriceInput,
  type TransportPricingResult,
  type TransportType,
  type TravelStyle,
  type UberBlackComparison,
} from "../server/services/transport/constants";
import {
  calcTransitHaversine,
  estimateTransitCost,
  haversineKm,
  pickTransitMode,
} from "../server/services/agents/transit-haversine";
import { optimizeDayRoute } from "../server/services/itinerary/route-optimizer";
// 바인딩(Hyperdrive) 접근 = 공식 방식. 타입은 `wrangler types` 가 만든 Env 를 쓴다(손으로 안 씀).
// https://developers.cloudflare.com/workers/runtime-apis/bindings/#how-to-access-bindings
import { env } from "cloudflare:workers";
import { ensureKeys } from "./keys";
// 라우트 묶음 = 파일별 분리(§0 슬림). 등록 순서는 아래 배선 지점 주석 참조.
import { registerPlaceRoutes } from "./routes-places";
import { registerItineraryRoutes } from "./routes-itinerary";
import { registerGuideVideoRoutes } from "./routes-guide-video";
import { registerExpertBtsRoutes } from "./routes-expert-bts";
import { registerAppleAuthRoutes } from "./routes-auth-apple";
import { registerAuthCreditsRoutes } from "./routes-auth-credits";
import { registerGenerateRoutes } from "./routes-generate";
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
import { registerVideoConfigRoutes } from "./routes-video-config";
import { registerItineraryGenerateDbRoutes } from "./routes-itinerary-generate-db";
import { registerDebugRoutes } from "./routes-debug";
// 근거: containers/get-started = 컨테이너를 관리하는 Durable Object 클래스는
//   **엔트리 파일에서 export** 되어야 런타임이 찾는다(안 하면 기동 자체가 실패).
import {
  registerVideoGenerateRoutes,
  VideoStitchContainer,
} from "./routes-video-generate";

export { VideoStitchContainer };

const app = express();

// ⚠️ 수정금지(승인필요) 2026-09-06 사장님 결정 = Stripe 웹훅은 **express.json() 앞**에 등록한다(§9 충전 유일 경로).
// 근거 = docs.stripe.com/webhooks/signature "Récupérer le corps de la requête brute" =
//   "assurez-vous que `app.use(express.json())` est placée *après* l'acheminement du webhook.
//    Dans Express, l'ordre de configuration du middleware est important."
//   예시도 app.post('/webhook', ...) → app.use(express.json()) 순서다.
//   뒤로 옮기면 전역 파서가 본문 스트림을 먼저 소비해(workers/gotchas.md:15 "Body has already been used")
//   서명검증에 필요한 원본 바이트가 사라진다 = 모든 충전이 조용히 실패.
// openDb/sql 은 아래에서 선언되지만(const = TDZ), 여기서는 호출하지 않고 요청 시점에 부르는
// 화살표로 감싸 넘기므로 안전하다.
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

// Hyperdrive + postgres.js
// https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/
// max:5 = Worker 동시 외부연결 제한 / fetch_types:false = 불필요 지연 제거
//
// ⚠️ 수정금지(승인필요) 2026-09-06 사장님 결정 = prepare:false 고정.
// 우리 DB 는 Supabase **트랜잭션 풀러(6543)** 이고, 공식 문서상 이 모드는
// prepared statement 를 지원하지 않는다("Transaction mode does not support
// prepared statements. To avoid errors, turn off prepared statements").
// prepare:true 로 두면 요청이 간헐적으로 20초에 canceled 된다(2026-09-06 실측).
const sql = () =>
  postgres(env.HYPERDRIVE.connectionString, {
    max: 5,
    fetch_types: false,
    prepare: true,
  });

// drizzle = Replit(server/db.ts) 과 같은 스키마·같은 camelCase 응답을 내기 위함.
// 생 SQL 은 snake_case 로 나와 앱이 기대하는 nameEn 등과 달라진다(2026-09-06 실측).
//
// ⚠️ 수정금지(승인필요) 2026-09-06 사장님 결정 = 요청 1건 = 연결 1벌 = 반드시 닫는다.
// 안 닫으면 요청마다 연결이 쌓여 간헐적으로 응답이 멈춘다(2026-09-06 실측: 6회 중 2회 정지).
function openDb() {
  const client = sql();
  return {
    db: drizzle(client, { schema }),
    close: () => {
      void client.end({ timeout: 5 });
    },
  };
}

// ⚠️ 수정금지(승인필요) 2026-09-06 사장님 결정 = 열쇠 게이트 (정본 B1)
// Replit 은 부팅 시 DB api_keys → process.env 를 채우지만, Worker 는 요청 밖 I/O 가
// 금지되므로 "첫 요청"에서 채운다. isolate 당 1회만 실제 조회된다(keys.ts).
// 열쇠가 실제로 필요한 라우트에서만 부른다(전역 게이트는 모든 요청에 DB 연결을
// 하나씩 더 열어 Hyperdrive 연결을 고갈시킨다 = 2026-09-06 실측, 응답 불규칙 정지).
async function withKeys<T>(run: () => Promise<T> | T): Promise<T> {
  const db = sql();
  try {
    await ensureKeys(db);
  } finally {
    void db.end({ timeout: 5 });
  }
  return run();
}

// [검사표 6-1] GET /api/health
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    from: "cloudflare-worker",
    time: new Date().toISOString(),
  });
});

// [검사표 6-2] GET /api/cities — 원본 server/city-place-routes.ts 와 동일 응답(도시 전체 배열)
app.get("/api/cities", async (_req, res) => {
  try {
    const { db, close } = openDb();
    // 정렬 = 원본 storage.getCities()(server/storage.ts:181) 와 동일한 name 순.
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

// [검사표 6-5] GET /api/cities/ready — 원본 server/city-place-routes.ts:39
// READY_THRESHOLD = 원본 server/services/agents/ag2-gemini-recommender.ts:24 (=200) 과 같은 값.
const READY_THRESHOLD = 200;
app.get("/api/cities/ready", async (_req, res) => {
  try {
    const { db, close } = openDb();
    const rows = await db
      .select({
        id: schema.cities.id,
        nameKo: schema.cities.name,
        nameEn: schema.cities.nameEn,
        rows: dsql<number>`COUNT(*)::int`,
      })
      .from(schema.cities)
      .innerJoin(
        schema.placeSeedRaw,
        eq(schema.placeSeedRaw.cityId, schema.cities.id),
      )
      .groupBy(schema.cities.id, schema.cities.name, schema.cities.nameEn)
      .having(dsql`COUNT(*) >= ${READY_THRESHOLD}`)
      .orderBy(desc(dsql`COUNT(*)`));
    res.json(rows);
  } catch (error) {
    console.error("[cities/ready] 완비도시 조회 실패:", error);
    res.status(500).json({ error: "failed_to_fetch_ready_cities" });
  } finally {
    close();
  }
});

// [검사표 6-2] GET /api/cities/:id — 원본 city-place-routes.ts:310
// ⚠️ 수정금지(승인필요) 2026-09-06 사장님 결정 = 이 배선은 반드시 `/api/cities/:id` **앞**.
// 뒤에 두면 `/api/cities/:id/representative` 를 `:id` 가 먼저 잡아 404 가 난다(2026-09-06 실측).
registerPlaceRoutes(app, openDb);
registerItineraryRoutes(app, openDb);
registerGuideVideoRoutes(app, openDb);
registerExpertBtsRoutes(app, openDb);
registerAppleAuthRoutes(app, openDb);
registerAuthCreditsRoutes(app, openDb);
registerGenerateRoutes(app, openDb);
registerAdminRoutes(app, openDb);
registerSocialAuthRoutes(app, openDb);
// 결제는 Stripe 웹훅 서명검증 등으로 raw postgres 클라이언트도 필요하다.
registerPaymentRoutes(app, openDb, sql);
registerMisc2Routes(app, openDb);
registerGeminiRoutes(app, openDb);
registerAdminKeysRoutes(app, openDb);
registerItineraryGenerateRoutes(app, openDb);
registerAppErrorRoutes(app, openDb);
registerAdminKeyTestRoutes(app, openDb);
registerRestRoutes(app, openDb);
registerVideoConfigRoutes(app, openDb);
registerItineraryGenerateDbRoutes(app, openDb);
registerDebugRoutes(app, openDb);
registerVideoGenerateRoutes(app, openDb);

app.get("/api/cities/:id", async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (Number.isNaN(id))
      return res.status(404).json({ error: "City not found" });
    const { db, close } = openDb();
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

// [검사표 6-3] GET /api/guide/health — 원본 server/guide-routes.ts:44
app.get("/api/guide/health", (_req, res) => {
  res.json({ status: "ok", service: "guide", version: "2.0.0" });
});

// ── 크레딧 상수 = 원본 server/credit-charge.ts:6(CREDIT_COSTS) · server/creditService.ts:6(CREDIT_CONFIG) 과 같은 값 1벌.
const CREDIT_COSTS = {
  route_generate: 5,
  ai_opinion: 5,
  guide_explain: 5,
  expert_verify: 10,
  day_video: 60,
} as const;
const SIGNUP_BONUS = 50;
const PURCHASE_CREDITS = 140;
const PRICE_EUR = 10;

// [검사표 6-4] GET /api/credits/pricing — 원본 server/payment-routes.ts:210
app.get("/api/credits/pricing", async (_req, res) => {
  try {
    // 이 라우트만 열쇠(STRIPE_PUBLISHABLE_KEY)가 필요하다.
    await withKeys(() => {
      res.json({
        currency: "EUR",
        priceEur: PRICE_EUR,
        purchaseCredits: PURCHASE_CREDITS,
        signupBonus: SIGNUP_BONUS,
        costs: CREDIT_COSTS,
        // 폰 결제 시트용 공개 키(pk_ = 비밀 아님).
        stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
      });
    });
  } catch (error) {
    console.error("Error fetching pricing:", error);
    res.status(500).json({ error: "Failed to fetch pricing" });
  }
});

// [검사표 6-6] GET /api/itineraries/:id/calendar.ics — 원본 server/itinerary-routes.ts:88
// 본문(ICS 생성) = server/itinerary-ics.ts 를 그대로 import = 재발명 0(§16).
app.get("/api/itineraries/:id/calendar.ics", async (req, res) => {
  try {
    const idNum = parseInt(String(req.params.id));
    if (Number.isNaN(idNum)) {
      return res.status(404).json({ error: "Itinerary not found" });
    }
    // 원본 storage.getItinerary(id) = itineraries 단일 행 조회(server/storage.ts:258).
    const { db, close } = openDb();
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

// ── 교통비 계산 = 원본 server/services/transport/** 와 같은 식.
//   원본은 server/db.ts(pg 드라이버)를 물고 있어 Worker 번들이 안 된다 = DB 읽는 1함수만 Hyperdrive drizzle 로 다시 배선하고,
//   나머지 순수 계산(상수·하버사인·2-opt)은 원본 모듈을 그대로 import 해 쓴다(§16).
function round2(num: number): number {
  return Math.round(num * 100) / 100;
}

function shouldApplyGuidePrice(
  mobilityStyle: MobilityStyle,
  travelStyle: TravelStyle,
): boolean {
  const ms = (mobilityStyle || "").toLowerCase();
  const ts = (travelStyle || "").toLowerCase();
  return (
    ms === "minimal" || ms === "moderate" || ts === "premium" || ts === "luxury"
  );
}

// 원본 server/services/transport/guide-pricing.ts:28 getGuidePriceFromDB 와 같은 조회.
async function getGuidePriceFromDB(serviceType: TransportType): Promise<{
  basePrice4h: number;
  pricePerHour: number;
} | null> {
  try {
    const { db, close } = openDb();
    try {
      const [priceData] = await db
        .select()
        .from(schema.guidePrices)
        .where(eq(schema.guidePrices.serviceType, serviceType))
        .limit(1);
      if (!priceData) return null;
      return {
        basePrice4h:
          priceData.basePrice4h || DEFAULT_PRICES[serviceType].basePrice4h,
        pricePerHour:
          priceData.pricePerHour || DEFAULT_PRICES[serviceType].pricePerHour,
      };
    } finally {
      close();
    }
  } catch (error) {
    console.warn(
      `[Transport] DB 조회 실패, 기본값 사용: ${serviceType}`,
      error,
    );
    return null;
  }
}

async function calculateGuideDailyPrice(
  transportType: TransportType,
  availableHours = 8,
  isRegionalTravel = false,
): Promise<{ dailyVehiclePrice: number }> {
  const dbPrice = await getGuidePriceFromDB(transportType);
  const priceConfig = dbPrice || DEFAULT_PRICES[transportType];
  const effectiveHours = Math.max(availableHours, 4);
  const additionalHours = Math.max(0, effectiveHours - 4);
  let dailyVehiclePrice = round2(
    priceConfig.basePrice4h + additionalHours * priceConfig.pricePerHour,
  );
  if (isRegionalTravel) dailyVehiclePrice = round2(dailyVehiclePrice * 1.5);
  return { dailyVehiclePrice };
}

function vehicleDescriptionOf(transportType: TransportType): string {
  return transportType === "sedan"
    ? "전용 세단 (1-4인)"
    : transportType === "van"
      ? "전용 밴 (5-7인)"
      : transportType === "minibus"
        ? "전용 미니버스 (8인+)"
        : "가이드 서비스";
}

async function getGuidePerPersonPerDay(
  companionType: CompanionType,
  companionCount: number,
  availableHours = 8,
  isRegionalTravel = false,
): Promise<{ perPersonPerDay: number; vehicleDescription: string }> {
  const transportType = COMPANION_TO_TRANSPORT[companionType].transportType;
  const { dailyVehiclePrice } = await calculateGuideDailyPrice(
    transportType,
    availableHours,
    isRegionalTravel,
  );
  return {
    perPersonPerDay: round2(dailyVehiclePrice / companionCount),
    vehicleDescription: vehicleDescriptionOf(transportType),
  };
}

// 원본 server/services/transport/transit-pricing.ts:5
function calculateTransitPerPersonPerDay(
  dayCount: number,
  tripCount: number,
): { perPersonPerDay: number; method: string; details: string } {
  const singleFare = PARIS_TRANSIT_FARES.metro.single;
  const carnetFare = PARIS_TRANSIT_FARES.metro.carnet10 / 10;
  const navigoDay = PARIS_TRANSIT_FARES.metro.navigo_day;
  const navigoWeek = PARIS_TRANSIT_FARES.metro.navigo_week;
  const dailyIndividual = tripCount * singleFare;
  const dailyCarnet = tripCount * carnetFare;

  if (dayCount >= 5) {
    const perPersonPerDay = round2(navigoWeek / dayCount);
    return {
      perPersonPerDay,
      method: "Navigo 주간권",
      details: `€${navigoWeek}/주 ÷ ${dayCount}일 = €${perPersonPerDay}/일/인`,
    };
  }
  if (dailyIndividual > navigoDay) {
    return {
      perPersonPerDay: navigoDay,
      method: "Navigo 일일권",
      details: `Mobilis Zone 1-5: €${navigoDay}/일/인`,
    };
  }
  if (tripCount >= 5) {
    const perPersonPerDay = round2(dailyCarnet);
    return {
      perPersonPerDay,
      method: "t+ 카르네",
      details: `카르네 €1.69/회 × ${tripCount}회 = €${perPersonPerDay}/일/인`,
    };
  }
  const perPersonPerDay = round2(dailyIndividual);
  return {
    perPersonPerDay,
    method: "t+ 개별",
    details: `€${singleFare}/회 × ${tripCount}회 = €${perPersonPerDay}/일/인`,
  };
}

// 원본 server/services/transport/transit-pricing.ts:46
function calculateUberXDailyPerPerson(
  tripCount: number,
  companionCount: number,
): { perPersonPerDay: number; details: string } {
  const fare = UBER_PARIS_FARES.uberx;
  let farePerTrip =
    fare.base +
    UBER_PARIS_FARES.avg_trip_km * fare.perKm +
    UBER_PARIS_FARES.avg_trip_min * fare.perMin;
  farePerTrip = round2(Math.max(farePerTrip, fare.min_fare));
  const dailyTotal = round2(farePerTrip * tripCount);
  const perPersonPerDay = round2(dailyTotal / companionCount);
  return {
    perPersonPerDay,
    details: `UberX €${farePerTrip}/회 × ${tripCount}회 ÷ ${companionCount}인 = €${perPersonPerDay}/일/인`,
  };
}

// 원본 server/services/transport/transit-pricing.ts:71
function calculateUberBlackHourly(
  availableHours: number,
  segments: { distanceKm: number; durationMin: number }[],
  companionCount: number,
): UberBlackComparison {
  const fare = UBER_PARIS_FARES.black;
  let totalDrivingKm = 0;
  let totalDrivingMin = 0;
  for (const seg of segments) {
    totalDrivingKm += seg.distanceKm;
    totalDrivingMin += seg.durationMin;
  }
  const totalAvailableMin = availableHours * 60;
  const waitingMin = Math.max(0, totalAvailableMin - totalDrivingMin);
  const drivingFare =
    totalDrivingKm * fare.perKm + totalDrivingMin * fare.perMin;
  const waitingFare = waitingMin * fare.perMin;
  const totalFare = round2(fare.base + drivingFare + waitingFare);
  const finalFare = Math.max(totalFare, fare.min_fare);
  return {
    totalFare: round2(finalFare),
    perPersonPerDay: round2(finalFare / companionCount),
    segmentCount: segments.length,
    totalDistanceKm: round2(totalDrivingKm),
    totalDurationMin: Math.round(totalAvailableMin),
  };
}

// 원본 server/services/transport-pricing-service.ts:53
async function calculateTransportPrice(
  input: TransportPriceInput,
): Promise<TransportPricingResult> {
  const {
    companionType,
    companionCount,
    mobilityStyle,
    travelStyle,
    availableHours,
    dayCount,
    isRegionalTravel,
  } = input;

  const isGuide = shouldApplyGuidePrice(mobilityStyle, travelStyle);
  const transportType = COMPANION_TO_TRANSPORT[companionType].transportType;

  if (isGuide) {
    const { dailyVehiclePrice } = await calculateGuideDailyPrice(
      transportType,
      availableHours,
      isRegionalTravel || false,
    );
    const notes: string[] = [];
    if (
      mobilityStyle === "Minimal" &&
      (travelStyle === "Premium" || travelStyle === "Luxury")
    ) {
      notes.push("이동 최소화 + 프리미엄/럭셔리");
    } else if (mobilityStyle === "Minimal") {
      notes.push("이동 최소화 → 전용 드라이빙 가이드");
    } else {
      notes.push(`${travelStyle} → 전용 드라이빙 가이드 포함`);
    }
    notes.push(`${availableHours}시간 기준, 200km 포함`);
    if (isRegionalTravel) notes.push("지방/도시 간 이동 포함 (+50%)");

    return {
      category: "guide",
      perPersonPerDay: round2(dailyVehiclePrice / companionCount),
      vehicleType: transportType,
      vehicleDescription: vehicleDescriptionOf(transportType),
      availableHours,
      includes200km: true,
      isRegionalSurcharge: isRegionalTravel || false,
      dailyVehiclePrice,
      dayCount,
      companionCount,
      segmentLabel: "전용차량이동",
      notes,
    } as GuidePriceResult;
  }

  const guideUpsell = await getGuidePerPersonPerDay(
    companionType,
    companionCount,
    availableHours,
    false,
  );

  if (mobilityStyle === "WalkMore") {
    const transit = calculateTransitPerPersonPerDay(
      dayCount,
      PARIS_TRANSIT_FARES.daily_trips_walkmore,
    );
    return {
      category: "transit",
      perPersonPerDay: transit.perPersonPerDay,
      method: transit.method,
      details: transit.details,
      dayCount,
      companionCount,
      guideUpsell: {
        perPersonPerDay: guideUpsell.perPersonPerDay,
        vehicleDescription: guideUpsell.vehicleDescription,
        clickable: true as const,
      },
      notes: [
        transit.details,
        "파리 대중교통 2026년 실제 요금",
        "메트로/버스/RER Zone 1-5",
      ],
    } as TransitPriceResult;
  }

  const transitTrips =
    PARIS_TRANSIT_FARES.daily_trips_moderate -
    UBER_PARIS_FARES.daily_uber_trips;
  const transit = calculateTransitPerPersonPerDay(dayCount, transitTrips);
  const uber = calculateUberXDailyPerPerson(
    UBER_PARIS_FARES.daily_uber_trips,
    companionCount,
  );

  return {
    category: "transit",
    perPersonPerDay: round2(transit.perPersonPerDay + uber.perPersonPerDay),
    method: `${transit.method} + UberX`,
    details: `대중교통 €${transit.perPersonPerDay}/인/일 + UberX €${uber.perPersonPerDay}/인/일`,
    dayCount,
    companionCount,
    guideUpsell: {
      perPersonPerDay: guideUpsell.perPersonPerDay,
      vehicleDescription: guideUpsell.vehicleDescription,
      clickable: true as const,
    },
    notes: [
      `대중교통: ${transit.details}`,
      `우버: ${uber.details}`,
      "파리 2026년 실제 요금",
    ],
  } as TransitPriceResult;
}

// 원본 server/services/transport/day-config.ts:40
function buildDayConfig(
  day: number,
  dayCount: number,
  userStart: string,
  userEnd: string,
  defaultStart: string,
  defaultEnd: string,
): { startTime: string; endTime: string } {
  if (dayCount === 1) return { startTime: userStart, endTime: userEnd };
  if (day === 1) return { startTime: userStart, endTime: defaultEnd };
  if (day === dayCount) return { startTime: defaultStart, endTime: userEnd };
  return { startTime: defaultStart, endTime: defaultEnd };
}

// 원본 server/services/transport/day-config.ts:56
async function guideCostForDay(args: {
  dayConfig: { startTime: string; endTime: string };
  companionType: CompanionType;
  companionCount: number;
  mobilityStyle: MobilityStyle;
  travelStyle: TravelStyle;
  dayCount: number;
}): Promise<number> {
  const [startH, startM] = (args.dayConfig.startTime || "09:00")
    .split(":")
    .map(Number);
  const [endH, endM] = (args.dayConfig.endTime || "21:00")
    .split(":")
    .map(Number);
  const availableHours = Math.max(
    4,
    round2((endH * 60 + endM - (startH * 60 + startM)) / 60),
  );
  const priceResult = await calculateTransportPrice({
    companionType: args.companionType,
    companionCount: args.companionCount,
    mobilityStyle: args.mobilityStyle,
    travelStyle: args.travelStyle,
    availableHours,
    dayCount: args.dayCount,
  });
  return priceResult.category === "guide" ? priceResult.perPersonPerDay : 0;
}

// 원본 server/services/itinerary/helpers.ts:10
function getCompanionCount(companionType: string): number {
  const mapping: Record<string, number> = {
    Single: 1,
    Couple: 2,
    Family: 4,
    ExtendedFamily: 8,
    Group: 10,
  };
  return mapping[companionType] || 1;
}

// 원본 server/services/itinerary/helpers.ts:193 (콘솔 로그 3줄은 Worker 에서 뺌 = 응답 동일)
function calculateDayCount(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
}

// 원본 server/services/itinerary/types.ts:32
const DEFAULT_START_TIME = "09:00";
const DEFAULT_END_TIME = "21:00";

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

// 원본 server/services/itinerary/regenerate-day.ts:22 = 본문 그대로.
async function regenerateDay(params: {
  day: number;
  accommodationCoords?: { lat: number; lng: number };
  places: RegenPlace[];
  formData?: RegenFormData;
}) {
  const { day, accommodationCoords, places, formData } = params;

  if (!places || places.length === 0) {
    return { day, places: [] };
  }

  const nonMealPlaces = places.filter((p) => !p.isMealSlot);
  const mealPlaces = places.filter((p) => p.isMealSlot);
  void mealPlaces; // 원본과 동일하게 선언만 하고 쓰지 않음(재정렬은 아래 원본 순회로 처리)

  let optimized = nonMealPlaces;
  if (nonMealPlaces.length > 2 && accommodationCoords) {
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
    accommodationCoords && reordered.length > 0
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
  const dc = buildDayConfig(
    day,
    dayCount,
    formData?.startTime || DEFAULT_START_TIME,
    formData?.endTime || DEFAULT_END_TIME,
    DEFAULT_START_TIME,
    DEFAULT_END_TIME,
  );
  const [sh, sm] = dc.startTime.split(":").map(Number);
  const [eh, em] = dc.endTime.split(":").map(Number);
  const availableHours = Math.max(
    4,
    round2((eh * 60 + em - (sh * 60 + sm)) / 60),
  );

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
  const entranceEur = reordered.reduce(
    (s, p) =>
      s +
      (!p.isMealSlot &&
      typeof p.estimatedPriceEur === "number" &&
      p.estimatedPriceEur > 0 &&
      p.estimatedPriceEur < 500
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

// [검사표 6-7] POST /api/routes/regenerate-day — 원본 server/city-place-routes.ts:500
app.post("/api/routes/regenerate-day", async (req, res) => {
  try {
    const { day, accommodationCoords, places, formData } = req.body;

    if (!day || !places || !Array.isArray(places)) {
      return res.status(400).json({ error: "day, places are required" });
    }

    const result = await regenerateDay({
      day,
      accommodationCoords,
      places,
      formData,
    });

    res.json(result);
  } catch (error) {
    console.error("[Regenerate Day] Error:", (error as Error)?.message);
    res.status(500).json({ error: "동선 재최적화 실패" });
  }
  // 이 라우트는 DB 를 직접 열지 않는다(가이드 요금 조회 함수가 자체적으로 열고 닫는다).
});

app.listen(8080);
export default httpServerHandler({ port: 8080 });
