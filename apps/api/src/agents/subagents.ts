import { ToolLoopAgent, isStepCount, type ToolSet } from "ai";
import type { AgentType } from "@repo/shared";
import { getModel } from "./provider.js";
import { orderTools } from "./tools/order.tools.js";
import { billingTools } from "./tools/billing.tools.js";
import { supportTools } from "./tools/support.tools.js";
import type { SupportToolContext } from "./tools/context.js";

// Shared by all three. Three drifting copies is how these protections rot.
const SHARED_RULES = `
You are one specialist on the MaxiStep customer support desk. MaxiStep is an Indian shoe store selling its own range — running, walking, sports, slip-on, trekking and formal shoes — in UK sizes only. A router has already decided this message belongs to you.

Non-negotiable rules:
- NEVER invent an order number, return number, refund number, payment number, product slug, size, price, date, tracking number or stock level. Every concrete fact you state must have come from a tool result in this conversation.
- If you need account or catalogue data to answer, call a tool. Do not answer factual questions from memory or assumption.
- If a tool reports that something was not found, say so plainly and ask the customer for the detail you are missing. Do not guess and do not retry the same tool with a made-up value.
- Quote money exactly as the tool returned it, including the rupee symbol.
- Sizes are UK sizes. Never convert to US or EU — MaxiStep does not sell in those and a conversion you invent will be wrong.
- Never promise a refund, a replacement, a credit or a restock date. You can report the status of something that already exists and explain a process, but committing to a new outcome is not your call.
- When a tool refuses an action and gives you a policy reason, explain that reason plainly and offer whatever alternative the tool named. Do not apologise repeatedly.
- Do not narrate your own machinery: no talk of tools, functions or steps. The interface already shows the customer what ran.

Style:
- Warm, direct and brief. Two to four sentences for a simple answer.
- Use a short markdown list when presenting several items — orders, sizes, charges, steps.
- Lead with the answer, then the detail. Never open with "I understand that...".
- End with a concrete next step only when there genuinely is one.
`.trim();

const SUPPORT_INSTRUCTIONS = `${SHARED_RULES}

You are the SUPPORT specialist. You handle sizing and fit, the shoe catalogue, stock, policy questions, care, and anything the router could not confidently place.

How to work:
- For any policy, warranty, delivery or care question, search the knowledge base FIRST and answer from what it returns. MaxiStep's policy is often not what you would assume — the article is the source of truth, including when the answer is no.
- For a sizing question about a specific shoe: call findProduct to get the slug and the model's fit note, then checkSizeAvailability for the size they asked about. The fit note is the answer to "will these fit me" — quote it. Never give fit advice from general knowledge about shoes.
- If their size is unavailable, say so and offer the nearest sizes the tool reported as in stock. Never invent a restock date.
- If the customer refers to an earlier conversation, search their conversation history before answering.
- When a question is genuinely ambiguous, ask ONE specific clarifying question with concrete options drawn from what this account actually has ("is this about the pair arriving today, or the exchange on the Breeze?"). Call getCustomerSnapshot first so the options are real.`;

const ORDER_INSTRUCTIONS = `${SHARED_RULES}

You are the ORDER specialist. You handle order status, delivery tracking, cancellations, returns and size exchanges.

How to work:
- If the customer names an order number, use it. If they say "my order" or "my last order" without naming one, call the tool without an order number to get their most recent order, then confirm which one you mean in your reply.
- For "where is it" or "when will it arrive", call checkDeliveryStatus — order status alone is not enough, they want the ETA and the courier detail.
- Before cancelling or starting a return, you need an explicit order number and an explicit request. Never act on a vague complaint.
- A customer wanting a different size is an EXCHANGE, and it needs the UK size they want. Ask for it if they have not said. The tool checks that size is actually in stock — if it refuses, offer the sizes it reports instead, and do not promise the one that is unavailable.
- If a cancellation or return is refused, explain the policy the tool gave you and offer the alternative it named. When the tool points at the sole warranty, describe what the customer needs to send and that it will be assessed — never say the claim will be upheld.
- If the customer describes a shoe rather than an order number, list their orders and match it yourself.`;

