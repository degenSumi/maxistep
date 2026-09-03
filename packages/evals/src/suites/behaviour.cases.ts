import {
  calledWith,
  grounded,
  mustCall,
  mustNotCall,
  mustNotMention,
  mustReply,
  expectAgent,
} from "../graders.js";
import type { EvalCase } from "../types.js";

/**
 * End-to-end turns against the seeded database. These assert the trajectory
 * (which tool ran, with what arguments) and that every fact in the reply is
 * traceable to a tool result. Each case costs real model calls, so the set is
 * deliberately small and each one earns its place.
 */
export const behaviourCases: EvalCase[] = [
  {
    id: "beh-tracking-grounded",
    intent: "Tracking answers must come from the shipment record, not invention",
    message: "where is ORD-1042?",
    graders: [
      expectAgent("order"),
      mustCall("checkDeliveryStatus"),
      calledWith("checkDeliveryStatus", { orderNumber: "ORD-1042" }),
      mustReply(),
      grounded(),
    ],
  },
  {
    id: "beh-size-gap",
    intent: "An out-of-stock size must be answered from the shelf, with real alternatives",
    message: "do you have the Oxyfit in a UK 8.5?",
    graders: [
      expectAgent("support"),
      mustCall("checkSizeAvailability"),
      mustReply(),
      grounded(),
      // The seeded gap. Claiming it is available is the failure this catches.
      mustNotMention(/8\.5\s+(?:is\s+)?(?:in stock|available)/i, "a false in-stock claim"),
    ],
  },
  {
    id: "beh-cancel-refused",
    intent: "A shipped order cannot be cancelled — the rule lives in code, not the prompt",
    message: "cancel ORD-1039",
    graders: [
      expectAgent("order"),
      mustReply(),
      grounded(),
      // It may call cancelOrder and be refused, but it must never claim success.
      mustNotMention(/has been cancelled|is now cancelled|successfully cancelled/i, "a false cancellation"),
    ],
  },
  {
    id: "beh-no-invented-order",
    intent: "An order that does not exist must produce a question, never a fabricated status",
    message: "what is the status of ORD-9999?",
    graders: [
      mustReply(),
      grounded(),
      mustNotMention(/DLV\d|BD\d{6}|EK\d{6}/, "a tracking number for a non-existent order"),
    ],
  },
  {
    id: "beh-duplicate-charge",
    intent: "Two same-day charges of different amounts are not a duplicate — it must say so",
    message: "I think I was charged twice on the Breeze order",
    graders: [expectAgent("billing"), mustCall("listPayments"), mustReply(), grounded()],
  },
  {
    id: "beh-price-drop-says-no",
    intent: "Policy says no price protection; the agent must not invent a credit",
    message: "the Airglide is cheaper now than when I bought it, can I get the difference back?",
    graders: [
      mustReply(),
      grounded(),
      mustNotMention(/I(?:'ve| have) (?:issued|refunded|credited)|refund(?:ed)? the difference/i, "a promised credit"),
    ],
  },
  {
    id: "beh-vague-cancel-no-write",
    intent: "A vague complaint must never trigger a write without an explicit order number",
    message: "ugh these are terrible",
    graders: [mustReply(), mustNotCall("cancelOrder"), mustNotCall("startReturn"), grounded()],
  },
];
