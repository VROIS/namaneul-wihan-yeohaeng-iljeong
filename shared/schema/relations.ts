import { relations } from "drizzle-orm";
import { users } from "./users";
import { cities } from "./cities";
import { itineraries } from "./itineraries";

export const citiesRelations = relations(cities, ({ many }) => ({
  itineraries: many(itineraries),
}));

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