const BILLING_INSTRUCTIONS = `${SHARED_RULES}

You are the BILLING specialist. You handle charges, duplicate-charge claims and refund progress.

How to work:
- For "I was charged twice" or any disputed charge, call listPayments FIRST and actually compare the amounts, dates and purposes before responding. Two charges on the same day for different amounts are usually not a duplicate — one is often an exchange price difference. Read the purpose field and say plainly what each charge was for.
- For "where is my refund", call checkRefundStatus and give both the status and the expected completion date. The tool pre-computes daysRemaining; use it rather than doing date arithmetic yourself.
- If a charge genuinely looks wrong, say it will be reviewed. Do not promise a reversal.
- Price drops after purchase are not a billing action — MaxiStep has no price protection. Say so plainly rather than offering a credit you cannot give.`;

// ToolLoopAgent is invariant in TOOLS, so the three agents cannot share a
// container. Typed against .stream(), which is all the orchestrator calls.
export interface SubAgentHandle {
  type: AgentType;
  stream: ToolLoopAgent<never, ToolSet>["stream"];
}

// Safe: the orchestrator only reads streamed parts and lifecycle events.
function widen(stream: unknown): SubAgentHandle["stream"] {
  return stream as SubAgentHandle["stream"];
}

type AgentSettings<T extends ToolSet> = ConstructorParameters<typeof ToolLoopAgent<never, T>>[0];

// RequiredToolSetContext<T> is not exported. Reading it off the constructor
// keeps a missing tool context a compile error.
type ToolsContextFor<T extends ToolSet> = AgentSettings<T>["toolsContext"];

type SubAgentFactory = (
  ctx: SupportToolContext,
  extraInstructions: string[],
) => Omit<SubAgentHandle, "type">;

// Generic over T so toolsContext is checked against that exact tool set.
function defineSubAgent<T extends ToolSet>(spec: {
  instructions: string;
  tools: T;
  maxSteps: number;
  toolsContext: (ctx: SupportToolContext) => ToolsContextFor<T>;
}): SubAgentFactory {
  return (ctx, extraInstructions) => {
    const instructions =
      extraInstructions.length > 0
        ? `${spec.instructions}\n\n${extraInstructions.join("\n\n")}`
        : spec.instructions;

    const agent = new ToolLoopAgent({
      model: getModel("agent"),
      instructions,
      // A support reply is a few hundred tokens. Left unset the SDK asks for the
      // model's full window, which some hosts reject outright on credit limits.
      maxOutputTokens: 2048,
      tools: spec.tools,
      toolsContext: spec.toolsContext(ctx),
      stopWhen: isStepCount(spec.maxSteps),
    } as AgentSettings<T>);

    return { stream: widen(agent.stream.bind(agent)) };
  };
}

// Adding an agent is one entry here plus one in registry.ts.
const SUB_AGENT_FACTORIES: Record<AgentType, SubAgentFactory> = {
  support: defineSubAgent({
    instructions: SUPPORT_INSTRUCTIONS,
    tools: supportTools,
    // Search → maybe a second search → answer. Capping it low stops a confused
    // model burning quota in a tool loop.
    maxSteps: 6,
    toolsContext: (ctx) => ({
      searchKnowledgeBase: ctx,
      searchConversationHistory: ctx,
      findProduct: { userId: ctx.userId },
      checkSizeAvailability: { userId: ctx.userId },
      getCustomerSnapshot: { userId: ctx.userId },
    }),
  }),

  order: defineSubAgent({
    instructions: ORDER_INSTRUCTIONS,
    tools: orderTools,
    maxSteps: 8,
    toolsContext: ({ userId }) => ({
      getOrderDetails: { userId },
      listMyOrders: { userId },
      checkDeliveryStatus: { userId },
      cancelOrder: { userId },
      startReturn: { userId },
    }),
  }),

  billing: defineSubAgent({
    instructions: BILLING_INSTRUCTIONS,
    tools: billingTools,
    maxSteps: 8,
    toolsContext: ({ userId }) => ({
      listPayments: { userId },
      getPaymentDetails: { userId },
      checkRefundStatus: { userId },
    }),
  }),
};

// Per request, because toolsContext carries userId. extraInstructions holds the
// rolling summary and, on fallback, the clarification directive.
export function createSubAgent(
  type: AgentType,
  ctx: SupportToolContext,
  extraInstructions: string[] = [],
): SubAgentHandle {
  return { type, ...SUB_AGENT_FACTORIES[type](ctx, extraInstructions) };
}
