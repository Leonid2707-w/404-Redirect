import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const trackingLinks = sqliteTable("tracking_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  label: text("label").notNull(),
  source: text("source").notNull().default(""),
  account: text("account").notNull().default(""),
  campaign: text("campaign").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const events = sqliteTable(
  "events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventType: text("event_type").notNull(),
    action: text("action").notNull().default(""),
    linkId: integer("link_id").references(() => trackingLinks.id, { onDelete: "set null" }),
    visitorId: text("visitor_id").notNull(),
    page: text("page").notNull().default("/"),
    referrer: text("referrer").notNull().default(""),
    country: text("country").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("events_created_at_idx").on(table.createdAt),
    index("events_link_id_idx").on(table.linkId),
    index("events_type_idx").on(table.eventType),
  ],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

