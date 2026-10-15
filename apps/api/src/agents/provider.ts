import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  wrapLanguageModel,
  type LanguageModel,
  type LanguageModelMiddleware,
} from "ai";
import { env } from "../config/env.js";
import { isTransientProviderFailure } from "../lib/provider-errors.js";

// Models are chosen by role: routing sits on the blocking path so it gets the
// fastest model, sub-agents need tool-calling reliability.
export type ModelRole = "router" | "agent" | "summary";

type RoleDefaults = Record<ModelRole, string>;

const PROVIDER_DEFAULTS: Record<typeof env.AI_PROVIDER, RoleDefaults> = {
  // Google recommends 3.6 over 3.5 for the answering role. There is no 3.6 lite,
  // so the two cheap roles stay on 3.5-flash-lite.
  google: {
    router: "gemini-3.5-flash-lite",
    agent: "gemini-3.6-flash",
    summary: "gemini-3.5-flash-lite",
  },
  openai: {
    router: "gpt-4.1-mini",
    agent: "gpt-4.1",
    summary: "gpt-4.1-mini",
  },
  // Same generation as the direct-Google defaults, so switching provider
  // changes who serves the request and not which model answers it.
  openrouter: {
    router: "google/gemini-3.5-flash-lite",
    agent: "google/gemini-3.5-flash",
    summary: "google/gemini-3.5-flash-lite",
  },
  gateway: {
    router: "google/gemini-3.5-flash-lite",
    agent: "google/gemini-3.5-flash",
    summary: "google/gemini-3.5-flash-lite",
  },
};

const OVERRIDES: Partial<RoleDefaults> = {
  router: env.ROUTER_MODEL,
  agent: env.AGENT_MODEL,
  summary: env.SUMMARY_MODEL,
};

function modelIdFor(role: ModelRole): string {
  const override = OVERRIDES[role];
  if (override) return override;
  const defaults = PROVIDER_DEFAULTS[env.AI_PROVIDER];
  return defaults[role];
}

/** Built once at module load — provider clients are stateless and reusable. */
const providerClient = (() => {
  switch (env.AI_PROVIDER) {
    case "google":
      return createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });
    case "openai":
      return createOpenAI({ apiKey: env.OPENAI_API_KEY });
    case "openrouter":
      // OpenRouter speaks the OpenAI wire format, so one adapter covers it and
      // every other OpenAI-compatible host (Groq, Together, a local vLLM).
      return createOpenAICompatible({
        name: "openrouter",
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: env.OPENROUTER_API_KEY,
      });
    case "gateway":
      // The SDK resolves bare "provider/model" strings through the Vercel AI
      // Gateway, so there is no client to construct.
      return null;
  }
})();

// Free models on the fallback route stream their chain of thought as ordinary
// content, so the customer reads "I should call listPayments". OpenRouter drops
// it at the source, which beats stripping it from a stream.
const suppressReasoning: typeof fetch = (input, init) => {
  if (typeof init?.body !== "string") return fetch(input, init);
  try {
    const body = JSON.parse(init.body);
    body.reasoning = { exclude: true };
    return fetch(input, { ...init, body: JSON.stringify(body) });
  } catch {
    return fetch(input, init);
  }
};

/**
 * A second provider, used only when the primary fails.
 */
const fallbackClient =
  env.FALLBACK_MODEL && env.OPENROUTER_API_KEY
    ? createOpenAICompatible({
        name: "openrouter-fallback",
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: env.OPENROUTER_API_KEY,
        fetch: suppressReasoning,
      })
    : null;

// Kept as the public name because the eval suite imports it. The logic now
// lives in one place and reads the status code, not just the message text.
export const isRetryableProviderFailure = isTransientProviderFailure;

function reasonOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 200);
}

// Log the reason, not just the fact. "Fell back" on its own leaves you unable
// to tell a transient rate limit from a retired model.
function logFailover(error: unknown) {
  console.warn(
    `[provider] primary failed, falling back to ${env.FALLBACK_MODEL}\n           reason: ${reasonOf(error)}`,
  );
}

// Without this line a busy fallback looks identical to a busy primary.
function logFallbackFailure(error: unknown) {
  console.error(
    `[provider] fallback ${env.FALLBACK_MODEL} also failed\n           reason: ${reasonOf(error)}`,
  );
}

// Exclude<LanguageModel, string> is a union across spec versions, so its
// doGenerate wants the intersection of all call options. Read it off the
// middleware instead.
type ModelObject = Parameters<NonNullable<LanguageModelMiddleware["wrapGenerate"]>>[0]["model"];

// Middleware, so router, sub-agents and summariser all inherit failover.
function withFallback(primary: ModelObject, fallback: ModelObject): LanguageModel {
  return wrapLanguageModel({
    model: primary,
    middleware: {
      wrapGenerate: async ({ doGenerate, params }) => {
        try {
          return await doGenerate();
        } catch (error) {
          if (!isTransientProviderFailure(error)) throw error;
          logFailover(error);
          try {
            return await fallback.doGenerate(params);
          } catch (fallbackError) {
            logFallbackFailure(fallbackError);
            throw fallbackError;
          }
        }
      },
      wrapStream: async ({ doStream, params }) => {
        try {
          return await doStream();
        } catch (error) {
          if (!isTransientProviderFailure(error)) throw error;
          logFailover(error);
          try {
            return await fallback.doStream(params);
          } catch (fallbackError) {
            logFallbackFailure(fallbackError);
            throw fallbackError;
          }
        }
      },
    },
  });
}

export function getModel(role: ModelRole): LanguageModel {
  const id = modelIdFor(role);

  // Gateway mode resolves bare strings server-side; there is no client object
  // to wrap, and the gateway does its own failover.
  if (providerClient === null) return id;

  const primary = providerClient(id) as ModelObject;
  if (!fallbackClient || !env.FALLBACK_MODEL) return primary;

  return withFallback(primary, fallbackClient(env.FALLBACK_MODEL) as ModelObject);
}

/** Surfaced on the health endpoint so a misconfigured deploy is obvious. */
export function describeModels() {
  return {
    provider: env.AI_PROVIDER,
    fallback: fallbackClient ? env.FALLBACK_MODEL : null,
    models: {
      router: modelIdFor("router"),
      agent: modelIdFor("agent"),
      summary: modelIdFor("summary"),
    },
  };
}
