import { tool } from "ai";
import { z } from "zod";
import { orderRepository } from "../../repositories/order.repository.js";
import { catalogRepository } from "../../repositories/catalog.repository.js";
import { formatDate, formatDateTime, formatMoney } from "../../lib/format.js";
import { toolContextSchema } from "./context.js";
import type { Order } from "@repo/db";

/** Statuses past the point of no return — cancellation must be refused. */
const UNCANCELLABLE = new Set(["shipped", "out_for_delivery", "delivered", "returned"]);

const RETURN_WINDOW_DAYS = 14;
const WARRANTY_MONTHS = 6;

function serialiseOrder(order: Order) {
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    placedAt: formatDate(order.placedAt),
    deliveredAt: formatDate(order.deliveredAt),
    items: order.items.map((i) => ({
      slug: i.slug,
      name: i.name,
      sizeUk: i.sizeUk,
      quantity: i.quantity,
      unitPrice: formatMoney(i.unitPricePaise),
    })),
    subtotal: formatMoney(order.subtotalPaise, order.currency),
    shipping: formatMoney(order.shippingPaise, order.currency),
    total: formatMoney(order.totalPaise, order.currency),
    shipTo: `${order.shippingAddress.city}, ${order.shippingAddress.state}`,
    cancelledAt: formatDate(order.cancelledAt),
    cancellationReason: order.cancellationReason,
  };
}

const orderNumberInput = z
  .string()
  .regex(/^ORD-\d{4}$/i, "Order numbers look like ORD-1042")
  .optional()
  .describe(
    "The order number, e.g. ORD-1042. Omit to use the customer's most recent order — do that when they say 'my order' or 'my last order' without naming one.",
  );

