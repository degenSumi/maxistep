import { expectAgent, expectFallback, expectIntent, expectSource } from "../graders.js";
import type { EvalCase } from "../types.js";

/**
 * Routing is the decision every other behaviour hangs off, so it gets the
 * broadest dataset. Adversarial cases matter most: the ones where the obvious
 * noun points at the wrong specialist.
 */
export const routingCases: EvalCase[] = [
  // --- the heuristic tier: must not spend a model call at all --------------
  {
    id: "route-heuristic-order-id",
    intent: "An order number with no billing language skips the classifier entirely",
    message: "where is ORD-1042?",
    graders: [expectAgent("order"), expectSource("heuristic")],
  },
  {
    id: "route-heuristic-refund-id",
    intent: "A refund number goes straight to billing",
    message: "what is happening with REF-2043",
    graders: [expectAgent("billing"), expectSource("heuristic")],
  },
  {
    id: "route-heuristic-return-id",
    intent: "A return number is goods moving, so it belongs to order",
    message: "any update on RET-3006",
    graders: [expectAgent("order"), expectSource("heuristic")],
  },

  // --- adversarial: the noun and the need disagree -------------------------
  {
    id: "route-charge-on-order",
    intent: "An order number inside a billing complaint must NOT shortcut to order",
    message: "I was charged twice for ORD-1041",
    graders: [expectAgent("billing")],
  },
  {
    id: "route-sizing-not-order",
    intent: "A question about a shoe they own is still sizing, not order status",
    message: "do the Airglides run narrow?",
    graders: [expectAgent("support"), expectIntent("support_sizing", "support_product")],
  },
  {
    id: "route-exchange-is-order",
    intent: "A size exchange is an order action even though it sounds like a refund",
    message: "I want to swap my Airglides for a UK 9",
    graders: [expectAgent("order"), expectIntent("order_exchange", "order_return")],
  },
  {
    id: "route-refund-progress-is-billing",
    intent: "Money that has already moved is billing",
    message: "when will my refund actually reach my account?",
    graders: [expectAgent("billing"), expectIntent("billing_refund")],
  },

  // --- plain routing -------------------------------------------------------
  {
    id: "route-tracking",
    intent: "Delivery questions go to order",
    message: "when will my parcel get here?",
    graders: [expectAgent("order")],
  },
  {
    id: "route-policy",
    intent: "Policy questions go to support",
    message: "what is your return policy?",
    graders: [expectAgent("support")],
  },
  {
    id: "route-care",
    intent: "Care questions go to support",
    message: "can I machine wash leather shoes?",
    graders: [expectAgent("support")],
  },
  {
    id: "route-cancel",
    intent: "Cancellation is an order action",
    message: "please cancel my last order",
    graders: [expectAgent("order"), expectIntent("order_cancel", "order_modify")],
  },

  // --- the honest-uncertainty path ----------------------------------------
  {
    id: "route-greeting-falls-back",
    intent: "A greeting carries no request, so it must fall back rather than guess",
    message: "hey",
    graders: [expectAgent("support"), expectFallback()],
  },
  {
    id: "route-gibberish-falls-back",
    intent: "Unclassifiable input must fall back, not be forced into a specialist",
    message: "asdkjh asd",
    graders: [expectAgent("support"), expectFallback()],
  },
];
