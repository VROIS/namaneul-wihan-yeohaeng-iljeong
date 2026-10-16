import { pgEnum } from "drizzle-orm/pg-core";
export const personaTypeEnum = pgEnum("persona_type", [
  "luxury",
  "comfort",
  "economic",
]);
