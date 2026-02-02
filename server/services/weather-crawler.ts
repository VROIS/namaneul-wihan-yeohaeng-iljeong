import { db } from "../db";
import { weatherForecast, weatherCache, cities, places } from "../../shared/schema";
import { eq, and, gte, desc } from "drizzle-orm";

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const CACHE_DURATION_HOURS = 6;

interface OpenWeatherResponse {
  list: Array<{
    dt: number;
    main: {
      temp_min: number;
      temp_max: number;
      humidity: number;
    };
    weather: Array<{
      main: string;
      description: string;
      icon: string;
    }>;
    wind: {
      speed: number;
    };
    pop: number;
  }>;
}

function calculateRealityPenalty(
  weatherMain: string,
  tempMax: number,
  rainProbability: number,
  windSpeed: number
): number {
  let penalty = 0;

  if (["Rain", "Thunderstorm", "Drizzle"].includes(weatherMain)) {
    penalty += 1.5;
  } else if (weatherMain === "Snow") {
    penalty += 1.0;
  } else if (weatherMain === "Fog" || weatherMain === "Mist") {
    penalty += 0.5;
  }

  if (tempMax > 35) {
    penalty += 1.0;
  } else if (tempMax > 32) {
    penalty += 0.5;
  } else if (tempMax < 0) {
    penalty += 0.5;
  } else if (tempMax < -10) {
    penalty += 1.0;
  }

  if (rainProbability > 0.7) {
    penalty += 0.5;
  }

  if (windSpeed > 10) {
    penalty += 0.5;
  }

  return Math.min(penalty, 3.0);
}

export async function fetchWeatherForCity(cityId: number): Promise<{
  success: boolean;
  forecastDays: number;
  currentCondition?: string;
}> {
  const [city] = await db.select().from(cities).where(eq(cities.id, cityId));
  if (!city) {
    console.error(`[Weather] City not found: ${cityId}`);
    return { success: false, forecastDays: 0 };
  }

  if (!OPENWEATHER_API_KEY) {
    console.log("[Weather] No API key, using Gemini fallback");
    return fetchWeatherWithGemini(cityId, city.name, city.latitude, city.longitude);
  }

  try {
    const url = new URL("https://api.openweathermap.org/data/2.5/forecast");
    url.searchParams.set("lat", city.latitude.toString());
    url.searchParams.set("lon", city.longitude.toString());
    url.searchParams.set("appid", OPENWEATHER_API_KEY);
    url.searchParams.set("units", "metric");

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`OpenWeather API error: ${response.status}`);
    }

    const data: OpenWeatherResponse = await response.json();
    let forecastDays = 0;
    const processedDates = new Set<string>();

    for (const item of data.list) {
      const forecastDate = new Date(item.dt * 1000);
      const dateKey = forecastDate.toISOString().split("T")[0];

      if (processedDates.has(dateKey)) continue;
      processedDates.add(dateKey);

      const weatherMain = item.weather[0]?.main || "Clear";
      const realityPenalty = calculateRealityPenalty(
        weatherMain,
        item.main.temp_max,
        item.pop,
        item.wind.speed
      );

      await db.insert(weatherForecast).values({
        cityId,
        forecastDate,
        tempMin: item.main.temp_min,
        tempMax: item.main.temp_max,
        humidity: item.main.humidity,
        weatherMain,
        weatherDescription: item.weather[0]?.description,
        weatherIcon: item.weather[0]?.icon,
        windSpeed: item.wind.speed,
        rainProbability: item.pop,
        realityPenalty,
      }).onConflictDoNothing();

      forecastDays++;
    }

    await db.insert(weatherCache).values({
      cityId,
      date: new Date(),
      temperature: data.list[0]?.main.temp_max,
      weatherCondition: data.list[0]?.weather[0]?.main || "Unknown",
      humidity: data.list[0]?.main.humidity,
      windSpeed: data.list[0]?.wind.speed,
    }).onConflictDoNothing();

    console.log(`[Weather] Fetched ${forecastDays} days forecast for ${city.name}`);
    return {
      success: true,
      forecastDays,
      currentCondition: data.list[0]?.weather[0]?.main,
    };
  } catch (error) {
    console.error(`[Weather] API error for ${city.name}:`, error);
    return fetchWeatherWithGemini(cityId, city.name, city.latitude, city.longitude);
  }
}

