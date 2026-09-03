import type { Check } from "../types.js";

/**
 * Failure handling, graded directly against the real implementations rather
 * than through a turn — these are the paths that only exist when something has
 * already gone wrong, and they must not need a live provider to be tested.
 */
export interface FailureCase {
  id: string;
  intent: string;
  run: () => Promise<Check[]>;
}

export const failureCases: FailureCase[] = [
  {
    id: "fail-router-degrades",
    intent: "A dead classifier must degrade to the generalist, never take the turn down",
    run: async () => {
      const { routeMessage } = await import("@repo/api/router");
      // No heuristic match, so this reaches the classifier — which has no key
      // configured for the test and will fail.
      const decision = await routeMessage({
        message: "something entirely ambiguous about my thing",
        recentTurns: [],
        lastAgentType: null,
      });
      return [
        {
          name: "returns a decision instead of throwing",
          passed: Boolean(decision.agent),
          score: decision.agent ? 1 : 0,
          detail: `agent=${decision.agent} source=${decision.source}`,
        },
        {
          name: "never routes to a specialist on a failure",
          passed: decision.source !== "fallback" || decision.agent === "support",
          score: decision.source !== "fallback" || decision.agent === "support" ? 1 : 0,
        },
      ];
    },
  },
  {
    id: "fail-heuristic-stands-down",
    intent: "The fast path must defer whenever two domains compete, rather than guess",
    run: async () => {
      const { heuristicRoute } = await import("@repo/api/router");
      const competing = [
        "I was charged twice for ORD-1041",
        "I want a refund for ORD-1039",
        "REF-2043 does not match ORD-1040",
      ];
      const deferred = competing.filter((m) => heuristicRoute(m) === null);
      return [
        {
          name: "defers every competing-domain message",
          passed: deferred.length === competing.length,
          score: deferred.length / competing.length,
          detail: `${deferred.length}/${competing.length} deferred to the classifier`,
        },
        {
          name: "still fires on an unambiguous order id",
          passed: heuristicRoute("where is ORD-1042")?.agent === "order",
          score: heuristicRoute("where is ORD-1042")?.agent === "order" ? 1 : 0,
        },
      ];
    },
  },
  {
    id: "fail-retryable-classification",
    intent: "Only transient provider failures may trigger a fallback; real errors must surface",
    run: async () => {
      const { isRetryableProviderFailure } = await import("@repo/api/provider");
      const retryable = ["429 quota exceeded", "model is overloaded", "503 unavailable"];
      const notRetryable = ["400 invalid request", "no such tool", "schema validation failed"];
      const a = retryable.every((m) => isRetryableProviderFailure(new Error(m)));
      const b = notRetryable.every((m) => !isRetryableProviderFailure(new Error(m)));
      return [
        { name: "retries quota, overload and 503", passed: a, score: a ? 1 : 0 },
        { name: "does NOT retry a client error", passed: b, score: b ? 1 : 0 },
      ];
    },
  },
  {
    id: "fail-error-envelope",
    intent: "An unknown route must return the single error envelope, never a stack trace",
    run: async () => {
      const { app } = await import("@repo/api");
      const res = await app.fetch(new Request("http://evals.local/api/nope"));
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      const leaks = /at\s+\w+\s+\(|\/Users\/|node_modules/.test(JSON.stringify(body));
      return [
        { name: "returns 404", passed: res.status === 404, score: res.status === 404 ? 1 : 0 },
        {
          name: "uses the error envelope",
          passed: Boolean(body.error?.code),
          score: body.error?.code ? 1 : 0,
          detail: body.error?.code,
        },
        { name: "leaks no stack or path", passed: !leaks, score: leaks ? 0 : 1 },
      ];
    },
  },
  {
    id: "fail-rate-limit",
    intent: "The chat endpoint must shed load with 429 + Retry-After, not fall over",
    run: async () => {
      const { app } = await import("@repo/api");
      const hit = () =>
        app.fetch(
          new Request("http://evals.local/api/chat/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.9" },
            body: JSON.stringify({ message: "" }), // invalid, so no model call is made
          }),
        );

      let limited: Response | null = null;
      for (let i = 0; i < 40 && !limited; i++) {
        const res = await hit();
        if (res.status === 429) limited = res;
      }

      return [
        {
          name: "eventually returns 429",
          passed: limited !== null,
          score: limited ? 1 : 0,
        },
        {
          name: "sets Retry-After",
          passed: Boolean(limited?.headers.get("Retry-After")),
          score: limited?.headers.get("Retry-After") ? 1 : 0,
          detail: limited?.headers.get("Retry-After") ?? undefined,
        },
      ];
    },
  },
];
