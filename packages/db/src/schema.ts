import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Money is integer paise everywhere, never floats.
// Sizes are UK, the only sizing system this store sells in.

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const agentTypeEnum = pgEnum("agent_type", ["support", "order", "billing"]);
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant", "system"]);

export const genderEnum = pgEnum("gender", ["men", "women"]);

export const shoeTypeEnum = pgEnum("shoe_type", [
  "running",
  "walking",
  "sports",
  "slip_on",
  "casual",
  "formal",
  "trekking",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "returned",
]);

export const shipmentStatusEnum = pgEnum("shipment_status", [
  "label_created",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "exception",
]);

export const returnTypeEnum = pgEnum("return_type", ["refund", "exchange"]);

export const returnStatusEnum = pgEnum("return_status", [
  "requested",
  "approved",
  "in_transit",
  "received",
  "completed",
  "rejected",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "succeeded",
  "failed",
  "refunded",
]);

export const refundStatusEnum = pgEnum("refund_status", [
  "requested",
  "approved",
  "processing",
  "completed",
  "rejected",
]);

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New conversation"),
    /** Which agent handled the most recent turn — the router's stickiness hint. */
    lastAgentType: agentTypeEnum("last_agent_type"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("conversations_user_updated_idx").on(t.userId, t.updatedAt)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(),

    // Routing provenance — only set on assistant messages. Persisted so the
    // reasoning card survives a reload, and so routing can be audited later.
    agentType: agentTypeEnum("agent_type"),
    intent: text("intent"),
    routeSource: text("route_source"),
    routeConfidence: real("route_confidence"),
    routeReasoning: text("route_reasoning"),

    /** [{ toolName, label, status, summary, durationMs }] */
    toolCalls: jsonb("tool_calls"),

    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    totalTokens: integer("total_tokens"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_conversation_created_idx").on(t.conversationId, t.createdAt)],
);

// coversThroughMessageId is what makes compaction idempotent.
export const conversationSummaries = pgTable(
  "conversation_summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    summary: text("summary").notNull(),
    coversThroughMessageId: uuid("covers_through_message_id"),
    messageCount: integer("message_count").notNull().default(0),
    tokenEstimate: integer("token_estimate").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("summaries_conversation_created_idx").on(t.conversationId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

/**
 * Products are addressed by `slug`, never by a generated id: a customer can say
 * "the Oxyfit", an agent can quote `oxyfit-men-walking`, and an invented product
 * is instantly visible as a slug that does not exist.
 */
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    modelName: text("model_name").notNull(),
    gender: genderEnum("gender").notNull(),
    type: shoeTypeEnum("type").notNull(),
    colour: text("colour").notNull(),
    materials: text("materials").notNull(),
    care: text("care").notNull(),
    mrpPaise: integer("mrp_paise").notNull(),
    pricePaise: integer("price_paise").notNull(),
    /** How this model actually fits. The answer to most sizing questions. */
    fitNote: text("fit_note").notNull(),
    description: text("description").notNull(),
  },
  (t) => [uniqueIndex("products_slug_idx").on(t.slug)],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** UK size. Halves are real sizes, hence real not integer. */
    sizeUk: real("size_uk").notNull(),
    variantSlug: text("variant_slug").notNull().unique(),
    stockQty: integer("stock_qty").notNull().default(0),
  },
  (t) => [index("variants_product_size_idx").on(t.productId, t.sizeUk)],
);

// ---------------------------------------------------------------------------
// Orders — what the Order agent's tools read
// ---------------------------------------------------------------------------

export interface OrderItem {
  slug: string;
  name: string;
  sizeUk: number;
  quantity: number;
  unitPricePaise: number;
}

export interface Address {
  line1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNumber: text("order_number").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: orderStatusEnum("status").notNull().default("pending"),
    items: jsonb("items").$type<OrderItem[]>().notNull(),
    shippingAddress: jsonb("shipping_address").$type<Address>().notNull(),
    subtotalPaise: integer("subtotal_paise").notNull(),
    shippingPaise: integer("shipping_paise").notNull().default(0),
    totalPaise: integer("total_paise").notNull(),
    currency: text("currency").notNull().default("INR"),
    placedAt: timestamp("placed_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: text("cancellation_reason"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("orders_user_placed_idx").on(t.userId, t.placedAt),
    uniqueIndex("orders_number_idx").on(t.orderNumber),
  ],
);

export interface TrackingEvent {
  at: string;
  status: string;
  location: string;
  description: string;
}

