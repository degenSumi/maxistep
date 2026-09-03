import { tool } from "ai";
import { z } from "zod";
import { paymentRepository } from "../../repositories/payment.repository.js";
import { daysBetween, formatDate, formatDateTime, formatMoney } from "../../lib/format.js";
import { toolContextSchema } from "./context.js";
import type { Payment, Refund } from "@repo/db";

function serialisePayment(payment: Payment) {
  return {
    paymentNumber: payment.paymentNumber,
    status: payment.status,
    amount: formatMoney(payment.amountPaise, payment.currency),
    // The raw number is included so the model can compare two charges without
    // parsing currency strings — the duplicate-charge question turns on this.
    amountPaise: payment.amountPaise,
    method: `${payment.method.brand} ${payment.method.type === "card" ? `••${payment.method.last4}` : ""}`.trim(),
    /** What this charge was for. An exchange difference is not a duplicate. */
    purpose: payment.purpose,
    processedAt: formatDateTime(payment.processedAt),
    processedOn: formatDate(payment.processedAt),
    failureReason: payment.failureReason,
  };
}

function serialiseRefund(refund: Refund) {
  const expected = refund.expectedCompletionAt;
  return {
    refundNumber: refund.refundNumber,
    status: refund.status,
    amount: formatMoney(refund.amountPaise, refund.currency),
    reason: refund.reason,
    requestedAt: formatDate(refund.requestedAt),
    expectedCompletionAt: formatDate(expected),
    completedAt: formatDate(refund.completedAt),
    // Pre-computed so the agent never does date arithmetic itself.
    daysRemaining:
      expected && !refund.completedAt ? Math.max(daysBetween(new Date(), expected), 0) : null,
  };
}

export const billingTools = {
  listPayments: tool({
    description:
      "The customer's recent charges, newest first, each with what it was for. Use this FIRST for any duplicate-charge or unexpected-charge claim — compare the amounts, dates and purposes before responding.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(20).default(10).describe("How many payments to return"),
      orderNumber: z
        .string()
        .regex(/^ORD-\d{4}$/i)
        .optional()
        .describe("Restrict to charges against one order, e.g. ORD-1042"),
    }),
    contextSchema: toolContextSchema,
    execute: async ({ limit, orderNumber }, { context }) => {
      const payments = orderNumber
        ? await paymentRepository.listPaymentsForOrderNumber(context.userId, orderNumber)
        : await paymentRepository.listPayments(context.userId, limit);

      return {
        count: payments.length,
        scopedToOrder: orderNumber?.toUpperCase() ?? null,
        payments: payments.map(serialisePayment),
      };
    },
  }),

  getPaymentDetails: tool({
    description: "One payment by its number, e.g. PAY-5010.",
    inputSchema: z.object({
      paymentNumber: z
        .string()
        .regex(/^PAY-\d{4}$/i, "Payment numbers look like PAY-5010")
        .describe("The payment number"),
    }),
    contextSchema: toolContextSchema,
    execute: async ({ paymentNumber }, { context }) => {
      const payment = await paymentRepository.findPaymentByNumber(context.userId, paymentNumber);
      if (!payment) {
        return {
          found: false as const,
          message: `No payment ${paymentNumber.toUpperCase()} exists on this account.`,
        };
      }
      return { found: true as const, payment: serialisePayment(payment) };
    },
  }),

  checkRefundStatus: tool({
    description:
      "Refund progress, by refund number or by order number, or all recent refunds if neither is given. Gives the status AND the expected completion date — use the pre-computed daysRemaining rather than working out dates yourself.",
    inputSchema: z.object({
      refundNumber: z
        .string()
        .regex(/^REF-\d{4}$/i, "Refund numbers look like REF-2043")
        .optional()
        .describe("A specific refund number"),
      orderNumber: z
        .string()
        .regex(/^ORD-\d{4}$/i)
        .optional()
        .describe("Find the refund raised against this order"),
    }),
    contextSchema: toolContextSchema,
    execute: async ({ refundNumber, orderNumber }, { context }) => {
      if (refundNumber) {
        const refund = await paymentRepository.findRefundByNumber(context.userId, refundNumber);
        if (!refund) {
          return {
            found: false as const,
            message: `No refund ${refundNumber.toUpperCase()} exists on this account.`,
          };
        }
        return { found: true as const, refunds: [serialiseRefund(refund)] };
      }

      const refunds = orderNumber
        ? await paymentRepository.findRefundsForOrderNumber(context.userId, orderNumber)
        : await paymentRepository.listRefunds(context.userId);

      if (refunds.length === 0) {
        return {
          found: false as const,
          message: orderNumber
            ? `No refund has been raised against ${orderNumber.toUpperCase()}.`
            : "There are no refunds on this account.",
        };
      }

      return { found: true as const, refunds: refunds.map(serialiseRefund) };
    },
  }),
};

export const BILLING_TOOL_NAMES = Object.keys(billingTools);
