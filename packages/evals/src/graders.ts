import type { Check, Grader } from "./types.js";

const ok = (name: string, passed: boolean, detail?: string): Check => ({
  name,
  passed,
  score: passed ? 1 : 0,
  ...(detail ? { detail } : {}),
});

// --- routing ---------------------------------------------------------------

export const expectAgent = (agent: string): Grader => (turn) =>
  ok("agent", turn.agent === agent, `expected ${agent}, got ${turn.agent ?? "none"}`);

export const expectIntent = (...intents: string[]): Grader => (turn) =>
  ok(
    "intent",
    turn.intent !== null && intents.includes(turn.intent),
    `expected one of ${intents.join("|")}, got ${turn.intent ?? "none"}`,
  );

export const expectFallback = (): Grader => (turn) =>
  ok("fallback", turn.isFallback, `expected a low-confidence fallback, got ${turn.routeSource}`);

export const expectSource = (source: string): Grader => (turn) =>
  ok("routeSource", turn.routeSource === source, `expected ${source}, got ${turn.routeSource}`);

// --- tool trajectory -------------------------------------------------------

export const mustCall = (toolName: string): Grader => (turn) =>
  ok(
    `calls ${toolName}`,
    turn.toolCalls.some((c) => c.toolName === toolName),
    `tools called: ${turn.toolCalls.map((c) => c.toolName).join(", ") || "none"}`,
  );

export const mustNotCall = (toolName: string): Grader => (turn) =>
  ok(
    `never calls ${toolName}`,
    !turn.toolCalls.some((c) => c.toolName === toolName),
    `tools called: ${turn.toolCalls.map((c) => c.toolName).join(", ") || "none"}`,
  );

/** Asserts a tool ran with specific arguments — catches a plausible call on invented input. */
export const calledWith = (toolName: string, expected: Record<string, unknown>): Grader => (turn) => {
  const calls = turn.toolCalls.filter((c) => c.toolName === toolName);
  const match = calls.some((c) => {
    const input = (c.input ?? {}) as Record<string, unknown>;
    return Object.entries(expected).every(([k, v]) => {
      const actual = input[k];
      return typeof v === "string" && typeof actual === "string"
        ? actual.toUpperCase() === v.toUpperCase()
        : actual === v;
    });
  });
  return ok(
    `${toolName}(${JSON.stringify(expected)})`,
    match,
    `actual: ${JSON.stringify(calls.map((c) => c.input))}`,
  );
};

// --- content ---------------------------------------------------------------

export const mustMention = (pattern: RegExp, label = pattern.source): Grader => (turn) =>
  ok(`mentions ${label}`, pattern.test(turn.reply));

export const mustNotMention = (pattern: RegExp, label = pattern.source): Grader => (turn) =>
  ok(`never mentions ${label}`, !pattern.test(turn.reply));

export const mustReply = (): Grader => (turn) =>
  ok("produced a reply", turn.reply.trim().length > 0, turn.error ?? "empty reply");

// --- grounding -------------------------------------------------------------

// Anything the agent must not be able to invent. Every one of these appearing
// in a reply has to be traceable to a tool result from the same turn.
const IDENTIFIER = /\b(?:ORD|RET|REF|PAY)-\d{4}\b/g;
const TRACKING = /\b(?:DLV|BD|EK)\d{6,}\b/g;
const MONEY = /₹\s?[\d,]+/g;

function haystack(turn: { toolCalls: Array<{ output: unknown; input: unknown }> }): string {
  return turn.toolCalls.map((c) => JSON.stringify(c.output ?? "") + JSON.stringify(c.input ?? "")).join(" ");
}

const normalise = (s: string) => s.replace(/[\s,₹]/g, "");

/**
 * The strictest grader here, and deliberately deterministic — no judge needed.
 * A hallucinated order number or price is an automatic fail, because every
 * concrete fact in a support reply must have come from a tool.
 */
export const grounded = (): Grader => (turn) => {
  const source = haystack(turn);
  const sourceNorm = normalise(source);
  const claims = [
    ...(turn.reply.match(IDENTIFIER) ?? []),
    ...(turn.reply.match(TRACKING) ?? []),
    ...(turn.reply.match(MONEY) ?? []),
  ];

  const unsupported = claims.filter((claim) => !sourceNorm.includes(normalise(claim)));

  return {
    name: "grounded",
    passed: unsupported.length === 0,
    score: claims.length === 0 ? 1 : (claims.length - unsupported.length) / claims.length,
    detail:
      unsupported.length > 0
        ? `invented: ${[...new Set(unsupported)].join(", ")}`
        : `${claims.length} factual claim(s), all traced to tool output`,
  };
};
