import { relations } from "drizzle-orm";
import { users } from "./users";
import { cities } from "./cities";
import { itineraries } from "./itineraries";
import { reviews } from "./places";

// Relations (= 유지된 테이블만)
export const citiesRelations = relations(cities, ({ many }) => ({
  itineraries: many(itineraries),
}));

export const reviewsRelations = relations(reviews, ({ one: _one }) => ({}));

export const itinerariesRelations = relations(itineraries, ({ one }) => ({
  user: one(users, {
    fields: [itineraries.userId],
    references: [users.id],
  }),
  city: one(cities, {
    fields: [itineraries.cityId],
    references: [cities.id],
  }),
}));
