import { tool } from "ai";
import { z } from "zod";
import { knowledgeRepository } from "../../repositories/knowledge.repository.js";
import { catalogRepository } from "../../repositories/catalog.repository.js";
import { orderRepository } from "../../repositories/order.repository.js";
import { conversationRepository } from "../../repositories/conversation.repository.js";
import { paymentRepository } from "../../repositories/payment.repository.js";
import { formatMoney } from "../../lib/format.js";
import { supportToolContextSchema, toolContextSchema } from "./context.js";
import type { Product } from "@repo/db";

function displayName(product: Product): string {
  const gender = product.gender === "men" ? "Men" : "Women";
  return `MaxiStep ${gender} ${product.modelName}`;
}

function serialiseProduct(product: Product) {
  return {
    slug: product.slug,
    name: displayName(product),
    type: product.type,
    colour: product.colour,
    price: formatMoney(product.pricePaise),
    mrp: formatMoney(product.mrpPaise),
    // Computed here, never by the model.
    discountPercent: Math.round(
      ((product.mrpPaise - product.pricePaise) / product.mrpPaise) * 100,
    ),
    materials: product.materials,
    care: product.care,
    fitNote: product.fitNote,
    description: product.description,
  };
}

export const supportTools = {
  searchKnowledgeBase: tool({
    description:
      "Search MaxiStep help-centre articles: sizing charts, fit guidance, the return and exchange policy, the sole warranty, delivery timelines, shoe care and price-drop policy. Use this FIRST for any policy or how-to question — company policy is often not what you would assume.",
    inputSchema: z.object({
      query: z.string().min(2).describe("Search terms, e.g. 'return policy' or 'suede care'"),
    }),
    contextSchema: supportToolContextSchema,
    execute: async ({ query }) => {
      const articles = await knowledgeRepository.search(query);
      if (articles.length === 0) {
        return {
          found: false as const,
          message: `No help-centre article matches "${query}".`,
        };
      }
      return {
        found: true as const,
        articles: articles.map((a) => ({
          slug: a.slug,
          title: a.title,
          category: a.category,
          body: a.body,
        })),
      };
    },
  }),

  findProduct: tool({
    description:
      "Look up shoes in the MaxiStep catalogue by name, slug or type (running, walking, formal, trekking, slip_on, sports). Returns price, materials, care instructions and the model's fit note. Use this before giving any advice about a specific shoe.",
    inputSchema: z.object({
      query: z
        .string()
        .min(2)
        .describe("A model name like 'Airglide', a slug like 'oxyfit-men-walking', or a type"),
    }),
    contextSchema: toolContextSchema,
    execute: async ({ query }) => {
      const products = await catalogRepository.search(query);
      if (products.length === 0) {
        return {
          found: false as const,
          message: `Nothing in the catalogue matches "${query}".`,
        };
      }
      return { found: true as const, products: products.map(serialiseProduct) };
    },
  }),

  checkSizeAvailability: tool({
    description:
      "Check whether a specific UK size of a shoe is in stock. Always use this before telling a customer a size is available. Returns the exact size plus the nearest sizes that ARE in stock, so you can offer a real alternative when their size is not available.",
    inputSchema: z.object({
      slug: z
        .string()
        .min(2)
        .describe("The product slug, e.g. 'oxyfit-men-walking'. Get it from findProduct first."),
      sizeUk: z
        .number()
        .min(2)
        .max(14)
        .describe("UK size. Half sizes are allowed, e.g. 8.5. MaxiStep sells UK sizes only."),
    }),
    contextSchema: toolContextSchema,
    execute: async ({ slug, sizeUk }) => {
      const product = await catalogRepository.findBySlug(slug);
      if (!product) {
        return {
          found: false as const,
          message: `No product with slug "${slug}". Use findProduct to get the right slug.`,
        };
      }

      const variants = await catalogRepository.listVariants(product.id);
      const exact = variants.find((v) => v.sizeUk === sizeUk);
      const inStock = variants.filter((v) => v.stockQty > 0);

      // Nearest available sizes either side, so a stock gap gets a real answer
      // rather than the model guessing what else might fit.
      const nearest = [...inStock]
        .sort((a, b) => Math.abs(a.sizeUk - sizeUk) - Math.abs(b.sizeUk - sizeUk))
        .slice(0, 3)
        .map((v) => ({ sizeUk: v.sizeUk, variantSlug: v.variantSlug, stockQty: v.stockQty }));

      return {
        found: true as const,
        product: { slug: product.slug, name: displayName(product), fitNote: product.fitNote },
        requestedSizeUk: sizeUk,
        available: Boolean(exact && exact.stockQty > 0),
        stockQty: exact?.stockQty ?? 0,
        listed: Boolean(exact),
        message: !exact
          ? `UK ${sizeUk} is not made in this model.`
          : exact.stockQty > 0
            ? `UK ${sizeUk} is in stock.`
            : `UK ${sizeUk} is listed but currently out of stock.`,
        nearestInStock: nearest,
        allSizesInStock: inStock.map((v) => v.sizeUk),
      };
    },
  }),

  searchConversationHistory: tool({
    description:
      "Search this customer's earlier conversations for a topic. Use when they refer to something discussed before.",
    inputSchema: z.object({
      query: z.string().min(2).describe("What to look for in past conversations"),
    }),
    contextSchema: supportToolContextSchema,
    execute: async ({ query }, { context }) => {
      const hits = await conversationRepository.searchHistory(context.userId, query);
      // The live thread is already in the agent's context window; surfacing it
      // again as "history" just repeats what it can already see.
      const matches = hits.filter((hit) => hit.conversationId !== context.conversationId);
      return {
        count: matches.length,
        matches: matches.map((m) => ({
          conversationTitle: m.conversationTitle,
          role: m.role,
          content: m.content.length > 300 ? `${m.content.slice(0, 300)}…` : m.content,
          when: m.createdAt.toISOString().slice(0, 10),
        })),
      };
    },
  }),

  getCustomerSnapshot: tool({
    description:
      "An overview of this customer's account: recent orders, open returns and refunds in progress. Use it to ground a clarifying question in what they actually have.",
    inputSchema: z.object({}),
    contextSchema: toolContextSchema,
    execute: async (_input, { context }) => {
      const [orders, returnRows, refundRows] = await Promise.all([
        orderRepository.listForUser(context.userId, 5),
        orderRepository.listReturnsForUser(context.userId, 5),
        paymentRepository.listRefunds(context.userId, 5),
      ]);

      return {
        recentOrders: orders.map((o) => ({
          orderNumber: o.orderNumber,
          status: o.status,
          items: o.items.map((i) => `${i.name} UK ${i.sizeUk}`).join(", "),
          total: formatMoney(o.totalPaise, o.currency),
        })),
        openReturns: returnRows
          .filter((r) => r.status !== "completed" && r.status !== "rejected")
          .map((r) => ({ returnNumber: r.returnNumber, type: r.type, status: r.status })),
        refundsInProgress: refundRows
          .filter((r) => r.status !== "completed" && r.status !== "rejected")
          .map((r) => ({
            refundNumber: r.refundNumber,
            status: r.status,
            amount: formatMoney(r.amountPaise, r.currency),
          })),
      };
    },
  }),
};

export const SUPPORT_TOOL_NAMES = Object.keys(supportTools);
