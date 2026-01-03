import { 
  type User, type InsertUser,
  type City, type InsertCity,
  type Place, type InsertPlace,
  type PlaceDataSource,
  type Review,
  type VibeAnalysis,
  type RealityCheck,
  type WeatherCache,
  type Itinerary, type InsertItinerary,
  type ItineraryItem,
  type RouteCache,
  type DataSyncLog,
  users, cities, places, placeDataSources, reviews, vibeAnalysis,
  realityChecks, weatherCache, itineraries, itineraryItems, routeCache, dataSyncLog
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserPersona(id: string, persona: "luxury" | "comfort"): Promise<User | undefined>;
  
  // Cities
  getCities(): Promise<City[]>;
  getCity(id: number): Promise<City | undefined>;
  getCityByName(name: string, country: string): Promise<City | undefined>;
  createCity(city: InsertCity): Promise<City>;
  
  // Places
  getPlacesByCity(cityId: number, type?: string): Promise<Place[]>;
  getPlace(id: number): Promise<Place | undefined>;
  getPlaceByGoogleId(googlePlaceId: string): Promise<Place | undefined>;
  createPlace(place: InsertPlace): Promise<Place>;
  updatePlaceScores(id: number, scores: { vibeScore?: number; buzzScore?: number; tasteVerifyScore?: number; realityPenalty?: number; finalScore?: number; tier?: number }): Promise<Place | undefined>;
  getTopPlaces(cityId: number, type: string, limit?: number): Promise<Place[]>;
  
  // Place Data Sources
  getPlaceDataSources(placeId: number): Promise<PlaceDataSource[]>;
  upsertPlaceDataSource(data: Omit<PlaceDataSource, "id" | "fetchedAt">): Promise<PlaceDataSource>;
  
  // Reviews
  getReviewsByPlace(placeId: number): Promise<Review[]>;
  getOriginatorReviews(placeId: number): Promise<Review[]>;
  createReview(review: Omit<Review, "id" | "fetchedAt">): Promise<Review>;
  
  // Vibe Analysis
  getVibeAnalysis(placeId: number): Promise<VibeAnalysis[]>;
  createVibeAnalysis(analysis: Omit<VibeAnalysis, "id" | "analyzedAt">): Promise<VibeAnalysis>;
  
  // Reality Checks
  getActiveRealityChecks(cityId: number): Promise<RealityCheck[]>;
  createRealityCheck(check: Omit<RealityCheck, "id" | "createdAt">): Promise<RealityCheck>;
  
  // Weather
  getWeatherCache(cityId: number, date: Date): Promise<WeatherCache | undefined>;
  upsertWeatherCache(data: Omit<WeatherCache, "id" | "fetchedAt">): Promise<WeatherCache>;
  
  // Itineraries
  getUserItineraries(userId: string): Promise<Itinerary[]>;
  getItinerary(id: number): Promise<Itinerary | undefined>;
  createItinerary(itinerary: InsertItinerary): Promise<Itinerary>;
  getItineraryItems(itineraryId: number): Promise<ItineraryItem[]>;
  
  // Route Cache
  getRouteCache(originId: number, destinationId: number, mode: string): Promise<RouteCache | undefined>;
  upsertRouteCache(data: Omit<RouteCache, "id" | "fetchedAt">): Promise<RouteCache>;
  
  // Sync Log
  logDataSync(log: Omit<DataSyncLog, "id" | "startedAt">): Promise<DataSyncLog>;
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
    return user;
  }

  async updateUserPersona(id: string, persona: "luxury" | "comfort"): Promise<User | undefined> {
    const [user] = await db.update(users).set({ persona }).where(eq(users.id, id)).returning();
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

  // Places
  async getPlacesByCity(cityId: number, type?: string): Promise<Place[]> {
    if (type) {
      return db.select().from(places).where(and(eq(places.cityId, cityId), eq(places.type, type as any))).orderBy(desc(places.finalScore));
    }
    return db.select().from(places).where(eq(places.cityId, cityId)).orderBy(desc(places.finalScore));
  }

  async getPlace(id: number): Promise<Place | undefined> {
    const [place] = await db.select().from(places).where(eq(places.id, id));
    return place || undefined;
  }

  async getPlaceByGoogleId(googlePlaceId: string): Promise<Place | undefined> {
    const [place] = await db.select().from(places).where(eq(places.googlePlaceId, googlePlaceId));
    return place || undefined;
  }

  async createPlace(place: InsertPlace): Promise<Place> {
    const [newPlace] = await db.insert(places).values(place).returning();
    return newPlace;
  }

  async updatePlaceScores(id: number, scores: { vibeScore?: number; buzzScore?: number; tasteVerifyScore?: number; realityPenalty?: number; finalScore?: number; tier?: number }): Promise<Place | undefined> {
    const [place] = await db.update(places).set({ ...scores, updatedAt: new Date() }).where(eq(places.id, id)).returning();
    return place || undefined;
  }

  async getTopPlaces(cityId: number, type: string, limit: number = 10): Promise<Place[]> {
    return db.select().from(places)
      .where(and(eq(places.cityId, cityId), eq(places.type, type as any)))
      .orderBy(desc(places.finalScore))
      .limit(limit);
  }

  // Place Data Sources
  async getPlaceDataSources(placeId: number): Promise<PlaceDataSource[]> {
    return db.select().from(placeDataSources).where(eq(placeDataSources.placeId, placeId));
  }

  async upsertPlaceDataSource(data: Omit<PlaceDataSource, "id" | "fetchedAt">): Promise<PlaceDataSource> {
    const existing = await db.select().from(placeDataSources)
      .where(and(eq(placeDataSources.placeId, data.placeId), eq(placeDataSources.source, data.source)));
    
    if (existing.length > 0) {
      const [updated] = await db.update(placeDataSources)
        .set({ ...data, fetchedAt: new Date() })
        .where(eq(placeDataSources.id, existing[0].id))
        .returning();
      return updated;
    }
    
    const [created] = await db.insert(placeDataSources).values(data).returning();
    return created;
  }

  // Reviews
  async getReviewsByPlace(placeId: number): Promise<Review[]> {
    return db.select().from(reviews).where(eq(reviews.placeId, placeId)).orderBy(desc(reviews.reviewDate));
  }

  async getOriginatorReviews(placeId: number): Promise<Review[]> {
    return db.select().from(reviews)
      .where(and(eq(reviews.placeId, placeId), eq(reviews.isOriginatorLanguage, true)))
      .orderBy(desc(reviews.reviewDate));
  }

  async createReview(review: Omit<Review, "id" | "fetchedAt">): Promise<Review> {
    const [newReview] = await db.insert(reviews).values(review).returning();
    return newReview;
  }

  // Vibe Analysis
  async getVibeAnalysis(placeId: number): Promise<VibeAnalysis[]> {
    return db.select().from(vibeAnalysis).where(eq(vibeAnalysis.placeId, placeId));
  }

  async createVibeAnalysis(analysis: Omit<VibeAnalysis, "id" | "analyzedAt">): Promise<VibeAnalysis> {
    const [newAnalysis] = await db.insert(vibeAnalysis).values(analysis).returning();
    return newAnalysis;
  }

  // Reality Checks
  async getActiveRealityChecks(cityId: number): Promise<RealityCheck[]> {
    return db.select().from(realityChecks)
      .where(and(eq(realityChecks.cityId, cityId), eq(realityChecks.isActive, true)));
  }

  async createRealityCheck(check: Omit<RealityCheck, "id" | "createdAt">): Promise<RealityCheck> {
    const [newCheck] = await db.insert(realityChecks).values(check).returning();
    return newCheck;
  }

  // Weather
  async getWeatherCache(cityId: number, date: Date): Promise<WeatherCache | undefined> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    const [weather] = await db.select().from(weatherCache)
      .where(and(
        eq(weatherCache.cityId, cityId),
        gte(weatherCache.date, startOfDay),
        lte(weatherCache.date, endOfDay)
      ));
    return weather || undefined;
  }

  async upsertWeatherCache(data: Omit<WeatherCache, "id" | "fetchedAt">): Promise<WeatherCache> {
    const existing = await this.getWeatherCache(data.cityId, data.date);
    
    if (existing) {
      const [updated] = await db.update(weatherCache)
        .set({ ...data, fetchedAt: new Date() })
        .where(eq(weatherCache.id, existing.id))
        .returning();
      return updated;
    }
    
    const [created] = await db.insert(weatherCache).values(data).returning();
    return created;
  }

  // Itineraries
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

  async getItineraryItems(itineraryId: number): Promise<ItineraryItem[]> {
    return db.select().from(itineraryItems)
      .where(eq(itineraryItems.itineraryId, itineraryId))
      .orderBy(itineraryItems.dayNumber, itineraryItems.orderInDay);
  }

  // Route Cache
  async getRouteCache(originId: number, destinationId: number, mode: string): Promise<RouteCache | undefined> {
    const [route] = await db.select().from(routeCache)
      .where(and(
        eq(routeCache.originPlaceId, originId),
        eq(routeCache.destinationPlaceId, destinationId),
        eq(routeCache.travelMode, mode)
      ));
    return route || undefined;
  }

  async upsertRouteCache(data: Omit<RouteCache, "id" | "fetchedAt">): Promise<RouteCache> {
    const existing = await this.getRouteCache(data.originPlaceId, data.destinationPlaceId, data.travelMode);
    
    if (existing) {
      const [updated] = await db.update(routeCache)
        .set({ ...data, fetchedAt: new Date() })
        .where(eq(routeCache.id, existing.id))
        .returning();
      return updated;
    }
    
    const [created] = await db.insert(routeCache).values(data).returning();
    return created;
  }

  // Sync Log
  async logDataSync(log: Omit<DataSyncLog, "id" | "startedAt">): Promise<DataSyncLog> {
    const [newLog] = await db.insert(dataSyncLog).values(log).returning();
    return newLog;
  }
}

export const storage = new DatabaseStorage();
