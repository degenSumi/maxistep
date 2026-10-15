import type { ContentfulStatusCode } from "hono/utils/http-status";
import { isAuthFailure, isTransientProviderFailure } from "./provider-errors.js";

// Everything thrown deliberately extends AppError. Anything else is unexpected
// and its message is never shown to the client.
export class AppError extends Error {
  readonly statusCode: ContentfulStatusCode;
  readonly code: string;
  readonly details?: unknown;
  /** Whether the message is safe to return to the client verbatim. */
  readonly isOperational = true;

  constructor(
    message: string,
    statusCode: ContentfulStatusCode = 500,
    code = "INTERNAL_ERROR",
    details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Request validation failed", details?: unknown) {
    super(message, 400, "VALIDATION_ERROR", details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Resource", id?: string) {
    super(id ? `${resource} '${id}' was not found` : `${resource} was not found`, 404, "NOT_FOUND");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to this resource") {
    super(message, 403, "FORBIDDEN");
  }
}

export class RateLimitError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(
      `Too many requests. Try again in ${retryAfterSeconds}s.`,
      429,
      "RATE_LIMIT_EXCEEDED",
      { retryAfterSeconds },
    );
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** The router or a sub-agent failed in a way we understand (bad output, no tools). */
export class AgentError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 502, "AGENT_ERROR", details);
  }
}

/** The model provider failed — quota, auth, network, timeout. */
export class ProviderError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 503, "PROVIDER_ERROR", details);
  }
}

/**
 * Provider SDK errors arrive as opaque objects. Map the ones we can recognise
 * onto our own types so the client gets an actionable message instead of a 500.
 */
export function normaliseProviderError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (isAuthFailure(error)) {
    return new ProviderError(
      "The AI provider rejected our credentials. Check the API key in .env.",
    );
  }
  // Reaching here means the primary and the fallback both refused, so this is
  // the honest message rather than "we are rate limited".
  if (isTransientProviderFailure(error)) {
    return new ProviderError(
      "Every model we can reach is busy right now. Give it a few seconds and send that again.",
    );
  }
  if (lower.includes("timeout") || lower.includes("etimedout") || lower.includes("aborted")) {
    return new ProviderError("The AI provider timed out. Please retry.");
  }

  return new AgentError(`Agent execution failed: ${message}`);
}
