// ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = Step 4 DB DROP = places 테이블 폐기 = Place type → PlaceSeedRaw alias
// = placeDataSources/weatherCache/routeCache/reviews/dataSyncLog/placePrices = 함수 삭제
import {
  type User, type InsertUser,
  type City, type InsertCity,
  type PlaceSeedRaw as Place,
  type Itinerary, type InsertItinerary,
  type GuidePrice,
  users, userProviders,
  cities, itineraries, placeSeedRaw,
  guidePrices,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";

// 참고: sql import는 필요 시 추가
// requireDb() 함수 - 향후 DB 연결 검증 필요 시 사용

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByProvider(provider: string, providerId: string): Promise<User | undefined>;
  getUserByBirthDate(birthDate: string): Promise<User | undefined>;
  linkProvider(userId: string, provider: string, providerId: string): Promise<void>;
  createUser(user: InsertUser): Promise<User>;
  updateUserPersona(id: string, persona: "luxury" | "comfort"): Promise<User | undefined>;
  updateUserLogin(id: string, data: Partial<User>): Promise<User | undefined>;

  // Cities
  getCities(): Promise<City[]>;
  getCity(id: number): Promise<City | undefined>;
  getCityByName(name: string, country: string): Promise<City | undefined>;
  createCity(city: InsertCity): Promise<City>;

  // Places = PSR 직접 (= 사용자 SSOT 2026-05-23)
  getPlace(id: number): Promise<Place | undefined>;
  getPlaceByGoogleId(googlePlaceId: string): Promise<Place | undefined>;

  // Itineraries
  getUserItineraries(userId: string): Promise<Itinerary[]>;
  getItinerary(id: number): Promise<Itinerary | undefined>;
  createItinerary(itinerary: InsertItinerary): Promise<Itinerary>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    if (user && insertUser.provider && insertUser.providerId) {
      try {
        await this.linkProvider(user.id, insertUser.provider, insertUser.providerId);
      } catch {
        // user_providers 테이블 없을 수 있음
      }
    }
    return user;
  }

  async updateUserPersona(id: string, persona: "luxury" | "comfort"): Promise<User | undefined> {
    const [user] = await db.update(users).set({ persona }).where(eq(users.id, id)).returning();
    return user || undefined;
  }

  async getUserByProvider(provider: string, providerId: string): Promise<User | undefined> {
    // 1) user_providers 우선 (한 사용자에 여러 provider 연결)
    try {
      const [row] = await db.select({ user: users })
        .from(userProviders)
        .innerJoin(users, eq(userProviders.userId, users.id))
        .where(and(eq(userProviders.provider, provider), eq(userProviders.providerId, providerId)));
      if (row) return row.user;
    } catch {
      // user_providers 테이블 없으면 아래로 fallback
    }
    // 2) users.provider/providerId (마이그레이션 전 호환)
    const [user] = await db.select().from(users).where(and(eq(users.provider, provider), eq(users.providerId, providerId)));
    return user || undefined;
  }

  async getUserByBirthDate(birthDate: string): Promise<User | undefined> {
    if (!birthDate || typeof birthDate !== "string") return undefined;
    const normalized = birthDate.trim().replace(/\s/g, "");
    if (!normalized) return undefined;
    const [user] = await db.select().from(users).where(eq(users.birthDate, normalized));
    return user || undefined;
  }

  async linkProvider(userId: string, provider: string, providerId: string): Promise<void> {
    await db.insert(userProviders).values({ userId, provider, providerId })
      .onConflictDoNothing({ target: [userProviders.provider, userProviders.providerId] });
  }

  async updateUserLogin(id: string, data: Partial<User>): Promise<User | undefined> {
    const { updatedAt, ...rest } = data as any;
    const [user] = await db.update(users).set(rest).where(eq(users.id, id)).returning();
    return user || undefined;
  }

  // Cities
  async getCities(): Promise<City[]> {
    return db.select().from(cities).orderBy(cities.name);
  }

  async getCity(id: number): Promise<City | undefined> {
    const [city] = await db.select().from(cities).where(eq(cities.id, id));
    return city || undefined;
  }

  async getCityByName(name: string, country: string): Promise<City | undefined> {
    const [city] = await db.select().from(cities).where(and(eq(cities.name, name), eq(cities.country, country)));
    return city || undefined;
  }

  async createCity(city: InsertCity): Promise<City> {
    const [newCity] = await db.insert(cities).values(city).returning();
    return newCity;
  }

  // ========================================
  // Places = PSR 직접 (= 사용자 SSOT 2026-05-23 = PSR 단일 컬럼만 사용)
  // = 옛 Place 필드 호환 매핑 (= nameEn → name, seedCategory → type, imageUrl → photoUrl)
  // ========================================
  async getPlace(id: number): Promise<Place | undefined> {
    const [psr] = await db.select().from(placeSeedRaw).where(eq(placeSeedRaw.id, id));
    if (!psr) return undefined;
    return {
      ...psr,
      name: psr.nameEn || psr.nameKo || "",
      type: psr.seedCategory,
      photoUrl: psr.imageUrl,
      // ⚠️ 2026-06-11 = photo_urls DROP = 이미지 image_url(구글 PM) 1종 통일
    } as unknown as Place;
  }

  async getPlaceByGoogleId(googlePlaceId: string): Promise<Place | undefined> {
    const [psr] = await db.select().from(placeSeedRaw).where(eq(placeSeedRaw.googlePlaceId, googlePlaceId));
    if (!psr) return undefined;
    return {
      ...psr,
      name: psr.nameEn || psr.nameKo || "",
      type: psr.seedCategory,
      photoUrl: psr.imageUrl,
      // ⚠️ 2026-06-11 = photo_urls DROP = 이미지 image_url(구글 PM) 1종 통일
    } as unknown as Place;
  }

  // ========================================
  // Itineraries (= itineraries.rawData JSON 사용 = 외래키 없음)
  // ========================================
  async getUserItineraries(userId: string): Promise<Itinerary[]> {
    return db.select().from(itineraries)
      .where(eq(itineraries.userId, userId))
      .orderBy(desc(itineraries.createdAt));
  }

  async getItinerary(id: number): Promise<Itinerary | undefined> {
    const [itinerary] = await db.select().from(itineraries).where(eq(itineraries.id, id));
    return itinerary || undefined;
  }

  async createItinerary(itinerary: InsertItinerary): Promise<Itinerary> {
    const [newItinerary] = await db.insert(itineraries).values(itinerary).returning();
    return newItinerary;
  }

  // ========================================
  // Guide Prices
  // ========================================
  async getGuidePrices(): Promise<GuidePrice[]> {
    return db.select().from(guidePrices).where(eq(guidePrices.isActive, true));
  }

  async getGuidePriceByType(serviceType: string): Promise<GuidePrice | undefined> {
    const [price] = await db.select().from(guidePrices)
      .where(and(eq(guidePrices.serviceType, serviceType), eq(guidePrices.isActive, true)));
    return price || undefined;
  }
}

export const storage = new DatabaseStorage();