export const orderTools = {
  getOrderDetails: tool({
    description:
      "Full details of one order: items with their UK sizes, totals, status and dates. Use this first for any question about what an order contains or what state it is in.",
    inputSchema: z.object({ orderNumber: orderNumberInput }),
    contextSchema: toolContextSchema,
    execute: async ({ orderNumber }, { context }) => {
      const order = orderNumber
        ? await orderRepository.findByNumber(context.userId, orderNumber)
        : await orderRepository.findMostRecent(context.userId);

      if (!order) {
        // Tools return structured failures rather than throwing: a throw ends
        // the agent loop, this lets the model recover by asking the customer.
        return {
          found: false as const,
          message: orderNumber
            ? `No order ${orderNumber.toUpperCase()} exists on this account.`
            : "This customer has no orders yet.",
        };
      }

      return { found: true as const, order: serialiseOrder(order) };
    },
  }),

  listMyOrders: tool({
    description:
      "List the customer's recent orders, newest first. Use when they ask what they have ordered, or when they describe an order by the shoe rather than by number.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(10).default(5).describe("How many orders to return"),
    }),
    contextSchema: toolContextSchema,
    execute: async ({ limit }, { context }) => {
      const orders = await orderRepository.listForUser(context.userId, limit);
      return {
        count: orders.length,
        orders: orders.map((o) => ({
          orderNumber: o.orderNumber,
          status: o.status,
          placedAt: formatDate(o.placedAt),
          total: formatMoney(o.totalPaise, o.currency),
          summary: o.items.map((i) => `${i.name} UK ${i.sizeUk}`).join(", "),
        })),
      };
    },
  }),

  checkDeliveryStatus: tool({
    description:
      "Live shipping information for an order: courier, tracking number, current location, estimated delivery date and recent tracking events. Use for 'where is my order' and 'when will it arrive'.",
    inputSchema: z.object({ orderNumber: orderNumberInput }),
    contextSchema: toolContextSchema,
    execute: async ({ orderNumber }, { context }) => {
      const order = orderNumber
        ? await orderRepository.findByNumber(context.userId, orderNumber)
        : await orderRepository.findMostRecent(context.userId);

      if (!order) {
        return { found: false as const, message: "No matching order on this account." };
      }

      if (order.status === "cancelled") {
        return {
          found: true as const,
          orderNumber: order.orderNumber,
          shipped: false as const,
          message: `Order ${order.orderNumber} was cancelled on ${formatDate(order.cancelledAt)}, so there is no shipment.`,
        };
      }

      const shipment = await orderRepository.findShipmentByOrderId(order.id);
      if (!shipment) {
        return {
          found: true as const,
          orderNumber: order.orderNumber,
          shipped: false as const,
          message: `Order ${order.orderNumber} is ${order.status} and has not been dispatched yet, so no tracking number exists.`,
        };
      }

      return {
        found: true as const,
        orderNumber: order.orderNumber,
        shipped: true as const,
        carrier: shipment.carrier,
        trackingNumber: shipment.trackingNumber,
        status: shipment.status,
        lastLocation: shipment.lastLocation,
        estimatedDelivery: formatDate(shipment.estimatedDelivery),
        deliveredAt: formatDateTime(shipment.deliveredAt),
        recentEvents: shipment.events.slice(-4),
      };
    },
  }),

  cancelOrder: tool({
    description:
      "Cancel an order. Only works before dispatch. Always confirm the order number with the customer before calling this — it changes their account.",
    inputSchema: z.object({
      orderNumber: z
        .string()
        .regex(/^ORD-\d{4}$/i, "Order numbers look like ORD-1042")
        .describe("The order number to cancel. Required — never guess this one."),
      reason: z.string().min(3).describe("The customer's stated reason for cancelling"),
    }),
    contextSchema: toolContextSchema,
    execute: async ({ orderNumber, reason }, { context }) => {
      const order = await orderRepository.findByNumber(context.userId, orderNumber);

      if (!order) {
        return {
          cancelled: false as const,
          reason: `No order ${orderNumber.toUpperCase()} exists on this account.`,
        };
      }

      if (order.status === "cancelled") {
        return {
          cancelled: false as const,
          reason: `Order ${order.orderNumber} was already cancelled on ${formatDate(order.cancelledAt)}.`,
        };
      }

      // The business rule lives here, in code — not in the prompt. Prompts are
      // suggestions; this is a guarantee. The model is told *why* so it can
      // explain the policy and offer the return route instead.
      if (UNCANCELLABLE.has(order.status)) {
        return {
          cancelled: false as const,
          reason: `Order ${order.orderNumber} is already ${order.status.replace(/_/g, " ")} and can no longer be cancelled. Offer the customer a return once it arrives instead.`,
          policy: "Orders can only be cancelled before they are dispatched.",
        };
      }

      const updated = await orderRepository.cancel(order.id, reason);
      return {
        cancelled: true as const,
        orderNumber: order.orderNumber,
        refundAmount: formatMoney(order.totalPaise, order.currency),
        cancelledAt: formatDate(updated?.cancelledAt),
        note: "The refund reaches the original payment method within 5-7 working days.",
      };
    },
  }),

  startReturn: tool({
    description:
      "Start a return or a size exchange for a delivered order. Use 'exchange' when the customer wants a different UK size of the same shoe, and 'refund' when they want their money back. For an exchange you must supply the size they want. This changes their account — confirm the order number first.",
    inputSchema: z.object({
      orderNumber: z
        .string()
        .regex(/^ORD-\d{4}$/i, "Order numbers look like ORD-1042")
        .describe("The order to return. Required — never guess this one."),
      type: z
        .enum(["refund", "exchange"])
        .describe("'exchange' for a different size of the same shoe, 'refund' for money back"),
      reason: z.string().min(3).describe("The customer's stated reason"),
      requestedSizeUk: z
        .number()
        .min(2)
        .max(14)
        .optional()
        .describe("Required for an exchange: the UK size the customer wants instead"),
    }),
    contextSchema: toolContextSchema,
    execute: async ({ orderNumber, type, reason, requestedSizeUk }, { context }) => {
      const order = await orderRepository.findByNumber(context.userId, orderNumber);

      if (!order) {
        return {
          started: false as const,
          reason: `No order ${orderNumber.toUpperCase()} exists on this account.`,
        };
      }

      if (order.status === "cancelled") {
        return {
          started: false as const,
          reason: `Order ${order.orderNumber} was cancelled, so there is nothing to return.`,
        };
      }

      if (order.status !== "delivered") {
        return {
          started: false as const,
          reason: `Order ${order.orderNumber} is ${order.status.replace(/_/g, " ")} and has not been delivered yet. A return can only start after delivery.`,
        };
      }

      const existing = await orderRepository.findReturnByOrderId(order.id);
      if (existing) {
        return {
          started: false as const,
          reason: `Order ${order.orderNumber} already has ${existing.returnNumber} open (${existing.type}, ${existing.status.replace(/_/g, " ")}).`,
        };
      }

      // The 14-day window, enforced in code. Past it, a defect is still covered
      // by the warranty — a different route, not a refusal.
      const deliveredAt = order.deliveredAt;
      const windowClosesAt = deliveredAt
        ? new Date(deliveredAt.getTime() + RETURN_WINDOW_DAYS * 86_400_000)
        : null;

      if (windowClosesAt && windowClosesAt.getTime() < Date.now()) {
        const daysSince = Math.floor((Date.now() - deliveredAt!.getTime()) / 86_400_000);
        return {
          started: false as const,
          reason: `Order ${order.orderNumber} was delivered ${daysSince} days ago, so the ${RETURN_WINDOW_DAYS}-day return window closed on ${formatDate(windowClosesAt)}.`,
          policy: `Returns and exchanges are only possible within ${RETURN_WINDOW_DAYS} days of delivery.`,
          alternative:
            daysSince <= WARRANTY_MONTHS * 30
              ? `This pair is still inside the ${WARRANTY_MONTHS}-month sole and construction warranty, which does cover worn shoes. If this is a manufacturing defect — sole separation, split midsole, failed stitching — tell the customer to send photographs with the order number and it will be assessed in 3 working days. Do not promise a refund; an upheld claim is normally resolved with a replacement.`
              : `This pair is outside the ${WARRANTY_MONTHS}-month warranty as well.`,
        };
      }

      // An exchange into a size we do not have is not a promise we can keep.
      if (type === "exchange") {
        if (requestedSizeUk === undefined) {
          return {
            started: false as const,
            reason: "An exchange needs the UK size the customer wants. Ask them for it.",
          };
        }

        const slug = order.items[0]?.slug;
        const product = slug ? await catalogRepository.findBySlug(slug) : null;
        if (product) {
          const variants = await catalogRepository.listVariants(product.id);
          const target = variants.find((v) => v.sizeUk === requestedSizeUk);
          if (!target || target.stockQty === 0) {
            const nearest = variants
              .filter((v) => v.stockQty > 0)
              .sort(
                (a, b) =>
                  Math.abs(a.sizeUk - requestedSizeUk) - Math.abs(b.sizeUk - requestedSizeUk),
              )
              .slice(0, 3)
              .map((v) => v.sizeUk);

            return {
              started: false as const,
              reason: `UK ${requestedSizeUk} of ${product.modelName} is ${target ? "out of stock" : "not made in this model"}, so the exchange cannot be confirmed.`,
              nearestInStock: nearest,
              alternative:
                "Offer the customer the nearest available size, or a refund instead. Do not promise the unavailable size.",
            };
          }
        }
      }

      const created = await orderRepository.createReturn({
        userId: context.userId,
        orderId: order.id,
        type,
        reason,
        requestedSizeUk,
        windowClosesAt: windowClosesAt ?? new Date(Date.now() + RETURN_WINDOW_DAYS * 86_400_000),
      });

      return {
        started: true as const,
        returnNumber: created.returnNumber,
        orderNumber: order.orderNumber,
        type: created.type,
        requestedSizeUk: created.requestedSizeUk,
        windowClosesAt: formatDate(created.windowClosesAt),
        note:
          type === "exchange"
            ? "A courier collects the original pair within 2 working days. The replacement is dispatched after it passes the warehouse quality check — 5 to 7 working days end to end."
            : "A courier collects the pair within 2 working days. The refund is issued 5 to 7 working days after it passes the warehouse quality check.",
      };
    },
  }),
};

export const ORDER_TOOL_NAMES = Object.keys(orderTools);
