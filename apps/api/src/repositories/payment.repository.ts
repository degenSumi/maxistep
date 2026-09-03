import { and, desc, eq, orders, payments, refunds, type Payment, type Refund } from "@repo/db";
import { db } from "../db.js";

export const paymentRepository = {
  async listPayments(userId: string, limit = 10): Promise<Payment[]> {
    return db
      .select()
      .from(payments)
      .where(eq(payments.userId, userId))
      .orderBy(desc(payments.processedAt))
      .limit(limit);
  },

  async findPaymentByNumber(userId: string, paymentNumber: string): Promise<Payment | null> {
    const [row] = await db
      .select()
      .from(payments)
      .where(
        and(eq(payments.userId, userId), eq(payments.paymentNumber, paymentNumber.toUpperCase())),
      )
      .limit(1);
    return row ?? null;
  },

  async listPaymentsForOrderNumber(userId: string, orderNumber: string): Promise<Payment[]> {
    const [order] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.userId, userId), eq(orders.orderNumber, orderNumber.toUpperCase())))
      .limit(1);
    if (!order) return [];

    return db
      .select()
      .from(payments)
      .where(and(eq(payments.userId, userId), eq(payments.orderId, order.id)))
      .orderBy(desc(payments.processedAt));
  },

  async listRefunds(userId: string, limit = 10): Promise<Refund[]> {
    return db
      .select()
      .from(refunds)
      .where(eq(refunds.userId, userId))
      .orderBy(desc(refunds.requestedAt))
      .limit(limit);
  },

  async findRefundByNumber(userId: string, refundNumber: string): Promise<Refund | null> {
    const [row] = await db
      .select()
      .from(refunds)
      .where(and(eq(refunds.userId, userId), eq(refunds.refundNumber, refundNumber.toUpperCase())))
      .limit(1);
    return row ?? null;
  },

  async findRefundsForOrderNumber(userId: string, orderNumber: string): Promise<Refund[]> {
    const [order] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.userId, userId), eq(orders.orderNumber, orderNumber.toUpperCase())))
      .limit(1);
    if (!order) return [];

    return db
      .select()
      .from(refunds)
      .where(and(eq(refunds.userId, userId), eq(refunds.orderId, order.id)))
      .orderBy(desc(refunds.requestedAt));
  },
};
