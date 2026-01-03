import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { storage } from "./storage";
import { googlePlacesFetcher } from "./services/google-places";
import { weatherFetcher } from "./services/weather";
import { vibeProcessor } from "./services/vibe-processor";
import { tasteVerifier } from "./services/taste-verifier";
import { routeOptimizer } from "./services/route-optimizer";
import { scoringEngine } from "./services/scoring-engine";
import { registerChatRoutes } from "./replit_integrations/chat";
import { registerImageRoutes } from "./replit_integrations/image";

export async function registerRoutes(app: Express): Promise<Server> {
  registerChatRoutes(app);
  registerImageRoutes(app);

  // Cities
  app.get("/api/cities", async (req, res) => {
    try {
      const cities = await storage.getCities();
      res.json(cities);
    } catch (error) {
      console.error("Error fetching cities:", error);
      res.status(500).json({ error: "Failed to fetch cities" });
    }
  });

  app.get("/api/cities/:id", async (req, res) => {
    try {
      const city = await storage.getCity(parseInt(req.params.id));
      if (!city) {
        return res.status(404).json({ error: "City not found" });
      }
      res.json(city);
    } catch (error) {
      console.error("Error fetching city:", error);
      res.status(500).json({ error: "Failed to fetch city" });
    }
  });

  app.post("/api/cities", async (req, res) => {
    try {
      const city = await storage.createCity(req.body);
      res.status(201).json(city);
    } catch (error) {
      console.error("Error creating city:", error);
      res.status(500).json({ error: "Failed to create city" });
    }
  });

  // Places
  app.get("/api/cities/:cityId/places", async (req, res) => {
    try {
      const cityId = parseInt(req.params.cityId);
      const type = req.query.type as string | undefined;
      const places = await storage.getPlacesByCity(cityId, type);
      res.json(places);
    } catch (error) {
      console.error("Error fetching places:", error);
      res.status(500).json({ error: "Failed to fetch places" });
    }
  });

  app.get("/api/places/:id", async (req, res) => {
    try {
      const place = await storage.getPlace(parseInt(req.params.id));
      if (!place) {
        return res.status(404).json({ error: "Place not found" });
      }
      
      const dataSources = await storage.getPlaceDataSources(place.id);
      const vibeAnalysis = await storage.getVibeAnalysis(place.id);
      
      res.json({ ...place, dataSources, vibeAnalysis });
    } catch (error) {
      console.error("Error fetching place:", error);
      res.status(500).json({ error: "Failed to fetch place" });
    }
  });

  // Top recommendations
  app.get("/api/cities/:cityId/recommendations", async (req, res) => {
    try {
      const cityId = parseInt(req.params.cityId);
      const type = (req.query.type as string) || "restaurant";
      const limit = parseInt(req.query.limit as string) || 10;
      const persona = (req.query.persona as "luxury" | "comfort") || "comfort";
      
      const recommendations = await scoringEngine.getTopRecommendations(
        cityId,
        type as any,
        limit,
        persona
      );
      
      res.json(recommendations);
    } catch (error) {
      console.error("Error fetching recommendations:", error);
      res.status(500).json({ error: "Failed to fetch recommendations" });
    }
  });

  // Data sync endpoints
  app.post("/api/sync/city/:cityId/places", async (req, res) => {
    try {
      const cityId = parseInt(req.params.cityId);
      const city = await storage.getCity(cityId);
      
      if (!city) {
        return res.status(404).json({ error: "City not found" });
      }
      
      const types = req.body.types || ["restaurant", "attraction"];
      const result = await googlePlacesFetcher.syncCityPlaces(
        cityId,
        city.latitude,
        city.longitude,
        types
      );
      
      res.json({ message: "Sync completed", ...result });
    } catch (error) {
      console.error("Error syncing places:", error);
      res.status(500).json({ error: "Failed to sync places" });
    }
  });

  app.post("/api/sync/city/:cityId/scores", async (req, res) => {
    try {
      const cityId = parseInt(req.params.cityId);
      const result = await scoringEngine.processCity(cityId);
      res.json({ message: "Scoring completed", ...result });
    } catch (error) {
      console.error("Error processing scores:", error);
      res.status(500).json({ error: "Failed to process scores" });
    }
  });

  app.post("/api/sync/place/:placeId/vibe", async (req, res) => {
    try {
      const placeId = parseInt(req.params.placeId);
      const result = await vibeProcessor.processPlaceVibe(placeId);
      res.json({ message: "Vibe processing completed", ...result });
    } catch (error) {
      console.error("Error processing vibe:", error);
      res.status(500).json({ error: "Failed to process vibe" });
    }
  });

  app.post("/api/sync/place/:placeId/taste", async (req, res) => {
    try {
      const placeId = parseInt(req.params.placeId);
      const result = await tasteVerifier.verifyRestaurant(placeId);
      res.json({ message: "Taste verification completed", ...result });
    } catch (error) {
      console.error("Error verifying taste:", error);
      res.status(500).json({ error: "Failed to verify taste" });
    }
  });

  // Weather
  app.get("/api/cities/:cityId/weather", async (req, res) => {
    try {
      const cityId = parseInt(req.params.cityId);
      const weather = await weatherFetcher.getWeatherForCity(cityId);
      
      if (!weather) {
        return res.status(404).json({ error: "Weather data not available" });
      }
      
      res.json({
        ...weather,
        description: weatherFetcher.getWeatherDescription(weather.weatherCondition || ""),
        severity: weatherFetcher.getPenaltySeverity(weather.penalty || 0),
      });
    } catch (error) {
      console.error("Error fetching weather:", error);
      res.status(500).json({ error: "Failed to fetch weather" });
    }
  });

  // Reality checks
  app.get("/api/cities/:cityId/reality-checks", async (req, res) => {
    try {
      const cityId = parseInt(req.params.cityId);
      const checks = await storage.getActiveRealityChecks(cityId);
      res.json(checks);
    } catch (error) {
      console.error("Error fetching reality checks:", error);
      res.status(500).json({ error: "Failed to fetch reality checks" });
    }
  });

  // Route optimization
  app.post("/api/routes/optimize", async (req, res) => {
    try {
      const { placeIds, travelMode = "TRANSIT" } = req.body;
      
      if (!placeIds || !Array.isArray(placeIds) || placeIds.length === 0) {
        return res.status(400).json({ error: "placeIds array is required" });
      }
      
      const places = await Promise.all(
        placeIds.map((id: number) => storage.getPlace(id))
      );
      
      const validPlaces = places.filter(Boolean);
      if (validPlaces.length === 0) {
        return res.status(404).json({ error: "No valid places found" });
      }
      
      const result = await routeOptimizer.optimizeRoute(validPlaces as any[], travelMode);
      
      res.json({
        ...result,
        formattedDuration: routeOptimizer.formatDuration(result.totalDurationSeconds),
        formattedDistance: routeOptimizer.formatDistance(result.totalDistanceMeters),
      });
    } catch (error) {
      console.error("Error optimizing route:", error);
      res.status(500).json({ error: "Failed to optimize route" });
    }
  });

  app.post("/api/routes/compare", async (req, res) => {
    try {
      const { placeIds } = req.body;
      
      if (!placeIds || !Array.isArray(placeIds) || placeIds.length === 0) {
        return res.status(400).json({ error: "placeIds array is required" });
      }
      
      const places = await Promise.all(
        placeIds.map((id: number) => storage.getPlace(id))
      );
      
      const validPlaces = places.filter(Boolean);
      const comparison = await routeOptimizer.compareTransportModes(validPlaces as any[]);
      
      const formattedComparison: Record<string, any> = {};
      for (const [mode, result] of Object.entries(comparison)) {
        formattedComparison[mode] = {
          ...result,
          formattedDuration: routeOptimizer.formatDuration(result.totalDurationSeconds),
          formattedDistance: routeOptimizer.formatDistance(result.totalDistanceMeters),
        };
      }
      
      res.json(formattedComparison);
    } catch (error) {
      console.error("Error comparing routes:", error);
      res.status(500).json({ error: "Failed to compare routes" });
    }
  });

  // Itineraries
  app.get("/api/users/:userId/itineraries", async (req, res) => {
    try {
      const itineraries = await storage.getUserItineraries(req.params.userId);
      res.json(itineraries);
    } catch (error) {
      console.error("Error fetching itineraries:", error);
      res.status(500).json({ error: "Failed to fetch itineraries" });
    }
  });

  app.get("/api/itineraries/:id", async (req, res) => {
    try {
      const itinerary = await storage.getItinerary(parseInt(req.params.id));
      if (!itinerary) {
        return res.status(404).json({ error: "Itinerary not found" });
      }
      
      const items = await storage.getItineraryItems(itinerary.id);
      const itemsWithPlaces = await Promise.all(
        items.map(async (item) => {
          const place = await storage.getPlace(item.placeId);
          return { ...item, place };
        })
      );
      
      res.json({ ...itinerary, items: itemsWithPlaces });
    } catch (error) {
      console.error("Error fetching itinerary:", error);
      res.status(500).json({ error: "Failed to fetch itinerary" });
    }
  });

  app.post("/api/itineraries", async (req, res) => {
    try {
      const itinerary = await storage.createItinerary(req.body);
      res.status(201).json(itinerary);
    } catch (error) {
      console.error("Error creating itinerary:", error);
      res.status(500).json({ error: "Failed to create itinerary" });
    }
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      services: {
        googlePlaces: !!process.env.GOOGLE_MAPS_API_KEY,
        weather: !!process.env.OPENWEATHER_API_KEY,
        gemini: !!process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
      }
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}