export const shipments = pgTable(
  "shipments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    carrier: text("carrier").notNull(),
    trackingNumber: text("tracking_number").notNull(),
    status: shipmentStatusEnum("status").notNull().default("label_created"),
    estimatedDelivery: timestamp("estimated_delivery", { withTimezone: true }),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    lastLocation: text("last_location"),
    events: jsonb("events").$type<TrackingEvent[]>().notNull().default([]),
  },
  (t) => [index("shipments_order_idx").on(t.orderId)],
);

/**
 * Returns and size exchanges. `windowClosesAt` is stored rather than derived so
 * the 14-day rule is a fact about the row, not a calculation the agent could
 * get wrong.
 */
export const returns = pgTable(
  "returns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    returnNumber: text("return_number").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    type: returnTypeEnum("type").notNull(),
    status: returnStatusEnum("status").notNull().default("requested"),
    reason: text("reason").notNull(),
    /** Only set on exchanges: the size the customer wants instead. */
    requestedSizeUk: real("requested_size_uk"),
    windowClosesAt: timestamp("window_closes_at", { withTimezone: true }),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("returns_user_requested_idx").on(t.userId, t.requestedAt)],
);

// ---------------------------------------------------------------------------
// Money — what the Billing agent's tools read
// ---------------------------------------------------------------------------

export interface PaymentMethodInfo {
  brand: string;
  last4: string;
  type: "card" | "upi" | "netbanking";
}

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentNumber: text("payment_number").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    status: paymentStatusEnum("status").notNull().default("pending"),
    amountPaise: integer("amount_paise").notNull(),
    currency: text("currency").notNull().default("INR"),
    method: jsonb("method").$type<PaymentMethodInfo>().notNull(),
    /** What the charge was for. "Exchange price difference" is not a duplicate. */
    purpose: text("purpose").notNull(),
    failureReason: text("failure_reason"),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payments_user_processed_idx").on(t.userId, t.processedAt)],
);

export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    refundNumber: text("refund_number").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    status: refundStatusEnum("status").notNull().default("requested"),
    amountPaise: integer("amount_paise").notNull(),
    currency: text("currency").notNull().default("INR"),
    reason: text("reason").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    expectedCompletionAt: timestamp("expected_completion_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("refunds_user_requested_idx").on(t.userId, t.requestedAt)],
);

// ---------------------------------------------------------------------------
// Knowledge base — what the Support agent's tools read
// ---------------------------------------------------------------------------

export const kbArticles = pgTable(
  "kb_articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    body: text("body").notNull(),
    /** Space-separated search terms; denormalised for cheap ILIKE search. */
    keywords: text("keywords").notNull().default(""),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("kb_category_idx").on(t.category)],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  conversations: many(conversations),
  orders: many(orders),
  returns: many(returns),
  payments: many(payments),
  refunds: many(refunds),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  user: one(users, { fields: [conversations.userId], references: [users.id] }),
  messages: many(messages),
  summaries: many(conversationSummaries),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const conversationSummariesRelations = relations(conversationSummaries, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationSummaries.conversationId],
    references: [conversations.id],
  }),
}));

export const productsRelations = relations(products, ({ many }) => ({
  variants: many(productVariants),
}));

export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  shipment: one(shipments),
  returns: many(returns),
  payments: many(payments),
}));

export const shipmentsRelations = relations(shipments, ({ one }) => ({
  order: one(orders, { fields: [shipments.orderId], references: [orders.id] }),
}));

export const returnsRelations = relations(returns, ({ one }) => ({
  user: one(users, { fields: [returns.userId], references: [users.id] }),
  order: one(orders, { fields: [returns.orderId], references: [orders.id] }),
}));

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  user: one(users, { fields: [payments.userId], references: [users.id] }),
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
  refunds: many(refunds),
}));

export const refundsRelations = relations(refunds, ({ one }) => ({
  user: one(users, { fields: [refunds.userId], references: [users.id] }),
  payment: one(payments, { fields: [refunds.paymentId], references: [payments.id] }),
  order: one(orders, { fields: [refunds.orderId], references: [orders.id] }),
}));

// ---------------------------------------------------------------------------
// Inferred row types
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type ConversationSummaryRow = typeof conversationSummaries.$inferSelect;
export type Product = typeof products.$inferSelect;
export type ProductVariant = typeof productVariants.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Shipment = typeof shipments.$inferSelect;
export type Return = typeof returns.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Refund = typeof refunds.$inferSelect;
export type KbArticle = typeof kbArticles.$inferSelect;
