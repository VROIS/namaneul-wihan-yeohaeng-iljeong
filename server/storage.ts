// ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = Step 4 DB DROP = places 테이블 폐기 = Place type → PlaceSeedRaw alias
// = placeDataSources/weatherCache/routeCache/reviews/dataSyncLog/placePrices = 함수 삭제
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

// 참고: sql import는 필요 시 추가
// requireDb() 함수 - 향후 DB 연결 검증 필요 시 사용

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  // 관리자 계정 = users.role='admin' 1벌 조회 (2026-08-08, 옛 ADMIN_USER_ID 하드코딩 폐기 §19)
  getAdminUser(): Promise<User | undefined>;
  // 회원 탈퇴 = 문패만 내림(6개월 유예). 실제 정리는 account-cleanup.ts (2026-08-08)
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
  // ⚠️ 2026-07-03 = 복원한 여정 재저장(숙소변경→동선변경) = 같은 행 덮어쓰기(여정1→여정1.1). 새 여정은 createItinerary(새 행).
  updateItinerary(
    id: number,
    data: Partial<InsertItinerary>,
  ): Promise<Itinerary | undefined>;
}

export class DatabaseStorage implements IStorage {
  // Users
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
  //   6개월 뒤 실제 정리(개인 사진만)는 server/services/account-cleanup.ts 가 한다.
  async markAccountDeleted(userId: string): Promise<void> {
    await db!
      .update(users)
      .set({ accountStatus: "deleted", deletedAt: new Date() })
      .where(eq(users.id, userId));
  }

  // ⚠️ 수정금지(승인필요) 2026-08-08 사장님 확정 = 관리자 계정 조회 = **users.role='admin' DB 1벌만**.
  //   옛 ADMIN_USER_ID 하드코딩(auth.ts) 완전삭제 §19 = 관리자를 바꿀 때 코드를 고칠 필요가 없어진다.
  //   여럿이면 가장 먼저 만든 1명(정렬 고정 = 매번 다른 계정이 나오는 것 방지).
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
      } catch {
        // user_providers 테이블 없을 수 있음
      }
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
    // 1) user_providers 우선 (한 사용자에 여러 provider 연결)
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
    } catch {
      // user_providers 테이블 없으면 아래로 fallback
    }
    // 2) users.provider/providerId (마이그레이션 전 호환)
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

  // Cities
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

  // ========================================
  // Places = PSR 직접 (= 사용자 SSOT 2026-05-23 = PSR 단일 컬럼만 사용)
  // = 옛 Place 필드 호환 매핑 (= nameEn → name, seedCategory → type, imageUrl → photoUrl)
  // ========================================
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
      // ⚠️ 2026-06-11 = photo_urls DROP = 이미지 image_url(구글 PM) 1종 통일
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
      // ⚠️ 2026-06-11 = photo_urls DROP = 이미지 image_url(구글 PM) 1종 통일
    } as unknown as Place;
  }

  // ========================================
  // Itineraries (= itineraries.rawData JSON 사용 = 외래키 없음)
  // ========================================
  // ⚠️ 수정금지(승인필요) 2026-08-09 = 화면 목록에서 **빼는 상태 1벌**(아래 두 목록이 같은 기준을 쓴다 §0).
  //   · inquiry    = 전문가 문의용 자동저장(사장님 SSOT 2026-07-14). 전문가는 여정 id 로 직접 연다.
  //   · generating = **아직 만드는 중** = 내용이 없다. 다 되면 draft 로 내려가 그때 목록에 뜬다.
  //   · failed     = 만들다 실패 = 보여줄 내용이 없다.
  //   ⚠️ 두 상태 모두 **DB 에서 지우지 않는다**(사장님 SSOT = 모든 생성물은 회사 소유 = 무조건 남긴다).
  //     화면에서만 감추는 것이고, 실패 원인은 그 행의 raw_data 에 남아 있어 나중에 들여다볼 수 있다.
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
  //   updatedAt = NOW 명시 = schema $onUpdate 없어 UPDATE 시 자동 갱신 안 됨 = "저장 시점만 변하는 구조" 보장.
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

  // ========================================
  // Guide Prices
  // ========================================
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
