// Re-exported by `ai`, so this needs no extra dependency.
import { APICallError } from "ai";

// Retrying elsewhere only helps for load and quota. Anything else fails the
// same way on a second provider.
const TRANSIENT_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);

// Some providers answer 200 with an error body, so status alone is not enough.
// Phrasing differs per vendor: Google says "overloaded", OpenRouter says
// "high demand", others say "capacity".
const TRANSIENT_PHRASES = [
  "quota",
  "rate limit",
  "ratelimit",
  "too many requests",
  "429",
  "overload",
  "high demand",
  "capacity",
  "unavailable",
  "no longer available",
  "try again later",
  "temporarily",
  "503",
  "529",
];

/** True when the failure is load or quota rather than a bad request. */
export function isTransientProviderFailure(error: unknown): boolean {
  if (APICallError.isInstance(error)) {
    if (error.isRetryable) return true;
    if (error.statusCode && TRANSIENT_STATUS.has(error.statusCode)) return true;
  }

  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return TRANSIENT_PHRASES.some((phrase) => message.includes(phrase));
}

export function isAuthFailure(error: unknown): boolean {
  if (APICallError.isInstance(error) && (error.statusCode === 401 || error.statusCode === 403)) {
    return true;
  }
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    message.includes("api key") || message.includes("unauthenticated") || message.includes("401")
  );
}
