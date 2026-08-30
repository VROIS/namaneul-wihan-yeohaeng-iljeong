// ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = Step 4 DB DROP = places 테이블 폐기 = Place type → PlaceSeedRaw alias
import {
  type User,
  type InsertUser,
  type City,
  type InsertCity,
  type PlaceSeedRaw as Place,
  type Itinerary,
  type InsertItinerary,
  type GuidePrice,
  users,
  userProviders,
  cities,
  itineraries,
  placeSeedRaw,
  guidePrices,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, notInArray } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getAdminUser(): Promise<User | undefined>;
  markAccountDeleted(userId: string): Promise<void>;
  getUserByProvider(
    provider: string,
    providerId: string,
  ): Promise<User | undefined>;
  linkProvider(
    userId: string,
    provider: string,
    providerId: string,
  ): Promise<void>;
  createUser(user: InsertUser): Promise<User>;
  updateUserPersona(
    id: string,
    persona: "luxury" | "comfort",
  ): Promise<User | undefined>;
  updateUserLogin(id: string, data: Partial<User>): Promise<User | undefined>;

  getCities(): Promise<City[]>;
  getCity(id: number): Promise<City | undefined>;
  getCityByName(name: string, country: string): Promise<City | undefined>;
  createCity(city: InsertCity): Promise<City>;

  getPlace(id: number): Promise<Place | undefined>;
  getPlaceByGoogleId(googlePlaceId: string): Promise<Place | undefined>;

  getUserItineraries(userId: string): Promise<Itinerary[]>;
  getItinerary(id: number): Promise<Itinerary | undefined>;
  createItinerary(itinerary: InsertItinerary): Promise<Itinerary>;
  updateItinerary(
    id: number,
    data: Partial<InsertItinerary>,
  ): Promise<Itinerary | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username));
    return user || undefined;
  }

  // ⚠️ 사장님 SSOT 2026-07-14 = 이메일로 사용자 조회(개발단계 메일 로그인용). DB 단 대소문자 무시(lower 비교).
  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`);
    return user || undefined;
  }

  // ⚠️ 수정금지(승인필요) 2026-08-08 사장님 확정 = 탈퇴 = **문패만 내린다. 아무것도 지우지 않는다.**
  async markAccountDeleted(userId: string): Promise<void> {
    await db!
      .update(users)
      .set({ accountStatus: "deleted", deletedAt: new Date() })
      .where(eq(users.id, userId));
  }

  // ⚠️ 수정금지(승인필요) 2026-08-08 사장님 확정 = 관리자 계정 조회 = **users.role='admin' DB 1벌만**.
  async getAdminUser(): Promise<User | undefined> {
    const [user] = await db!
      .select()
      .from(users)
      .where(eq(users.role, "admin"))
      .orderBy(users.createdAt)
      .limit(1);
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    if (user && insertUser.provider && insertUser.providerId) {
      try {
        await this.linkProvider(
          user.id,
          insertUser.provider,
          insertUser.providerId,
        );
      } catch {}
    }
    return user;
  }

  async updateUserPersona(
    id: string,
    persona: "luxury" | "comfort",
  ): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ persona })
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  async getUserByProvider(
    provider: string,
    providerId: string,
  ): Promise<User | undefined> {
    try {
      const [row] = await db
        .select({ user: users })
        .from(userProviders)
        .innerJoin(users, eq(userProviders.userId, users.id))
        .where(
          and(
            eq(userProviders.provider, provider),
            eq(userProviders.providerId, providerId),
          ),
        );
      if (row) return row.user;
    } catch {}
    const [user] = await db
      .select()
      .from(users)
      .where(
        and(eq(users.provider, provider), eq(users.providerId, providerId)),
      );
    return user || undefined;
  }

  async linkProvider(
    userId: string,
    provider: string,
    providerId: string,
  ): Promise<void> {
    await db
      .insert(userProviders)
      .values({ userId, provider, providerId })
      .onConflictDoNothing({
        target: [userProviders.provider, userProviders.providerId],
      });
  }

  async updateUserLogin(
    id: string,
    data: Partial<User>,
  ): Promise<User | undefined> {
    const { updatedAt, ...rest } = data as any;
    const [user] = await db
      .update(users)
      .set(rest)
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  async getCities(): Promise<City[]> {
    return db.select().from(cities).orderBy(cities.name);
  }

  async getCity(id: number): Promise<City | undefined> {
    const [city] = await db.select().from(cities).where(eq(cities.id, id));
    return city || undefined;
  }

  async getCityByName(
    name: string,
    country: string,
  ): Promise<City | undefined> {
    const [city] = await db
      .select()
      .from(cities)
      .where(and(eq(cities.name, name), eq(cities.country, country)));
    return city || undefined;
  }

  async createCity(city: InsertCity): Promise<City> {
    const [newCity] = await db.insert(cities).values(city).returning();
    return newCity;
  }

  async getPlace(id: number): Promise<Place | undefined> {
    const [psr] = await db
      .select()
      .from(placeSeedRaw)
      .where(eq(placeSeedRaw.id, id));
    if (!psr) return undefined;
    return {
      ...psr,
      name: psr.nameEn || psr.nameKo || "",
      type: psr.seedCategory,
      photoUrl: psr.imageUrl,
    } as unknown as Place;
  }

  async getPlaceByGoogleId(googlePlaceId: string): Promise<Place | undefined> {
    const [psr] = await db
      .select()
      .from(placeSeedRaw)
      .where(eq(placeSeedRaw.googlePlaceId, googlePlaceId));
    if (!psr) return undefined;
    return {
      ...psr,
      name: psr.nameEn || psr.nameKo || "",
      type: psr.seedCategory,
      photoUrl: psr.imageUrl,
    } as unknown as Place;
  }

  // ⚠️ 수정금지(승인필요) 2026-08-09 = 화면 목록에서 **빼는 상태 1벌**(아래 두 목록이 같은 기준을 쓴다 §0).
  private static readonly HIDDEN_STATUSES = ["inquiry", "generating", "failed"];

  async getUserItineraries(userId: string): Promise<Itinerary[]> {
    return db
      .select()
      .from(itineraries)
      .where(
        and(
          eq(itineraries.userId, userId),
          notInArray(itineraries.status, DatabaseStorage.HIDDEN_STATUSES),
        ),
      )
      .orderBy(desc(itineraries.createdAt));
  }

  // ⚠️ 2026-08-06 사장님 승인 = 관리자 전체 상황판 = 전 사용자 여정(감출 상태 규칙·정렬 = 위와 동일 1벌 기준).
  async getAllItineraries(): Promise<Itinerary[]> {
    return db
      .select()
      .from(itineraries)
      .where(notInArray(itineraries.status, DatabaseStorage.HIDDEN_STATUSES))
      .orderBy(desc(itineraries.createdAt));
  }

  async getItinerary(id: number): Promise<Itinerary | undefined> {
    const [itinerary] = await db
      .select()
      .from(itineraries)
      .where(eq(itineraries.id, id));
    return itinerary || undefined;
  }

  async createItinerary(itinerary: InsertItinerary): Promise<Itinerary> {
    const [newItinerary] = await db
      .insert(itineraries)
      .values(itinerary)
      .returning();
    return newItinerary;
  }

  // ⚠️ 2026-07-03 사장님 SSOT = 여정 재저장 = 같은 행 전체 새덮어쓰기(셀렉 아님 = raw_data·조건 전부 현재 화면 최신값). 변하는 것 = 내용 + 저장시점(updated_at). id·created_at 유지. 없는 id면 undefined.
  async updateItinerary(
    id: number,
    data: Partial<InsertItinerary>,
  ): Promise<Itinerary | undefined> {
    const [updated] = await db
      .update(itineraries)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(itineraries.id, id))
      .returning();
    return updated || undefined;
  }

  async getGuidePrices(): Promise<GuidePrice[]> {
    return db.select().from(guidePrices).where(eq(guidePrices.isActive, true));
  }

  async getGuidePriceByType(
    serviceType: string,
  ): Promise<GuidePrice | undefined> {
    const [price] = await db
      .select()
      .from(guidePrices)
      .where(
        and(
          eq(guidePrices.serviceType, serviceType),
          eq(guidePrices.isActive, true),
        ),
      );
    return price || undefined;
  }
}

export const storage = new DatabaseStorage();
