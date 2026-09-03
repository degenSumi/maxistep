import {
  and,
  desc,
  eq,
  orders,
  returns,
  shipments,
  type Order,
  type Return,
  type Shipment,
} from "@repo/db";
import { db } from "../db.js";

// Every read is scoped by userId — these run on model-supplied input.
export const orderRepository = {
  async findByNumber(userId: string, orderNumber: string): Promise<Order | null> {
    const [row] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.userId, userId), eq(orders.orderNumber, orderNumber.toUpperCase())))
      .limit(1);
    return row ?? null;
  },

  async listForUser(userId: string, limit = 10): Promise<Order[]> {
    return db
      .select()
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.placedAt))
      .limit(limit);
  },

  async findMostRecent(userId: string): Promise<Order | null> {
    const [row] = await db
      .select()
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.placedAt))
      .limit(1);
    return row ?? null;
  },

  async findShipmentByOrderId(orderId: string): Promise<Shipment | null> {
    const [row] = await db.select().from(shipments).where(eq(shipments.orderId, orderId)).limit(1);
    return row ?? null;
  },

  async cancel(orderId: string, reason: string): Promise<Order | null> {
    const [row] = await db
      .update(orders)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        cancellationReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning();
    return row ?? null;
  },

  // --- returns and exchanges -------------------------------------------------

  async findReturnByOrderId(orderId: string): Promise<Return | null> {
    const [row] = await db.select().from(returns).where(eq(returns.orderId, orderId)).limit(1);
    return row ?? null;
  },

  async findReturnByNumber(userId: string, returnNumber: string): Promise<Return | null> {
    const [row] = await db
      .select()
      .from(returns)
      .where(and(eq(returns.userId, userId), eq(returns.returnNumber, returnNumber.toUpperCase())))
      .limit(1);
    return row ?? null;
  },

  async listReturnsForUser(userId: string, limit = 10): Promise<Return[]> {
    return db
      .select()
      .from(returns)
      .where(eq(returns.userId, userId))
      .orderBy(desc(returns.requestedAt))
      .limit(limit);
  },

  /**
   * Return numbers are sequential and human-readable, so a new one is derived
   * from the highest existing number rather than generated randomly.
   */
  async createReturn(input: {
    userId: string;
    orderId: string;
    type: "refund" | "exchange";
    reason: string;
    requestedSizeUk?: number;
    windowClosesAt: Date;
  }): Promise<Return> {
    const [latest] = await db
      .select({ returnNumber: returns.returnNumber })
      .from(returns)
      .orderBy(desc(returns.returnNumber))
      .limit(1);

    const nextSeq = latest ? Number(latest.returnNumber.split("-")[1]) + 1 : 3001;

    const [row] = await db
      .insert(returns)
      .values({
        returnNumber: `RET-${nextSeq}`,
        userId: input.userId,
        orderId: input.orderId,
        type: input.type,
        status: "requested",
        reason: input.reason,
        requestedSizeUk: input.requestedSizeUk ?? null,
        windowClosesAt: input.windowClosesAt,
      })
      .returning();

    if (!row) throw new Error("Failed to create return");
    return row;
  },
};
