import { pgEnum } from "drizzle-orm/pg-core";

export const placeTypeEnum = pgEnum("place_type", [
  "restaurant",
  "attraction",
  "hotel",
  "cafe",
  "landmark",
]);
export const personaTypeEnum = pgEnum("persona_type", [
  "luxury",
  "comfort",
  "economic",
]);
export const dataSourceEnum = pgEnum("data_source", [
  "google",
  "tripadvisor",
  "yelp",
  "foursquare",
  "michelin",
  "viator",
]);
