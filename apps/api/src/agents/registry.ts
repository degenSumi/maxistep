import type { AgentDefinition, AgentType } from "@repo/shared";

// Drives the /agents endpoints, the router's prompt menu, and the UI badges.
export const AGENT_REGISTRY: Record<AgentType, AgentDefinition> = {
  support: {
    type: "support",
    name: "Support Agent",
    description:
      "Handles sizing and fit questions, the shoe catalogue, stock availability, policy and care questions, and anything that does not clearly belong to another specialist. Also the fallback for ambiguous messages.",
    handles: ["support_sizing", "support_product", "support_faq", "support_troubleshoot", "unknown"],
    accent: "emerald",
    capabilities: [
      { name: "Sizing and fit", description: "UK sizing, how each model fits, break-in advice" },
      { name: "Stock checks", description: "Whether a specific UK size is actually available" },
      { name: "Policy answers", description: "Returns, warranty, delivery and care, from the help centre" },
      { name: "Clarification", description: "Asks one focused question when a request is ambiguous" },
    ],
    tools: [
      { name: "searchKnowledgeBase", description: "Keyword search across help-centre articles" },
      { name: "findProduct", description: "Look up shoes by name, slug or type" },
      { name: "checkSizeAvailability", description: "Stock for a UK size, plus nearest available sizes" },
      { name: "searchConversationHistory", description: "Searches the customer's past conversations" },
      { name: "getCustomerSnapshot", description: "Recent orders, open returns, refunds in progress" },
    ],
  },

  order: {
    type: "order",
    name: "Order Agent",
    description:
      "Handles order status, delivery tracking, cancellations, returns and size exchanges.",
    handles: ["order_status", "order_tracking", "order_modify", "order_cancel", "order_return", "order_exchange"],
    accent: "sky",
    capabilities: [
      { name: "Order lookup", description: "Items, UK sizes, totals and status for an order" },
      { name: "Delivery tracking", description: "Courier, tracking number and live ETA" },
      { name: "Cancellation", description: "Cancels before dispatch, and explains why when it cannot" },
      { name: "Returns and exchanges", description: "Raises a refund or a size exchange within the window" },
    ],
    tools: [
      { name: "getOrderDetails", description: "Full detail for one order, or the latest" },
      { name: "listMyOrders", description: "The customer's recent orders, newest first" },
      { name: "checkDeliveryStatus", description: "Shipment status, ETA and tracking events" },
      { name: "cancelOrder", description: "Cancels an order if it has not been dispatched" },
      { name: "startReturn", description: "Raises a return or a size exchange" },
    ],
  },

  billing: {
    type: "billing",
    name: "Billing Agent",
    description: "Handles payments, charges, duplicate-charge claims and refund status.",
    handles: ["billing_payment", "billing_refund", "billing_dispute"],
    accent: "violet",
    capabilities: [
      { name: "Payment history", description: "Recent charges with what each one was for" },
      { name: "Duplicate charges", description: "Compares amounts, dates and purposes before answering" },
      { name: "Refund tracking", description: "Refund status and expected completion date" },
    ],
    tools: [
      { name: "listPayments", description: "Recent charges, optionally scoped to one order" },
      { name: "getPaymentDetails", description: "One payment by number" },
      { name: "checkRefundStatus", description: "Refund progress by refund or order number" },
    ],
  },
};

export const ALL_AGENTS: AgentDefinition[] = Object.values(AGENT_REGISTRY);

export function getAgentDefinition(type: AgentType): AgentDefinition {
  return AGENT_REGISTRY[type];
}

/**
 * Compact menu injected into the router's prompt. Generated from the registry
 * so the classifier can never be offered an agent that does not exist.
 */
export function buildRoutingMenu(): string {
  return ALL_AGENTS.map((agent) => {
    const tools = agent.tools.map((t) => t.name).join(", ");
    return `- ${agent.type}: ${agent.description}\n  intents: ${agent.handles.join(", ")}\n  tools: ${tools}`;
  }).join("\n");
}
