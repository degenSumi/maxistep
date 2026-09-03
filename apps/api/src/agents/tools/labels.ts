// Labels are derived from the real tool call and its arguments, not a timer.

type Args = Record<string, unknown>;

function str(args: Args, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.length > 0 ? value.toUpperCase() : undefined;
}

const RUNNING: Record<string, (args: Args) => string> = {
  getOrderDetails: (a) =>
    str(a, "orderNumber")
      ? `Fetching order ${str(a, "orderNumber")}`
      : "Fetching your most recent order",
  listMyOrders: () => "Looking through your recent orders",
  checkDeliveryStatus: (a) =>
    str(a, "orderNumber")
      ? `Checking delivery for ${str(a, "orderNumber")}`
      : "Checking your delivery status",
  cancelOrder: (a) => `Cancelling order ${str(a, "orderNumber") ?? ""}`.trim(),
  startReturn: (a) =>
    a["type"] === "exchange"
      ? `Raising a size exchange on ${str(a, "orderNumber") ?? "your order"}`
      : `Raising a return on ${str(a, "orderNumber") ?? "your order"}`,

  listPayments: () => "Reviewing recent charges",
  getPaymentDetails: (a) => `Opening payment ${str(a, "paymentNumber") ?? ""}`.trim(),
  checkRefundStatus: (a) =>
    str(a, "refundNumber") ?? str(a, "orderNumber")
      ? `Checking refund for ${str(a, "refundNumber") ?? str(a, "orderNumber")}`
      : "Checking your refunds",

  searchKnowledgeBase: (a) => `Searching the help centre for "${a["query"] ?? ""}"`,
  findProduct: (a) => `Looking up "${a["query"] ?? ""}" in the catalogue`,
  checkSizeAvailability: (a) => `Checking stock in UK ${a["sizeUk"] ?? "?"}`,
  searchConversationHistory: (a) => `Searching your past conversations for "${a["query"] ?? ""}"`,
  getCustomerSnapshot: () => "Reviewing your account",
};

export function labelForToolCall(toolName: string, input: unknown): string {
  const args = (input ?? {}) as Args;
  const builder = RUNNING[toolName];
  if (builder) {
    try {
      return builder(args);
    } catch {
      /* fall through to the generic label */
    }
  }
  return `Running ${toolName}`;
}

/**
 * A one-line result summary for the completed tool chip. Reads the shapes the
 * tools actually return, so the chip says "3 orders" instead of "done".
 */
export function summariseToolOutput(toolName: string, output: unknown): string | undefined {
  if (output === null || typeof output !== "object") return undefined;
  const o = output as Args;

  if (o["found"] === false) {
    return typeof o["message"] === "string" ? o["message"] : "No match found";
  }
  if (o["cancelled"] === true) return "Order cancelled";
  if (o["cancelled"] === false) {
    return typeof o["reason"] === "string" ? o["reason"] : "Cancellation refused";
  }
  if (o["started"] === true) return `${o["returnNumber"]} raised`;
  if (o["started"] === false) {
    return typeof o["reason"] === "string" ? o["reason"] : "Return refused";
  }

  switch (toolName) {
    case "getOrderDetails": {
      const order = o["order"] as Args | undefined;
      return order ? `${order["orderNumber"]} — ${order["status"]}` : undefined;
    }
    case "listMyOrders":
      return `Found ${o["count"]} order${o["count"] === 1 ? "" : "s"}`;
    case "checkDeliveryStatus":
      return o["shipped"] === true
        ? `${o["carrier"]} — ${String(o["status"]).replace(/_/g, " ")}`
        : "Not dispatched yet";
    case "listPayments":
      return `Found ${o["count"]} charge${o["count"] === 1 ? "" : "s"}`;
    case "getPaymentDetails": {
      const payment = o["payment"] as Args | undefined;
      return payment ? `${payment["paymentNumber"]} — ${payment["amount"]}` : undefined;
    }
    case "checkRefundStatus": {
      const refunds = o["refunds"] as Args[] | undefined;
      if (!refunds?.length) return undefined;
      const first = refunds[0];
      return refunds.length === 1
        ? `${first?.["refundNumber"]} — ${first?.["status"]}`
        : `${refunds.length} refunds found`;
    }
    case "searchKnowledgeBase": {
      const articles = o["articles"] as Args[] | undefined;
      return articles?.length ? `${articles.length} article(s) found` : undefined;
    }
    case "findProduct": {
      const products = o["products"] as Args[] | undefined;
      return products?.length ? `${products.length} shoe(s) found` : undefined;
    }
    case "checkSizeAvailability":
      return o["available"] === true
        ? `UK ${o["requestedSizeUk"]} in stock`
        : `UK ${o["requestedSizeUk"]} unavailable`;
    case "searchConversationHistory": {
      const matches = o["matches"] as Args[] | undefined;
      return matches?.length ? `${matches.length} earlier mention(s)` : undefined;
    }
    case "getCustomerSnapshot": {
      const orders = o["recentOrders"] as Args[] | undefined;
      const refunds = o["refundsInProgress"] as Args[] | undefined;
      return `${orders?.length ?? 0} recent orders, ${refunds?.length ?? 0} refund(s) in progress`;
    }
    default:
      return undefined;
  }
}