async function fetchWeatherWithGemini(
  cityId: number,
  cityName: string,
  lat: number,
  lon: number
): Promise<{ success: boolean; forecastDays: number; currentCondition?: string }> {
  try {
    const { ai } = await import("../replit_integrations/image/client");

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `What is the current weather and 5-day forecast for ${cityName}?

Return JSON:
{
  "current": {
    "temp": 25,
    "condition": "Clear",
    "humidity": 60
  },
  "forecast": [
    {
      "date": "2026-01-08",
      "tempMin": 18,
      "tempMax": 28,
      "condition": "Clear",
      "rainProbability": 0.1
    }
  ]
}`,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      for (const day of parsed.forecast || []) {
        const realityPenalty = calculateRealityPenalty(
          day.condition,
          day.tempMax,
          day.rainProbability || 0,
          5
        );

        await db.insert(weatherForecast).values({
          cityId,
          forecastDate: new Date(day.date),
          tempMin: day.tempMin,
          tempMax: day.tempMax,
          weatherMain: day.condition,
          rainProbability: day.rainProbability,
          realityPenalty,
        }).onConflictDoNothing();
      }

      return {
        success: true,
        forecastDays: parsed.forecast?.length || 0,
        currentCondition: parsed.current?.condition,
      };
    }
  } catch (error) {
    console.error("[Weather] Gemini fallback error:", error);
  }

  return { success: false, forecastDays: 0 };
}

export async function syncAllCitiesWeather(): Promise<{
  success: boolean;
  citiesSynced: number;
  totalForecasts: number;
}> {
  console.log("[Weather] Starting weather sync for all cities...");

  const allCities = await db.select().from(cities);
  let citiesSynced = 0;
  let totalForecasts = 0;

  for (const city of allCities) {
    const result = await fetchWeatherForCity(city.id);
    if (result.success) {
      citiesSynced++;
      totalForecasts += result.forecastDays;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`[Weather] Sync complete: ${citiesSynced} cities, ${totalForecasts} forecast days`);
  return { success: true, citiesSynced, totalForecasts };
}

export async function getCityWeather(cityId: number): Promise<{
  current: {
    temp?: number;
    condition?: string;
    humidity?: number;
  } | null;
  forecast: Array<{
    date: Date;
    tempMin: number | null;
    tempMax: number | null;
    condition: string | null;
    realityPenalty: number | null;
  }>;
}> {
  const [currentWeather] = await db
    .select()
    .from(weatherCache)
    .where(eq(weatherCache.cityId, cityId))
    .orderBy(desc(weatherCache.fetchedAt))
    .limit(1);

  const forecasts = await db
    .select()
    .from(weatherForecast)
    .where(
      and(
        eq(weatherForecast.cityId, cityId),
        gte(weatherForecast.forecastDate, new Date())
      )
    )
    .orderBy(weatherForecast.forecastDate)
    .limit(7);

  return {
    current: currentWeather
      ? {
          temp: currentWeather.temperature ?? undefined,
          condition: currentWeather.weatherCondition ?? undefined,
          humidity: currentWeather.humidity ?? undefined,
        }
      : null,
    forecast: forecasts.map((f) => ({
      date: f.forecastDate,
      tempMin: f.tempMin,
      tempMax: f.tempMax,
      condition: f.weatherMain,
      realityPenalty: f.realityPenalty,
    })),
  };
}

export async function getWeatherStats(): Promise<{
  citiesWithData: number;
  totalForecasts: number;
  avgRealityPenalty: number;
}> {
  const forecasts = await db.select().from(weatherForecast);
  const cityIds = new Set(forecasts.map((f) => f.cityId));

  const avgPenalty =
    forecasts.length > 0
      ? forecasts.reduce((sum, f) => sum + (f.realityPenalty || 0), 0) / forecasts.length
      : 0;

  return {
    citiesWithData: cityIds.size,
    totalForecasts: forecasts.length,
    avgRealityPenalty: Math.round(avgPenalty * 100) / 100,
  };
}
